# MaxAudioEditor — Master Implementation Prompt

You are the lead architect and senior full-stack audio/AI engineer responsible for implementing **MaxAudioEditor**.

Build a production-quality, fully local, GPU-accelerated AI music/audio editor.

Do not mention or reference any previous project. The product name is **MaxAudioEditor**.

---

# 1. Non-negotiable requirements

## Runtime

The application must run locally on the user's computer.

Mandatory frontend:
- Vanilla HTML
- CSS
- JavaScript
- Web Audio API
- Canvas 2D

Mandatory backend:
- Python
- FastAPI
- Uvicorn

Heavy processing:
- Use local CPU/GPU libraries and models.
- Prefer NVIDIA CUDA when available.
- Use the GPU aggressively for compatible inference and processing.
- Do not compromise quality merely to reduce compute cost.

## No external APIs

Do NOT use:
- OpenAI API
- cloud AI APIs
- cloud audio APIs
- SaaS stem separation
- SaaS transcription
- remote rendering
- mandatory telemetry services
- remote model inference

All AI inference must use local model files.

Internet may only be needed during installation/model download/development. Runtime must continue working offline.

---

# 2. Product objective

Create an AI-native DAW-like editor where the user can:

1. Import a song.
2. Analyze it.
3. Detect BPM/key/beat/structure.
4. Separate stems.
5. Display all stems on a synchronized timeline.
6. Select individual regions.
7. Edit each region independently.
8. Change BPM, pitch, volume, pan, EQ, compression, reverb, delay, etc.
9. Automate parameters.
10. Ask a local AI assistant to perform editing operations.
11. Generate/extend/replace selected music using local models where supported.
12. Compare versions.
13. Master.
14. Export a mix, selected range, or synchronized stems.

---

# 3. Core UI

Create a professional DAW-style interface.

## Top transport bar

Include:
- New
- Open
- Save
- Undo
- Redo
- Play
- Pause
- Stop
- Record-ready architecture
- Current time
- BPM
- Time signature
- Key
- Snap
- Metronome
- Loop
- Export

## Main timeline

The timeline must contain:
- time ruler
- bar/beat ruler
- playhead
- tracks
- clips
- waveform
- grid
- selection
- markers
- automation
- horizontal zoom
- vertical scrolling

The user must be able to select an exact region.

Example:

```text
00:00       00:30       01:00       01:30
│-----------│-----------│-----------│-----------

VOCALS   ████████████|███████████████████
                    ↑
               selected region

BASS     ████████████|███████████████████
DRUMS    ████████████|███████████████████
OTHER    ████████████|███████████████████
```

---

# 4. Project model

Build a non-destructive project model.

Project contains:
- metadata
- tracks
- clips
- stems
- sections
- markers
- effects
- automation
- analysis
- versions
- render settings

Original audio must never be overwritten.

Every edit must be represented as project state.

---

# 5. Import

Support common formats through local FFmpeg/native decoding.

At import:
1. Validate file.
2. Store original.
3. Read metadata.
4. Decode/prepare working representation.
5. Generate waveform cache.
6. Start analysis.

Do not block the UI.

---

# 6. Audio analysis

Implement local analysis for:

- duration
- channels
- sample rate
- BPM
- beat positions
- downbeats
- time signature where reliable
- key
- scale
- loudness
- LUFS
- true peak
- dynamic range
- spectral centroid
- spectral energy
- energy curve
- probable instruments
- vocals
- musical sections

Display confidence.

Never present an uncertain AI prediction as guaranteed fact.

---

# 7. Stem separation

Implement a model abstraction.

Baseline:

```text
Vocals
Drums
Bass
Other
```

Allow additional local models for:
- guitar
- piano
- synth
- percussion
- strings
- brass

The stem system must:
- run locally
- prefer CUDA
- report progress
- cache results
- preserve synchronization
- allow retry
- allow model selection
- expose model metadata

Do not claim perfect separation.

---

# 8. Timeline editing

Implement:

- select
- multi-select
- split
- trim
- move
- duplicate
- delete
- copy
- paste
- loop
- reverse
- mute
- fade-in
- fade-out
- crossfade
- slip/edit source offset where practical

Keyboard shortcuts:

```text
Space = Play/Pause
S = Split
Delete = Delete
Ctrl/Cmd+Z = Undo
Ctrl/Cmd+Shift+Z = Redo
C = Copy
V = Paste
L = Loop
M = Mute
```

