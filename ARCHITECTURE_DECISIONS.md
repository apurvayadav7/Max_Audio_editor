# MaxAudioEditor — Architecture Decision Records (ADRs)

This document records the foundational architectural decisions made for **MaxAudioEditor**, detailing the context, decisions, trade-offs, and alternatives considered.

---

## ADR-001: 100% Local-First Offline Execution (No Cloud AI APIs)

- **Status:** Accepted
- **Context:** Many modern audio tools rely on cloud APIs (OpenAI, Anthropic, ElevenLabs, Replicate). This introduces latency, recurring API costs, privacy concerns with unreleased audio, and failure modes when offline.
- **Decision:** MaxAudioEditor will execute **all AI and DSP workloads locally** on the user's workstation. Internet connectivity is utilized solely during setup/installation.
- **Consequences:**
  - *Pros:* Zero API costs, zero data leakage, works in remote/air-gapped studios, instantaneous local responses.
  - *Cons:* Constrained by local GPU/CPU hardware; initial model downloads required.
- **Alternatives Considered:**
  - *Hybrid Cloud/Local:* Rejected due to privacy risks and vendor lock-in.

---

## ADR-002: Vanilla HTML5 / CSS3 / ES Modules (Zero Frontend Build Step)

- **Status:** Accepted
- **Context:** React, Vue, Angular, and complex bundlers (Vite, Webpack) introduce toolchain decay, virtual DOM overhead during 60 FPS timeline rendering, and complex build steps.
- **Decision:** Build the entire frontend in **pure modern Vanilla JavaScript (ES2022+ modules), standard CSS3, and HTML5**. Files are served directly by FastAPI.
- **Consequences:**
  - *Pros:* Zero build step, instant edit-and-refresh, zero framework dependency vulnerabilities, direct DOM/Canvas access for microsecond audio rendering.
  - *Cons:* Requires manual state management and component structure.
- **Alternatives Considered:**
  - *React / Next.js:* Rejected due to VDOM reconciliation lag during high-frequency playhead updates.
  - *Svelte:* Good performance, but still introduces a compilation/bundler dependency.

---

## ADR-003: FastAPI + Python for Backend Orchestration

- **Status:** Accepted
- **Context:** Audio ML models (PyTorch, Demucs, MusicGen) and DSP libraries (NumPy, SciPy, librosa) are predominantly native to Python. A backend is required to serve APIs, stream media, and orchestrate GPU workloads.
- **Decision:** Use **FastAPI with Uvicorn** running asynchronous event loops on Python 3.11+.
- **Consequences:**
  - *Pros:* Direct interoperability with PyTorch and NumPy; auto-generating OpenAPI documentation; native WebSocket support.
  - *Cons:* Python Global Interpreter Lock (GIL) requires multiprocessing for CPU-bound rendering tasks.
- **Alternatives Considered:**
  - *Node.js / Express:* Excellent I/O, but invoking Python AI scripts via subprocesses adds massive IPC overhead.
  - *Rust / C++ Backend:* Maximum performance, but severely limits rapid iteration with PyTorch models.

---

## ADR-004: Dual-Engine Audio Architecture (Web Audio + Python Offline Render)

- **Status:** Accepted
- **Context:** Browsers cannot directly export 24-bit PCM WAV master files with heavy neural DSP in real-time, while Python cannot achieve 10ms interactive playback in the browser without massive streaming overhead.
- **Decision:** Implement a **Dual-Engine Architecture**:
  1. *Client Web Audio API:* Instant interactive auditioning, mixer routing, and real-time preview effects.
  2. *Server Python Engine:* 64-bit float sample-accurate rendering, Rubber Band time/pitch processing, and final multi-format export.
- **Consequences:**
  - *Pros:* Best of both worlds: ultra-responsive UI playback + studio-grade bit-perfect offline bounce.
  - *Cons:* Must maintain strict mathematical DSP parameter parity between Web Audio nodes and Python SciPy routines.
- **Alternatives Considered:**
  - *WebAssembly Full Engine (C++ / Rust compiled to Wasm):* High fidelity, but cannot run local GPU PyTorch models inside the browser sandbox.

---

## ADR-005: 6 GB VRAM Baseline with Sequential GPU Scheduling

