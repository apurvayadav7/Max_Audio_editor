# MaxAudioEditor — GPU Architecture & VRAM Strategy

This document details the GPU engineering architecture, VRAM budgeting, CUDA optimizations, memory pooling, and CPU fallback strategies for **MaxAudioEditor**.

---

## 1. Hardware Target & Capability Matrix

MaxAudioEditor treats the GPU as a **first-class compute engine**. The baseline minimum hardware specification is an **NVIDIA GeForce RTX 4050 Laptop GPU with 6 GB VRAM**.

| Hardware Tier | GPU Example | VRAM | Concurrency Capability | Optimal Settings |
|---------------|-------------|------|------------------------|------------------|
| **Baseline (Target)** | RTX 4050 Laptop / RTX 3050 6GB | **6 GB** | **1 Heavy Model at a time** (Sequential) | FP16, chunk size 10s, Phi-3-mini Q4_K_M |
| **Mid Tier** | RTX 4060 / RTX 3060 | **8 GB – 12 GB** | **2 Concurrent Models** (e.g. Demucs + LLM) | FP16, chunk size 20s, MusicGen-medium enabled |
| **Pro Tier** | RTX 4080 / 4090 / Desktop 16GB+ | **16 GB – 24 GB** | **All Models Warm-Loaded** | BF16/FP32, full-track chunks, zero model unload |
| **Zero GPU (Fallback)**| Intel Core i7 / AMD Ryzen (CPU) | **System RAM (16GB+)** | Multi-threaded CPU sequential | CPU float32, llama.cpp AVX2/AVX-512 |

---

## 2. CUDA Discovery & Diagnostics Engine

On application startup, the backend interrogates the CUDA environment through `backend/app/ai/device.py`:

```python
import torch
from pydantic import BaseModel

class GPUCapabilities(BaseModel):
    available: bool
    device_name: str
    vram_total_mb: int
    vram_free_mb: int
    cuda_version: str
    compute_capability: tuple[int, int]
    fp16_supported: bool
    bf16_supported: bool
    recommended_tier: str

def probe_gpu() -> GPUCapabilities:
    if not torch.cuda.is_available():
        return GPUCapabilities(
            available=False,
            device_name="CPU Fallback",
            vram_total_mb=0,
            vram_free_mb=0,
            cuda_version="None",
            compute_capability=(0, 0),
            fp16_supported=False,
            bf16_supported=False,
            recommended_tier="cpu"
        )

    dev = torch.cuda.current_device()
    props = torch.cuda.get_device_properties(dev)
    free_mem, total_mem = torch.cuda.mem_get_info(dev)
    cc = (props.major, props.minor)

    return GPUCapabilities(
        available=True,
        device_name=props.name,
        vram_total_mb=total_mem // (1024 * 1024),
        vram_free_mb=free_mem // (1024 * 1024),
        cuda_version=torch.version.cuda or "unknown",
        compute_capability=cc,
        fp16_supported=cc >= (7, 0),
        bf16_supported=cc >= (8, 0), # Ampere, Ada Lovelace
        recommended_tier="baseline" if total_mem < 8 * 1024**3 else "pro"
    )
```

---

## 3. Strict VRAM Budgeting (6 GB Baseline)

In a 6,144 MB physical VRAM environment on Windows, memory allocations must be disciplined to avoid hard OS crashes:

```
┌────────────────────────────────────────────────────────┐
│ Total Physical VRAM: 6,144 MB                          │
├────────────────────────────────────────────────────────┤
│ Windows DWM / Display:               700 MB  (Fixed)   │
│ PyTorch Base Context / Drivers:      300 MB  (Fixed)   │
│ Safety Headroom / Temp Allocations:  644 MB  (Reserved)│
├────────────────────────────────────────────────────────┤
│ Available Pool for Models:          4,500 MB           │
└────────────────────────────────────────────────────────┘
```

### Allocation Scenarios

1. **Idle State:**
   - Active models: `None`
   - VRAM in use: ~1,000 MB (OS + driver baseline)
   - Remaining: 5,144 MB

2. **Stem Separation Active (HTDemucs):**
   - Active models: `htdemucs` (FP16)
   - Model weights: 80 MB
   - Forward pass activation tensors (chunked): ~1,120 MB
   - Total model VRAM: ~1,200 MB
   - Remaining VRAM: ~3,944 MB (safe)

3. **Natural Language AI Assistant Active (Phi-3-mini):**
   - Active models: `Phi-3-mini-4k-instruct.Q4_K_M`
   - Weight memory: ~2,200 MB
   - KV Cache (4096 context): ~280 MB
   - Total model VRAM: ~2,480 MB
   - Remaining VRAM: ~2,664 MB (safe)

4. **Music Generation Active (MusicGen-small):**
   - Active models: `musicgen-small`
   - Weights + EnCodec + Attention buffers: ~1,500 MB
   - Remaining VRAM: ~3,644 MB (safe)

