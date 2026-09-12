"""AI Music Generation, Audio Extension & Stem Variation Endpoints."""

import asyncio
from pathlib import Path
from typing import Any, Dict, Optional
import uuid

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
import soundfile as sf

from backend.app.ai.generation_models import MusicGenerator
from backend.app.audio.decode import probe_audio
from backend.app.audio.waveform import WaveformPyramid
from backend.app.jobs.manager import job_manager
from backend.app.jobs.model import Job, JobType
from backend.app.logging_config import logger
from backend.app.schemas.clip import Clip
from backend.app.schemas.media import MediaAsset
from backend.app.schemas.track import Track
from backend.app.services.media_service import MediaService
from backend.app.services.project_service import ProjectService
from backend.app.storage.project_format import ProjectFormat, safe_resolve

router = APIRouter(prefix="/api/projects/{project_id}", tags=["AI Music Generation"])


class GenerateMusicRequest(BaseModel):
    prompt: str = Field(description="Natural language music prompt, style description or instrument tags")
    duration: float = Field(default=8.0, ge=1.0, le=60.0, description="Duration in seconds")
    tempo: Optional[float] = Field(default=120.0, ge=40.0, le=240.0, description="Tempo in BPM")
    key: Optional[str] = Field(default="A minor", description="Musical key signature")


class ExtendClipRequest(BaseModel):
    clip_id: str = Field(description="ID of the clip to extend")
    prompt: Optional[str] = Field(default="", description="Optional prompt or stylistic directive")
    extension_seconds: float = Field(default=6.0, ge=1.0, le=30.0, description="Seconds to add to the clip")
    overlap_seconds: float = Field(default=0.5, ge=0.05, le=2.0, description="Crossfade boundary in seconds")


class AcceptGenerationRequest(BaseModel):
    insert_mode: str = Field(default="new_track", description="'new_track', 'at_playhead', or 'replace_clip'")
    playhead_time: float = Field(default=0.0, ge=0.0, description="Target timeline playhead time in seconds")
    target_track_id: Optional[str] = None
    target_clip_id: Optional[str] = None
    track_name: Optional[str] = None


async def _execute_generation(
    job_id: str,
    project_id: str,
    prompt: str,
    duration: float,
    tempo: float,
    key: str,
) -> Dict[str, Any]:
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    cache_gen_dir = bundle_dir / "cache" / "generated"
    cache_gen_dir.mkdir(parents=True, exist_ok=True)

    output_wav = cache_gen_dir / f"{job_id}.wav"
    output_json = cache_gen_dir / f"{job_id}.json"

    loop = asyncio.get_running_loop()

    def progress_cb(pct: float, stage_msg: str) -> None:
        asyncio.run_coroutine_threadsafe(
            job_manager.update_progress(job_id, pct, stage_msg),
            loop,
        )

    def _sync_worker():
        progress_cb(10, "Synthesizing harmonic progression...")
        audio = MusicGenerator.generate(
            prompt=prompt,
            duration=duration,
            sample_rate=44100,
            progress_callback=progress_cb,
        )
        progress_cb(85, "Writing 32-bit float audio cache...")
        sf.write(str(output_wav), audio, 44100, subtype="FLOAT")

        progress_cb(92, "Generating waveform peak pyramid...")
        WaveformPyramid.generate_from_file(output_wav, output_json)
        return {
            "prompt": prompt,
            "duration": duration,
            "sample_rate": 44100,
            "channels": 2,
            "wav_path": str(output_wav),
        }

    return await loop.run_in_executor(None, _sync_worker)


async def _execute_extension(
    job_id: str,
    project_id: str,
    source_audio_path: Path,
    prompt: str,
    extension_seconds: float,
    overlap_seconds: float,
) -> Dict[str, Any]:
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    cache_gen_dir = bundle_dir / "cache" / "generated"
    cache_gen_dir.mkdir(parents=True, exist_ok=True)

    output_wav = cache_gen_dir / f"{job_id}.wav"
    output_json = cache_gen_dir / f"{job_id}.json"

    loop = asyncio.get_running_loop()

    def progress_cb(pct: float, stage_msg: str) -> None:
        asyncio.run_coroutine_threadsafe(
            job_manager.update_progress(job_id, pct, stage_msg),
            loop,
        )

    def _sync_worker():
        progress_cb(10, "Analyzing audio continuation point & scale intervals...")
        audio = MusicGenerator.extend_clip(
            source_audio_path=source_audio_path,
            prompt=prompt,
            extension_seconds=extension_seconds,
            overlap_seconds=overlap_seconds,
            sample_rate=44100,
            progress_callback=progress_cb,
        )
        progress_cb(85, "Writing extended 32-bit float audio cache...")
        sf.write(str(output_wav), audio, 44100, subtype="FLOAT")

        progress_cb(92, "Generating waveform peak pyramid...")
        WaveformPyramid.generate_from_file(output_wav, output_json)
        return {
            "prompt": prompt,
            "duration": float(len(audio) / 44100),
            "sample_rate": 44100,
            "channels": 2,
            "wav_path": str(output_wav),
        }

    return await loop.run_in_executor(None, _sync_worker)


