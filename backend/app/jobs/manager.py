"""Asynchronous Background Job Manager with Priority and Concurrency Semaphores."""

import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Callable, Dict, List, Optional, Set

from backend.app.jobs.model import Job, JobStatus

logger = logging.getLogger("maxaudio.jobs")


class JobManager:
    """Central Job Manager controlling background workers, semaphores, and real-time telemetry."""

    def __init__(self, max_cpu_workers: int = 4, max_gpu_workers: int = 1):
        self.jobs: Dict[str, Job] = {}
        self.cpu_semaphore = asyncio.Semaphore(max_cpu_workers)
        self.gpu_semaphore = asyncio.Semaphore(max_gpu_workers)
        self.cancellation_tokens: Dict[str, asyncio.Event] = {}
        self.subscribers: Set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def submit(
        self,
        job: Job,
        coro_fn: Callable[..., Any],
        *args: Any,
        **kwargs: Any,
    ) -> Job:
        """Submit a background job for managed execution."""
        async with self._lock:
            self.jobs[job.id] = job
            self.cancellation_tokens[job.id] = asyncio.Event()

        # Notify subscribers
        await self.broadcast("job_queued", job.model_dump(mode="json"))

        # Launch background runner task
        asyncio.create_task(self._run_job(job.id, coro_fn, *args, **kwargs))
        logger.info(f"[JobManager] Submitted job '{job.id}' ({job.title}) [GPU={job.requires_gpu}]")
        return job

    async def _run_job(
        self,
        job_id: str,
        coro_fn: Callable[..., Any],
        *args: Any,
        **kwargs: Any,
    ) -> None:
        job = self.jobs.get(job_id)
        if not job:
            return

        semaphore = self.gpu_semaphore if job.requires_gpu else self.cpu_semaphore

        try:
            async with semaphore:
                # Check cancellation before starting
                if self.is_cancelled(job_id):
                    job.status = JobStatus.CANCELLED
                    job.stage = "Cancelled before execution"
                    await self.broadcast("job_cancelled", job.model_dump(mode="json"))
                    return

                job.status = JobStatus.RUNNING
                job.started_at = datetime.now(timezone.utc)
                job.stage = "Started"
                await self.broadcast("job_started", job.model_dump(mode="json"))

                # Execute target function
                # Inject job_id as kwargs if accepted
                result = await coro_fn(job_id=job_id, *args, **kwargs)

                if self.is_cancelled(job_id):
                    job.status = JobStatus.CANCELLED
                    job.stage = "Cancelled"
                    await self.broadcast("job_cancelled", job.model_dump(mode="json"))
                else:
                    job.status = JobStatus.COMPLETED
                    job.progress = 100.0
                    job.stage = "Complete"
                    job.result = result
                    job.completed_at = datetime.now(timezone.utc)
                    await self.broadcast("job_completed", job.model_dump(mode="json"))
                    logger.info(f"[JobManager] Job '{job_id}' completed successfully")

        except asyncio.CancelledError:
            job.status = JobStatus.CANCELLED
            job.stage = "Cancelled"
            job.completed_at = datetime.now(timezone.utc)
            await self.broadcast("job_cancelled", job.model_dump(mode="json"))
            logger.warning(f"[JobManager] Job '{job_id}' was cancelled")
        except Exception as exc:
            job.status = JobStatus.FAILED
            job.error = str(exc)
            job.stage = "Failed"
            job.completed_at = datetime.now(timezone.utc)
            await self.broadcast("job_failed", job.model_dump(mode="json"))
            logger.error(f"[JobManager] Job '{job_id}' failed: {exc}", exc_info=True)

    async def update_progress(self, job_id: str, progress: float, stage: Optional[str] = None) -> None:
        """Update job progress and broadcast telemetry."""
        job = self.jobs.get(job_id)
        if not job or job.status != JobStatus.RUNNING:
            return

        job.progress = min(max(0.0, progress), 100.0)
        if stage:
            job.stage = stage

        await self.broadcast(
            "job_progress",
            {
                "id": job.id,
                "progress": job.progress,
                "stage": job.stage,
                "status": job.status,
            },
        )

    def is_cancelled(self, job_id: str) -> bool:
        token = self.cancellation_tokens.get(job_id)
        return token.is_set() if token else False

    async def cancel_job(self, job_id: str) -> bool:
        token = self.cancellation_tokens.get(job_id)
        if not token:
            return False

        token.set()
        job = self.jobs.get(job_id)
        if job and job.status == JobStatus.QUEUED:
            job.status = JobStatus.CANCELLED
            job.stage = "Cancelled in queue"
            await self.broadcast("job_cancelled", job.model_dump(mode="json"))
        return True

    def get_job(self, job_id: str) -> Optional[Job]:
        return self.jobs.get(job_id)

    def list_jobs(self, project_id: Optional[str] = None) -> List[Job]:
        all_jobs = list(self.jobs.values())
        if project_id:
            return [j for j in all_jobs if j.project_id == project_id]
        # Return newest first
        return sorted(all_jobs, key=lambda j: j.created_at, reverse=True)

    async def broadcast(self, event_type: str, data: Any) -> None:
        """Broadcast payload to all connected WebSocket subscribers."""
        payload = {"event": event_type, "data": data, "timestamp": datetime.now(timezone.utc).isoformat()}
        for queue in list(self.subscribers):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                pass

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self.subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self.subscribers.discard(queue)


# Singleton job manager instance
job_manager = JobManager(max_cpu_workers=4, max_gpu_workers=1)
