"""Job management REST and telemetry endpoints."""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query

from backend.app.jobs.manager import job_manager
from backend.app.jobs.model import Job

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


@router.get("", response_model=List[Job])
async def list_jobs(project_id: Optional[str] = Query(None, description="Filter by project ID")):
    """List recent and active background jobs."""
    return job_manager.list_jobs(project_id=project_id)


@router.get("/{job_id}", response_model=Job)
async def get_job(job_id: str):
    """Retrieve specific job status, progress percentage, and result."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return job


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel a running or queued job."""
    success = await job_manager.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found or already completed")
    return {"status": "cancelled", "job_id": job_id}
