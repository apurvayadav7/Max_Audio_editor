# MaxAudioEditor — Master Development Checklist

This document is the actionable, phase-by-phase development checklist for building **MaxAudioEditor**. Every phase produces a runnable, testable slice of the application.

> **Execution Rule:** Check off each item as completed. Do not start a phase until all prerequisite phases have their exit criteria verified. No stub implementations or fake features.

---

## Phase 0: Environment & Architecture Skeleton

- [x] **Prerequisites & System Verification**
  - [x] Verify Python 3.11+ / 3.12 64-bit installed
  - [x] Verify NVIDIA GPU and CUDA driver (`nvidia-smi` reports CUDA 12.x)
  - [x] Verify FFmpeg binary installed and accessible in system `PATH`
  - [x] Verify Rubber Band library / CLI installed

- [x] **Project Setup & Virtual Environment**
  - [x] Create directory structure (`backend/app/`, `frontend/`, `data/`, `scripts/`)
  - [x] Create `pyproject.toml` with pinned core dependencies: `fastapi`, `uvicorn[standard]`, `pydantic`, `numpy`, `soundfile`, `scipy`, `aiofiles`, `aiosqlite`, `websockets`, `python-multipart`
  - [x] Create virtual environment (`.venv`) and install base dependencies
  - [x] Create `.gitignore` ignoring `.venv/`, `data/cache/`, `data/temp/`, `data/models/`, `*.maxaudio` audio binaries

- [x] **Backend Skeleton**
  - [x] Implement `backend/app/config.py` (paths, GPU configs, limits, environment variables)
  - [x] Implement logging infrastructure (`backend/app/logging_config.py` with structured formatting)
  - [x] Implement `backend/app/main.py` FastAPI app with CORS, exception handlers, and static file mount
  - [x] Implement `backend/app/api/system.py`:
    - [x] `GET /api/health` -> returns `{"status": "ok", "version": "0.1.0"}`
    - [x] `GET /api/system/info` -> returns CPU cores, RAM, OS, disk space
    - [x] `GET /api/system/gpu` -> returns PyTorch/CUDA availability, GPU name, VRAM total/free

- [x] **Frontend Skeleton**
  - [x] Create `frontend/index.html` with semantic structure (header, main timeline area, bottom mixer/effects, status bar)
  - [x] Implement CSS architecture:
    - [x] `frontend/css/variables.css` (dark studio theme, accent colors, spacing, typography)
    - [x] `frontend/css/reset.css`
    - [x] `frontend/css/layout.css` (CSS Grid/Flexbox shell)
    - [x] `frontend/css/components.css` (buttons, meters, inputs, sliders, toolbars)
  - [x] Implement `frontend/js/app.js` entry point with ES Module loading
  - [x] Implement `frontend/js/core/event-bus.js` (pub/sub)
  - [x] Implement `frontend/js/api/client.js` (typed fetch wrapper)

- [x] **Phase 0 Exit Verification**
  - [x] Run `python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000`
  - [x] Open `http://127.0.0.1:8000` in browser -> UI shell loads with dark DAW theme
  - [x] Verify `GET /api/health` returns 200 OK
  - [x] Verify `GET /api/system/gpu` correctly detects local NVIDIA GPU and VRAM

---

## Phase 1: Project Model & Storage Subsystem

- [x] **Pydantic Schemas & Domain Models**
  - [x] `backend/app/schemas/project.py`: Project metadata, sample rate, tempo, key, time signature
  - [x] `backend/app/schemas/track.py`: Track ID, name, type (audio/stem/bus/master), color, mute, solo, volume, pan
  - [x] `backend/app/schemas/clip.py`: Clip ID, sourceId, trackId, startTime, duration, sourceOffset, gain, fadeIn, fadeOut, stretchRatio, pitchSemitones, isMuted, isReversed
  - [x] `backend/app/schemas/effect.py`: Effect ID, type, isBypassed, order, parameters dict
  - [x] `backend/app/schemas/automation.py`: Automation lane, parameterId, points list `[(time, value, curve)]`
  - [x] `backend/app/schemas/marker.py`: Markers and section cues (id, name, time, type, color)

