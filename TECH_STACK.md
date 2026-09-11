# MaxAudioEditor — Technology Stack Specification

This document specifies the complete technology stack for **MaxAudioEditor**, including runtime environments, backend libraries, local AI models, audio processing tools, and frontend standards.

---

## 1. System & Runtime Environment

| Component | Specification / Version | Rationale |
|-----------|-------------------------|-----------|
| **Host OS** | Windows 10/11 (64-bit) | Target developer and user environment |
| **Python** | 3.11.x – 3.12.x | High performance, broad PyTorch & C-extension compatibility |
| **GPU Hardware Baseline** | NVIDIA GeForce RTX 4050 (6 GB VRAM) | Laptop baseline target for local inference |
| **CUDA Driver** | 550+ (CUDA 12.1 / 12.4 support) | Required for modern PyTorch CUDA acceleration |
| **Browser Runtime** | Modern Chromium / Firefox / Edge | Standard Web Audio API, Canvas 2D, ES2022+ modules |

---

## 2. External System Binaries

These must be installed on the host OS and available in the system `PATH`:

| Binary | Minimum Version | Purpose | License | Installation / Verification |
|--------|-----------------|---------|---------|-----------------------------|
| **FFmpeg** | 6.0+ | Universal audio decoding, format conversion (MP3/OGG/M4A/FLAC), multi-format export encoding | LGPL / GPL | `winget install Gyan.FFmpeg` or manual zip -> check via `ffmpeg -version` |
| **Rubber Band Library** | 3.3+ | Industry-standard high-fidelity time stretching and formant-preserving pitch shifting | GPL / Commercial | `rubberband -h` |

---

## 3. Backend Python Dependencies

### Core Application & Web Framework

| Package | Version Pin | Purpose | License | Execution |
|---------|-------------|---------|---------|-----------|
| `fastapi` | `^0.115.0` | High-performance asynchronous REST API framework | MIT | CPU |
| `uvicorn[standard]` | `^0.30.0` | Production ASGI server with uvloop and websockets | BSD-3-Clause | CPU |
| `pydantic` | `^2.8.0` | Strict data validation, project schemas, AI operation contracts | MIT | CPU |
| `aiofiles` | `^24.1.0` | Asynchronous file I/O for media assets and projects | Apache 2.0 | CPU |
| `aiosqlite` | `^0.20.0` | Async SQLite driver for project index, cache, and job history | MIT | CPU |
| `websockets` | `^12.0` | Low-latency duplex communication for job progress and telemetry | BSD-3-Clause | CPU |
| `python-multipart` | `^0.0.9` | Streaming multipart file upload handling | Apache 2.0 | CPU |
| `python-dotenv` | `^1.0.1` | Environment variable configuration management | BSD-3-Clause | CPU |

### Audio Engineering & DSP

| Package | Version Pin | Purpose | License | Execution |
|---------|-------------|---------|---------|-----------|
| `soundfile` | `^0.12.1` | High-precision PCM WAV/FLAC reading and writing via libsndfile | BSD-3-Clause | CPU |
| `numpy` | `^1.26.4` | Vectorized multidimensional audio buffer manipulation | BSD-3-Clause | CPU |
| `scipy` | `^1.13.1` | Signal processing: IIR/FIR filters, STFT, convolutions | BSD-3-Clause | CPU |
| `librosa` | `^0.10.2` | Music information retrieval: key estimation, onset detection, chromagrams | ISC | CPU |
| `madmom` | `^0.16.1` | High-accuracy neural beat tracking and downbeat detection | BSD-2-Clause | CPU |
| `pyloudnorm` | `^0.1.1` | EBU R128 and ITU-R BS.1770-4 compliant LUFS & True Peak metering | MIT | CPU |
| `pyrubberband` | `^0.3.0` | Python wrapper for Rubber Band audio time/pitch engine | MIT | CPU |
| `pydub` | `^0.25.1` | High-level audio segmentation and format fallback utilities | MIT | CPU |

### AI, Deep Learning & GPU Acceleration

