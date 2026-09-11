"""Generate demo audio files for testing DAW audio import and playback."""

import numpy as np
import soundfile as sf
from pathlib import Path

out_dir = Path("data/temp")
out_dir.mkdir(parents=True, exist_ok=True)
out_file = out_dir / "demo_synth_riff.wav"

sr = 44100
duration = 8.0  # seconds
num_samples = int(sr * duration)
t = np.linspace(0, duration, num_samples, endpoint=False, dtype=np.float32)

# Melodic arpeggio pattern in A minor (A3, C4, E4, G4)
arpeggio_freqs = [220.0, 261.63, 329.63, 392.0]
note_duration = 0.25  # 16th notes at 120 bpm
pattern_indices = (t / note_duration).astype(int) % len(arpeggio_freqs)
frequencies = np.array([arpeggio_freqs[i] for i in pattern_indices], dtype=np.float32)

# Synthesis: Saw-like harmonics with stereo chorus detune
left_signal = (
    0.35 * np.sin(2 * np.pi * frequencies * t) +
    0.20 * np.sin(4 * np.pi * frequencies * t) +
    0.10 * np.sin(6 * np.pi * frequencies * t)
)
right_signal = (
    0.35 * np.sin(2 * np.pi * frequencies * 1.003 * t) +
    0.20 * np.sin(4 * np.pi * frequencies * 1.003 * t) +
    0.10 * np.sin(6 * np.pi * frequencies * 1.003 * t)
)

# Apply rhythmic tremolo / amplitude envelope
tremolo = 0.7 + 0.3 * np.sin(2 * np.pi * 8 * t)
left_signal *= tremolo
right_signal *= tremolo

audio_stereo = np.stack([left_signal, right_signal], axis=1)

sf.write(str(out_file), audio_stereo, sr, subtype="FLOAT")
print(f"Generated demo audio: {out_file} ({duration}s, {sr}Hz, stereo)")
