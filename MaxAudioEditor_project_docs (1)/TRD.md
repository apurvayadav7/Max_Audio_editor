# MaxAudioEditor — Technical Requirements Document

## 1. Mandatory stack

### Frontend
- Vanilla HTML
- CSS
- JavaScript
- Web Audio API
- Canvas 2D
- Web Workers
- ES modules

Do not introduce React, Vue, Angular, Svelte, or another frontend framework.

### Backend
- Python
- FastAPI
- Uvicorn

### Heavy processing
Use the best local libraries/models appropriate for each task.

Recommended categories:
- FFmpeg for robust media decoding/encoding
- PyTorch for GPU inference
- Demucs-family models for baseline stem separation
- librosa/Essentia-style tooling for music analysis
- soundfile for PCM I/O
- NumPy/SciPy for DSP
- pyloudnorm or equivalent for loudness
- Rubber Band or an equivalent high-quality local time/pitch engine where licensing/build constraints permit
- AudioWorklet/Web Audio for interactive browser DSP
- local music-generation models such as MusicGen-family or newer compatible local models where hardware permits
- local audio-to-MIDI models where available
- optional ONNX Runtime/TensorRT acceleration when beneficial and compatible

The implementation team should benchmark alternatives rather than blindly selecting one library.

## 2. Python environment

Use a pinned environment:
- requirements.txt and/or pyproject.toml
- lock versions for production builds
- CUDA-compatible PyTorch build
- explicit FFmpeg dependency check

## 3. Frontend modules

```text
frontend/js/
├── app.js
├── state/
│   ├── store.js
│   ├── project-store.js
│   └── selection-store.js
├── timeline/
│   ├── timeline.js
│   ├── ruler.js
│   ├── track.js
│   ├── clip.js
│   ├── grid.js
│   └── interaction.js
├── audio/
│   ├── audio-engine.js
│   ├── transport.js
│   ├── mixer.js
│   ├── worklets/
│   └── effects/
├── canvas/
│   ├── renderer.js
│   ├── waveform.js
│   ├── automation.js
│   └── overlays.js
├── commands/
│   ├── command-manager.js
│   ├── undo.js
│   └── redo.js
├── ai/
│   ├── assistant.js
│   ├── command-schema.js
│   └── operation-preview.js
└── api/
    ├── client.js
    └── websocket.js
```

## 4. Backend modules

```text
backend/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── api/
│   ├── schemas/
│   ├── services/
│   ├── jobs/
│   ├── audio/
│   ├── ai/
│   ├── models/
│   ├── storage/
│   └── security/
├── workers/
└── tests/
```

## 5. Local AI assistant

The assistant must run locally.

Preferred architecture:
```text
User text
   ↓
Local instruction model
   ↓
Structured operation JSON
   ↓
Schema validation
   ↓
Operation planner
   ↓
Preview
   ↓
Executor
```

The language model is not allowed to directly modify the filesystem or execute commands.

## 6. Operation schema

All AI actions must conform to typed operations.

Examples:
- set_track_gain
- set_clip_gain
- set_pan
- split_clip
- trim_clip
- move_clip
- duplicate_clip
- delete_clip
- add_effect
- set_effect_parameter
- create_automation
- change_pitch
- change_tempo
- create_loop
- generate_region
- extend_region
- replace_region

## 7. DSP requirements

Interactive preview:
- low latency
- browser-based
- AudioWorklet where needed

Final render:
- offline/local Python/native DSP
- high precision
- deterministic
- no browser-only limitations

The preview and final renderer should share parameter semantics.

## 8. Time/pitch processing

Do not implement high-quality time stretching by simply changing AudioBuffer playbackRate for professional output.

PlaybackRate may be used for rough preview.

Final rendering should use a dedicated high-quality time/pitch algorithm.

## 9. Waveform system

Generate multiresolution peak pyramids.

Example:
```text
waveform/
├── level_0
├── level_1
├── level_2
├── level_3
└── metadata.json
```

The canvas should choose the appropriate level based on zoom.

## 10. Timeline coordinate system

Internally maintain exact time/sample values.

Never rely on pixel coordinates as the source of truth.

Conversions:
```text
time → pixels
pixels → time
beats → time
bars → time
samples → time
```

## 11. Snapping

Snap candidates:
- bar
- beat
- half beat
- quarter beat
- eighth note
- marker
- clip boundary
- free

## 12. Rendering strategy

Canvas should render only the visible timeline region.

Use:
- requestAnimationFrame
- dirty rectangles where practical
- cached waveform images/data
- devicePixelRatio handling

## 13. State management

Use a centralized plain-JavaScript state store.

State should be serializable.

Do not store:
- AudioContext objects
- DOM nodes
- decoded AudioBuffers
- GPU tensors

inside project JSON.

## 14. Database/storage

For the first local release, SQLite is preferred for metadata because it is simple and fully local.

Project media remains on the filesystem.

Optional future migration:
- PostgreSQL for multi-user/networked deployment.

## 15. Suggested project format

```text
MyProject.maxaudio/
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

## 16. Testing

### Unit tests
- time conversion
- beat conversion
- clip splitting
- fades
- automation interpolation
- command undo/redo
- schema validation

### Audio tests
- no unexpected clipping
- phase checks
- channel alignment
- sample-count correctness
- render determinism

### AI tests
- prompt → valid operation
- invalid operation rejection
- target resolution
- safety validation

### Browser tests
- timeline interactions
- zoom
- selection
- keyboard shortcuts
- transport
- playback

## 17. Performance targets

The exact target depends on machine hardware, but aim for:
- 60 FPS timeline interaction on normal projects
- no main-thread blocking from heavy analysis
- instant state changes for basic editing
- cached waveform display
- GPU inference whenever supported
- model reuse between jobs
- incremental rendering

## 18. Offline enforcement

Runtime must function without internet.

CI may verify this by:
- blocking network access
- running tests
- starting backend
- importing project
- performing local DSP
- performing a local model inference
- rendering output

No runtime request may depend on a remote API.

