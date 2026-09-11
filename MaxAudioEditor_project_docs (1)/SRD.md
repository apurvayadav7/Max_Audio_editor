# MaxAudioEditor — System Requirements Document

## 1. System overview

MaxAudioEditor is a local client-server application.

The browser provides the editing UI and interactive audio playback. FastAPI provides project/job/model orchestration. Local Python workers perform heavy DSP and AI operations.

## 2. Logical components

```text
Browser UI
│
├── Project Store
├── Timeline Engine
├── Audio Playback Engine
├── Canvas Renderer
├── Command/Undo Engine
└── API Client
        │
        ▼
FastAPI
│
├── Project Service
├── Media Service
├── Analysis Service
├── Stem Service
├── AI Service
├── Render Service
└── Job Service
        │
        ▼
Local Workers
│
├── CPU DSP
├── GPU AI
├── GPU/CPU analysis
└── Offline renderer
```

## 3. Internal project model

### Project
```text
Project
- id
- name
- version
- sample_rate
- tempo
- time_signature
- key
- duration
- tracks[]
- markers[]
- sections[]
- analysis
- render_settings
```

### Track
```text
Track
- id
- name
- type
- color
- volume
- pan
- mute
- solo
- clips[]
- effects[]
- sends[]
- automation[]
```

### Clip
```text
Clip
- id
- source_id
- timeline_start
- timeline_end
- source_offset
- source_duration
- gain
- pan
- pitch
- stretch
- fades
- mute
- effects
```

## 4. Audio representation

Recommended internal working format:
- PCM WAV/float32 or equivalent high-quality intermediate
- fixed project sample rate
- channel metadata
- exact sample positions for offline rendering

The system should preserve original source files and generate derived assets separately.

## 5. Browser audio engine

Web Audio API shall provide:
- AudioContext
- AudioBufferSourceNode
- GainNode
- StereoPannerNode
- BiquadFilterNode
- DynamicsCompressorNode
- DelayNode
- ConvolverNode
- AudioWorklet for custom DSP

The application should use AudioWorklet for DSP that must not run on the main UI thread.

## 6. Canvas renderer

Canvas 2D shall render:
- waveform
- playhead
- grid
- beat markers
- selection
- automation curves
- clip boundaries
- meters where appropriate

Rendering must be incremental and viewport-aware.

## 7. Worker architecture

Browser:
- waveform worker
- decoding/preprocessing worker where practical

Backend:
- analysis worker
- stem worker
- render worker
- AI worker

GPU workers must avoid unnecessary model reloads.

## 8. GPU

Primary target:
- NVIDIA CUDA GPU

The system should expose:
- GPU name
- VRAM
- CUDA availability
- selected compute device

Model execution should automatically select CUDA when available.

CPU fallback is permitted for compatibility but must not be the default when CUDA is available.

## 9. Model architecture

Models shall be represented by a registry:

```yaml
models:
  stem_separator:
    provider: local
    model: <installed-model>
    device: cuda
  music_analyzer:
    provider: local
    model: <installed-model>
    device: cuda
  music_generator:
    provider: local
    model: <installed-model>
    device: cuda
```

No model adapter may require an external API.

## 10. AI command security

Natural language shall be converted into a constrained command schema.

Never allow:
- arbitrary Python
- arbitrary shell
- arbitrary filesystem paths
- arbitrary subprocess commands

The executor only accepts registered operation types.

## 11. Rendering

The offline renderer shall:
1. Load project.
2. Resolve clips.
3. Decode required source media.
4. Apply time/pitch transformations.
5. Apply clip effects.
6. Apply track effects.
7. Apply buses.
8. Apply master chain.
9. Write output.
10. Validate output.

## 12. Caching

Cache:
- decoded media
- waveform pyramids
- analysis
- separated stems
- AI generated clips
- effect previews
- rendered previews

Cache keys must include relevant source/model/settings hashes.

## 13. Concurrency

GPU jobs shall be scheduled to prevent VRAM exhaustion.

The scheduler should know:
- estimated VRAM
- model size
- job priority
- project
- cancellation status

## 14. Local filesystem

Recommended:

```text
data/
├── projects/
├── cache/
├── models/
├── jobs/
├── logs/
└── temp/
```

All paths must be resolved under configured roots.

## 15. API transport

Use REST for:
- project operations
- uploads
- job creation
- metadata
- exports

Use WebSocket or Server-Sent Events for:
- job progress
- server events
- long-operation status

## 16. Observability

Log:
- request ID
- project ID
- job ID
- operation
- model
- GPU
- duration
- memory
- errors

Do not log raw user audio.

