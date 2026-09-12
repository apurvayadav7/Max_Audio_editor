"""Mastering Suite & Audio-to-MIDI Transcription REST API Endpoints."""

from pathlib import Path
from typing import Any, Dict, Optional
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
import soundfile as sf

from backend.app.audio.mastering import MasteringChain, LoudnessAnalyzer
from backend.app.ai.transcription_models import AudioTranscriber
from backend.app.audio.render_graph import render_project_timeline
from backend.app.audio.waveform import WaveformPyramid
from backend.app.audio.decode import probe_audio
from backend.app.schemas.clip import Clip
from backend.app.schemas.media import MediaAsset
from backend.app.schemas.track import Track
from backend.app.services.media_service import MediaService
from backend.app.services.project_service import ProjectService
from backend.app.storage.project_format import ProjectFormat
from backend.app.logging_config import logger

router = APIRouter(prefix="/api/projects/{project_id}", tags=["Mastering & MIDI"])


class MasterRequest(BaseModel):
    preset: str = Field(default="streaming", description="'streaming', 'club', 'podcast', or 'cinematic'")
    target_track_id: Optional[str] = Field(default=None, description="Optional single track ID to master; None for master mix")
    custom_params: Optional[Dict[str, Any]] = None


class TranscribeRequest(BaseModel):
    clip_id: str = Field(description="Clip ID to transcribe to MIDI")
    min_note_duration: float = Field(default=0.05, ge=0.02, le=1.0)
    energy_threshold: float = Field(default=0.02, ge=0.001, le=0.5)


@router.post("/master")
async def master_project(project_id: str, req: MasterRequest):
    """
    Run complete mastering chain on project session or track:
    1. Renders timeline audio
    2. Measures pre-master LUFS and True-Peak
    3. Applies 4-band EQ, glue compression, harmonic exciter, and true-peak limiter
    4. Measures post-master LUFS
    5. Caches mastered audio and waveform pyramid for immediate auditioning
    """
    project = await ProjectService.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    cache_master_dir = bundle_dir / "cache" / "mastering"
    cache_master_dir.mkdir(parents=True, exist_ok=True)

    # 1. Render timeline
    render_tracks = [req.target_track_id] if req.target_track_id else None
    audio_buf, sr = render_project_timeline(
        project=project,
        bundle_dir=bundle_dir,
        target_sample_rate=int(project.sample_rate or 44100),
        render_tracks=render_tracks,
    )

    # Convert shape from (2, frames) to (frames, 2)
    stereo_audio = audio_buf.T

    # 2. Execute Mastering Chain
    mastered_audio, pre_metrics, post_metrics = MasteringChain.process(
        stereo_audio,
        sample_rate=sr,
        preset_name=req.preset,
        custom_params=req.custom_params,
    )

    # 3. Write cached mastered WAV and waveform peak pyramid
    master_id = f"mst_{uuid.uuid4().hex[:8]}"
    out_wav = cache_master_dir / f"{master_id}.wav"
    out_json = cache_master_dir / f"{master_id}.json"

    sf.write(str(out_wav), mastered_audio, sr, subtype="FLOAT")
    WaveformPyramid.generate_from_file(out_wav, out_json)

    return {
        "status": "success",
        "master_id": master_id,
        "preset": req.preset,
        "pre_metrics": pre_metrics.to_dict(),
        "post_metrics": post_metrics.to_dict(),
        "duration": float(len(mastered_audio) / sr),
        "stream_url": f"/api/projects/{project_id}/master/{master_id}/stream",
        "waveform_url": f"/api/projects/{project_id}/master/{master_id}/waveform",
    }


@router.get("/master/{master_id}/stream")
async def stream_mastered_audio(project_id: str, master_id: str):
    """Stream candidate mastered audio for auditioning."""
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    wav_path = bundle_dir / "cache" / "mastering" / f"{master_id}.wav"

    if not wav_path.exists():
        raise HTTPException(status_code=404, detail="Mastered audio not found")

    return FileResponse(
        wav_path,
        media_type="audio/wav",
        filename=f"master_{master_id}.wav",
        headers={"Accept-Ranges": "bytes"},
    )


@router.get("/master/{master_id}/waveform")
async def get_mastered_waveform(project_id: str, master_id: str):
    """Retrieve pre-computed waveform peak pyramid for mastered audio."""
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    json_path = bundle_dir / "cache" / "mastering" / f"{master_id}.json"

    if not json_path.exists():
        raise HTTPException(status_code=404, detail="Waveform data not found")

    return JSONResponse(content=WaveformPyramid.load_cached(json_path))


