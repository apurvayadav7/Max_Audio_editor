"""Stem separation REST API endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.app.jobs.manager import job_manager
from backend.app.jobs.model import Job, JobType
from backend.app.workers.stem_worker import stem_worker

router = APIRouter(prefix="/api/projects/{project_id}/stems", tags=["Stems"])


class StemSeparationRequest(BaseModel):
    media_id: Optional[str] = None
    model_name: str = "htdemucs"


@router.post("")
async def start_stem_separation(
    project_id: str,
    req: Optional[StemSeparationRequest] = None,
):
    """Enqueue an asynchronous stem separation job on the local GPU."""
    media_id = req.media_id if req else None
    model_name = req.model_name if req else "htdemucs"

    job = Job(
        type=JobType.STEM_SEPARATION,
        title=f"Stem Separation ({model_name})",
        project_id=project_id,
        requires_gpu=True,
    )

    await job_manager.submit(
        job,
        stem_worker.run,
        project_id=project_id,
        media_id=media_id,
        model_name=model_name,
    )

    return {
        "job_id": job.id,
        "status": "queued",
        "requires_gpu": True,
        "message": "Stem separation job queued",
    }