@router.post("/generate")
async def generate_music(project_id: str, req: GenerateMusicRequest):
    """Queue a local AI music generation job matching prompt, tempo, and key."""
    project = await ProjectService.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    job = Job(
        type=JobType.AI_GENERATION,
        title=f"AI Gen: {req.prompt[:32]}",
        project_id=project_id,
        requires_gpu=True,
    )

    await job_manager.submit(
        job,
        _execute_generation,
        project_id=project_id,
        prompt=req.prompt,
        duration=req.duration,
        tempo=req.tempo or 120.0,
        key=req.key or "A minor",
    )

    return {
        "job_id": job.id,
        "status": "queued",
        "title": job.title,
        "message": "AI Music Generation job queued",
    }


@router.post("/extend")
async def extend_clip(project_id: str, req: ExtendClipRequest):
    """Queue an audio continuation job extending an existing clip seamlessly."""
    project = await ProjectService.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    target_clip: Optional[Clip] = None
    for trk in project.tracks:
        for clp in trk.clips:
            if clp.id == req.clip_id:
                target_clip = clp
                break
        if target_clip:
            break

    if not target_clip:
        raise HTTPException(status_code=404, detail=f"Clip '{req.clip_id}' not found in project")

    source_path = MediaService.get_media_path(project_id, target_clip.source_id)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"Source audio file for clip '{req.clip_id}' not found")

    job = Job(
        type=JobType.AI_GENERATION,
        title=f"Extend: {target_clip.name[:24]} (+{req.extension_seconds}s)",
        project_id=project_id,
        requires_gpu=True,
    )

    await job_manager.submit(
        job,
        _execute_extension,
        project_id=project_id,
        source_audio_path=source_path,
        prompt=req.prompt or f"Extend {target_clip.name}",
        extension_seconds=req.extension_seconds,
        overlap_seconds=req.overlap_seconds,
    )

    return {
        "job_id": job.id,
        "status": "queued",
        "title": job.title,
        "clip_id": req.clip_id,
        "message": "Clip extension job queued",
    }


@router.get("/generate/{job_id}/preview")
async def preview_generated_audio(project_id: str, job_id: str):
    """Stream candidate audio for auditioning before accepting into timeline."""
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    candidate_path = bundle_dir / "cache" / "generated" / f"{job_id}.wav"

    if not candidate_path.exists():
        raise HTTPException(status_code=404, detail="Candidate audio not found or generation not finished")

    return FileResponse(
        candidate_path,
        media_type="audio/wav",
        filename=f"ai_gen_{job_id[:8]}.wav",
        headers={"Accept-Ranges": "bytes"},
    )


@router.get("/generate/{job_id}/waveform")
async def get_generated_waveform(project_id: str, job_id: str):
    """Return waveform pyramid JSON for the generated audio preview."""
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    waveform_json = bundle_dir / "cache" / "generated" / f"{job_id}.json"

    if not waveform_json.exists():
        raise HTTPException(status_code=404, detail="Waveform preview not ready")

    return JSONResponse(content=WaveformPyramid.load_cached(waveform_json))


