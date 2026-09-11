# MaxAudioEditor — Audio Engine & DSP Architecture Plan

This document details the dual-engine audio architecture of **MaxAudioEditor**: the client-side **Web Audio API real-time playback engine** and the server-side **Python/NumPy high-precision offline rendering engine**.

---

## 1. Dual-Engine Philosophy & DSP Parity

A core challenge in modern web DAWs is ensuring that what the user hears in the browser during editing matches **sample-for-sample** what is rendered to disk upon export.

```
┌────────────────────────────────────────────────────────┐
│                   CLIENT-SIDE ENGINE                   │
│             Web Audio API + AudioWorklets              │
│  - Ultra-low latency playback (< 10ms)                 │
│  - Real-time parameter modulation & automation         │
│  - Dynamic interactive mixer & insert rack             │
└──────────────────────────┬─────────────────────────────┘
                           │ Shared Mathematical Semantics
                           │ (dB gains, cutoff Hz, Q, ratios)
┌──────────────────────────┴─────────────────────────────┐
│                   SERVER-SIDE ENGINE                   │
│               Python + NumPy + SciPy + DSP             │
│  - 64-bit float precision offline summing              │
│  - High-order IIR/FIR filter modeling                  │
│  - High-quality sinc interpolation & Rubber Band pitch │
│  - Exact bit-perfect exports (WAV/FLAC/MP3)            │
└────────────────────────────────────────────────────────┘
```

---

## 2. Client-Side Web Audio Routing Graph

The browser engine constructs a dynamic directed acyclic audio graph for each project:

```
[Audio Clip 1] ──┐
                 ├──> [Track 1 Channel Strip] ──┐
[Audio Clip 2] ──┘   (Gain, Pan, Inserts Rack) │
                                                │
[Audio Clip 3] ──────> [Track 2 Channel Strip] ──┼──> [Submix Buses / Sends]
                                                │           │
[Audio Clip 4] ──────> [Track 3 Channel Strip] ──┘           │
                                                │           │
                                                ▼           ▼
                                       ┌────────────────────────┐
                                       │    Master Bus Rack     │
                                       │ (EQ -> Comp -> Limiter)│
                                       └───────────┬────────────┘
                                                   │
                                                   ▼
                                         [AnalyserNode (Meters)]
                                                   │
                                                   ▼
                                        [AudioContext.destination]
```

### 2.1 Track Channel Strip Structure

For every track, the following nodes are chained:
1. **Track Input Node (`GainNode`)**: Serves as the summation point for all active clips on this track.
2. **Effects Insert Chain**:
   - `BiquadFilterNode` (4-band Parametric EQ)
   - `DynamicsCompressorNode` (Track Dynamics)
   - `AudioWorkletNode` ("noise-gate-processor")
   - `WaveShaperNode` (Saturation / Drive)
   - `DelayNode` + Feedback Gain (Stereo Delay)
   - `ConvolverNode` + Wet/Dry Gain (Convolution Reverb)
3. **Track Volume Fader (`GainNode`)**: Controlled in decibels converted to linear amplitude (`10 ** (gain_dB / 20)`).
4. **Track Panning Node (`StereoPannerNode`)**: Controlled from `-1.0` (Full Left) to `+1.0` (Full Right).
5. **Mute / Solo Switch**:
   - Mute ramps gain to `0.0` within 10ms to eliminate clicks.
   - Solo mutes all un-soloed tracks simultaneously.
6. **Auxiliary Send Taps (`GainNode`)**: Routes a configurable fraction of the track's signal to Submix/Auxiliary Buses (e.g. Shared Reverb Bus).

---

## 3. Lookahead Audio Scheduling & Transport Engine

Web Audio nodes must not be triggered via JavaScript `setTimeout` or `setInterval` due to browser main-thread jitter. Instead, MaxAudioEditor implements a **Lookahead Clock Scheduler**:

```javascript
class AudioScheduler {
    constructor(audioContext, scheduleAheadTime = 0.1, lookaheadInterval = 25) {
        this.ctx = audioContext;
        this.scheduleAheadTime = scheduleAheadTime; // Schedule 100ms in advance
        this.lookaheadInterval = lookaheadInterval; // Tick every 25ms
        this.timerId = null;
        this.nextPlaybackTime = 0;
    }

    start() {
        this.timerId = setInterval(() => this.scheduleEvents(), this.lookaheadInterval);
    }

    scheduleEvents() {
        const currentTime = this.ctx.currentTime;
        const horizon = currentTime + this.scheduleAheadTime;

        // Iterate over all active project clips and schedule buffer starts within horizon
        project.tracks.forEach(track => {
            if (track.isMuted) return;
            track.clips.forEach(clip => {
                this.scheduleClipPlayback(clip, currentTime, horizon);
            });
        });
    }
}
```

### Transport State Machine

```
   ┌──────────┐      Play       ┌───────────┐
   │ STOPPED  ├────────────────>│  PLAYING  │
   └────▲─────┘                 └─────┬─────┘
        │                             │
        │ Stop                  Pause │ Resume
        │                             ▼
   ┌────┴─────────────────────────────┴─────┐
   │                PAUSED                  │
   └────────────────────────────────────────┘
```

- **Seek:** When seeking, all running `AudioBufferSourceNode`s are stopped immediately, the transport playhead resets, and the scheduler schedules new nodes from the target offset.
- **Looping:** Seamless boundary looping via modulo scheduling on `AudioBufferSourceNode.loop` and timeline wrap-around logic.

---

## 4. Custom AudioWorklet DSP Processors

Native Web Audio nodes lack a brickwall lookahead limiter and a fast-acting noise gate. MaxAudioEditor implements these in real-time Web Audio Worklets running on the browser's dedicated high-priority audio thread.