---

# 9. Beat grid

Create musical grid from detected/manual BPM.

Support snapping:
- bar
- beat
- 1/2
- 1/4
- 1/8
- free

Clips must be stored in exact time/sample coordinates, not pixels.

---

# 10. Region-level editing

This is a core feature.

Every clip can have independent:

- gain
- pan
- pitch
- tempo/stretch
- mute
- fades
- effects
- automation

Example:

```text
Verse bass: 0 dB
Chorus bass: +3 dB
Bridge bass: -2 dB
```

Do not apply the chorus change to the whole bass track.

---

# 11. BPM editing

Support:

## Global tempo
Change project BPM.

## Region tempo
Change only selected region.

Provide:
- preserve pitch
- preserve timing
- high-quality final render

Do not rely on simple playbackRate for final professional rendering.

---

# 12. Pitch/key editing

Support:
- semitone shift
- cents where technically practical
- key-aware transposition
- preserve tempo

For vocals, support formant-aware processing where the chosen local engine/model supports it.

---

# 13. Mixer

Every track gets:

- gain
- volume
- pan
- mute
- solo
- phase/polarity where available
- stereo width
- inserts
- sends

Create buses:

```text
Vocals → Vocal Bus
Drums  → Drum Bus
Music  → Music Bus

All buses → Master
```

---

# 14. Effects

Implement modular effect chains.

Minimum:
- EQ
- compressor
- limiter
- reverb
- delay

Advanced:
- gate
- de-esser
- saturation
- distortion
- filter
- chorus
- flanger
- phaser
- spatial/8D

Each effect:
- bypass
- parameters
- preset
- reset
- automation support where practical

---

# 15. EQ

Provide simple and advanced modes.

Simple:
- bass
- mids
- treble

Advanced:
- frequency
- gain
- Q
- filter type
- multiple bands

Display frequency response.

---

# 16. Compressor

Parameters:
- threshold
- ratio
- attack
- release
- knee
- makeup gain

Meters:
- input
- output
- gain reduction

---

# 17. Reverb

Parameters:
- room/size
- decay
- pre-delay
- damping
- mix
- width

Presets:
- room
- studio
- hall
- plate
- cathedral
- ambient

---

# 18. Delay

Support:
- tempo-sync
- 1/4
- 1/8
- dotted
- 1/16
- feedback
- mix
- stereo width

---

# 19. Spatial/8D

Implement local spatial movement.

Allow:
- left/right movement
- stereo width
- automated position
- rotation curves

Do not require external APIs.

---

# 20. Automation

Implement automation lanes.

Parameters:
- volume
- pan
- EQ
- filter
- reverb
- delay
- effect parameters
- other registered parameters

Support:
- add point
- delete point
- drag point
- interpolation
- curve selection

---

# 21. Spectrogram

Provide optional spectrogram view using Canvas 2D.

Allow switching between:
- waveform
- spectrogram
- waveform + spectrogram

Do not calculate expensive full-resolution spectrograms on every frame.

Cache/stream analysis data.

---

# 22. AI assistant

Implement a local AI assistant.

Example:

User:
"Lower the drums by 2 dB during the second chorus."

Assistant should determine:

```json
{
  "operation": "set_clip_gain",
  "track": "drums",
  "region": "chorus_2",
  "gain_db": -2
}
```

Then show:

```text
AI PROPOSAL

Drums
Second Chorus
Gain: -2.0 dB

[Apply] [Cancel]
```

Only after Apply should the operation mutate project state.

---

# 23. AI safety

The local language model must NEVER be allowed to:
- execute Python
- execute shell
- access arbitrary files
- run arbitrary subprocesses
- modify arbitrary JSON

It may only emit registered operation types.

Validate with Pydantic/JSON Schema before execution.

---

# 24. AI commands to support

Implement interpretation for:

### Editing
- split
- cut
- trim
- delete
- duplicate
- move
- loop

### Mixing
- volume
- gain
- pan
- mute
- solo
- balance

### Effects
- EQ
- compression
- reverb
- delay
- distortion
- saturation

### Timing
- BPM
- stretch
- loop
- quantize/snap where applicable

### Pitch
- transpose
- key change
- pitch shift

### Creative
- generate
- extend
- replace
- variation
- add instrument
- remove instrument

