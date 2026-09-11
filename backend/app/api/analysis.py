"""Music analysis REST endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from backend.app.jobs.manager import job_manager
from backend.app.jobs.model import Job, JobType
from backend.app.services.analysis_service import analysis_service

router = APIRouter(prefix="/api/projects/{project_id}/analysis", tags=["Analysis"])


@router.post("")
async def start_project_analysis(
    project_id: str,
    media_id: Optional[str] = Query(None, description="Specific media asset to analyze"),
):
    """Start an asynchronous music analysis job (BPM, Key, LUFS, Sections)."""
    # Create background job
    job = Job(
        type=JobType.ANALYSIS,
        title=f"Acoustic & Musical Analysis ({project_id})",
        project_id=project_id,
        requires_gpu=False,
    )

    await job_manager.submit(
        job,
        analysis_service.analyze_project_async,
        project_id=project_id,
        media_id=media_id,
    )

    return {"job_id": job.id, "status": "queued", "message": "Analysis started"}


@router.get("")
async def get_project_analysis(project_id: str):
    """Retrieve existing cached analysis for project."""
    cached = await analysis_service.get_cached_analysis(project_id)
    if not cached:
        raise HTTPException(status_code=404, detail="No analysis found for this project. Trigger POST to analyze.")
    return cached
