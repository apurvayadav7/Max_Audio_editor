# MaxAudioEditor

MaxAudioEditor is a **fully local, GPU-accelerated, AI-native music/audio editor** designed to work without external APIs or cloud inference.

The application combines a browser-based DAW-style timeline with local AI audio analysis, stem separation, intelligent musical structure detection, non-destructive region editing, effects, automation, AI-assisted editing, audio generation/transformation, mastering, and professional export.

## Core principle

> Upload audio → understand the music → separate it → edit any musical region independently → process stems → use local AI for creative operations → render/export locally.

## No external AI/API requirement

MaxAudioEditor is designed to run entirely on the user's machine:

- Frontend: Vanilla HTML + CSS + JavaScript
- Audio playback/render graph: Web Audio API
- Visualization: Canvas 2D
- Backend: Python + FastAPI + Uvicorn
- Heavy audio/AI processing: local Python workers
- GPU: CUDA-compatible NVIDIA GPU preferred
- AI inference: local model files only
- No OpenAI API
- No cloud AI API
- No SaaS audio-processing API
- No mandatory internet connection after dependencies/models are installed

Internet may be used during development to download open-source packages and model weights, but runtime inference must remain local.

## Main capabilities

### Project and timeline
- Multi-track timeline
- Unlimited practical tracks/clips
- Waveform rendering
- Beat/bar grid
- BPM-aware snapping
- Zoom and horizontal scrolling
- Playhead
- Loop regions
- Markers
- Clip selection
- Multi-selection
- Copy/paste/duplicate
- Split/cut/trim
- Move
- Fade in/out
- Crossfade
- Region mute
- Non-destructive editing
- Undo/redo
- Autosave
- Project versions

### AI audio analysis
- BPM detection
- Beat/downbeat detection
- Time signature estimation where reliable
- Key/scale estimation
- Loudness/LUFS
- True peak
- Dynamic range
- Spectral analysis
- Energy curve
- Instrument detection
- Vocal detection
- Musical section detection
- Confidence scores

### Stem separation
Support configurable local separation models, with Demucs-family separation as the baseline:

- Vocals
- Drums
- Bass
- Other

Optional advanced separation:
- Guitar
- Piano
- Synth/keys
- Percussion
- Strings
- Brass

The UI must distinguish model-supported stems from inferred/experimental stems and show confidence where appropriate.

### Region-level editing
Every clip/region is independently editable.

Examples:
- Change only the chorus BPM
- Pitch-shift only one vocal region
- Pan only a guitar phrase
- Lower drums during one chorus
- Add reverb to one vocal section
- Replace or regenerate a selected region
- Loop a selected musical section

### Mixing
Per-track:
- Volume
- Pan
- Stereo width where supported
- Mute
- Solo
- Gain
- Phase/polarity where supported
- Sends
- Inserts

### Effects
- Parametric EQ
- High-pass/low-pass filters
- Compressor
- Limiter
- Gate
- De-esser
- Saturation
- Distortion
- Reverb
- Delay
- Chorus
- Flanger
- Phaser
- Stereo/spatial processing
- 8D-style movement
- Filter automation

### Automation
- Volume
- Pan
- EQ parameters
- Filter cutoff
- Reverb mix
- Delay mix
- Effect parameters
- Pitch where technically supported

### Time/pitch
- Global BPM change
- Region BPM change
- Time stretch
- Pitch shift in semitones
- Key-aware pitch shifting
- Formant-aware vocal processing where supported
- Preserve pitch while changing tempo
- Preserve tempo while changing pitch

### AI assistant
Natural-language local commands such as:

- "Make the vocals warmer."
- "Lower the drums by 2 dB during the second chorus."
- "Pan the guitar 30% left in the verse."
- "Make the bass tighter."
- "Add a large reverb to the chorus vocals."
- "Remove the guitar from the bridge."
- "Extend this section by 8 bars."
- "Create a synth pad matching this section."

The AI assistant must convert requests into a deterministic project operation plan before applying changes.

### AI generation/transformation
Planned local capabilities:
- Generate accompaniment
- Generate replacement layers
- Generate variations
- Extend music
- Continue a selected region
- Instrument replacement
- Style transformation
- Audio-to-MIDI transcription
- MIDI-based editing
- Vocal pitch/timing assistance

These capabilities must use locally installed models and must expose model/resource requirements in the UI.

### Mastering
- Master EQ
- Bus compression
- Saturation
- Limiting
- Loudness metering
- True peak
- Stereo analysis
- Streaming-oriented presets
- WAV/FLAC/MP3 export

## Important quality policy

AI audio separation and transformation are imperfect. MaxAudioEditor must never pretend that arbitrary instruments can always be isolated perfectly.

Every advanced AI operation should provide:
- Model used
- Processing status
- Confidence where available
- Non-destructive result
- A/B comparison
- Revert option

## Recommended architecture

```text
Browser
├── Vanilla HTML
├── CSS
├── JavaScript
├── Web Audio API
├── Canvas 2D
└── Web Workers

        │ HTTP/WebSocket

FastAPI
├── Project API
├── Analysis API
├── Stem API
├── Render API
├── AI operation API
└── Job/status API

        │

Local Worker System
├── Audio analysis
├── Stem separation
├── Time/pitch processing
├── AI generation
├── Mastering
└── Rendering

        │

Local storage
├── Project files
├── Original audio
├── Stems
├── Waveforms
├── Analysis
├── Render cache
└── Versions
```

## Performance target

The application should feel responsive for editing even while heavy AI jobs run.

Simple editing must happen in the browser whenever practical. Heavy operations should be dispatched to local GPU workers.

## Security

Because the application is local-first:
- Do not upload audio externally.
- Do not expose local files unnecessarily.
- Validate all file paths.
- Prevent path traversal.
- Sandbox subprocess arguments.
- Never execute user-provided shell strings.
- Restrict project storage to configured directories.

## Development philosophy

1. Build the audio/project data model first.
2. Build the timeline second.
3. Build local DSP/rendering.
4. Add stem separation.
5. Add analysis.
6. Add advanced effects/automation.
7. Add local AI assistant.
8. Add generation/transformation.
9. Optimize GPU and rendering.
10. Harden/export/package the application.