@router.post("/master/{master_id}/commit")
async def commit_master(project_id: str, master_id: str):
    """Commit mastered audio into the project timeline as a finalized Master track."""
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    master_wav = bundle_dir / "cache" / "mastering" / f"{master_id}.wav"
    if not master_wav.exists():
        raise HTTPException(status_code=404, detail="Mastered audio not found")

    project = await ProjectService.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    media_dir = bundle_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    cache_waveforms_dir = bundle_dir / "cache" / "waveforms"
    cache_waveforms_dir.mkdir(parents=True, exist_ok=True)

    asset_id = f"med_master_{uuid.uuid4().hex[:8]}"
    target_wav_path = media_dir / f"{asset_id}.wav"

    with open(master_wav, "rb") as sf_in, open(target_wav_path, "wb") as sf_out:
        sf_out.write(sf_in.read())

    meta = probe_audio(target_wav_path)
    waveform_cache_path = cache_waveforms_dir / f"{asset_id}.json"
    candidate_json = bundle_dir / "cache" / "mastering" / f"{master_id}.json"
    if candidate_json.exists():
        with open(candidate_json, "rb") as j_in, open(waveform_cache_path, "wb") as j_out:
            j_out.write(j_in.read())
    else:
        WaveformPyramid.generate_from_file(target_wav_path, waveform_cache_path)

    media_asset = MediaAsset(
        id=asset_id,
        project_id=project_id,
        name="Mastered Session Final",
        original_filename="Mastered_Final.wav",
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

    # Create dedicated Master Track
    master_track = Track(
        name="Final Master (LUFS Compliant)",
        type="audio",
        color="#ff007f",  # Studio Magenta
        volume=0.0,
        pan=0.0,
        order=len(project.tracks),
    )
    clip = Clip(
        name="Master Audio",
        source_id=asset_id,
        track_id=master_track.id,
        start_time=0.0,
        duration=meta.duration,
        source_offset=0.0,
        gain=0.0,
    )
    master_track.clips.append(clip)
    project.tracks.append(master_track)

    await ProjectService.update_project(project_id, project)
    logger.info(f"Committed final master '{asset_id}' into project '{project_id}'")

    return {
        "status": "committed",
        "asset_id": asset_id,
        "track_id": master_track.id,
        "clip_id": clip.id,
        "duration": meta.duration,
    }


@router.post("/transcribe")
async def transcribe_clip_to_midi(project_id: str, req: TranscribeRequest):
    """
    Extract discrete MIDI note events from audio clip and build standard .mid file.
    """
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
        raise HTTPException(status_code=404, detail=f"Clip '{req.clip_id}' not found")

    source_path = MediaService.get_media_path(project_id, target_clip.source_id)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Source audio file not found")

    # Extract note events
    notes = AudioTranscriber.transcribe(
        audio_path_or_array=source_path,
        sample_rate=int(project.sample_rate or 44100),
        min_note_duration=req.min_note_duration,
        energy_threshold=req.energy_threshold,
        tempo=float(project.tempo or 120.0),
    )

    # Save standard .mid file in project cache
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    midi_dir = bundle_dir / "cache" / "midi"
    midi_dir.mkdir(parents=True, exist_ok=True)
    out_midi_path = midi_dir / f"{target_clip.id}.mid"

    AudioTranscriber.export_midi_file(
        notes=notes,
        output_path=out_midi_path,
        tempo_bpm=float(project.tempo or 120.0),
    )

    return {
        "status": "success",
        "clip_id": target_clip.id,
        "clip_name": target_clip.name,
        "notes_count": len(notes),
        "notes": [n.to_dict() for n in notes],
        "midi_download_url": f"/api/projects/{project_id}/transcribe/{target_clip.id}/midi",
    }


@router.get("/transcribe/{clip_id}/midi")
async def download_transcribed_midi(project_id: str, clip_id: str):
    """Download exported standard MIDI (.mid) file."""
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    midi_path = bundle_dir / "cache" / "midi" / f"{clip_id}.mid"

    if not midi_path.exists():
        raise HTTPException(status_code=404, detail="Transcribed MIDI file not found. Transcribe first.")

    return FileResponse(
        midi_path,
        media_type="audio/midi",
        filename=f"transcription_{clip_id}.mid",
    )
