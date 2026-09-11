# MaxAudioEditor — AI Model Plan & Model Registry

This document defines all local AI models utilized by **MaxAudioEditor**, their memory and compute requirements, storage specifications, and lifecycle management.

> **Absolute Architectural Rule:** MaxAudioEditor operates **100% locally**. No model inference calls cloud APIs. All weights are downloaded to the user's filesystem and executed on the local GPU (or CPU fallback).

---

## 1. Master Model Registry

| Model Name | Task / Purpose | Precision | Format | Download Size | VRAM Footprint | CPU Fallback | License | Introduced |
|------------|----------------|-----------|--------|---------------|----------------|--------------|---------|------------|
| **HTDemucs (v4)** | 4-stem separation (vocals, drums, bass, other) | FP16 | PyTorch `.th` | ~80 MB | ~1.2 GB | Yes (~15x slower) | MIT | Phase 6 |
| **HTDemucs-FT** | Fine-tuned 4-stem separation (maximum quality) | FP16 | PyTorch `.th` | ~160 MB | ~1.4 GB | Yes (~18x slower) | MIT | Phase 6 |
| **HTDemucs-6S** | 6-stem separation (+ guitar, piano) | FP16 | PyTorch `.th` | ~120 MB | ~1.8 GB | Yes (~20x slower) | MIT | Phase 6 |
| **Phi-3-mini-4k-instruct** | Natural Language DAW command planning & JSON generation | 4-bit (Q4_K_M) | GGUF | ~2.2 GB | ~2.2 GB | Yes (~4x slower) | MIT | Phase 11 |
| **Mistral-7B-Instruct-v0.3** | Alternative high-reasoning LLM (for 8GB+ GPUs) | 4-bit (Q4_K_M) | GGUF | ~4.1 GB | ~4.2 GB | Yes (~8x slower) | Apache 2.0 | Phase 11 (Optional) |
| **MusicGen-small** | Text-to-music generation, audio continuation | FP16 | PyTorch / EnCodec | ~1.5 GB | ~1.5 GB | Yes (extremely slow) | MIT | Phase 12 |
| **MusicGen-medium** | High-fidelity music generation (requires 8GB+ VRAM) | FP16 | PyTorch / EnCodec | ~3.3 GB | ~3.8 GB | Not recommended | MIT | Phase 12 (Optional) |
| **Basic Pitch** | Polyphonic audio-to-MIDI transcription | FP32 | PyTorch `.pth` / ONNX | ~15 MB | < 200 MB | Yes (near real-time) | Apache 2.0 | Phase 13 |
| **WORLD Vocoder** | Vocal fundamental frequency (F0) & formant extraction | Native C | C Extension | < 5 MB | CPU RAM only | Native C | BSD-3-Clause | Phase 10 |

---

## 2. Model Profiles & Specifications

### 2.1 Stem Separation Models (Demucs v4)

- **Source / Author:** Alexandre Défossez et al. (Meta AI Research)
- **Architecture:** Hybrid Transformer-Demucs (dual-domain: spectrogram + waveform)
- **Input:** 44.1kHz stereo audio tensor `[batch, 2, samples]`
- **Output:** 4 stems: `Vocals`, `Drums`, `Bass`, `Other` (each `[batch, 2, samples]`)
- **Execution Details:**
  - Standard inference splits audio into 10-second segments with 25% overlap (`shifts=1`) to conserve memory.
  - On RTX 4050 (6GB), a 3.5-minute stereo song separates in **~35 seconds** at FP16.
  - VRAM peak is locked under **1.4 GB** via PyTorch chunked processing.
  - Synchronization guarantee: Output stems have identical length and zero phase drift relative to the input.

### 2.2 Local Language Model: Phi-3-mini-4k-instruct (GGUF)