- [x] **Project Storage & Serialization Engine**
  - [x] Implement `backend/app/storage/project_format.py`:
    - [x] `.maxaudio/` bundle layout (`project.json`, `media/`, `stems/`, `renders/`, `cache/`, `versions/`)
    - [x] Non-destructive atomic write pattern (write to `.tmp` then rename)
    - [x] Path safety validation (prevent path traversal outside project root)
  - [x] Implement SQLite metadata store (`aiosqlite`) in `backend/app/storage/db.py`:
    - [x] Projects table (id, name, created_at, updated_at, filepath)
    - [x] Media index table (hash, path, sample_rate, channels, duration)

- [x] **Project Service & API**
  - [x] Implement `backend/app/services/project_service.py` (CRUD, snapshot versioning, auto-save handler)
  - [x] Implement `backend/app/api/projects.py`:
    - [x] `POST /api/projects` (create new project)
    - [x] `GET /api/projects` (list recent projects)
    - [x] `GET /api/projects/{id}` (load full project state)
    - [x] `PUT /api/projects/{id}` (save project updates)
    - [x] `DELETE /api/projects/{id}` (archive/delete project)
    - [x] `POST /api/projects/{id}/version` (create snapshot version)

- [x] **Frontend State Management**
  - [x] Implement `frontend/js/state/store.js` (centralized observable store with state diffs)
  - [x] Implement `frontend/js/state/project.js` (project slice: tracks, clips, tempo, markers)
  - [x] Implement project modal UI in `frontend/js/panels/project-modal.js` (New Project, Open, Save As)
  - [x] Implement auto-save worker/interval (auto-save every 60s if dirty)
  - [x] Implement crash recovery check on startup

- [x] **Phase 1 Exit Verification**
  - [x] Run automated tests: `pytest backend/tests/unit/test_phase1_projects.py`
  - [x] Create project from UI -> verify folder structure created on disk
  - [x] Restart server -> reopen project -> verify exact state matches

---

## Phase 2: Audio Ingestion, Waveform Pipeline & Transport

- [x] **Audio Ingestion & Decoding**
  - [x] Implement `backend/app/audio/decode.py` using `soundfile` and `ffmpeg` subprocess fallback
  - [x] Support format conversion: WAV, MP3, FLAC, OGG, M4A, AIFF -> standard 32-bit float PCM
  - [x] Extract audio metadata: sample rate, bit depth, channels, duration, SHA256 checksum
  - [x] Implement `POST /api/projects/{id}/media` file upload endpoint (multipart/form-data)

- [x] **Waveform Peak Pyramid Generation**
  - [x] Implement `backend/app/audio/waveform.py`:
    - [x] Compute multi-resolution min/max peak pyramids (10, 100, 1000, 10000 samples per pixel)
    - [x] Cache peak data in binary or compact JSON format in `project/cache/waveforms/`
  - [x] Implement `GET /api/projects/{id}/media/{mediaId}/waveform` endpoint
  - [x] Implement `GET /api/projects/{id}/media/{mediaId}/stream` (HTTP range requests for audio streaming)

- [x] **Web Audio Engine & Transport Core**
  - [x] Implement `frontend/js/audio/engine.js`:
    - [x] AudioContext initialization, user-gesture unlock, clock synchronization
    - [x] Master gain node and meter analyser
  - [x] Implement `frontend/js/audio/buffer-cache.js` (LRU decoded AudioBuffer cache)
  - [x] Implement `frontend/js/audio/transport.js`:
    - [x] Play, pause, stop, seek state machine
    - [x] Microsecond-accurate scheduling via `AudioContext.currentTime`
    - [x] Loop region handling (loop start/end boundaries)
    - [x] Synchronized digital timecode (`00:00:00.000`) and bar:beat clock (`1.1.00`)

