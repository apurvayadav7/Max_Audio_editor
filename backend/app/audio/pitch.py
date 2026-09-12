"""Vocal Pitch Tracking Engine — Fundamental Frequency (f0), MIDI Note & Cents Analysis."""

import json
from pathlib import Path
from typing import Optional, Dict, Any, List
import numpy as np
import soundfile as sf
import librosa

from backend.app.logging_config import logger


class PitchTracker:
    """Extracts fundamental frequency (f0) contour, MIDI notes, and pitch deviations."""

    @classmethod
    def analyze_pitch(
        cls,
        audio_path: Path,
        cache_json_path: Optional[Path] = None,
        fmin: float = 65.0,     # ~C2 (low baritone)
        fmax: float = 1046.5,   # ~C6 (high soprano)
        hop_length: int = 512,
        target_sr: int = 22050,
    ) -> Dict[str, Any]:
        """
        Analyze vocal/melodic pitch contour using librosa.pyin.
        Returns time-series of pitch detections, MIDI notes, and overall vocal statistics.
        """
        if cache_json_path and cache_json_path.exists():
            try:
                with open(cache_json_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to read pitch cache, recomputing: {e}")

        # Load audio (downsampled to 22050Hz for 4x faster pyin computation without losing vocal accuracy)
        y, sr = librosa.load(str(audio_path), sr=target_sr, mono=True)
        duration = float(len(y)) / sr

        logger.info(f"Extracting pitch for '{audio_path.name}' (duration: {duration:.2f}s, sr: {sr})")

        # Run probabilistic YIN (pYIN)
        f0, voiced_flag, voiced_probs = librosa.pyin(
            y,
            fmin=fmin,
            fmax=fmax,
            sr=sr,
            hop_length=hop_length,
            fill_na=None,
        )

        times = librosa.times_like(f0, sr=sr, hop_length=hop_length)

        frames_data: List[Dict[str, Any]] = []
        valid_pitches: List[float] = []
        valid_midis: List[float] = []

        for t, freq, voiced, prob in zip(times, f0, voiced_flag, voiced_probs):
            t_sec = round(float(t), 3)
            is_voiced = bool(voiced) and (freq is not None) and not np.isnan(freq)

            if is_voiced:
                f_val = round(float(freq), 2)
                midi_val = float(librosa.hz_to_midi(freq))
                nearest_semi = int(round(midi_val))
                cents = round((midi_val - nearest_semi) * 100.0, 1)
                note_name = librosa.midi_to_note(nearest_semi)

                valid_pitches.append(f_val)
                valid_midis.append(midi_val)

                frames_data.append({
                    "t": t_sec,
                    "hz": f_val,
                    "midi": round(midi_val, 2),
                    "note": note_name,
                    "cents": cents,
                    "prob": round(float(prob), 3),
                })
            else:
                frames_data.append({
                    "t": t_sec,
                    "hz": None,
                    "midi": None,
                    "note": None,
                    "cents": None,
                    "prob": round(float(prob), 3) if prob is not None and not np.isnan(prob) else 0.0,
                })

        # Calculate vocal statistics
        if valid_pitches:
            min_hz = float(np.min(valid_pitches))
            max_hz = float(np.max(valid_pitches))
            mean_hz = float(np.mean(valid_pitches))
            median_hz = float(np.median(valid_pitches))
            lowest_note = librosa.midi_to_note(int(round(librosa.hz_to_midi(min_hz))))
            highest_note = librosa.midi_to_note(int(round(librosa.hz_to_midi(max_hz))))
            voiced_percentage = round((len(valid_pitches) / max(len(frames_data), 1)) * 100.0, 1)
        else:
            min_hz = max_hz = mean_hz = median_hz = 0.0
            lowest_note = highest_note = "N/A"
            voiced_percentage = 0.0

        result = {
            "duration": round(duration, 3),
            "hop_length": hop_length,
            "sample_rate": sr,
            "total_frames": len(frames_data),
            "voiced_percentage": voiced_percentage,
            "stats": {
                "min_hz": round(min_hz, 2),
                "max_hz": round(max_hz, 2),
                "mean_hz": round(mean_hz, 2),
                "median_hz": round(median_hz, 2),
                "lowest_note": lowest_note,
                "highest_note": highest_note,
            },
            "frames": frames_data,
        }

        if cache_json_path:
            cache_json_path.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_json_path, "w", encoding="utf-8") as f:
                json.dump(result, f)
            logger.info(f"Cached vocal pitch data ({len(frames_data)} frames) to {cache_json_path.name}")

        return result