---

# 25. Local AI generation

Build a model registry that can load local generation models.

Support conceptual operations:

```text
Generate
Extend
Replace
Variation
Accompaniment
```

For every generated result:
- create new media
- create new clip
- preserve original
- allow A/B
- allow undo
- store model/settings

Do not force a single generation model into every task.

Use the strongest locally runnable model appropriate to the user's GPU.

---

# 26. AI instrument transformation

Design the architecture to support:

```text
Guitar → Piano
Piano → Strings
Synth → Guitar-like layer
Drum transformation
Vocal transformation
```

Use model adapters.

If a requested transformation cannot be performed reliably with the installed local model, report that honestly rather than producing a fake "success".

---

# 27. Audio extension

Allow:

```text
Select 8 bars
↓
Extend by 8 bars
↓
AI generates continuation
```

Generated content must become a separate clip/version.

---

# 28. Audio-to-MIDI

Where a suitable local model is available:
- detect notes
- detect pitch
- estimate onset
- estimate duration
- export MIDI

Do not require perfect transcription.

Display confidence.

---

# 29. Vocal processing

Where supported:
- pitch assistance
- pitch shift
- formant shift
- de-essing
- EQ
- compression
- reverb
- delay
- noise reduction

Keep the original vocal stem untouched.

---

# 30. Mastering

Create a master panel:

```text
MASTER

EQ
Compressor
Saturation
Limiter
Stereo
LUFS
True Peak
Dynamic Range
```

Presets:
- Streaming
- YouTube
- Podcast
- Club
- Cinematic

Do not normalize blindly. Provide meters and explicit settings.

---

# 31. A/B comparison

Allow:
- Original vs edited
- Before vs after
- AI result vs current
- Version A vs Version B

A/B state must not mutate the project.

---

# 32. History

Display:

```text
v1 Original
v2 Stems
v3 Chorus edited
v4 Vocal pitch
v5 Bass mix
v6 Master
```

Every operation should be reversible.

---

# 33. Export

Export:
- full mix
- selected range
- selected track
- selected stem
- all stems

Formats:
- WAV
- FLAC
- MP3
- OGG/AAC where locally supported

Settings:
- sample rate
- bit depth
- channels
- bitrate for lossy formats

---

# 34. Stem export

All stems must:
- start at the same timeline origin
- use the same duration
- use the same sample rate where selected
- maintain synchronization

---

# 35. Offline renderer

Implement a server-side/local renderer.

Render graph:

```text
Source
 ↓
Clip processing
 ↓
Track effects
 ↓
Sends
 ↓
Buses
 ↓
Master
 ↓
Encoder
```

The browser preview and offline renderer should share the same conceptual parameter model.

---

# 36. GPU strategy

Use CUDA whenever compatible.

At startup detect:
- NVIDIA GPU
- CUDA
- VRAM
- PyTorch CUDA support
- available model memory

Implement:

```text
GPU device manager
Model manager
VRAM-aware scheduler
Model cache
Job queue
```

Avoid loading multiple huge models simultaneously if VRAM cannot support them.

Prefer model reuse/warm loading.

---

# 37. GPU optimization

Use:
- FP16 where quality is acceptable
- BF16 where supported and advantageous
- batch processing
- model warmup
- pinned memory
- asynchronous data transfer
- CUDA streams where useful
- memory cleanup
- cached models

Do not use reduced precision if it causes unacceptable audio quality.

Provide configurable quality/performance settings.

---

# 38. Job manager

Jobs:

```text
QUEUED
RUNNING
COMPLETED
FAILED
CANCELLED
```

Each job has:
- ID
- type
- project
- progress
- started_at
- completed_at
- GPU
- model
- error

Frontend receives progress updates.

---

# 39. Caching

Cache:
- waveform
- analysis
- stems
- generated clips
- previews
- renders

Cache key should include:
- source hash
- model version
- operation parameters
- relevant project state

---

# 40. Project storage

Use:

```text
data/projects/
```

Project:

```text
Example.maxaudio/
├── project.json
├── media/
├── stems/
├── generated/
├── analysis/
├── waveforms/
├── previews/
├── versions/
└── renders/
```

Never depend on an external database server for the local edition.

SQLite can store indexed metadata if useful.

---

# 41. API endpoints

Implement clean endpoints such as:

