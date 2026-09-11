# MaxAudioEditor — Product Requirements Document

## 1. Product vision

MaxAudioEditor is a desktop-local/web-UI music production environment that gives users DAW-like control over uploaded audio while using local AI to understand and transform music.

The product should make advanced music editing accessible through both traditional controls and natural-language AI commands.

## 2. Target users

### Beginner
Wants to:
- remove vocals
- change BPM
- change key
- cut sections
- adjust volume/pan
- add effects
- export a remix

### Intermediate producer
Wants:
- stems
- detailed mixing
- clip-level editing
- automation
- beat grids
- effects chains
- mastering

### Advanced producer/developer
Wants:
- non-destructive editing
- project files
- deterministic rendering
- batch processing
- advanced local models
- MIDI/audio workflows
- scripting/extensibility

## 3. Product goals

- Fully local runtime.
- GPU acceleration for expensive processing.
- No external AI APIs.
- Non-destructive editing.
- Region-level musical editing.
- Professional-quality offline rendering.
- Fast interactive browser editor.
- Modular AI model architecture.
- Reproducible project state.

## 4. Non-goals for initial release

- Cloud collaboration.
- Mandatory account system.
- Mobile app.
- Cloud rendering.
- Streaming service integration.
- Guaranteed perfect instrument isolation.
- Guaranteed studio-quality AI instrument replacement for every input.

## 5. Core user journey

1. Launch MaxAudioEditor locally.
2. Create a project.
3. Import an audio file.
4. Decode/analyze audio.
5. Display waveform and detected musical information.
6. User chooses stem separation.
7. Local GPU processes the file.
8. Stems appear as tracks.
9. User edits clips/regions.
10. User applies effects and automation.
11. User optionally uses AI assistant.
12. User previews A/B.
13. User renders.
14. User exports mix/stems/selected region.

## 6. Functional product areas

### A. Project management
- New project
- Open project
- Save
- Save as
- Autosave
- Version history
- Recover previous session
- Import media
- Remove media
- Project metadata

### B. Timeline
- Tracks
- Clips
- Selection
- Playhead
- Grid
- Snapping
- Zoom
- Scroll
- Loop
- Markers
- Region editing
- Multi-select
- Clipboard operations

### C. Analysis
- BPM
- Key
- Beat grid
- Downbeats
- Sections
- Instrument recognition
- Loudness
- Spectral information

### D. Stems
- Separate stems
- Re-run separation
- Compare models
- Replace stem
- Hide stem
- Export stems

### E. Editing
- Split
- Trim
- Move
- Duplicate
- Loop
- Reverse
- Fade
- Crossfade
- Gain
- Time stretch
- Pitch shift

### F. Mixing
- Volume
- Pan
- Mute
- Solo
- Width
- Inserts
- Sends
- Buses
- Master

### G. DSP
- EQ
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
- Spatial effects

### H. Automation
- Track automation
- Clip automation
- Parameter automation
- Draw/edit automation points
- Linear and curved interpolation

### I. AI assistant
- Interpret natural language
- Identify target track/region
- Generate operation plan
- Show preview plan
- Apply
- Undo

### J. AI generation
- Generate layer
- Replace selected region
- Extend selected region
- Generate variation
- Audio-to-MIDI
- MIDI-to-audio where locally supported

### K. Export
- Full mix
- Selected range
- Individual stem
- All stems
- WAV
- FLAC
- MP3
- Configurable sample rate/bit depth

## 7. UX requirements

- Timeline must remain usable while background jobs run.
- Heavy operations must show progress.
- AI actions must be reversible.
- Destructive actions require confirmation when necessary.
- Selection must always be visually obvious.
- Keyboard shortcuts must be documented.
- Errors must explain what happened and how to recover.

## 8. Quality requirements

- Avoid clipping.
- Preserve sample accuracy in offline rendering.
- Keep original source untouched.
- Maintain deterministic project state.
- Validate output files.
- Handle unsupported media gracefully.

## 9. Success criteria

A user should be able to:

1. Import a song.
2. Detect BPM/key/structure.
3. Separate stems locally.
4. See synchronized waveforms.
5. Select one musical region.
6. Change its gain/pan/pitch/BPM/effects independently.
7. Undo the operation.
8. Render the complete project.
9. Export synchronized stems.

