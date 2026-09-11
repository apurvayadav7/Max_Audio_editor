# MaxAudioEditor — Comprehensive Test & Quality Assurance Plan

This document outlines the testing strategy, test suites, audio DSP validation criteria, performance benchmarks, and test execution commands for **MaxAudioEditor**.

---

## 1. Multi-Tier Testing Strategy

MaxAudioEditor mandates testing across 6 distinct tiers to ensure bit-perfect audio processing, rock-solid stability, and zero hallucinations:

```
┌────────────────────────────────────────────────────────┐
│ 1. Backend Unit Tests (Fast, mock-free business logic) │
├────────────────────────────────────────────────────────┤
│ 2. Audio DSP & Math Tests (Signal validation, impulse) │
├────────────────────────────────────────────────────────┤
│ 3. API & WebSocket Integration Tests (Async HTTP/WS)   │
├────────────────────────────────────────────────────────┤
│ 4. GPU & VRAM Memory Management Tests (CUDA lifecycle) │
├────────────────────────────────────────────────────────┤
│ 5. AI Safety & Command Schema Tests (LLM validation)   │
├────────────────────────────────────────────────────────┤
│ 6. Performance & Stress Benchmarks (60 FPS, 20+ tracks)│
└────────────────────────────────────────────────────────┘
```

---

## 2. Test Suites & Verification Criteria

### Tier 1: Backend Unit Tests (`backend/tests/unit/`)
- **Project Serialization Roundtrip:**
  - Save project to `.maxaudio` -> reload from disk -> verify all tracks, clips, and parameters match byte-for-byte.
- **Clip Mathematics:**
  - Verify split calculations preserve exact duration and calculate correct source offsets across multiple splits.
  - Verify boundary clamping (clips cannot start before time `0.0`).
- **Path Security:**
  - Attempt path traversal attacks (e.g. `../../Windows/System32` or URL-encoded equivalents) -> verify `SecurityError` raised.

### Tier 2: Audio DSP & Mathematical Correctness (`backend/tests/dsp/`)
- **Gain & Pan Invariance:**
  - Generate a 1,000 Hz stereo sine wave at 0 dBFS.
  - Apply -6 dB gain -> verify peak amplitude equals $10^{-6/20} \approx 0.501187 \pm 0.0001$.
  - Apply hard left pan -> verify Right channel energy is exactly $-\infty$ dB.
- **Filter Frequency Response:**
  - Pass white noise through Lowpass filter at 1,000 Hz (12 dB/oct).
  - Verify power attenuation at 2,000 Hz is $-12 \text{ dB} \pm 0.5 \text{ dB}$.
- **Brickwall Limiter Ceiling:**
  - Pass a +6 dBFS clipped square wave through the offline limiter with ceiling set to -0.1 dBTP.
  - Verify **zero samples** exceed -0.1 dBTP in both raw and 4x oversampled domains.
- **Stem Synchronization & Phase Cancellation:**
  - Separate a test track into 4 stems.
  - Sum the 4 stems back together ($S = \text{vocals} + \text{drums} + \text{bass} + \text{other}$).
  - Verify sample count of $S$ equals original audio exactly; verify waveform alignment has zero phase drift.

### Tier 3: API Integration Tests (`backend/tests/api/`)
- **Media Ingestion:**
  - Upload MP3, FLAC, and WAV files via `POST /api/projects/{id}/media`.
  - Verify returned metadata (duration, sample rate, channels) matches `ffprobe` ground truth.
  - Verify waveform peak data endpoint `GET /waveform` returns valid multi-resolution pyramids.
- **Job Lifecycle & WebSockets:**
  - Submit stem separation job -> verify initial state `QUEUED` -> transitions to `RUNNING` -> receives progress updates -> finishes `COMPLETED`.
  - Trigger job cancellation while running -> verify subprocess terminates and transient temp files are cleaned up.

### Tier 4: GPU & VRAM Memory Management (`backend/tests/gpu/`)
- **CUDA Device Interrogation:**
  - Probe GPU properties -> verify name, driver version, and memory reporting work correctly.
- **LRU Eviction & OOM Prevention:**
  - Mock-load multiple models exceeding 4,500 MB threshold -> verify oldest model is cleanly evicted.
  - Verify `torch.cuda.memory_allocated()` drops back to baseline after explicit eviction.

### Tier 5: AI Assistant & Safety Sandbox (`backend/tests/ai/`)
- **Schema Enforcement:**
  - Test LLM prompt responses against `AIOperationPlan` Pydantic validator.
  - Inject malformed JSON or prohibited commands (e.g. system calls) -> verify schema rejects and flags safely.
- **Fuzzy Reference Resolution:**
  - Provide prompt: "lower the voice track" when track name is "Vocals (Lead)".
  - Verify resolution maps to correct track UUID with confidence score > 0.8.

### Tier 6: Performance & Stress Benchmarks (`backend/tests/perf/`)
- **Timeline Canvas Benchmark:**
  - Render 24 tracks with 150 clips at 60 FPS viewport scrolling.
  - Frame time must remain under **16.6 ms** (< 5% dropped frames).
- **Offline Render Throughput:**
  - A 4-minute 16-track project must render to 24-bit WAV in **< 20 seconds** on standard multicore CPU.

---

## 3. Directory Organization

```
backend/tests/
├── conftest.py                   — Shared fixtures (test audio generators, temp dirs, mock project states)
├── fixtures/
│   ├── sine_1k_stereo.wav        — 1kHz reference tone
│   ├── sweep_20_20k.wav          — Logarithmic frequency sweep
│   └── multitrack_sample.json    — Reference 4-track project
├── unit/
│   ├── test_project_model.py
│   ├── test_clip_math.py
│   ├── test_security.py
│   └── test_cache.py
├── dsp/
│   ├── test_gain_pan.py
│   ├── test_filters.py
│   ├── test_dynamics.py
│   ├── test_time_pitch.py
│   └── test_lufs.py
├── api/
│   ├── test_projects_api.py
│   ├── test_media_api.py
│   ├── test_jobs_api.py
│   └── test_websocket.py
├── gpu/
│   ├── test_cuda_device.py
│   └── test_vram_manager.py
├── ai/
│   ├── test_command_schema.py
│   └── test_track_resolver.py
└── perf/
    └── test_render_speed.py
```

---

## 4. Test Execution Commands

```bash
# Run all fast unit and DSP tests
pytest backend/tests/unit/ backend/tests/dsp/ -v

# Run full API integration test suite
pytest backend/tests/api/ -v

# Run GPU and model tests (requires NVIDIA GPU)
pytest backend/tests/gpu/ -v -m "gpu"

# Run complete test suite with coverage report
pytest backend/tests/ --cov=backend/app --cov-report=term-missing --cov-report=html

# Run performance benchmarks
pytest backend/tests/perf/ -v -s
```
