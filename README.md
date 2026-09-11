# MaxAudioEditor — 100% Local AI-Native Digital Audio Workstation (DAW)

> **High-Performance, GPU-Accelerated, Privacy-Preserving Audio Workstation Built on FastAPI and Modern Web Audio Standards.**

---

## ⚡ Overview

**MaxAudioEditor** is an advanced, local-first browser DAW designed to leverage local GPU hardware (such as NVIDIA GeForce RTX 4050 6GB with Ada Lovelace Tensor Cores) for offline/real-time DSP, AI stem separation, music analysis, non-destructive editing, and offline sample-accurate rendering.

---

## 🚀 Key Features

### 1. Multi-Track Timeline & Musical Grid
- Sample-accurate interactive timeline with high-DPI waveform peak pyramids (64, 256, 1024, 4096 samples/pixel).
- Musical ruler with bars, beats, and fractional snapping (1 bar, 1/2, 1/4, 1/8, 1/16, free).
- Horizontal zoom scaling (15 to 600 px/s) with microsecond transport clock synchronization.

### 2. 100-Level Non-Destructive Undo/Redo (Command Pattern)
- Full compound command architecture: `Split`, `Move`, `Trim`, `Duplicate`, `Delete`, `Gain`, `Fade`.
- Clip Inspector with sample-accurate timecodes and fades.
- Visual History Panel with click-to-revert time-travel.

### 3. Local GPU-Accelerated AI Stem Separation (Demucs)
- Demucs 4-stem model (`htdemucs`) executed locally via FP16 tensor core acceleration.
- VRAM optimization staying strictly within 1.5 - 2.5 GB without memory spikes.
- Automatically creates 4 synchronized color-coded tracks (`Drums`, `Bass`, `Other`, `Vocals`).

### 4. Music Intelligence & Background Job System
- BPM detection with confidence scoring (`librosa`).
- Musical Key & Scale estimation via Krumhansl-Kessler chromagram correlation.
- ITU-R BS.1770 compliant Integrated LUFS, Loudness Range (LRA), and True Peak metering.
- Automatic musical section segmentation (Intro, Verse, Chorus, Outro) with colored ruler flags.
- Real-time WebSocket job telemetry broadcasting (`/ws/jobs`).

### 5. Professional DSP & Extended Effects Suite
- **4-Band Parametric EQ**: Low/High shelf and peaking filters with live 20Hz - 20kHz logarithmic frequency curve response canvas.
- **Dynamic Compressor & Brickwall Limiter**: Zero-latency peak protection and transparent punch.
- **Tempo Feedback Delay & Algorithmic Reverb**: Diffusion network with wet/dry mix.
- **Tape Saturation**: Soft-clipping hyperbolic tangent (`tanh`) waveshaper with warmth lowpass filter and 4x oversampling.
- **Tube Distortion / Overdrive**: Polynomial waveshaping with pre-gain and tone shaping.
- **Lush Stereo Chorus**: Dual modulated delay lines driven by quadrature sinusoidal LFOs.
- **Stereo Width / M-S Imager**: Mid/Side matrix decoder (0% mono to 200% wide).
- **Preset Engine**: Factory presets for all 9 effect types and custom user preset saving with `localStorage` persistence.

### 6. Parameter Automation Engine
- Collapsible automation sub-lanes under each track (Volume, Pan, FX Parameters).
- Interactive point editing (click to add, drag to move, Alt-click to delete).
- Real-time parameter automation scheduler synchronized with the transport clock.

### 7. Resizable Studio Splitter & Layout Controls
- Draggable splitter handle between timeline and bottom drawer.
- One-click Maximize (`▲`) and Collapse (`▼`) controls.
- Auto-expansion upon tab selection.

### 8. Python Offline Render & Multi-Format Export
- Frame-by-frame sample-accurate mixing engine in NumPy and SciPy (`render_graph.py`).
- Constant-power panning law (-3dB center) and clip envelope fades.
- Export formats: WAV (16, 24, 32-bit float), FLAC (lossless 24-bit), and MP3 (320 kbps).
- Synchronized stem bounce with identical timeline origin.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla ES Modules, Vanilla CSS (Design Tokens), HTML5 Canvas, Web Audio API |
| **Backend** | Python 3.12, FastAPI, Uvicorn, Pydantic v2 |
| **Storage** | Atomic `.maxaudio` project bundles, SQLite index (`aiosqlite`) |
| **DSP & Audio** | NumPy, SciPy Signal, SoundFile, Librosa, Pyloudnorm |
| **Local AI** | PyTorch (CUDA / FP16), Demucs v4 (`htdemucs`) |
| **Testing** | Pytest (33 unit tests across all phases) |

---

## 📦 Quickstart

### Prerequisites
- Windows 10/11 (or Linux / macOS)
- Python 3.12+
- NVIDIA GPU (Optional, recommended for Demucs stem separation)

### Setup & Run
```bash
# 1. Activate virtual environment
.venv\Scripts\activate

# 2. Start local DAW backend server
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000

# 3. Open browser
http://127.0.0.1:8000
```

### Run Unit Tests
```bash
pytest backend/tests/unit/ -v
```

---

## 📜 License
MIT License. 100% Local & Open Source.