- [x] **Single-Track Canvas Waveform**
  - [x] Implement `frontend/js/canvas/waveform.js`:
    - [x] High-DPI canvas rendering (using `window.devicePixelRatio`)
    - [x] Render dual-channel min/max waveform with zero-crossing line
    - [x] Playhead line synchronized with transport clock via `requestAnimationFrame`
  - [x] Implement drag-and-drop audio file import onto browser window

- [x] **Phase 2 Exit Verification**
  - [x] Drag an MP3/WAV file into editor -> uploads, generates waveform, loads onto timeline
  - [x] Press Space / Play -> audio plays through speakers with zero crackle/dropouts
  - [x] Playhead moves smoothly across waveform at 60 FPS; seek immediately updates audio position

---

## Phase 3: Multi-Track Timeline & Beat Grid

- [x] **Timeline Coordinate Architecture**
  - [x] Implement `frontend/js/timeline/coordinate.js`:
    - [x] `timeToPixel(seconds, zoomLevel)` and `pixelToTime(px, zoomLevel)`
    - [x] `timeToBeat(seconds, bpm, timeSig)` and `beatToTime(beat, bpm, timeSig)`
    - [x] `snapTimeToGrid(seconds, bpm, snapMode)` (bar, 1/2, 1/4, 1/8, 1/16, 1/32, triplet, free)

- [x] **Multi-Track Viewport & Rendering**
  - [x] Implement `frontend/js/timeline/timeline.js`:
    - [x] Virtual scrolling & viewport clipping (only render visible tracks and clips)
    - [x] Horizontal zoom (Ctrl+wheel / trackpad pinch) from 5 px/sec to 1000 px/sec
    - [x] Vertical track header layout with track controls (mute, solo, volume fader, pan)
  - [x] Implement `frontend/js/timeline/ruler.js`: Time and bar:beat:tick ruler bar
  - [x] Implement `frontend/js/timeline/grid.js`: Vertical beat and bar grid lines
  - [x] Implement `frontend/js/timeline/clip-view.js`:
    - [x] Clip bounding box, header, title, waveform, fade curves, selection halo

- [x] **Interactive Timeline Controls**
  - [x] Implement clip selection (single click, Ctrl/Cmd click multi-select, rubberband box selection)
  - [x] Implement playhead scrub by clicking/dragging ruler
  - [x] Implement track header controls (Add Audio Track, Delete Track, Rename Track)
  - [x] Implement global timeline keyboard shortcuts (Space=play, Home=rewind, 1-8=tools)

- [x] **Phase 3 Exit Verification**
  - [x] Create 4 audio tracks and import audio into each
  - [x] Zoom in/out seamlessly without UI lag or memory leak
  - [x] Beat grid aligns with ruler divisions and snapping locks cursor to exact beat boundaries

---

## Phase 4: Non-Destructive Editing & Command Pattern

- [x] **Command Architecture (Undo/Redo)**
  - [x] Implement `frontend/js/commands/manager.js`:
    - [x] Undo stack and Redo stack with configurable depth (100 levels)
    - [x] Compound commands (grouping batch mutations into a single undo step)
    - [x] Event emission on stack push/pop for UI synchronization
  - [x] Implement base `Command` interface with `execute()` and `undo()`

- [x] **Core Audio Clip Edit Commands**
  - [x] `SplitClipCommand`: Split clip at playhead or cursor time into two non-destructive slices
  - [x] `MoveClipCommand`: Move clip across timeline time and between compatible tracks
  - [x] `TrimClipCommand`: Drag left boundary (slip start) or right boundary (slip end)
  - [x] `DuplicateClipCommand`: Duplicate selected clips at next bar/cursor
  - [x] `DeleteClipCommand`: Remove clips non-destructively (restorable on undo)
  - [x] `ClipGainCommand`: Adjust individual clip gain offset (-inf to +12 dB)
  - [x] `FadeCommand`: Set fade-in / fade-out curve and duration