5. **Disallowed State (Concurrent Demucs + MusicGen):**
   - Total required: 1,200 MB + 1,500 MB + activations = ~3,800 MB + OS = Dangerous edge.
   - **Enforced Strategy:** Job manager serializes these tasks. Stem separation locks the `gpu_heavy_task` mutex; MusicGen waits in queue.

---

## 4. Model Registry & VRAM Memory Pooling

The `ModelManager` maintains a registry of loaded models and enforces LRU (Least Recently Used) eviction before any new model load:

```python
import time
import gc
import torch

class ModelManager:
    def __init__(self, max_allowed_vram_mb: int = 4500):
        self.max_vram_mb = max_allowed_vram_mb
        self.loaded_models: dict[str, dict] = {}

    def acquire_model(self, model_id: str):
        if model_id in self.loaded_models:
            self.loaded_models[model_id]["last_used"] = time.time()
            return self.loaded_models[model_id]["instance"]

        needed_mb = MODEL_REGISTRY_METADATA[model_id]["vram_mb"]
        self.ensure_headroom(needed_mb)

        instance = self._instantiate_model(model_id)
        self.loaded_models[model_id] = {
            "instance": instance,
            "vram_mb": needed_mb,
            "last_used": time.time()
        }
        return instance

    def ensure_headroom(self, needed_mb: int):
        current_used = sum(m["vram_mb"] for m in self.loaded_models.values())
        while current_used + needed_mb > self.max_vram_mb and self.loaded_models:
            # Find LRU model
            lru_key = min(self.loaded_models, key=lambda k: self.loaded_models[k]["last_used"])
            self.evict_model(lru_key)
            current_used = sum(m["vram_mb"] for m in self.loaded_models.values())

    def evict_model(self, model_id: str):
        if model_id in self.loaded_models:
            del self.loaded_models[model_id]["instance"]
            del self.loaded_models[model_id]
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()
```

---

## 5. PyTorch CUDA Optimization Directives

To maximize throughput and guarantee stability on Ada Lovelace (RTX 4050) architecture:

1. **Mixed Precision (FP16/BF16):**
   - Models run under `torch.autocast(device_type="cuda", dtype=torch.float16)`.
   - Halves memory footprint and doubles tensor core arithmetic throughput.

2. **cuDNN Benchmark:**
   - `torch.backends.cudnn.benchmark = True` enabled for fixed-size audio chunk convolutions in Demucs.

3. **Memory Allocator Configuration:**
   - Environment variable set before PyTorch import:
     `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:128`
   - Prevents memory fragmentation across long-running DAW sessions.

4. **Audio Chunking Strategy (Demucs):**
   - Segment length: 10.0 seconds with 2.5 second overlap.
   - Batch size: 1.
   - This guarantees activation tensors never exceed 800 MB regardless of song length (even 20-minute files separate smoothly).

---

## 6. OOM Prevention & Recovery Protocol

If an unexpected `torch.cuda.OutOfMemoryError` occurs:

1. **Catch Block:**
   ```python
   except torch.cuda.OutOfMemoryError as e:
       logger.error("CUDA OOM caught! Purging caches and switching to recovery mode.")
       torch.cuda.empty_cache()
       gc.collect()
       # Notify user with clear diagnostic
       raise ResourceExhaustedError("GPU ran out of memory. Retrying operation on CPU fallback.")
   ```
2. **Immediate Eviction:** All models in `ModelManager` are forcibly evicted to restore free VRAM.
3. **Automatic Fallback:** The failed job is re-dispatched to the CPU worker pool with halved batch/chunk sizes.
4. **WebSocket Alert:** Broadcasts warning to the frontend UI with instructions (e.g. "GPU memory full. Processing switched to CPU.").

---

## 7. CPU Fallback Execution Plan

Every single GPU operation in MaxAudioEditor has a fully functional CPU implementation:

| Task | GPU Path | CPU Fallback Path | Performance Delta |
|------|----------|-------------------|-------------------|
| **Stem Separation** | Demucs CUDA (FP16) | Demucs CPU (Float32, `torch.set_num_threads(N)`) | ~15x slower (30s -> ~7m) |
| **Command Assistant** | `llama-cpp-python` CUDA offload | `llama-cpp-python` CPU offload (AVX2 instructions) | ~4x slower (1.5s -> ~6s) |
| **Audio-to-MIDI** | Basic Pitch CUDA | Basic Pitch CPU (Torch / ONNX) | ~2x slower (3s -> ~7s) |
| **Music Generation** | MusicGen CUDA (FP16) | MusicGen CPU (with warning dialog) | ~20x slower (4s -> ~80s) |
| **Analysis & DSP** | CPU Native (SciPy, librosa) | CPU Native | Native (no change) |