### 4.1 Brickwall Limiter Processor (`limiter-processor.js`)

- **Role:** Guarantees zero digital clipping by looking ahead 5ms and applying an adaptive envelope release.
- **Parameters:** `threshold` (dB), `ceiling` (dB, default -0.1 dBTP), `release` (ms).
- **Buffer:** Circular ring buffer holding lookahead sample frames.

### 4.2 Noise Gate Processor (`gate-processor.js`)

- **Role:** Silences background hiss or mic bleed during pauses in vocals/stems.
- **Parameters:** `threshold` (dB), `attack` (ms), `hold` (ms), `release` (ms).

---

## 5. Non-Destructive Clip Mathematics

Editing audio in MaxAudioEditor is completely non-destructive. Modifying, trimming, or splitting a clip never mutates the underlying audio file.

### Clip Parameter Semantics

```json
{
  "id": "clip_vocals_01",
  "sourceId": "media_orig_song",
  "trackId": "track_vocals",
  "startTime": 16.0,         // Position on project timeline (seconds)
  "duration": 8.5,           // Active playback duration on timeline (seconds)
  "sourceOffset": 32.0,      // Offset into raw media file (seconds)
  "gain": 0.0,               // Clip gain offset in dB
  "fadeInDuration": 0.05,    // Fade-in duration (seconds)
  "fadeOutDuration": 0.08,   // Fade-out duration (seconds)
  "stretchRatio": 1.0,       // 1.0 = normal, 0.5 = 2x speed, 2.0 = half speed
  "pitchSemitones": 0.0,     // -12.0 to +12.0 semitones
  "isMuted": false,
  "isReversed": false
}
```

### Splitting Mathematics

When a clip of duration $D$ starting at $T_{start}$ with source offset $S_{offset}$ is split at playhead position $T_{split}$:
1. **Clip Left:**
   - $T_{start, 1} = T_{start}$
   - $D_1 = T_{split} - T_{start}$
   - $S_{offset, 1} = S_{offset}$
2. **Clip Right:**
   - $T_{start, 2} = T_{split}$
   - $D_2 = D - D_1$
   - $S_{offset, 2} = S_{offset} + (D_1 \times \text{stretchRatio})$

---

## 6. Server-Side Offline Render Pipeline (Python)

The offline renderer in `backend/app/audio/render_graph.py` takes the identical project JSON and produces a 64-bit float mix matrix:

```python
import numpy as np
import scipy.signal as signal
import soundfile as sf

def render_project(project_state: dict, output_path: str):
    sr = project_state["sample_rate"]
    total_samples = int(project_state["duration"] * sr)
    master_mix = np.zeros((2, total_samples), dtype=np.float64)

    # 1. Render each track independently
    for track in project_state["tracks"]:
        if track["isMuted"]:
            continue

        track_buffer = np.zeros((2, total_samples), dtype=np.float64)

        for clip in track["clips"]:
            # Load cached source PCM
            audio_source = load_media_cached(clip["sourceId"], sr)
            
            # Apply time/pitch transformations if needed
            if clip["stretchRatio"] != 1.0 or clip["pitchSemitones"] != 0.0:
                audio_source = apply_rubberband(audio_source, sr, clip["stretchRatio"], clip["pitchSemitones"])

            # Slice clip region
            start_frame = int(clip["startTime"] * sr)
            offset_frame = int(clip["sourceOffset"] * sr)
            duration_frames = int(clip["duration"] * sr)
            
            clip_data = audio_source[:, offset_frame : offset_frame + duration_frames]
            
            # Apply fades and clip gain
            clip_data = apply_fades(clip_data, sr, clip["fadeInDuration"], clip["fadeOutDuration"])
            clip_data *= 10.0 ** (clip["gain"] / 20.0)
            
            # Sum into track buffer
            track_buffer[:, start_frame : start_frame + duration_frames] += clip_data

        # 2. Apply Track Effects Chain (SciPy IIR filters, dynamic compressors)
        track_buffer = apply_track_dsp(track_buffer, track["effects"], sr)

        # 3. Apply Track Volume & Pan
        vol_lin = 10.0 ** (track["volume"] / 20.0)
        pan = track["pan"] # -1.0 to 1.0
        track_buffer[0, :] *= vol_lin * np.cos((pan + 1) * np.pi / 4)
        track_buffer[1, :] *= vol_lin * np.sin((pan + 1) * np.pi / 4)

        master_mix += track_buffer

    # 4. Apply Master Bus Chain
    master_mix = apply_master_dsp(master_mix, project_state.get("masterEffects", []), sr)

    # 5. Normalize / Brickwall Limiting
    master_mix = apply_brickwall_limiter(master_mix, ceiling_db=-0.1)

    # 6. Write output file
    sf.write(output_path, master_mix.T, sr, subtype="PCM_24")
```

---

## 7. Metering & Loudness Compliance

MaxAudioEditor implements standard broadcast and streaming loudness measurement:

- **EBU R128 / ITU-R BS.1770-4:**
  - Integrated Loudness (LUFS) across full song.
  - Short-Term Loudness (3-second moving window).
  - Momentary Loudness (400ms moving window).
- **True Peak Detection:**
  - 4x oversampling (via Polyphase FIR filter) to detect inter-sample analog reconstruction peaks.
- **Stereo Phase Correlation Meter:**
  - Pearson correlation coefficient between Left and Right channels:
    $$r = \frac{\sum (L \cdot R)}{\sqrt{\sum L^2 \cdot \sum R^2}}$$
    - $+1.0$: Pure mono (in phase)
    - $0.0$: Wide stereo
    - $-1.0$: Out of phase (100% cancellation in mono)