- [x] **Track & Project Commands**
  - [x] `TrackVolumeCommand`, `TrackPanCommand`, `TrackMuteCommand`, `TrackSoloCommand`
  - [x] `AddTrackCommand`, `RemoveTrackCommand`, `ReorderTrackCommand`

- [x] **History & Inspector UI**
  - [x] Implement `frontend/js/panels/history.js` (list recent actions, click to jump to state)
  - [x] Implement `frontend/js/panels/inspector.js` (inspect selected clip start, length, gain, fades)
  - [x] Bind keyboard shortcuts: `Ctrl+Z` (Undo), `Ctrl+Y` / `Ctrl+Shift+Z` (Redo), `S` (Split), `Delete`/`Backspace`

- [x] **Phase 4 Exit Verification**
  - [x] Split clip -> move right half 2 bars forward -> trim 1 second off left edge
  - [x] Hit `Ctrl+Z` 3 times -> clip completely restores to original un-split state
  - [x] Hit `Ctrl+Y` 3 times -> edits accurately re-applied

---

## Phase 5: Music Analysis Engine & Async Job System

- [x] **Asynchronous Job Worker Infrastructure**
  - [x] Implement `backend/app/jobs/model.py`: Job state machine (`QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`)
  - [x] Implement `backend/app/jobs/manager.py`:
    - [x] Priority queue for background processing
    - [x] Resource concurrency semaphores (GPU semaphore max 1, CPU semaphore max 4)
    - [x] Cancellation token handling
  - [x] Implement `backend/app/api/websocket.py`: Real-time WebSocket broadcasting of job progress and telemetry

- [x] **Audio Analysis Engine (librosa / madmom / pyloudnorm)**
  - [x] Implement `backend/app/services/analysis_service.py`:
    - [x] BPM detection with confidence scoring
    - [x] Beat and downbeat tracking (bar alignment)
    - [x] Musical key estimation (e.g. "C Major", "A Minor")
    - [x] Integrated LUFS, RMS, and dynamic range calculation
    - [x] Structural section segmentation (Intro, Verse, Chorus, Bridge, Outro)
  - [x] Cache analysis output in `.maxaudio/analysis/analysis.json`
  - [x] Implement `POST /api/projects/{id}/analysis` and `GET /api/projects/{id}/analysis`

- [x] **Frontend Analysis & Musical Intelligence Integration**
  - [x] Implement `frontend/js/panels/analysis.js` (display detected BPM, Key, Loudness, Section cards)
  - [x] Auto-populate project tempo and time signature from analysis
  - [x] Render section cue markers on timeline ruler
  - [x] Implement Jobs UI tray (floating task status with real-time percentage progress bar)

- [x] **Phase 5 Exit Verification**
  - [x] Trigger analysis on imported song -> background job starts with WebSocket progress updates
  - [x] UI displays accurate BPM and Key; beat grid automatically locks to detected tempo
  - [x] Section markers (Verse/Chorus) visually appear on timeline

---

## Phase 6: Local GPU Stem Separation Subsystem

- [x] **PyTorch CUDA & Hardware Detection**
  - [x] Install PyTorch with CUDA 12 support and torchaudio
  - [x] Implement `backend/app/ai/device.py`:
    - [x] Dynamic device selection (`cuda` if available and healthy, else `cpu`)
    - [x] VRAM interrogation (`torch.cuda.mem_get_info()`)
    - [x] Device capability profiling (compute capability, tensor core support)

- [x] **Demucs Model Integration & VRAM Scheduler**
  - [x] Install Demucs (`demucs>=4.0`)
  - [x] Implement `backend/app/ai/stem_models.py`:
    - [x] `StemSeparator` interface
    - [x] `DemucsAdapter` wrapping `htdemucs`, `htdemucs_ft`, `htdemucs_6s`
    - [x] FP16 half-precision execution to respect 6GB VRAM limit
    - [x] Audio chunking with overlap to prevent GPU out-of-memory spikes
  - [x] Implement `backend/app/ai/registry.py`: Model lifecycle manager (load on demand, unload with `torch.cuda.empty_cache()`)

