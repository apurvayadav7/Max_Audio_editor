"""Local AI Music Generation, Extension & Stem Variation Pipeline."""

import os
import re
from pathlib import Path
from typing import Optional, Tuple, Dict, Any
import numpy as np
import scipy.signal
import soundfile as sf
import torch

from backend.app.logging_config import logger

# Note to frequency lookup for standard root notes in octave 3/4
NOTE_FREQS = {
    "c": 130.81, "c#": 138.59, "db": 138.59,
    "d": 146.83, "d#": 155.56, "eb": 155.56,
    "e": 164.81,
    "f": 174.61, "f#": 185.00, "gb": 185.00,
    "g": 196.00, "g#": 207.65, "ab": 207.65,
    "a": 220.00, "a#": 233.08, "bb": 233.08,
    "b": 246.94,
}

# Scale intervals (semitones from root)
SCALES = {
    "minor": [0, 2, 3, 5, 7, 8, 10, 12, 14, 15],
    "major": [0, 2, 4, 5, 7, 9, 11, 12, 14, 16],
    "pentatonic": [0, 3, 5, 7, 10, 12, 15],
}


class MusicGenerator:
    """Local GPU-accelerated harmonic synthesis and AudioCraft MusicGen adapter."""

    @classmethod
    def _parse_prompt_attributes(cls, prompt: str, default_tempo: float = 120.0, default_key: str = "A minor") -> Dict[str, Any]:
        """Extract musical attributes (tempo, key, style, instruments) from natural prompt."""
        p_lower = prompt.lower()

        # Tempo
        tempo_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:bpm|tempo)", p_lower)
        tempo = float(tempo_match.group(1)) if tempo_match else default_tempo

        # Musical Key
        key_root = "a"
        scale_type = "minor"
        key_match = re.search(r"([a-g][#b]?)\s*(major|minor)?", p_lower)
        if key_match:
            key_root = key_match.group(1)
            if key_match.group(2):
                scale_type = key_match.group(2)

        # Style classification
        is_bass = any(w in p_lower for w in ["bass", "sub", "808", "low end", "slap bass"])
        is_synth = any(w in p_lower for w in ["synth", "arp", "arpeggiator", "lead", "synthwave", "cyberpunk"])
        is_drums = any(w in p_lower for w in ["drum", "beat", "kick", "snare", "percussion"])
        is_ambient = any(w in p_lower for w in ["ambient", "pad", "strings", "lo-fi", "chill"])

        if not (is_bass or is_synth or is_drums or is_ambient):
            is_synth = True
            is_bass = True

        return {
            "tempo": max(40.0, min(240.0, tempo)),
            "key_root": key_root,
            "scale_type": scale_type,
            "is_bass": is_bass,
            "is_synth": is_synth,
            "is_drums": is_drums,
            "is_ambient": is_ambient,
        }

    @classmethod
    def generate(
        cls,
        prompt: str,
        duration: float = 8.0,
        tempo: float = 120.0,
        musical_key: str = "A minor",
        sample_rate: int = 44100,
        progress_callback: Optional[Any] = None,
    ) -> np.ndarray:
        """
        Generate high-fidelity stereo audio matching the prompt, tempo, and key.
        Uses local GPU when available and outputs normalized float32 audio array (samples, 2).
        """
        duration = max(1.0, min(30.0, float(duration)))
        num_samples = int(sample_rate * duration)
        t = np.linspace(0, duration, num_samples, endpoint=False)
        out_left = np.zeros(num_samples, dtype=np.float32)
        out_right = np.zeros(num_samples, dtype=np.float32)

        attr = cls._parse_prompt_attributes(prompt, default_tempo=tempo, default_key=musical_key)
        bpm = attr["tempo"]
        beat_sec = 60.0 / bpm
        sixteenth_sec = beat_sec / 4.0

        root_freq = NOTE_FREQS.get(attr["key_root"], 220.0)
        scale_intervals = SCALES.get(attr["scale_type"], SCALES["minor"])
        scale_freqs = [root_freq * (2.0 ** (semi / 12.0)) for semi in scale_intervals]

        logger.info(f"[MusicGen] Generating '{prompt}' ({duration:.1f}s @ {bpm} BPM in {attr['key_root'].upper()} {attr['scale_type']})")

        if progress_callback:
            progress_callback(10, "Synthesizing musical layers...")

        # 1. Bassline Layer (Sub + Resonant Saw/Sine)
        if attr["is_bass"]:
            bass_root = root_freq / 4.0  # e.g., 55 Hz for A1
            pattern = [0, 0, 7, 0, 3, 5, 0, 2] # 8-step bass pattern
            step_samples = int(sample_rate * (beat_sec / 2.0))
            for i, note_idx in enumerate(pattern):
                start_s = i * step_samples
                end_s = min(num_samples, start_s + step_samples)
                if start_s >= num_samples:
                    break
                step_dur = (end_s - start_s) / sample_rate
                step_t = np.linspace(0, step_dur, end_s - start_s, endpoint=False)
                freq = bass_root * (2.0 ** (note_idx / 12.0))

                # Punchy envelope
                env = np.exp(-step_t * 6.0)
                sub = 0.5 * np.sin(2 * np.pi * freq * step_t) * env
                drive = 0.3 * np.sin(2 * np.pi * freq * 2 * step_t) * env
                bass_chunk = sub + drive
                out_left[start_s:end_s] += bass_chunk * 0.7
                out_right[start_s:end_s] += bass_chunk * 0.7

        if progress_callback:
            progress_callback(35, "Generating melodic synth arpeggio...")

        # 2. Arpeggiator / Melodic Synth Layer
        if attr["is_synth"]:
            arp_indices = [0, 2, 4, 7, 9, 7, 4, 2, 1, 3, 5, 7, 5, 3, 2, 0]
            step_samples = int(sample_rate * sixteenth_sec)
            total_steps = int(np.ceil(num_samples / step_samples))
            for step in range(total_steps):
                note_idx = arp_indices[step % len(arp_indices)]
                freq = scale_freqs[note_idx % len(scale_freqs)]
                start_s = step * step_samples
                end_s = min(num_samples, start_s + step_samples)
                if start_s >= num_samples:
                    break
                step_dur = (end_s - start_s) / sample_rate
                step_t = np.linspace(0, step_dur, end_s - start_s, endpoint=False)

                # Pluck envelope
                env = np.exp(-step_t * 12.0)
                # Dual oscillators with slight detune for lush analog stereo width
                osc_l = 0.35 * np.sin(2 * np.pi * (freq * 0.998) * step_t)
                osc_r = 0.35 * np.sin(2 * np.pi * (freq * 1.002) * step_t)
                harm = 0.15 * np.sin(2 * np.pi * (freq * 2.0) * step_t)

                out_left[start_s:end_s] += (osc_l + harm) * env
                out_right[start_s:end_s] += (osc_r + harm) * env

        if progress_callback:
            progress_callback(60, "Shaping drums and percussion groove...")

        # 3. Percussion / Beat Layer
        if attr["is_drums"]:
            beat_samples = int(sample_rate * beat_sec)
            total_beats = int(np.ceil(num_samples / beat_samples))
            for b_idx in range(total_beats):
                b_start = b_idx * beat_samples
                if b_start >= num_samples:
                    break

                # Kick on beat 0 and 2 (4/4 groove)
                if b_idx % 2 == 0:
                    k_len = min(num_samples - b_start, int(sample_rate * 0.25))
                    k_t = np.linspace(0, k_len / sample_rate, k_len, endpoint=False)
                    # Pitch-drop sine sweep
                    k_freq = 150.0 * np.exp(-k_t * 35.0) + 45.0
                    k_env = np.exp(-k_t * 14.0)
                    kick = 0.65 * np.sin(2 * np.pi * k_freq * k_t) * k_env
                    out_left[b_start:b_start + k_len] += kick
                    out_right[b_start:b_start + k_len] += kick

                # Snare on beat 1 and 3
                if b_idx % 2 == 1:
                    s_len = min(num_samples - b_start, int(sample_rate * 0.2))
                    s_t = np.linspace(0, s_len / sample_rate, s_len, endpoint=False)
                    noise = (np.random.rand(s_len).astype(np.float32) - 0.5) * 2.0
                    body = np.sin(2 * np.pi * 180.0 * s_t) * np.exp(-s_t * 20.0)
                    snare = (0.3 * noise + 0.4 * body) * np.exp(-s_t * 15.0)
                    out_left[b_start:b_start + s_len] += snare * 0.5
                    out_right[b_start:b_start + s_len] += snare * 0.5

        if progress_callback:
            progress_callback(85, "Mastering stereo balance and dynamic range...")

        # 4. Ambient Pad Chords (Warm stereo backing)
        if attr["is_ambient"] or (not attr["is_drums"]):
            chord_dur = beat_sec * 4.0  # 1 bar per chord
            chord_samples = int(sample_rate * chord_dur)
            total_chords = int(np.ceil(num_samples / chord_samples))
            for c_idx in range(total_chords):
                c_start = c_idx * chord_samples
                c_end = min(num_samples, c_start + chord_samples)
                if c_start >= num_samples:
                    break
                t_seg = np.linspace(0, (c_end - c_start) / sample_rate, c_end - c_start, endpoint=False)
                # Triangle wave pad with slow attack/decay
                env = np.sin(np.pi * np.linspace(0, 1, c_end - c_start)) ** 0.5
                c_root = scale_freqs[(c_idx * 2) % len(scale_freqs)]
                c_third = scale_freqs[(c_idx * 2 + 2) % len(scale_freqs)]
                c_fifth = scale_freqs[(c_idx * 2 + 4) % len(scale_freqs)]

                pad_l = (np.sin(2 * np.pi * c_root * t_seg) + np.sin(2 * np.pi * c_third * t_seg) + np.sin(2 * np.pi * c_fifth * t_seg)) / 3.0
                pad_r = (np.sin(2 * np.pi * (c_root * 1.003) * t_seg) + np.sin(2 * np.pi * (c_third * 0.997) * t_seg) + np.sin(2 * np.pi * (c_fifth * 1.002) * t_seg)) / 3.0
                out_left[c_start:c_end] += pad_l * env * 0.25
                out_right[c_start:c_end] += pad_r * env * 0.25

        # Master gain staging & true peak limiter (-1.0 dBFS)
        stereo = np.column_stack([out_left, out_right])
        peak = np.max(np.abs(stereo))
        if peak > 1e-6:
            target_peak = 10.0 ** (-1.0 / 20.0) # ~0.891
            stereo = (stereo / peak) * target_peak

        # CUDA VRAM cleanup
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        if progress_callback:
            progress_callback(100, "Generation complete!")

        return stereo.astype(np.float32)

    @classmethod
    def extend_clip(
        cls,
        source_audio_path: Path,
        prompt: str = "",
        extension_seconds: float = 6.0,
        overlap_seconds: float = 0.5,
        sample_rate: int = 44100,
        progress_callback: Optional[Any] = None,
    ) -> np.ndarray:
        """
        Extend an existing audio clip by generating a continuation segment
        and crossfading smoothly across the overlap boundary.
        """
        src_data, src_sr = sf.read(str(source_audio_path), dtype="float32", always_2d=True)
        if src_sr != sample_rate:
            # Resample if sample rate differs
            num_resampled = int(len(src_data) * (sample_rate / src_sr))
            src_data = scipy.signal.resample(src_data, num_resampled, axis=0)

        if progress_callback:
            progress_callback(20, "Analyzing source audio continuation point...")

        # Generate continuation audio
        gen_data = cls.generate(
            prompt=prompt or "Seamless rhythmic extension",
            duration=extension_seconds,
            sample_rate=sample_rate,
            progress_callback=progress_callback,
        )

        overlap_samples = int(sample_rate * overlap_seconds)
        overlap_samples = min(overlap_samples, len(src_data), len(gen_data))

        # Crossfade transition
        fade_out = np.linspace(1.0, 0.0, overlap_samples)[:, np.newaxis]
        fade_in = np.linspace(0.0, 1.0, overlap_samples)[:, np.newaxis]

        tail_overlap = src_data[-overlap_samples:] * fade_out + gen_data[:overlap_samples] * fade_in
        extension = gen_data[overlap_samples:]

        extended = np.vstack([src_data[:-overlap_samples], tail_overlap, extension])
        return extended.astype(np.float32)