```text
GET    /api/health
GET    /api/system/gpu
GET    /api/models
POST   /api/projects
GET    /api/projects/{id}
PUT    /api/projects/{id}
DELETE /api/projects/{id}

POST   /api/projects/{id}/media
POST   /api/projects/{id}/analysis
POST   /api/projects/{id}/stems
POST   /api/projects/{id}/render
POST   /api/projects/{id}/export

POST   /api/projects/{id}/ai/plan
POST   /api/projects/{id}/ai/apply

GET    /api/jobs/{id}
POST   /api/jobs/{id}/cancel
```

Use WebSocket/SSE for job progress.

---

# 42. Frontend performance

Never let:
- stem separation
- model inference
- large file decoding
- waveform generation
- rendering

block the UI thread.

Use Web Workers and backend jobs.

Canvas rendering must be viewport-aware.

---

# 43. Accessibility

Provide:
- keyboard shortcuts
- visible focus
- readable labels
- tooltip descriptions
- adequate contrast
- non-color-only status indicators

---

# 44. Error handling

Every error should explain:
1. What failed.
2. Why it probably failed.
3. What the user can do.

Example:

```text
Stem separation failed.

Reason:
The selected model requires more GPU memory than is currently available.

Try:
- close other GPU applications
- choose a lower-memory model
- enable CPU fallback
```

---

# 45. Security

Even though the app is local:
- validate paths
- prevent traversal
- sanitize filenames
- never use shell=True with user data
- use subprocess argument arrays
- limit file sizes
- validate MIME/content
- isolate temporary files
- never execute AI-generated code

---

# 46. Testing

Build tests before declaring features complete.

Test:
- project serialization
- clip operations
- undo/redo
- timeline conversion
- snapping
- effects
- render graph
- export
- GPU detection
- model loading
- job cancellation
- AI schema validation
- AI operation execution
- offline operation

Audio regression tests should compare:
- duration
- sample rate
- channels
- peak
- RMS/LUFS
- alignment
- expected operation behavior

---

# 47. Development order

Implement in this exact high-level order:

1. Project model
2. FastAPI
3. Local filesystem
4. Import/decoding
5. Web Audio transport
6. Canvas waveform
7. Timeline
8. Clips
9. Selection
10. Undo/redo
11. Analysis
12. Stem separation
13. Mixer
14. DSP
15. Region processing
16. Automation
17. Offline renderer
18. Export
19. Local AI assistant
20. AI generation
21. Audio-to-MIDI
22. Mastering
23. Optimization
24. Packaging

Do not implement AI generation before the underlying project/clip architecture is stable.

---

# 48. Implementation quality rules

Do not:
- put the whole application in one HTML file
- put the whole backend in one Python file
- duplicate project state
- mutate original media
- put audio buffers into project JSON
- allow AI to execute arbitrary commands
- block the browser during heavy processing
- fake unsupported AI functionality
- depend on external APIs
- silently upload user audio

Do:
- use modular files
- use typed schemas
- use deterministic commands
- use caching
- use local models
- use GPU where useful
- expose progress
- support undo
- preserve source media
- write tests
- document model requirements

---

# 49. Definition of done

The implementation is considered successful only when a user can run:

```text
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

open the local web UI, import a song, analyze it, separate stems using the local GPU, edit individual regions, mix them, use supported local AI functions, undo/redo changes, and render/export the result without any external API.

The application must remain usable with the network disabled after dependencies and models have been installed.

---

# 50. Final engineering objective

Do not build a demo.

Build MaxAudioEditor as a modular, extensible, local-first audio production platform.

Prioritize:

1. Audio quality
2. Correctness
3. Non-destructive editing
4. GPU acceleration
5. Low-latency interaction
6. Deterministic rendering
7. AI safety
8. Maintainability
9. Excellent UX
10. Offline operation

When choosing between a quick implementation and a technically correct implementation, prefer the technically correct implementation unless the difference is genuinely negligible.

When choosing between CPU-only and CUDA-capable processing, prefer CUDA when available.

When choosing between a simple audio effect and a high-quality offline DSP implementation, use the higher-quality implementation for final rendering.

When a feature requires a specialized model, create a model adapter interface rather than hard-coding the entire application around one model.

Always preserve the ability to replace models later.

The final system should feel like a serious professional audio editor with local AI capabilities, not a collection of unrelated AI demos.