- [x] **Stem Separation Pipeline & Track Ingestion**
  - [x] Implement `backend/app/workers/stem_worker.py`:
    - [x] Ingest source audio track
    - [x] Run separation job with live step progress callbacks (e.g. "Separating drums... 40%")
    - [x] Output 4 synchronized 32-bit float WAV stems: `vocals.wav`, `drums.wav`, `bass.wav`, `other.wav`
    - [x] Compute peak pyramids for all stems
  - [x] Implement `POST /api/projects/{id}/stems` endpoint
  - [x] Implement frontend stem separation modal (model selection, stem routing)
  - [x] On completion, automatically create 4 synchronized tracks on the timeline

- [x] **Phase 6 Exit Verification**
  - [x] Execute stem separation on audio track (tested with `A_dark_cyberpunk_industrial_tr_001303.wav`)
  - [x] Monitor VRAM -> stays within ~1.5 - 2.5 GB range without crash or OOM on RTX 4050
  - [x] 4 new tracks appear in DAW timeline with waveforms (Drums Amber, Bass Green, Other Cyan, Vocals Purple)

---

## Phase 7: Professional DSP, Real-Time Effects & Time/Pitch Engine

- [x] **Web Audio Real-Time Insert Graph**
  - [x] Implement `frontend/js/audio/effects.js`:
    - [x] **Parametric EQ**: 4-band EQ using `BiquadFilterNode` (Low Shelf, Peaking 1, Peaking 2, High Shelf) with `getFrequencyResponse`
    - [x] **Compressor**: Threshold, ratio, attack, release, makeup gain using `DynamicsCompressorNode`
    - [x] **Limiter**: Zero-latency brickwall peak limiter / ceiling protection
    - [x] **Stereo Delay**: Tempo-synced delay with feedback loop and high-cut damping filter
    - [x] **Reverb**: Algorithmic diffuser & parallel comb filter network with decay time and wet/dry mix
  - [x] Implement track and master insert chains in `frontend/js/audio/engine.js` with clean disconnect/reconnect and bypass

- [x] **Time Stretching & Pitch Shifting Subsystem**
  - [x] Implement `backend/app/audio/time_pitch.py`:
    - [x] Phase vocoder time stretching (0.25x to 4.0x) and pitch shifting (-24 to +24 semitones)
    - [x] Deterministic SHA-256 caching for processed audio buffers (`cache/time_pitch/tp_<sha256>.wav`)
  - [x] Implement `POST /api/projects/{id}/clips/{clip_id}/process` endpoint
  - [x] Automatic peak pyramid generation for processed clips

- [x] **Effects UI Panel**
  - [x] Implement `frontend/js/panels/effects.js` and `frontend/css/effects.css`:
    - [x] Hardware rack aesthetic with metallic chassis, LED indicators, ON/OFF bypass toggles
    - [x] Target selector (Master Bus or any Audio Track)
    - [x] Interactive 4-Band Parametric EQ frequency response curve canvas (20Hz - 20kHz logarithmic grid)
    - [x] Add/remove effects with instant real-time audio parameter updates

- [x] **Phase 7 Exit Verification**
  - [x] 24/24 unit tests passing across Phases 0 through 7
  - [x] Pitch shifting and time stretching verified with automated tests
  - [x] Insert effects seamlessly integrated into Web Audio mixer and Studio FX Rack tab

---

## Phase 8: Extended Effects Suite & Preset Engine