- **Source / Author:** Microsoft Research
- **Architecture:** 3.8 Billion parameter dense decoder transformer
- **Context Window:** 4,096 tokens (ample for full project state summaries)
- **Quantization:** `Q4_K_M` (4-bit medium quantization with optimal perplexity preservation)
- **Inference Engine:** `llama-cpp-python` with CUDA cuBLAS offloading (`n_gpu_layers=-1` offloads all 32 layers to GPU)
- **Input:** Prompt including current project state context + user natural language instruction.
- **Output:** Strictly formatted JSON conforming to `AIOperationPlan` schema.
- **Inference Speed:** ~45-60 tokens/sec on RTX 4050; typical DAW plan takes **1.2 to 2.5 seconds**.

### 2.3 Music Generation: MusicGen-small

- **Source / Author:** Meta AI (AudioCraft)
- **Architecture:** 300M parameter autoregressive Transformer conditioned on EnCodec audio tokens
- **Input:** Text prompt (e.g. "funky slap bass groove, 120 bpm") + optional conditioning melody audio tensor
- **Output:** 32kHz audio tensor (resampled to session sample rate via high-quality sinc interpolation)
- **Generation Speed:** ~2.5x real-time on RTX 4050 (a 10-second segment generates in ~4 seconds).
- **VRAM Footprint:** ~1.5 GB in FP16 mode.

### 2.4 Audio-to-MIDI: Spotify Basic Pitch

- **Source / Author:** Spotify Research (Bittner et al.)
- **Architecture:** Lightweight Convolutional Neural Network with polyphonic pitch contours
- **Input:** Single-channel or stereo audio buffer
- **Output:** Note events with onset, offset, MIDI pitch (0-127), and note velocity (0.0 - 1.0)
- **Performance:** Processes a 3-minute track in **< 4 seconds** on GPU, or ~12 seconds on CPU.

---

## 3. Storage Layout & Directory Structure

All model weights reside inside the project workspace under `data/models/`:

```
data/models/
├── demucs/
│   ├── htdemucs.th                     (80 MB)
│   ├── htdemucs_ft.th                  (160 MB)
│   └── htdemucs_6s.th                  (120 MB)
├── llm/
│   ├── phi-3-mini-4k-instruct.Q4_K_M.gguf  (2.2 GB)
│   └── mistral-7b-instruct-v0.3.Q4_K_M.gguf (4.1 GB, optional)
├── musicgen/
│   └── musicgen-small/                 (1.5 GB total checkpoints)
└── basic-pitch/
    └── basic_pitch_model.pth           (15 MB)
```

---

## 4. Model Lifecycle & Memory Management

On a **6 GB VRAM baseline**, multiple heavy models cannot be loaded simultaneously without triggering CUDA Out-Of-Memory (OOM) errors.

### VRAM Budget Allocation (6 GB Baseline)

```
Total Hardware VRAM:            6,144 MB (100%)
Windows Desktop / System Base:    700 MB (~11%)
PyTorch CUDA Context Baseline:    300 MB (~5%)
Max Safe Model Allocation:      4,500 MB (~74%)
Buffer / Transient Headroom:      644 MB (~10%)
```

### Loading & Eviction Strategy

1. **Lazy Loading:** Models are loaded into VRAM only when the user requests an action requiring them.
2. **LRU Eviction Policy:** If loading a model would exceed the safe VRAM threshold (4,500 MB), the Least-Recently-Used model is evicted.
3. **Explicit Cleanup:**
   ```python
   del model
   import gc
   gc.collect()
   import torch
   if torch.cuda.is_available():
       torch.cuda.empty_cache()
   ```
4. **Serialization of Heavy Tasks:** Stem separation and MusicGen cannot run simultaneously on 6GB VRAM. If an AI generation job is requested while stem separation is active, the job manager queues it until the separation completes and VRAM is released.

---

## 5. Model Download Utility

Model downloading is performed via a dedicated CLI script (`scripts/download_models.py`):

- Shows visual download progress bar with speed and ETA.
- Verifies integrity via cryptographic SHA256 checksums before saving.
- Resumes interrupted downloads.
- Flags models as ready in the SQLite registry (`data/maxaudio.db`).