| Package | Version Pin | Purpose | License | Execution |
|---------|-------------|---------|---------|-----------|
| `torch` | `^2.4.0+cu121` | Deep learning runtime, tensor computation, CUDA backend | BSD-3-Clause | GPU (CUDA) / CPU |
| `torchaudio` | `^2.4.0+cu121` | Audio tensor operations and I/O transforms | BSD-3-Clause | GPU (CUDA) / CPU |
| `demucs` | `^4.0.1` | State-of-the-art music source separation (HTDemucs models) | MIT | GPU (CUDA) / CPU |
| `llama-cpp-python` | `^0.2.89` | GPU-accelerated GGUF LLM inference with cuBLAS | MIT | GPU (CUDA) / CPU |
| `audiocraft` | `^1.3.0` | Meta's generative audio models (MusicGen-small/medium) | MIT | GPU (CUDA) / CPU |
| `basic-pitch` | `^0.3.0` | Spotify's neural polyphonic audio-to-MIDI transcription | Apache 2.0 | CPU / GPU |

### Testing & Development

| Package | Version Pin | Purpose | License |
|---------|-------------|---------|---------|
| `pytest` | `^8.0.0` | Test runner and fixture framework | MIT |
| `pytest-asyncio` | `^0.23.0` | Asynchronous test execution for FastAPI endpoints | Apache 2.0 |
| `pytest-cov` | `^5.0.0` | Test coverage measurement and reporting | MIT |
| `httpx` | `^0.27.0` | Async HTTP client for integration test requests | BSD-3-Clause |

---

## 4. Frontend Technology Stack

To ensure maximum lifetime stability, zero compilation latency, and absolute auditability, the frontend is built **without external heavy frameworks** (no React, no Vue, no Angular, no Webpack, no Vite).

| Technology | Role | Details |
|------------|------|---------|
| **HTML5** | Application Shell | Semantic elements, accessible ARIA attributes, drag-and-drop file target |
| **Vanilla CSS3** | Visual Design System | Custom properties (CSS variables), CSS Grid, Flexbox, hardware-accelerated animations |
| **ES2022+ JavaScript** | Application Logic | Native ES Modules (`import`/`export`), Classes, Promises, Web Workers |
| **Web Audio API** | Real-Time Audio Engine | `AudioContext`, `AudioBufferSourceNode`, `GainNode`, `StereoPannerNode`, `BiquadFilterNode`, `DynamicsCompressorNode`, `ConvolverNode`, `DelayNode` |
| **AudioWorklet** | Low-Latency Custom DSP | Custom zero-latency processors: Brickwall Limiter, Noise Gate |
| **HTML5 Canvas 2D** | High-Performance Visualization | Viewport-clipped multi-resolution waveform rendering, beat grids, automation lanes |
| **WebSockets** | Server-Client Synchronization | Native `window.WebSocket` for bi-directional real-time telemetry |

---

## 5. Storage & Persistence Architecture

| Data Type | Storage Mechanism | Format | Location |
|-----------|-------------------|--------|----------|
| **Project Document** | Filesystem Bundle | `project.json` (UTF-8 formatted JSON) | `data/projects/<id>.maxaudio/project.json` |
| **Project Media** | Local Directory | Standard PCM WAV (32-bit float) | `data/projects/<id>.maxaudio/media/` |
| **Separated Stems** | Local Directory | Standard PCM WAV (32-bit float) | `data/projects/<id>.maxaudio/stems/` |
| **Waveform Peaks** | Local Directory | Binary Float32 / Compact JSON | `data/projects/<id>.maxaudio/cache/waveforms/` |
| **System Index** | SQLite Database | SQLite 3 | `data/maxaudio.db` |
| **AI Models** | Local Directory | `.th`, `.pth`, `.gguf` weights | `data/models/` |

---

## 6. Architecture Rationale Summary

1. **Why FastAPI over Flask / Django?**
   - Native `asyncio` for non-blocking I/O while audio jobs run on background workers.
   - Built-in Pydantic v2 validation guarantees type safety between frontend JSON payloads and backend data models.
   - Auto-generated interactive OpenAPI/Swagger docs for immediate API testing.

2. **Why Vanilla JS & Native Modules over React / Svelte?**
   - DAWs require microsecond-accurate timeline rendering and canvas operations. React's virtual DOM creates unnecessary overhead and reconciliation thrashing when redrawing at 60 FPS.
   - Zero-step build pipeline: files are served directly as static assets by FastAPI during development.

3. **Why GGUF (llama-cpp-python) over Ollama or Cloud APIs?**
   - Zero cloud data leakage: users' music and commands never leave localhost.
   - GGUF 4-bit quantization allows a 3.8B parameter model (Phi-3-mini) to consume only ~2.2 GB VRAM, fitting smoothly on 6GB GPUs alongside Demucs.
