"""Unit tests for Phase 5: Music Analysis Engine and Asynchronous Job System."""

import asyncio
from pathlib import Path
import numpy as np
import pytest
import soundfile as sf

from backend.app.jobs.manager import JobManager
from backend.app.jobs.model import Job, JobStatus, JobType
from backend.app.services.analysis_service import MusicAnalysisService
from backend.app.storage.project_format import ProjectFormat
from backend.app.schemas.project import Project


class TestPhase5JobManager:
    """Test background task queues, priority scheduling, and cancellation tokens."""

    @pytest.mark.asyncio
    async def test_job_execution_lifecycle(self):
        manager = JobManager(max_cpu_workers=2, max_gpu_workers=1)

        async def sample_task(job_id: str):
            await manager.update_progress(job_id, 50.0, "Halfway done")
            return {"status": "ok", "value": 42}

        job = Job(type=JobType.ANALYSIS, title="Test Lifecycle")
        submitted = await manager.submit(job, sample_task)

        assert submitted.status in [JobStatus.QUEUED, JobStatus.RUNNING]

        # Wait briefly for execution
        await asyncio.sleep(0.1)

        completed = manager.get_job(job.id)
        assert completed is not None
        assert completed.status == JobStatus.COMPLETED
        assert completed.progress == 100.0
        assert completed.result == {"status": "ok", "value": 42}

    @pytest.mark.asyncio
    async def test_job_cancellation(self):
        manager = JobManager(max_cpu_workers=1)

        async def slow_task(job_id: str):
            for i in range(10):
                if manager.is_cancelled(job_id):
                    return
                await asyncio.sleep(0.05)

        job = Job(type=JobType.ANALYSIS, title="Cancelable Task")
        await manager.submit(job, slow_task)

        # Cancel immediately
        await manager.cancel_job(job.id)
        await asyncio.sleep(0.1)

        canceled_job = manager.get_job(job.id)
        assert canceled_job is not None
        assert canceled_job.status == JobStatus.CANCELLED


class TestPhase5MusicAnalysis:
    """Test acoustic and musical analysis algorithms: BPM, Key, BS.1770 LUFS, and Sections."""

    @pytest.fixture
    def synthetic_audio_path(self, tmp_path):
        """Generate a 4-second 120 BPM stereo sine wave test audio file."""
        sr = 22050
        duration = 4.0
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)

        # 440 Hz A4 tone with 2 Hz amplitude modulation (120 BPM = 2 beats per second)
        carrier = np.sin(2 * np.pi * 440 * t)
        modulator = 0.5 * (1 + np.sin(2 * np.pi * 2.0 * t))
        audio = (carrier * modulator * 0.7).astype(np.float32)

        file_path = tmp_path / "test_synth_120bpm.wav"
        sf.write(str(file_path), audio, sr)
        return file_path

    def test_analysis_sync_pipeline(self, synthetic_audio_path):
        service = MusicAnalysisService()
        result = service.analyze_audio_sync(synthetic_audio_path)

        assert "bpm" in result
        assert result["bpm"] > 30.0  # Detected a valid musical tempo
        assert "key" in result
        assert "integrated_lufs" in result
        assert result["integrated_lufs"] < 0.0  # Valid negative LUFS
        assert "peak_db" in result
        assert "sections" in result
        assert len(result["sections"]) >= 1

    @pytest.mark.asyncio
    async def test_project_analysis_integration(self, tmp_path, monkeypatch):
        # Create a real project bundle
        proj = Project(name="Analysis Test Project", tempo=120.0)
        ProjectFormat.initialize_bundle(proj)

        # Write test audio file into project media directory
        bundle_dir = ProjectFormat.get_bundle_path(proj.id)
        media_dir = bundle_dir / "media"
        media_dir.mkdir(parents=True, exist_ok=True)

        sr = 22050
        audio = (np.sin(2 * np.pi * 440 * np.linspace(0, 3, sr * 3)) * 0.5).astype(np.float32)
        test_wav = media_dir / "med_test.wav"
        sf.write(str(test_wav), audio, sr)

        # Run analysis service
        service = MusicAnalysisService()
        data = await service.analyze_project_async(proj.id)

        assert data["bpm"] > 0
        assert data["key"] != ""

        # Verify cached output
        cached = await service.get_cached_analysis(proj.id)
        assert cached is not None
        assert cached["key"] == data["key"]