- [x] **Extended DSP Processors**
  - [x] **Tape Saturation**: Soft-clipping hyperbolic tangent waveshaper with warmth lowpass filter and 4x oversampling
  - [x] **Distortion / Overdrive**: Non-linear polynomial waveshaping curve with pre-drive and tone filter
  - [x] **Lush Stereo Chorus**: Dual modulated delay lines driven by quadrature sinusoidal LFOs
  - [x] **Stereo Width / M-S Imager**: Mid/side matrix decoder (0% mono to 200% wide) with dual ChannelSplitters/Mergers
  - [x] Full real-time integration into track fader chains and master output bus

- [x] **Preset Management System**
  - [x] Implement JSON preset schema for individual effects (`EffectPreset`) and full channel strips (`ChannelStripPreset`) in `backend/app/schemas/preset.py`
  - [x] Factory presets for all 9 effect types (Tape, Tube, Modern Overdrive, Dimension D, Rotary, Sub Bass EQ, Air EQ, Punchy Comp, etc.) in `frontend/js/audio/presets.js`
  - [x] Save/load user custom presets with `localStorage` persistence and quick preset switching in Studio FX Rack UI

- [x] **Phase 8 Exit Verification**
  - [x] 28/28 unit tests passing across Phases 0 through 8 (`pytest backend/tests/unit/ -v`)
  - [x] Verified in browser: Tape Saturation, Stereo Chorus, and Stereo Width insertion, preset switching, parameter slider interaction, and UI rendering

---

## Phase 9: Automation, Submix Buses, Offline Render & Multi-Format Export

- [x] **Parameter Automation Engine**
  - [x] Implement `frontend/js/timeline/automation.js`:
    - [x] Automation sub-lanes under each track (Volume, Pan, Effect Parameters)
    - [x] Point editing (click to add, drag to move, Alt-click to delete)
    - [x] Interpolation: Constant-time linear interpolation
  - [x] Real-time parameter automation scheduler synchronized with transport clock
  - [x] Interactive automation canvas rendering in `frontend/js/timeline/timeline.js` with glowing editable nodes
  - [x] Track header `A` toggle button with dynamic parameter dropdown (Volume / Pan)

- [x] **Python Offline Render Pipeline (Exact DSP Parity)**
  - [x] Implement `backend/app/audio/render_graph.py`:
    - [x] Sample-accurate timeline summing in NumPy & SciPy
    - [x] Constant-power panning law (-3dB center)
    - [x] Clip envelope fades (linear fade-in / fade-out) and gain staging
    - [x] Mute and solo state filtering during offline bounce

- [x] **Multi-Format Export Subsystem**
  - [x] Implement `backend/app/services/export_service.py`:
    - [x] Export Master Mix: WAV (16, 24, 32-bit float), FLAC (lossless 24-bit), MP3 (320kbps via FFmpeg)
    - [x] Export Stems: Synchronized stem bounce with identical origin time
  - [x] Implement `backend/app/api/export.py` endpoints:
    - [x] `POST /api/projects/{id}/export`
    - [x] `GET /api/projects/{id}/export/{id}/download`
  - [x] Implement `frontend/js/panels/export.js` UI with live render status and download cards

- [x] **Phase 9 Exit Verification**
  - [x] 33/33 unit tests passing across Phases 0 through 9 (`pytest backend/tests/unit/ -v`)
  - [x] Verified in browser: Automation sub-lane toggle, node manipulation, and offline master mix bounce with working download card

---

## Phase 10: Spectrogram View, Spatial Audio & Vocal Pitch Tools

- [ ] **High-Resolution Spectrogram Engine**
  - [ ] Implement `backend/app/audio/spectrogram.py`:
    - [ ] Short-Time Fourier Transform (STFT) via SciPy/librosa
    - [ ] Decibel-scaled magnitude spectrogram with perceptually uniform colormaps (Magma / Viridis)
    - [ ] Compressed spectrogram tile caching
  - [ ] Implement `frontend/js/canvas/spectrogram.js`:
    - [ ] Viewport-accelerated spectrogram tile canvas rendering
    - [ ] View mode switcher: Waveform only | Spectrogram only | Split view

