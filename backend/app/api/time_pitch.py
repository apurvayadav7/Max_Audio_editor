"""Time-Stretching and Pitch-Shifting API Router."""

import hashlib
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.app.audio.time_pitch import time_pitch_processor
from backend.app.audio.waveform import WaveformPyramid
from backend.app.schemas.media import MediaAsset
from backend.app.storage.project_format import ProjectFormat

logger = logging.getLogger("maxaudio.api.time_pitch")

router = APIRouter(prefix="/api/projects/{project_id}/clips/{clip_id}/process", tags=["TimePitch"])


class ProcessClipRequest(BaseModel):
    pitch_semitones: float = Field(default=0.0, ge=-24.0, le=24.0)
    stretch_ratio: float = Field(default=1.0, ge=0.25, le=4.0)


@router.post("")
async def process_clip_time_pitch(
    project_id: str,
    clip_id: str,
    req: ProcessClipRequest,
):
    """Process an audio clip non-destructively with pitch shift and time stretch."""
    project = ProjectFormat.load(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    target_clip = None
    target_track = None
    for track in project.tracks:
        for clip in track.clips:
            if clip.id == clip_id:
                target_clip = clip
                target_track = track
                break
        if target_clip:
            break

    if not target_clip:
        raise HTTPException(status_code=404, detail=f"Clip '{clip_id}' not found in project")

    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    media_dir = bundle_dir / "media"

    # Locate source media file
    src_candidates = list(media_dir.glob(f"{target_clip.source_id}.*"))
    if not src_candidates:
        raise HTTPException(status_code=404, detail=f"Source media '{target_clip.source_id}' not found")

    source_path = src_candidates[0]

    # Process or retrieve from cache
    try:
        out_path, duration, sr, channels, sha256_hash = time_pitch_processor.get_or_process(
            bundle_dir=bundle_dir,
            source_audio_path=source_path,
            semitones=req.pitch_semitones,
            rate=req.stretch_ratio,
        )

        # Create new media asset id for this processed buffer
        processed_asset_id = f"med_tp_{sha256_hash[:12]}"
        dest_media_path = media_dir / f"{processed_asset_id}.wav"

        # Copy to media directory if not already there
        if not dest_media_path.exists():
            dest_media_path.write_bytes(out_path.read_bytes())

        # Generate peak pyramid waveform
        cache_waveform_dir = bundle_dir / "cache" / "waveforms"
        cache_waveform_dir.mkdir(parents=True, exist_ok=True)
        cache_json_path = cache_waveform_dir / f"{processed_asset_id}.json"
        if not cache_json_path.exists():
            WaveformPyramid.generate_from_file(dest_media_path, cache_json_path)

        # Update clip properties
        target_clip.source_id = processed_asset_id
        target_clip.duration = duration
        target_clip.pitch_semitones = req.pitch_semitones
        target_clip.stretch_ratio = req.stretch_ratio

        # Save project
        ProjectFormat.save(project)

        return {
            "status": "success",
            "clip_id": clip_id,
            "processed_asset_id": processed_asset_id,
            "duration": duration,
            "pitch_semitones": req.pitch_semitones,
            "stretch_ratio": req.stretch_ratio,
            "waveform_url": f"/api/projects/{project_id}/media/{processed_asset_id}/waveform",
        }

    except Exception as e:
        logger.error(f"[TimePitch] Error processing clip: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"DSP processing error: {str(e)}")
