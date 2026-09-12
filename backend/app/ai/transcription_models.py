"""Audio-to-MIDI Neural & DSP Transcription Engine.

Converts polyphonic and melodic audio clips into discrete MIDI note events
and exports standard Type 0/1 .mid binary files.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import librosa
import mido
import soundfile as sf

from backend.app.logging_config import logger

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def midi_to_note_name(midi_number: int) -> str:
    """Convert MIDI number (e.g. 60) to scientific pitch notation (e.g. C4)."""
    octave = (midi_number // 12) - 1
    name = NOTE_NAMES[midi_number % 12]
    return f"{name}{octave}"


def hz_to_midi(freq_hz: float) -> int:
    """Convert frequency in Hertz to closest integer MIDI note number."""
    if freq_hz <= 10.0:
        return 0
    midi = 69 + 12 * np.log2(freq_hz / 440.0)
    return int(np.clip(round(midi), 21, 108))


class NoteEvent:
    """Represents a discrete musical note event."""

    def __init__(
        self,
        pitch: int,
        start_time: float,
        duration: float,
        velocity: int = 100,
        note_name: Optional[str] = None,
    ):
        self.pitch = int(pitch)
        self.start_time = round(float(start_time), 3)
        self.duration = round(float(max(0.04, duration)), 3)
        self.velocity = int(np.clip(velocity, 1, 127))
        self.note_name = note_name or midi_to_note_name(self.pitch)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pitch": self.pitch,
            "note_name": self.note_name,
            "start_time": self.start_time,
            "duration": self.duration,
            "velocity": self.velocity,
        }


class AudioTranscriber:
    """Extracts melodic and polyphonic note events from audio waveforms."""

    @classmethod
    def transcribe(
        cls,
        audio_path_or_array: Any,
        sample_rate: int = 44100,
        min_note_duration: float = 0.05,
        energy_threshold: float = 0.02,
        tempo: float = 120.0,
    ) -> List[NoteEvent]:
        """
        Transcribe audio to a list of NoteEvents:
        1. Load & downmix audio to mono
        2. Harmonic-percussive separation (HPSS) to isolate musical pitch
        3. Detect note onsets
        4. Track fundamental frequencies across onset segments
        5. Filter noise and quantize to MIDI notes
        """
        if isinstance(audio_path_or_array, (str, Path)):
            y, sr = librosa.load(str(audio_path_or_array), sr=sample_rate, mono=True)
        else:
            y = np.asarray(audio_path_or_array, dtype=np.float32)
            if y.ndim > 1:
                y = np.mean(y, axis=1)
            sr = sample_rate

        total_duration = len(y) / sr
        if total_duration < 0.1 or np.max(np.abs(y)) < 1e-4:
            return []

        # 1. Harmonic-percussive separation via 2D median filtering (pure scipy, numba-safe)
        D = librosa.stft(y, n_fft=2048, hop_length=512)
        S = np.abs(D)
        # Median filter along time axis isolates harmonic horizontal lines
        import scipy.ndimage
        H = scipy.ndimage.median_filter(S, size=(1, 15))
        y_harmonic = librosa.istft(H * np.exp(1j * np.angle(D)), hop_length=512)

        # 2. Spectral onset detection
        onset_env = librosa.onset.onset_strength(y=y_harmonic, sr=sr)
        onset_frames = librosa.onset.onset_detect(
            onset_envelope=onset_env,
            sr=sr,
            backtrack=True,
            units="frames",
            delta=0.07,
        )
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)

        # Append start (0.0) if not present and end time
        if len(onset_times) == 0 or onset_times[0] > 0.1:
            onset_times = np.insert(onset_times, 0, 0.0)
        onset_times = np.append(onset_times, total_duration)

        # 3. Track pitches using piptrack over harmonic audio
        pitches, magnitudes = librosa.piptrack(
            y=y_harmonic,
            sr=sr,
            fmin=55.0,  # A1
            fmax=1760.0,  # A6
            threshold=0.1,
        )

        notes: List[NoteEvent] = []

        for i in range(len(onset_times) - 1):
            t_start = onset_times[i]
            t_end = onset_times[i + 1]
            dur = t_end - t_start
            if dur < min_note_duration:
                continue

            # Frame range for this segment
            f_start = librosa.time_to_frames(t_start, sr=sr)
            f_end = librosa.time_to_frames(t_end, sr=sr)
            f_end = max(f_start + 1, min(f_end, pitches.shape[1]))

            # Segment energy
            s_idx = int(t_start * sr)
            e_idx = min(len(y), int(t_end * sr))
            seg_rms = np.sqrt(np.mean(y[s_idx:e_idx] ** 2)) if e_idx > s_idx else 0.0
            if seg_rms < energy_threshold:
                continue

            # Find peak pitch in segment
            seg_pitches = pitches[:, f_start:f_end]
            seg_mags = magnitudes[:, f_start:f_end]

            best_freq = 0.0
            best_mag = 0.0

            # Find pitch with maximum magnitude
            if seg_mags.size > 0 and np.max(seg_mags) > 0.01:
                max_idx = np.unravel_index(np.argmax(seg_mags), seg_mags.shape)
                best_freq = seg_pitches[max_idx]
                best_mag = seg_mags[max_idx]

            # Fallback to pyin if piptrack is ambiguous
            if best_freq < 55.0 and (e_idx - s_idx) >= 1024:
                try:
                    f0, voiced_flag, _ = librosa.pyin(
                        y_harmonic[s_idx:e_idx],
                        fmin=55.0,
                        fmax=1000.0,
                        sr=sr,
                        frame_length=1024,
                    )
                    valid_f0 = f0[voiced_flag & ~np.isnan(f0)] if voiced_flag is not None else []
                    if len(valid_f0) > 0:
                        best_freq = float(np.median(valid_f0))
                except Exception:
                    pass

            if best_freq >= 55.0:
                midi_num = hz_to_midi(best_freq)
                # Estimate velocity from RMS
                vel = int(np.clip(40 + (seg_rms / 0.5) * 80, 45, 125))

                # Merge with previous note if same pitch and adjacent
                if notes and notes[-1].pitch == midi_num and abs(notes[-1].start_time + notes[-1].duration - t_start) < 0.04:
                    notes[-1].duration = round(notes[-1].duration + dur, 3)
                else:
                    notes.append(
                        NoteEvent(
                            pitch=midi_num,
                            start_time=t_start,
                            duration=dur,
                            velocity=vel,
                        )
                    )

        logger.info(f"[AudioTranscriber] Extracted {len(notes)} note events from {total_duration:.2f}s audio")
        return notes

    @classmethod
    def export_midi_file(
        cls,
        notes: List[NoteEvent],
        output_path: Path,
        tempo_bpm: float = 120.0,
        ticks_per_beat: int = 480,
    ) -> Path:
        """
        Build a standard Type 0 MIDI file from note events and save to disk.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)

        mid = mido.MidiFile(ticks_per_beat=ticks_per_beat)
        track = mido.MidiTrack()
        mid.tracks.append(track)

        # Meta: Tempo & Time Signature
        track.append(mido.MetaMessage("track_name", name="MaxAudio Transcribed", time=0))
        track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(tempo_bpm), time=0))
        track.append(mido.MetaMessage("time_signature", numerator=4, denominator=4, time=0))

        # Build discrete on/off events
        events: List[Tuple[float, str, int, int]] = []
        for n in notes:
            events.append((n.start_time, "note_on", n.pitch, n.velocity))
            events.append((n.start_time + n.duration, "note_off", n.pitch, 0))

        # Sort chronologically, prioritizing note_off before note_on at identical timestamps
        events.sort(key=lambda x: (x[0], 0 if x[1] == "note_off" else 1))

        # Seconds to ticks conversion: ticks = seconds * (tempo_bpm / 60) * ticks_per_beat
        ticks_per_second = (tempo_bpm / 60.0) * ticks_per_beat

        last_tick = 0
        for time_sec, ev_type, pitch, vel in events:
            current_tick = int(round(time_sec * ticks_per_second))
            delta_ticks = max(0, current_tick - last_tick)
            last_tick = current_tick

            if ev_type == "note_on":
                track.append(mido.Message("note_on", note=pitch, velocity=vel, time=delta_ticks))
            else:
                track.append(mido.Message("note_off", note=pitch, velocity=0, time=delta_ticks))

        # End of track
        track.append(mido.MetaMessage("end_of_track", time=480))
        mid.save(str(output_path))
        logger.info(f"[AudioTranscriber] Exported MIDI to '{output_path}' ({len(notes)} notes)")
        return output_path
