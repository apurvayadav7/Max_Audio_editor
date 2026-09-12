"""Vocal Pitch Tracking API Endpoint."""

from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from backend.app.storage.project_format import ProjectFormat
from backend.app.services.media_service import MediaService
from backend.app.audio.pitch import PitchTracker
from backend.app.logging_config import logger

router = APIRouter(prefix="/api/projects/{project_id}/media/{media_id}/pitch", tags=["Pitch"])


@router.get("")
async def get_pitch_data(
    project_id: str,
    media_id: str,
    fmin: float = Query(65.0, ge=30.0, le=500.0),
    fmax: float = Query(1046.5, ge=200.0, le=4000.0),
):
    """
    Retrieve or compute vocal pitch tracking data (f0 contour, MIDI notes, and pitch stats).
    Cached in project bundle.
    """
    try:
        audio_path = Path(MediaService.get_media_path(project_id, media_id))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Media '{media_id}' not found in project '{project_id}'.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    cache_json = bundle_dir / "cache" / "pitch" / f"{media_id}_pitch.json"

    try:
        pitch_data = PitchTracker.analyze_pitch(
            audio_path=audio_path,
            cache_json_path=cache_json,
            fmin=fmin,
            fmax=fmax,
        )
        return JSONResponse(content=pitch_data)
    except Exception as e:
        logger.error(f"Pitch analysis failed for {media_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to analyze pitch: {e}")
