"""Spectrogram API Endpoint."""

from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import JSONResponse

from backend.app.storage.project_format import ProjectFormat
from backend.app.services.media_service import MediaService
from backend.app.audio.spectrogram import SpectrogramEngine
from backend.app.logging_config import logger

router = APIRouter(prefix="/api/projects/{project_id}/media/{media_id}/spectrogram", tags=["Spectrogram"])


@router.get("")
async def get_spectrogram(
    project_id: str,
    media_id: str,
    colormap: str = Query("cyberpunk", pattern="^(cyberpunk|magma|viridis)$"),
    n_mels: int = Query(128, ge=32, le=512),
    format: str = Query("png", pattern="^(png|json)$"),
):
    """
    Retrieve or compute Mel-frequency decibel spectrogram image (PNG) or metadata (JSON).
    Cached per (project_id, media_id, colormap, n_mels).
    """
    try:
        audio_path = Path(MediaService.get_media_path(project_id, media_id))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Media '{media_id}' not found in project '{project_id}'.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    cache_png = bundle_dir / "cache" / "spectrograms" / f"{media_id}_{colormap}_{n_mels}.png"

    try:
        png_bytes, metadata = SpectrogramEngine.generate_spectrogram_image(
            audio_path=audio_path,
            cache_png_path=cache_png,
            colormap=colormap,
            n_mels=n_mels,
        )

        if format == "json":
            return JSONResponse(content=metadata)
        
        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=86400",
                "X-Audio-Duration": str(metadata["duration"]),
                "X-Spectrogram-Width": str(metadata["width"]),
                "X-Spectrogram-Height": str(metadata["height"]),
            }
        )
    except Exception as e:
        logger.error(f"Spectrogram generation failed for {media_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate spectrogram: {e}")