- [ ] **8D & Binaural Spatial Panning**
  - [ ] Implement automated orbit spatial panner (StereoPannerNode + LFO automation + Doppler filter)
  - [ ] Spatial radius, speed, and trajectory controls

- [ ] **Vocal Pitch & Formant Inspection (WORLD vocoder)**
  - [ ] Extract pitch contour (F0) across vocal stem
  - [ ] Render pitch curve overlay over vocal waveform on the timeline

- [ ] **Phase 10 Exit Verification**
  - [ ] Switch vocal track to Spectrogram view -> frequency distribution and harmonics clearly visible
  - [ ] Enable 8D panning effect on synth -> sound circles smoothly in stereo headphones

---

## Phase 11: Local AI Assistant (Natural Language DAW Commands)

- [ ] **Local LLM Engine (GGUF / llama-cpp-python)**
  - [ ] Integrate `llama-cpp-python` with CUDA acceleration
  - [ ] Download and verify local GGUF model: `Phi-3-mini-4k-instruct.Q4_K_M.gguf` (~2.2 GB)
  - [ ] Implement `backend/app/ai/command_model.py`:
    - [ ] Local model loading into GPU memory with fallback to CPU threads
    - [ ] Strict temperature (0.1 - 0.2) and JSON schema grammar enforcement

- [ ] **Natural Language Command Planner**
  - [ ] Implement `backend/app/services/ai_service.py`:
    - [ ] Context builder: serialize current tracks, clips, tempo, markers into compact prompt context
    - [ ] Few-shot system prompt tailored for DAW operations (split, gain, mute, add effect, eq, solo)
    - [ ] Pydantic validation of LLM output into typed `AIOperationPlan`
    - [ ] Safety validator: resolve track names to UUIDs; reject destructive or invalid commands

- [ ] **AI Proposal & Preview UI**
  - [ ] Implement `frontend/js/panels/ai.js`:
    - [ ] AI prompt drawer / chat window with command history
    - [ ] Structured Proposal Card: "AI proposes 2 changes: [1] Lower 'Drums' gain by -3dB, [2] Add Reverb to 'Vocals'"
    - [ ] `Apply` and `Cancel` buttons
    - [ ] Full undo support (hitting Undo immediately reverts all AI changes)

- [ ] **Phase 11 Exit Verification**
  - [ ] Type: "Mute the bass track and lower the vocals by 2 dB"
  - [ ] Local LLM responds in < 3s with structured plan
  - [ ] Click "Apply" -> Bass fader mutes, Vocal fader drops by 2 dB; Undo restores both

---

## Phase 12: Local AI Music Generation, Extension & Stem Replacement

- [ ] **MusicGen Model Pipeline (AudioCraft)**
  - [ ] Integrate `audiocraft` with `facebook/musicgen-small` (~1.5 GB VRAM)
  - [ ] Implement `backend/app/ai/generation_models.py`:
    - [ ] Text-to-music generation (prompt, BPM conditioning, duration up to 30s)
    - [ ] Audio continuation / extension (use preceding 5s audio as conditioning context)
    - [ ] Musical variation (generate melodic variant conditioned on source stem)
  - [ ] Implement job worker with cancel token and GPU memory cleanup

- [ ] **Creative Workspace & Timeline Insertion**
  - [ ] Region right-click context menu: "AI Extend", "AI Generate Variation", "AI Replace Instrument"
  - [ ] Candidate preview player: audition generated clip before committing to timeline
  - [ ] Insert generated clip into new track or replace region non-destructively

- [ ] **Phase 12 Exit Verification**
  - [ ] Select 8-bar region -> prompt: "Funky 70s slap bass line in A minor, 120 bpm"
  - [ ] Local GPU generates audio without internet connection
  - [ ] Audition preview -> Accept -> inserted into session at exact timeline position

---

## Phase 13: Mastering Suite & Audio-to-MIDI Transcription

