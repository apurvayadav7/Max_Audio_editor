"""Audio Export API Endpoints."""

from typing import Literal, Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.app.storage.project_format import ProjectFormat
from backend.app.services.export_service import ExportService
from backend.app.logging_config import logger

router = APIRouter(prefix="/api/projects/{project_id}/export", tags=["Export"])


class ExportRequest(BaseModel):
    format: Literal["wav", "flac", "mp3"] = "wav"
    sample_rate: Literal[44100, 48000, 96000] = 44100
    bit_depth: Literal[16, 24, 32] = 24
    mode: Literal["master", "stems"] = "master"
    start_time: Optional[float] = Field(default=None, ge=0.0)
    end_time: Optional[float] = Field(default=None, ge=0.0)


@router.post("")
async def export_project_endpoint(project_id: str, request: ExportRequest):
    """Render timeline and export audio file(s)."""
    try:
        project = ProjectFormat.load(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    time_range = None
    if request.start_time is not None and request.end_time is not None:
        if request.end_time > request.start_time:
            time_range = (request.start_time, request.end_time)

    try:
        result = ExportService.export_project(
            project=project,
            format_type=request.format,
            sample_rate=request.sample_rate,
            bit_depth=request.bit_depth,
            export_mode=request.mode,
            time_range=time_range,
        )
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"Export failed for project {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{export_id}/download")
async def download_exported_file(
    project_id: str,
    export_id: str,
    filename: str = Query(..., description="Target file name"),
):
    """Download an exported audio master or stem file."""
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    file_path = bundle_dir / "renders" / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Export file not found: {filename}")

    # Determine media type
    ext = file_path.suffix.lower()
    media_types = {
        ".wav": "audio/wav",
        ".flac": "audio/flac",
        ".mp3": "audio/mpeg",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type=media_type,
    )
