"""Unit tests for Phase 7: Professional DSP, Real-Time Effects & Time/Pitch Engine."""

from pathlib import Path
import numpy as np
import pytest
import soundfile as sf

from backend.app.audio.time_pitch import time_pitch_processor
from backend.app.schemas.clip import Clip
from backend.app.schemas.project import Project
from backend.app.schemas.track import Track
from backend.app.storage.project_format import ProjectFormat


class TestPhase7TimePitchEngine:
    """Validate offline pitch-shifting, time-stretching, and asset caching."""

    def test_pitch_shifting(self, tmp_path):
        """Verify pitch shifting preserves sample rate, channels, and duration."""
        sr = 44100
        t = np.linspace(0, 1.0, sr, endpoint=False)
        audio = (np.sin(2 * np.pi * 440 * t) * 0.5).astype(np.float32)
        in_file = tmp_path / "sine440.wav"
        out_file = tmp_path / "sine_up2.wav"
        sf.write(str(in_file), audio, sr)

        # Shift pitch up by 2 semitones
        res_path, duration, res_sr, channels, sha = time_pitch_processor.process_audio(
            input_path=in_file,
            output_path=out_file,
            semitones=2.0,
            rate=1.0,
        )

        assert res_path.exists()
        assert res_sr == sr
        assert channels == 1
        assert abs(duration - 1.0) < 0.05
        assert len(sha) == 64

    def test_time_stretching(self, tmp_path):
        """Verify time stretching scales duration appropriately."""
        sr = 44100
        t = np.linspace(0, 1.0, sr, endpoint=False)
        audio = (np.sin(2 * np.pi * 330 * t) * 0.5).astype(np.float32)
        in_file = tmp_path / "sine330.wav"
        out_file = tmp_path / "sine_slow.wav"
        sf.write(str(in_file), audio, sr)

        # Slow down by 0.5x rate (should double duration to ~2.0s)
        res_path, duration, res_sr, channels, sha = time_pitch_processor.process_audio(
            input_path=in_file,
            output_path=out_file,
            semitones=0.0,
            rate=0.5,
        )

        assert res_path.exists()
        assert res_sr == sr
        assert abs(duration - 2.0) < 0.15

    def test_sha256_caching(self, tmp_path):
        """Verify deterministic SHA-256 caching avoids duplicate computation."""
        bundle_dir = tmp_path / "test_bundle"
        bundle_dir.mkdir(parents=True, exist_ok=True)

        sr = 44100
        t = np.linspace(0, 0.5, int(sr * 0.5), endpoint=False)
        audio = (np.sin(2 * np.pi * 550 * t) * 0.4).astype(np.float32)
        src_file = bundle_dir / "test_source.wav"
        sf.write(str(src_file), audio, sr)

        # 1st call: Processes audio
        path1, dur1, sr1, ch1, sha1 = time_pitch_processor.get_or_process(
            bundle_dir=bundle_dir,
            source_audio_path=src_file,
            semitones=3.0,
            rate=1.2,
        )

        # 2nd call: Hits disk cache instantly
        path2, dur2, sr2, ch2, sha2 = time_pitch_processor.get_or_process(
            bundle_dir=bundle_dir,
            source_audio_path=src_file,
            semitones=3.0,
            rate=1.2,
        )

        assert path1 == path2
        assert sha1 == sha2
        assert dur1 == dur2
