"""Multi-Resolution Waveform Peak Pyramid Generation Engine."""

import json
from pathlib import Path
import numpy as np
import soundfile as sf
from backend.app.logging_config import logger


class WaveformPyramid:
    # Standard resolution pyramid factors (samples per visual peak pair)
    RESOLUTIONS = [64, 256, 1024, 4096]

    @classmethod
    def generate_from_file(cls, audio_file: Path, output_cache_json: Path) -> dict:
        """
        Reads audio file, calculates multi-resolution min/max peaks,
        and saves peak pyramid cache to disk.
        """
        data, sr = sf.read(str(audio_file), dtype="float32", always_2d=True)
        # data shape: (samples, channels)
        num_samples, num_channels = data.shape
        duration = float(num_samples) / sr

        pyramid_data = {
            "sample_rate": sr,
            "channels": num_channels,
            "duration": duration,
            "samples": num_samples,
            "levels": {},
        }

        # For stereo, process each channel
        for step in cls.RESOLUTIONS:
            # Number of blocks
            num_blocks = int(np.ceil(num_samples / step))
            # Pad data with zeros to full blocks if necessary
            padded_len = num_blocks * step
            if padded_len > num_samples:
                pad_width = ((0, padded_len - num_samples), (0, 0))
                padded_data = np.pad(data, pad_width, mode="constant")
            else:
                padded_data = data

            # Reshape into (num_blocks, step, channels)
            blocks = padded_data.reshape(num_blocks, step, num_channels)
            
            # Compute min and max across block axis (axis 1)
            min_peaks = blocks.min(axis=1)  # shape (num_blocks, channels)
            max_peaks = blocks.max(axis=1)  # shape (num_blocks, channels)

            # Store per channel, rounded to 4 decimals to save memory
            level_dict = {
                "step": step,
                "length": num_blocks,
                "channels": [],
            }

            for ch in range(num_channels):
                ch_min = np.round(min_peaks[:, ch], 4).tolist()
                ch_max = np.round(max_peaks[:, ch], 4).tolist()
                level_dict["channels"].append({
                    "min": ch_min,
                    "max": ch_max,
                })

            pyramid_data["levels"][str(step)] = level_dict

        # Save to cache JSON
        output_cache_json.parent.mkdir(parents=True, exist_ok=True)
        with open(output_cache_json, "w", encoding="utf-8") as f:
            json.dump(pyramid_data, f)

        logger.debug(f"Generated waveform pyramid for {audio_file.name} ({num_blocks} blocks at top resolution)")
        return pyramid_data

    @staticmethod
    def load_cached(cache_file: Path) -> dict:
        """Load pre-computed peak pyramid from cache."""
        if not cache_file.exists():
            raise FileNotFoundError(f"Waveform cache missing: {cache_file}")
        with open(cache_file, "r", encoding="utf-8") as f:
            return json.load(f)