@router.post("/generate/{job_id}/accept")
async def accept_generation(project_id: str, job_id: str, req: AcceptGenerationRequest):
    """Commit candidate audio into the project media bundle and insert into timeline."""
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    candidate_path = bundle_dir / "cache" / "generated" / f"{job_id}.wav"

    if not candidate_path.exists():
        raise HTTPException(status_code=404, detail="Candidate audio not found")

    project = await ProjectService.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    media_dir = bundle_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    cache_waveforms_dir = bundle_dir / "cache" / "waveforms"
    cache_waveforms_dir.mkdir(parents=True, exist_ok=True)

    asset_id = f"med_ai_{uuid.uuid4().hex[:8]}"
    target_wav_path = media_dir / f"{asset_id}.wav"

    # Copy candidate WAV to bundle media
    with open(candidate_path, "rb") as sf_in, open(target_wav_path, "wb") as sf_out:
        sf_out.write(sf_in.read())

    # Probe metadata
    meta = probe_audio(target_wav_path)

    # Precompute peak pyramid in project cache
    waveform_cache_path = cache_waveforms_dir / f"{asset_id}.json"
    candidate_json = bundle_dir / "cache" / "generated" / f"{job_id}.json"
    if candidate_json.exists():
        # Copy pre-generated waveform JSON
        with open(candidate_json, "rb") as j_in, open(waveform_cache_path, "wb") as j_out:
            j_out.write(j_in.read())
    else:
        WaveformPyramid.generate_from_file(target_wav_path, waveform_cache_path)

    display_name = req.track_name or f"AI Gen {job_id[:6]}"

    # Save media asset record
    media_asset = MediaAsset(
        id=asset_id,
        project_id=project_id,
        name=display_name,
        original_filename=f"{display_name}.wav",
        format=meta.format_name,
        duration=meta.duration,
        sample_rate=meta.sample_rate,
        channels=meta.channels,
        frames=meta.frames,
        file_size_bytes=meta.file_size_bytes,
        sha256=meta.sha256,
        filepath=str(target_wav_path),
        waveform_cached=True,
    )

    created_track_id: Optional[str] = None
    created_clip_id: Optional[str] = None

    if req.insert_mode == "replace_clip" and req.target_clip_id:
        # Find clip and replace its source
        found_clip = False
        for trk in project.tracks:
            for clp in trk.clips:
                if clp.id == req.target_clip_id:
                    clp.source_id = asset_id
                    clp.duration = meta.duration
                    clp.name = f"{clp.name} (AI)"
                    created_track_id = trk.id
                    created_clip_id = clp.id
                    found_clip = True
                    break
            if found_clip:
                break
    elif req.insert_mode == "at_playhead" and req.target_track_id:
        # Find target track and append clip at playhead
        for trk in project.tracks:
            if trk.id == req.target_track_id:
                clip = Clip(
                    name=display_name,
                    source_id=asset_id,
                    track_id=trk.id,
                    start_time=req.playhead_time,
                    duration=meta.duration,
                    source_offset=0.0,
                    gain=0.0,
                )
                trk.clips.append(clip)
                created_track_id = trk.id
                created_clip_id = clip.id
                break
    else:
        # Default: new track
        track_color = "#b026ff"  # Neon Violet for AI Generations
        track = Track(
            name=display_name,
            type="audio",
            color=track_color,
            volume=0.0,
            pan=0.0,
            order=len(project.tracks),
        )
        clip = Clip(
            name=display_name,
            source_id=asset_id,
            track_id=track.id,
            start_time=req.playhead_time,
            duration=meta.duration,
            source_offset=0.0,
            gain=0.0,
        )
        track.clips.append(clip)
        project.tracks.append(track)
        created_track_id = track.id
        created_clip_id = clip.id

    # Update project duration if extended
    end_time = req.playhead_time + meta.duration
    if end_time > project.duration:
        project.duration = end_time

    await ProjectService.update_project(project_id, project)
    logger.info(f"Committed AI audio '{asset_id}' into project '{project_id}' [mode={req.insert_mode}]")

    return {
        "status": "accepted",
        "asset_id": asset_id,
        "track_id": created_track_id,
        "clip_id": created_clip_id,
        "duration": meta.duration,
        "stream_url": f"/api/projects/{project_id}/media/{asset_id}/stream",
        "waveform_url": f"/api/projects/{project_id}/media/{asset_id}/waveform",
    }


@router.delete("/generate/{job_id}")
async def discard_generation(project_id: str, job_id: str):
    """Discard candidate preview audio."""
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    for ext in [".wav", ".json"]:
        fpath = bundle_dir / "cache" / "generated" / f"{job_id}{ext}"
        if fpath.exists():
            try:
                fpath.unlink()
            except Exception as e:
                logger.warning(f"Failed to delete {fpath}: {e}")

    return {"status": "discarded", "job_id": job_id}