- [ ] **Professional Mastering Chain**
  - [ ] Implement `backend/app/audio/mastering.py`:
    - [ ] Mastering 4-band Linear-Phase EQ
    - [ ] Bus Glue Compressor
    - [ ] Analog Harmonic Exciter / Saturator
    - [ ] True-Peak Lookahead Brickwall Limiter
  - [ ] Standards-compliant metering via `pyloudnorm`:
    - [ ] Integrated LUFS (target -14 LUFS for streaming)
    - [ ] Short-term LUFS, Momentary LUFS, Loudness Range (LU)
    - [ ] True-Peak meter (4x oversampling) to prevent inter-sample clipping
    - [ ] Phase correlation meter (-1.0 to +1.0)
  - [ ] Industry Mastering Presets: Streaming (-14 LUFS), Club (-8 LUFS), Podcast (-16 LUFS), Cinematic (-18 LUFS)

- [ ] **Audio-to-MIDI Transcription (basic-pitch)**
  - [ ] Integrate Spotify's `basic-pitch` neural network
  - [ ] Implement `backend/app/ai/transcription_models.py`:
    - [ ] Transcribe melodic and polyphonic audio stems to note events (pitch, onset, offset, velocity)
    - [ ] Export standard Type 0 / Type 1 `.mid` files
  - [ ] Implement basic piano roll / note viewer in inspector

- [ ] **Phase 13 Exit Verification**
  - [ ] Run mastering processor with "Streaming" preset -> output hits -14.0 LUFS ±0.2 LUFS and True Peak < -1.0 dBFS
  - [ ] Transcribe bass stem to MIDI -> export `.mid` -> load in standard player -> notes match pitch and timing

---

## Phase 14: AI Mix Assistant & Intelligent Explanations

- [ ] **Intelligent Mix Analyzer**
  - [ ] Implement `backend/app/services/mix_advisor.py`:
    - [ ] Frequency masking detector: detect frequency collisions between Kick and Bass, Vocals and Guitars
    - [ ] Stereo balance analyzer: detect phase cancellation or mono imbalance
    - [ ] Dynamic range and headroom analysis
  - [ ] Generate actionable mix advice cards with one-click fix buttons (e.g. "Sidechain Kick to Bass", "Carve 300Hz from Guitars")

- [ ] **Audio Insight & Education Module**
  - [ ] Natural language audio explanation: "Explain the frequency profile and tempo changes of this track"
  - [ ] LLM combines raw spectral and harmonic analysis data into concise, educational musical feedback

- [ ] **Phase 14 Exit Verification**
  - [ ] Mix Kick and Bass with overlapping sub frequencies -> Mix Advisor flags collision at 60Hz and offers EQ fix

---

## Phase 15: Optimization, VRAM Hardening & Quality Assurance

- [ ] **GPU & VRAM Hardening**
  - [ ] Stress-test back-to-back stem separations, AI generation, and command planning on 6GB VRAM
  - [ ] Verify automatic LRU model unloading and garbage collection prevents CUDA OOM
  - [ ] Verify clean graceful fallback to CPU when GPU is saturated

- [ ] **Performance Benchmarks**
  - [ ] Timeline rendering maintains 60 FPS with 24 audio tracks and 100+ clips
  - [ ] Playback starts in < 100ms
  - [ ] Full project offline export renders faster than real-time (e.g. 5-minute song renders in < 30 seconds)

- [ ] **Hardened Offline Verification**
  - [ ] Disconnect machine from network completely (airplane mode)
  - [ ] Boot app, import audio, separate stems, apply effects, run AI assistant, render master
  - [ ] Verify zero network calls or failures

---

## Phase 16: Packaging & Standalone Desktop Deployment (Future)

- [ ] Windows launcher script (`run_max_audio.bat`)
- [ ] Model download & integrity verification utility (`scripts/download_models.py`)
- [ ] PyInstaller / Electron standalone wrapper configuration