- **Status:** Accepted
- **Context:** Many creative users have laptop GPUs (e.g. NVIDIA RTX 4050 6GB). Loading multiple heavy models (Demucs ~1.4GB + Phi-3-mini ~2.2GB + MusicGen ~1.5GB) simultaneously alongside OS overhead causes CUDA OOM.
- **Decision:** Target **6 GB VRAM as the primary baseline**. Heavy GPU workloads are serialized through a centralized priority queue. Models are loaded lazily and managed via an LRU cache with automatic VRAM purge.
- **Consequences:**
  - *Pros:* 100% stability on accessible consumer hardware; prevents OS display crashes.
  - *Cons:* Stem separation and music generation cannot run concurrently; one must wait for the other.
- **Alternatives Considered:**
  - *Requiring 12GB+ VRAM:* Excludes the majority of laptop and budget creator users.

---

## ADR-006: Local GGUF LLM (Phi-3-mini) via `llama-cpp-python`

- **Status:** Accepted
- **Context:** Natural language DAW commands require an intelligent parser that understands audio terminology and returns strict JSON schemas without hallucinations.
- **Decision:** Deploy **Phi-3-mini-4k-instruct in 4-bit quantization (Q4_K_M)** using `llama-cpp-python` with CUDA cuBLAS offload.
- **Consequences:**
  - *Pros:* Consumes only ~2.2 GB VRAM; runs at 45-60 tokens/sec on RTX 4050; strong structured JSON output capability.
  - *Cons:* Occasional syntax errors in complex edge cases require strict Pydantic validation and retry logic.
- **Alternatives Considered:**
  - *Ollama local daemon:* Requires users to install and run a separate external system service.
  - *Rule-based regex parser:* Zero flexibility for conversational or nuanced musical commands.

---

## ADR-007: Stem Separation via Demucs v4 (HTDemucs) with FP16 Chunking

- **Status:** Accepted
- **Context:** High-quality stem separation is a signature feature of MaxAudioEditor.
- **Decision:** Standardize on **Demucs v4 (HTDemucs)** running in FP16 mixed precision with 10-second chunking.
- **Consequences:**
  - *Pros:* Industry-leading separation SDR (Signal-to-Distortion Ratio); MIT permissive license; runs in ~1.2 GB VRAM.
  - *Cons:* Higher compute requirement than older Spleeter models.
- **Alternatives Considered:**
  - *Spleeter:* Much faster, but acoustic separation quality and phase artifacts are unacceptable for modern standards.

---

## ADR-008: Non-Destructive Project Bundle Format (`.maxaudio`)

- **Status:** Accepted
- **Context:** Audio projects consist of multi-track metadata, peak pyramids, original audio files, separated stems, and history snapshots.
- **Decision:** Encapsulate projects in a structured directory bundle named `<project-name>.maxaudio/`, featuring a human-readable `project.json` manifest and organized asset subfolders.
- **Consequences:**
  - *Pros:* Highly portable, easily inspectable, completely non-destructive, atomic file writes prevent corruption.
  - *Cons:* Folder-based rather than single monolithic file (can be zipped for sharing).
- **Alternatives Considered:**
  - *Monolithic SQLite Database for all audio blobs:* Bloats database size and degrades multi-channel audio streaming performance.

---

## ADR-009: Command Pattern with Inverse Actions for 100-Level Undo/Redo

- **Status:** Accepted
- **Context:** Audio editors require flawless, instantaneous undo/redo across complex clip splits, moves, fader changes, and batch AI operations.
- **Decision:** Implement the **GoF Command Pattern** on the frontend. Every user action implements `execute()` and a mathematically exact `undo()`. Batch operations are wrapped in atomic `CompoundCommands`.
- **Consequences:**
  - *Pros:* Constant-time undo/redo; zero memory snapshot overhead; AI proposals integrate directly into the same undo stack.
  - *Cons:* Every newly added editing feature must explicitly implement its own reverse operation.

---

## ADR-010: HTML5 Canvas 2D with Viewport Clipping for Waveform Rendering

- **Status:** Accepted
- **Context:** Rendering 20+ tracks with hundreds of thousands of waveform peak samples using DOM elements or SVG causes severe browser layout thrashing and drops frames.
- **Decision:** Use **HTML5 Canvas 2D with strict horizontal/vertical viewport clipping and pre-calculated multi-resolution peak pyramids**.
- **Consequences:**
  - *Pros:* Rock-solid 60 FPS scrolling and zooming; crisp HiDPI support; near-zero memory footprint.
  - *Cons:* Must manually implement hit-testing and event handling for clip interactions.
- **Alternatives Considered:**
  - *WebGL / WebGPU:* Higher theoretical throughput, but Canvas 2D easily achieves 60 FPS for 2D waveforms with far less boilerplate.
