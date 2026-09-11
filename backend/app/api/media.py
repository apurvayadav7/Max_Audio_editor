"""Media Asset API Endpoints & Audio Streaming."""

import os
from pathlib import Path
from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse
from backend.app.schemas.media import MediaUploadResponse
from backend.app.services.media_service import MediaService
from backend.app.logging_config import logger

router = APIRouter(prefix="/api/projects/{project_id}/media", tags=["Media"])


@router.post("", response_model=MediaUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_media(
    project_id: str,
    file: UploadFile = File(...),
    auto_track: bool = True
):
    """Upload and decode an audio file (WAV/MP3/FLAC/OGG/M4A), compute waveform peaks, and insert into timeline."""
    try:
        return await MediaService.ingest_media(project_id, file, create_timeline_track=auto_track)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Media upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Audio ingestion failed: {e}")


@router.get("/{media_id}/waveform")
async def get_waveform(project_id: str, media_id: str):
    """Retrieve pre-computed multi-resolution waveform peak pyramid."""
    try:
        return MediaService.get_waveform_data(project_id, media_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Waveform for '{media_id}' not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading waveform: {e}")


@router.get("/{media_id}/stream")
async def stream_media(project_id: str, media_id: str, request: Request):
    """Stream audio asset with HTTP Range support for low-latency browser scrubbing."""
    try:
        file_path = MediaService.get_media_path(project_id, media_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Audio file '{media_id}' not found.")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    if not range_header:
        return FileResponse(
            path=file_path,
            media_type="audio/wav",
            filename=f"{media_id}.wav",
        )

    # Parse byte range header
    byte_range = range_header.replace("bytes=", "").strip()
    range_start, range_end = byte_range.split("-")
    start = int(range_start) if range_start else 0
    end = int(range_end) if range_end else file_size - 1
    chunk_size = (end - start) + 1

    with open(file_path, "rb") as f:
        f.seek(start)
        data = f.read(chunk_size)

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_size),
        "Content-Type": "audio/wav",
    }
    return Response(content=data, status_code=206, headers=headers)
