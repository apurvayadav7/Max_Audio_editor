"""Time Stretching and Pitch Shifting Engine.

Provides pristine offline phase-vocoder / WSOLA DSP processing
with SHA-256 asset caching for instant recall.
"""

import hashlib
import logging
from pathlib import Path
from typing import Optional, Tuple
import numpy as np
import soundfile as sf
import librosa

logger = logging.getLogger("maxaudio.audio.time_pitch")


class TimePitchProcessor:
    """Offline high-fidelity time stretching and pitch shifting processor."""

    @staticmethod
    def process_audio(
        input_path: Path,
        output_path: Path,
        semitones: float = 0.0,
        rate: float = 1.0,
    ) -> Tuple[Path, float, int, int, str]:
        """Process an audio file with pitch shift and/or time stretch.

        Returns:
            Tuple of (output_path, duration_seconds, sample_rate, channels, sha256_hash)
        """
        input_path = Path(input_path)
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # 1. Read input audio
        data, sr = sf.read(str(input_path), dtype="float32")
        is_stereo = data.ndim == 2 and data.shape[1] == 2

        # Transpose to (channels, samples) if multi-channel
        if is_stereo:
            y = data.T  # (2, N)
        else:
            y = data.reshape(1, -1)  # (1, N)

        # 2. Apply Pitch Shift (-12 to +12 semitones)
        if abs(semitones) > 0.01:
            processed_channels = []
            for ch in y:
                # librosa.effects.pitch_shift preserves duration while shifting pitch
                shifted = librosa.effects.pitch_shift(ch, sr=sr, n_steps=semitones)
                processed_channels.append(shifted)
            y = np.stack(processed_channels, axis=0)

        # 3. Apply Time Stretch (0.25x to 4.0x)
        if abs(rate - 1.0) > 0.01:
            processed_channels = []
            for ch in y:
                # librosa.effects.time_stretch stretches time without altering pitch
                # rate > 1 speeds up (shorter), rate < 1 slows down (longer)
                stretched = librosa.effects.time_stretch(ch, rate=rate)
                processed_channels.append(stretched)
            y = np.stack(processed_channels, axis=0)

        # 4. Format back to (samples, channels)
        if is_stereo:
            out_data = y.T
        else:
            out_data = y[0]

        # Clip safely to avoid digital overs
        out_data = np.clip(out_data, -1.0, 1.0).astype(np.float32)

        # 5. Write to output file
        sf.write(str(output_path), out_data, sr, subtype="FLOAT")

        # 6. Compute metadata
        content_bytes = output_path.read_bytes()
        file_hash = hashlib.sha256(content_bytes).hexdigest()
        info = sf.info(str(output_path))

        logger.info(
            f"[TimePitch] Processed '{input_path.name}' (pitch={semitones:+.1f}st, rate={rate:.2f}x) "
            f"-> {info.duration:.2f}s ({file_hash[:10]})"
        )

        return output_path, info.duration, info.samplerate, info.channels, file_hash

    @classmethod
    def get_or_process(
        cls,
        bundle_dir: Path,
        source_audio_path: Path,
        semitones: float = 0.0,
        rate: float = 1.0,
    ) -> Tuple[Path, float, int, int, str]:
        """Compute or retrieve cached processed audio buffer based on SHA-256 hash."""
        bundle_dir = Path(bundle_dir)
        cache_dir = bundle_dir / "cache" / "time_pitch"
        cache_dir.mkdir(parents=True, exist_ok=True)

        # Hash inputs to generate deterministic cache key
        src_bytes = source_audio_path.read_bytes()
        param_str = f"{semitones:.4f}_{rate:.4f}"
        cache_key = hashlib.sha256(src_bytes + param_str.encode("utf-8")).hexdigest()
        cached_file = cache_dir / f"tp_{cache_key}.wav"

        if cached_file.exists():
            info = sf.info(str(cached_file))
            file_hash = hashlib.sha256(cached_file.read_bytes()).hexdigest()
            logger.info(f"[TimePitch] Cache hit for key {cache_key[:10]}")
            return cached_file, info.duration, info.samplerate, info.channels, file_hash

        # Execute processing
        return cls.process_audio(source_audio_path, cached_file, semitones, rate)


time_pitch_processor = TimePitchProcessor()
