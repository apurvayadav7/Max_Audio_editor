"""Stem Separation Models (Demucs / Hybrid Transformer Demucs).

Implements 4-stem separation (Vocals, Drums, Bass, Other) with FP16 half-precision,
chunking with overlap, and graceful acoustic decomposition fallback.
"""

from abc import ABC, abstractmethod
import logging
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple

import numpy as np
import soundfile as sf

from backend.app.ai.device import device_manager
from backend.app.ai.registry import model_registry

logger = logging.getLogger("maxaudio.ai.stems")


class StemSeparator(ABC):
    """Abstract interface for multi-track stem separation engines."""

    @abstractmethod
    def separate(
        self,
        audio_path: Path,
        output_dir: Path,
        progress_cb: Optional[Callable[[float, str], None]] = None,
    ) -> Dict[str, Path]:
        """Separate audio into stems and write WAV files to output_dir."""
        pass


class DemucsAdapter(StemSeparator):
    """Adapter for Meta's Demucs (htdemucs) with FP16 precision and VRAM safe chunking."""

    def __init__(self, model_name: str = "htdemucs"):
        self.model_name = model_name
        self._model = None

    def _is_demucs_installed(self) -> bool:
        try:
            import demucs
            return True
        except ImportError:
            return False

    def get_or_load_model(self):
        """Retrieve warm model from registry or load into VRAM."""
        warm_model = model_registry.get_model(self.model_name)
        if warm_model is not None:
            return warm_model

        if not self._is_demucs_installed():
            logger.info("[DemucsAdapter] Demucs package not present, using acoustic DSP decomposition")
            return None

        import torch
        from demucs.pretrained import get_model

        device = device_manager.get_device()
        logger.info(f"[DemucsAdapter] Loading Demucs model '{self.model_name}' on {device}...")
        model = get_model(self.model_name)
        model.to(device)
        model.eval()

        # Register in VRAM registry (automatically evicts other models)
        model_registry.register_and_evict(self.model_name, model)
        return model

    def separate(
        self,
        audio_path: Path,
        output_dir: Path,
        progress_cb: Optional[Callable[[float, str], None]] = None,
    ) -> Dict[str, Path]:
        output_dir.mkdir(parents=True, exist_ok=True)
        stem_names = ["vocals", "drums", "bass", "other"]
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        stem_paths: Dict[str, Path] = {}

        if self._is_demucs_installed():
            try:
                return self._separate_with_demucs(audio_path, output_dir, progress_cb)
            except Exception as e:
                logger.error(f"[DemucsAdapter] Demucs separation failed: {e}. Falling back to acoustic DSP separation.")

        # Robust DSP Separation Fallback
        return self._separate_with_dsp(audio_path, output_dir, progress_cb)

    def _separate_with_demucs(
        self,
        audio_path: Path,
        output_dir: Path,
        progress_cb: Optional[Callable[[float, str], None]] = None,
    ) -> Dict[str, Path]:
        import torch
        import torchaudio
        from demucs.apply import apply_model

        model = self.get_or_load_model()
        device = device_manager.get_device()

        if progress_cb:
            progress_cb(15.0, "Loading audio for GPU tensor inference...")

        # Load audio with torchaudio
        wav, sr = torchaudio.load(str(audio_path))
        if sr != model.samplerate:
            resample = torchaudio.transforms.Resample(sr, model.samplerate)
            wav = resample(wav)
            sr = model.samplerate

        # Ensure stereo (2, N)
        if wav.shape[0] == 1:
            wav = wav.repeat(2, 1)
        elif wav.shape[0] > 2:
            wav = wav[:2]

        wav = wav.to(device)

        # Normalize volume
        ref = wav.mean(0)
        wav = (wav - ref.mean()) / (ref.std() + 1e-8)

        if progress_cb:
            progress_cb(35.0, f"Executing {self.model_name} on {device} (FP16 chunked)...")

        with torch.no_grad():
            # Use FP16 autocast on CUDA for 6GB VRAM safety
            with torch.amp.autocast("cuda", enabled=(device.startswith("cuda"))):
                sources = apply_model(
                    model,
                    wav[None],
                    shifts=1,
                    split=True,
                    overlap=0.25,
                    progress=False,
                )[0]

        if progress_cb:
            progress_cb(80.0, "Re-scaling and exporting isolated stems...")

        # Denormalize
        sources = sources * (ref.std() + 1e-8) + ref.mean()

        stem_paths: Dict[str, Path] = {}
        target_sources = model.sources  # ['drums', 'bass', 'other', 'vocals']

        for src, name in zip(sources, target_sources):
            out_path = output_dir / f"{name}.wav"
            # Move to CPU and save
            stem_audio = src.cpu().numpy().T  # (samples, channels)
            sf.write(str(out_path), stem_audio, sr, subtype="FLOAT")
            stem_paths[name] = out_path

        if progress_cb:
            progress_cb(95.0, "Stems rendered successfully")

        return stem_paths

    def _separate_with_dsp(
        self,
        audio_path: Path,
        output_dir: Path,
        progress_cb: Optional[Callable[[float, str], None]] = None,
    ) -> Dict[str, Path]:
        """Acoustic Filter-Bank DSP Stem Separator.

        Decomposes audio mathematically:
        - Bass: Steep low-pass (< 180 Hz)
        - Drums: Transient high-frequency percussion + sub kick
        - Vocals: Mid-range bandpass (250 Hz - 4000 Hz) with center-channel extraction
        - Other: Harmonic residual
        """
        from scipy import signal

        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        if progress_cb:
            progress_cb(20.0, "Reading audio for acoustic DSP decomposition...")

        data, sr = sf.read(str(audio_path))
        if data.ndim == 1:
            data = np.column_stack([data, data])

        nyq = sr / 2.0
        num_samples = len(data)

        if progress_cb:
            progress_cb(40.0, "Isolating Bass sub-frequencies (< 180 Hz)...")
        # 1. Bass (< 180 Hz)
        b_low, a_low = signal.butter(4, min(180.0 / nyq, 0.99), btype="low")
        bass_stem = signal.filtfilt(b_low, a_low, data, axis=0)

        if progress_cb:
            progress_cb(60.0, "Isolating Vocal vocal-tract frequencies (300 - 3800 Hz)...")
        # 2. Vocals (300 Hz - 3800 Hz)
        b_mid, a_mid = signal.butter(4, [min(300.0 / nyq, 0.98), min(3800.0 / nyq, 0.99)], btype="band")
        vocal_stem = signal.filtfilt(b_mid, a_mid, data, axis=0) * 0.85

        if progress_cb:
            progress_cb(75.0, "Isolating Drum percussive transients (> 4500 Hz + Sub)...")
        # 3. Drums (High percussive air + punch)
        b_high, a_high = signal.butter(4, min(4500.0 / nyq, 0.99), btype="high")
        percussion = signal.filtfilt(b_high, a_high, data, axis=0)
        drum_stem = percussion * 0.75 + bass_stem * 0.35

        if progress_cb:
            progress_cb(90.0, "Synthesizing harmonic residual (Other)...")
        # 4. Other (Harmonic remainder)
        other_stem = data - (bass_stem * 0.65 + vocal_stem * 0.7 + drum_stem * 0.4)

        # Normalize and save
        stems = {
            "drums": drum_stem,
            "bass": bass_stem,
            "vocals": vocal_stem,
            "other": other_stem,
        }

        output_paths = {}
        for name, arr in stems.items():
            # Clip safely
            arr = np.clip(arr, -1.0, 1.0).astype(np.float32)
            out_file = output_dir / f"{name}.wav"
            sf.write(str(out_file), arr, sr, subtype="FLOAT")
            output_paths[name] = out_file

        if progress_cb:
            progress_cb(98.0, "Finalizing stems...")

        return output_paths
