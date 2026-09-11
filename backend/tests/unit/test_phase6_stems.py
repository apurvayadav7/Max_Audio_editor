"""Unit tests for Phase 6: Local GPU Stem Separation Subsystem."""

from pathlib import Path
import numpy as np
import pytest
import soundfile as sf

from backend.app.ai.device import device_manager
from backend.app.ai.stem_models import DemucsAdapter
from backend.app.workers.stem_worker import stem_worker
from backend.app.schemas.project import Project
from backend.app.storage.project_format import ProjectFormat


class TestPhase6GPUAndStems:
    """Validate PyTorch CUDA hardware acceleration and 4-stem separation."""

    def test_cuda_hardware_discovery(self):
        """Verify NVIDIA RTX 4050 GPU detection and VRAM reporting."""
        profile = device_manager.get_gpu_profile()
        assert profile.available is True
        assert "RTX 4050" in profile.device_name
        assert profile.vram_total_mb > 4000
        assert profile.fp16_supported is True
        assert profile.tensor_cores is True
        assert device_manager.get_device() == "cuda:0"

    def test_demucs_adapter_dsp_fallback(self, tmp_path):
        """Verify 4-stem separation produces vocals, drums, bass, and other."""
        # Create a 2-second stereo synthetic mix
        sr = 44100
        t = np.linspace(0, 2.0, sr * 2, endpoint=False)

        # Mix = Bass (100Hz) + Vocals (1000Hz) + Percussion (6000Hz)
        bass = np.sin(2 * np.pi * 100 * t) * 0.5
        vocal = np.sin(2 * np.pi * 1000 * t) * 0.4
        drums = (np.random.rand(len(t)) - 0.5) * 0.3
        mix = np.column_stack([bass + vocal + drums, bass + vocal + drums]).astype(np.float32)

        mix_file = tmp_path / "test_mix.wav"
        sf.write(str(mix_file), mix, sr)

        adapter = DemucsAdapter(model_name="htdemucs")
        out_dir = tmp_path / "stems_out"
        stems = adapter._separate_with_dsp(mix_file, out_dir)

        assert "vocals" in stems
        assert "drums" in stems
        assert "bass" in stems
        assert "other" in stems

        for name, path in stems.items():
            assert Path(path).exists()
            data, out_sr = sf.read(str(path))
            assert out_sr == sr
            assert len(data) == len(mix)

    @pytest.mark.asyncio
    async def test_stem_worker_timeline_ingestion(self, tmp_path):
        """Verify stem_worker ingests 4 stems as synchronized tracks in a Project bundle."""
        proj = Project(name="Stem Ingestion Test")
        ProjectFormat.initialize_bundle(proj)

        # Create source media in bundle
        bundle_dir = ProjectFormat.get_bundle_path(proj.id)
        media_dir = bundle_dir / "media"
        media_dir.mkdir(parents=True, exist_ok=True)

        sr = 44100
        t = np.linspace(0, 1.5, int(sr * 1.5), endpoint=False)
        audio = (np.sin(2 * np.pi * 220 * t) * 0.5).astype(np.float32)
        source_wav = media_dir / "med_source.wav"
        sf.write(str(source_wav), audio, sr)

        # Run stem worker pipeline
        result = await stem_worker.run(proj.id, media_id="med_source")

        assert result["status"] == "completed"
        assert len(result["stems"]) == 4

        # Verify project state has 4 new tracks
        updated_proj = ProjectFormat.load(proj.id)
        assert len(updated_proj.tracks) == 4
        track_names = [t.name for t in updated_proj.tracks]
        assert any("Vocals" in n for n in track_names)
        assert any("Drums" in n for n in track_names)
        assert any("Bass" in n for n in track_names)
        assert any("Other" in n for n in track_names)

        # Verify clips were placed with duration matching source
        for trk in updated_proj.tracks:
            assert len(trk.clips) == 1
            assert abs(trk.clips[0].duration - 1.5) < 0.05
