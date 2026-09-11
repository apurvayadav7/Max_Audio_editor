# MaxAudioEditor — Complete Feature Specification

## 1. Product Overview

MaxAudioEditor is a fully local, GPU-accelerated, AI-native music and audio editor.

Its primary workflow is:

```text
Import Audio
    ↓
Analyze Music
    ↓
Separate Stems
    ↓
Build Musical Timeline
    ↓
Edit Any Track/Region
    ↓
Mix + Automate
    ↓
Use Local AI
    ↓
Master
    ↓
Render
    ↓
Export
```

The system must operate without external AI APIs or cloud audio-processing services.

---

# 2. Project Management

## 2.1 New Project

Users can create a project with:

- Project name
- Sample rate
- Bit depth
- Tempo
- Time signature
- Key
- Project directory

## 2.2 Open Project

Open:

```text
.maxaudio project
```

A project contains all metadata required to reconstruct the editing session.

## 2.3 Save

Save:

- Timeline
- Tracks
- Clips
- Effects
- Automation
- Analysis
- Markers
- Sections
- AI operations
- Render settings

## 2.4 Autosave

Automatically save after important operations and at configurable intervals.

## 2.5 Crash Recovery

On startup:

```text
Recovered unsaved project
```

Allow the user to restore the latest valid state.

## 2.6 Project Versions

Example:

```text
Version 1 — Original
Version 2 — Stems separated
Version 3 — Chorus edited
Version 4 — Vocals processed
Version 5 — Final mix
```

Users can restore an earlier version.

---

# 3. Audio Import

Support local import of:

- WAV
- MP3
- FLAC
- OGG
- M4A/AAC where FFmpeg supports it

Import workflow:

```text
Select file
    ↓
Validate
    ↓
Store original
    ↓
Read metadata
    ↓
Prepare working representation
    ↓
Generate waveform
    ↓
Analyze
```

The original file must never be overwritten.

---

# 4. Drag and Drop

Allow users to drag audio files directly into the editor.

Possible actions:

```text
Drop into empty project → create track
Drop onto existing track → create clip
Drop onto timeline → place at selected time
```

---

# 5. Multi-Track Timeline

The central editing area is a professional DAW-style timeline.

Each track supports:

- Track name
- Track icon
- Track type
- Waveform
- Clips
- Volume
- Pan
- Mute
- Solo
- Effects
- Automation
- Sends
- Routing

Example:

```text
          0:00       0:30       1:00       1:30
           │          │          │          │

VOCALS    █████████████████████████████████████
DRUMS     █████████████████████████████████████
BASS      █████████████████████████████████████
GUITAR    █████████████████████████████████████
PIANO     █████████████████████████████████████
```

---

# 6. Timeline Navigation

Support:

- Horizontal scrolling
- Vertical scrolling
- Zoom in
- Zoom out
- Fit project
- Fit selection
- Follow playhead
- Center playhead
- Go to start
- Go to end
- Go to marker

---

# 7. Waveform Visualization

Display high-quality waveform previews.

Support:

- Overview waveform
- Zoomed waveform
- Peak display
- RMS display where useful
- Stereo waveform
- Clip waveform
- Selection overlay

Use Canvas 2D for visualization.

Use multiresolution waveform caches for performance.

---

# 8. Spectrogram

Optional spectrogram view:

```text
Frequency
↑
│
│  ███████████
│ ██████████████
│   █████████
└────────────────→ Time
```

Modes:

- Waveform
- Spectrogram
- Waveform + Spectrogram

---

# 9. Transport Controls

Provide:

- Play
- Pause
- Stop
- Restart
- Seek
- Play from selection
- Loop
- Metronome
- Current time display
- Remaining time
- Playback speed preview where appropriate

Keyboard:

```text
Space → Play/Pause
Home → Start
End → End
```

---

# 10. BPM Detection

Automatically detect BPM.

Display:

```text
BPM: 124
```

Allow manual correction.

Show confidence where available.

---

# 11. BPM Editing

## Global BPM

Change the entire project's tempo.

Example:

```text
120 BPM → 128 BPM
```

## Region BPM

Change only a selected region.

Example:

```text
Verse    120 BPM
Chorus   128 BPM
Verse    120 BPM
```

Use high-quality local time-stretching for final rendering.

---

# 12. Beat Detection

Detect:

- Beats
- Downbeats
- Bars
- Tempo changes where supported

Display them on the timeline.

---

# 13. Musical Grid

Snap to:

- Bar
- Beat
- 1/2 beat
- 1/4 beat
- 1/8 beat
- Free

The grid should adapt to zoom level.

---

# 14. Key Detection

Detect:

- Key
- Major/minor scale
- Confidence

Example:

```text
Key: C Minor
Confidence: 91%
```

Allow manual correction.

---

# 15. Pitch Shifting

Support:

- Semitone shift
- Fine pitch adjustment where supported
- Key-aware transposition
- Preserve tempo

Example:

```text
+2 semitones
C Minor → D Minor
```

Pitch operations can apply to:

- Entire track
- Clip
- Selected region

---

# 16. Time Stretching

Support:

- Faster
- Slower
- Preserve pitch
- Preserve musical alignment
- Beat-aware stretching

Preview may use browser playback techniques, but final export must use a high-quality offline engine.

---

# 17. Stem Separation

Use local GPU-based stem separation.

Minimum:

```text
Vocals
Drums
Bass
Other
```

Optional model-dependent stems:

```text
Guitar
Piano
Synth
Percussion
Strings
Brass
```

Features:

- GPU inference
- Model selection
- Progress
- Cancellation where supported
- Caching
- Retry
- Re-run
- Compare models

---

# 18. Stem Synchronization

All generated stems must remain synchronized.

Every stem must share:

- Project start
- Sample rate
- Timeline duration
- Beat alignment

Stem exports must remain phase/timing aligned as far as the source/model permits.

---

# 19. Stem Confidence

When instrument-specific models provide confidence estimates, show:

```text
Vocals    98%
Drums     96%
Bass      94%
Guitar    76%
Piano     64%
```

Do not display unsupported certainty.

---

# 20. Clip Editing

Every clip supports:

- Select
- Move
- Trim
- Split
- Duplicate
- Delete
- Copy
- Paste
- Loop
- Mute
- Gain
- Fade in
- Fade out
- Crossfade
- Reverse where supported

---

# 21. Region Selection

Users can select an exact time range.

Example:

```text
01:24.000 ───────────── 01:52.000
             SELECTED
```

All region-aware operations operate only on the selected range.

---

# 22. Independent Region Editing

This is a core feature.

Example:

```text
BASS

Verse       0 dB
Chorus     +3 dB
Bridge     -2 dB
Outro       0 dB
```

Changing the chorus must not modify the verse.

---

# 23. Clip Gain

Each clip can have independent gain.

Support:

- dB control
- gain handle
- reset
- automation

---

# 24. Pan

Per-track and per-clip pan:

```text
L ─────────●──────── R
            C
```

Support automation.

---

# 25. Mute and Solo

Track-level:

- Mute
- Solo

Region-level:

- Mute selected clip
- Mute selected range

Solo behavior must be predictable and reversible.

---

# 26. Stereo Width

Where the source is stereo, provide:

- width
- mono compatibility monitoring
- stereo balance

---

# 27. Phase / Polarity

Provide polarity inversion for tracks where useful.

Include optional phase/correlation visualization.

---

# 28. EQ

## Simple EQ

Controls:

- Bass
- Mid
- Treble

## Advanced EQ

Provide:

- Multiple bands
- Frequency
- Gain
- Q
- Filter type

Supported filter types:

- Bell
- Low shelf
- High shelf
- High-pass
- Low-pass
- Notch

---

# 29. Compressor

Parameters:

- Threshold
- Ratio
- Attack
- Release
- Knee
- Makeup gain

Meters:

- Input
- Output
- Gain reduction

---

# 30. Limiter

Parameters:

- Ceiling
- Threshold
- Release
- Lookahead where supported

Display:

- Gain reduction
- True peak
- Output level

---

# 31. Gate

Parameters:

- Threshold
- Attack
- Hold
- Release
- Range

Useful for drum/vocal cleanup.

---

# 32. De-Esser

Designed primarily for vocals.

Parameters:

- Frequency
- Threshold
- Reduction
- Bandwidth

---

# 33. Saturation

Modes:

- Tape
- Tube
- Soft clip
- Harmonic saturation

Controls:

- Drive
- Mix
- Output

---

# 34. Distortion

Modes:

- Soft
- Hard
- Fuzz
- Bitcrush where appropriate

Controls:

- Drive
- Tone
- Mix

---

# 35. Reverb

Presets:

- Room
- Studio
- Hall
- Plate
- Cathedral
- Ambient

Parameters:

- Size
- Decay
- Pre-delay
- Damping
- Mix
- Width

---

# 36. Delay

Support:

- 1/4
- 1/8
- Dotted
- 1/16
- Free time

Parameters:

- Time
- Feedback
- Mix
- Stereo width
- Filtering

---

# 37. Chorus

Parameters:

- Rate
- Depth
- Mix
- Width

---

# 38. Flanger

Parameters:

- Rate
- Depth
- Feedback
- Delay
- Mix

---

# 39. Phaser

Parameters:

- Rate
- Depth
- Feedback
- Stages
- Mix

---

# 40. Filter

Support:

- Low-pass
- High-pass
- Band-pass
- Notch

Parameters:

- Cutoff
- Resonance
- Slope

---

# 41. 8D / Spatial Audio

Provide local spatial processing.

Features:

- Left/right movement
- Circular movement
- Width
- Depth approximation
- Automated movement
- Speed control
- Movement curve

Example:

```text
LEFT → CENTER → RIGHT → CENTER → LEFT
```

---

# 42. Effects Chain

Each track can contain an ordered chain:

```text
EQ
 ↓
Compressor
 ↓
Saturation
 ↓
Reverb
 ↓
Delay
 ↓
Limiter
```

Users can:

- Add effect
- Remove effect
- Reorder
- Bypass
- Reset
- Save preset

---

# 43. Effect Presets

Allow:

- Save preset
- Load preset
- Delete custom preset
- Factory presets
- Reset to default

Presets must be stored locally.

---

# 44. Sends

Allow tracks to send audio to effect buses.

Example:

```text
VOCALS ──┐
GUITAR ──┼──→ REVERB BUS
PIANO  ──┘
```

---

# 45. Buses

Create:

- Vocal Bus
- Drum Bus
- Music Bus
- FX Bus
- Master

Allow bus effects.

---

# 46. Automation

Automation lanes support:

- Volume
- Pan
- EQ
- Filter
- Reverb
- Delay
- Saturation
- Other registered effect parameters

Users can:

- Add points
- Delete points
- Move points
- Select points
- Draw curves
- Change interpolation

---

# 47. Automation Curves

Support:

- Linear
- Smooth
- Step
- Exponential where appropriate

---

# 48. Markers

Users can create markers:

```text
Intro
Verse
Chorus
Drop
Bridge
Important
Edit
```

Markers can be moved and renamed.

---

# 49. AI Musical Structure Detection

Automatically identify probable:

- Intro
- Verse
- Pre-chorus
- Chorus
- Bridge
- Drop
- Build
- Instrumental
- Outro

Each section contains:

```text
Name
Start
End
Confidence
```

Users can manually adjust all detected sections.

---

# 50. AI Instrument Detection

Analyze audio/stems to identify probable:

- Vocals
- Drums
- Bass
- Guitar
- Piano
- Synth
- Strings
- Brass
- Percussion

Use confidence values.

---

# 51. AI Assistant

Provide a natural-language command interface.

Examples:

```text
Make the vocals warmer.

Lower the drums by 2 dB during the second chorus.

Pan the guitar 30% left during the verse.

Make the bass tighter.

Add a large reverb to the chorus vocals.

Remove the guitar from the bridge.

Make the chorus 8 bars longer.
```

---

# 52. AI Operation Planner

The local AI must convert natural language into a structured operation.

Example:

```json
{
  "operation": "set_clip_gain",
  "track_id": "drums",
  "region_id": "chorus_2",
  "gain_db": -2.0
}
```

The operation must be validated before execution.

---

# 53. AI Proposal UI

Never silently modify the project.

Show:

```text
AI PROPOSAL

Track: Drums
Region: Chorus 2
Gain: -2.0 dB

[Apply] [Cancel]
```

---

# 54. AI Undo

Every AI operation must be added to the normal undo system.

User can immediately:

```text
Ctrl + Z
```

---

# 55. AI Mix Assistant

Analyze the mix for:

- Frequency masking
- Excessive peaks
- Low-end imbalance
- Vocal level
- Stereo imbalance
- Loudness
- Dynamics
- Clipping

Provide suggestions:

```text
Vocals      +1.2 dB
Bass        -0.8 dB
Drums       +0.5 dB
EQ          -1.0 dB @ 3.5 kHz
```

User chooses whether to apply.

---

# 56. AI Audio Explanation

Allow questions such as:

```text
Why does my bass sound muddy?
```

The assistant should inspect available local analysis and explain probable causes.

It should not invent measurements.

---

# 57. AI Music Generation

Support local generation models through a model adapter.

Operations:

- Generate
- Variation
- Accompaniment
- Replace
- Extend

Generated content must be inserted as a new clip or track.

---

# 58. AI Music Extension

Example:

```text
Select 8 bars
↓
Extend by 8 bars
↓
Generate continuation
↓
Preview
↓
Accept / Reject
```

---

# 59. AI Instrument Addition

Example:

```text
Select Chorus
↓
"Add a subtle synth pad"
↓
Local generation
↓
New Synth track
```

---

# 60. AI Instrument Replacement

Architecture should support:

```text
Guitar → Piano
Piano → Strings
Synth → Guitar
```

only when a suitable local model is installed.

Unsupported transformations must report limitations honestly.

---

# 61. AI Instrument Removal

Example:

```text
Select Guitar
Select Chorus
Remove Instrument
```

The operation should use a local separation/restoration pipeline where available.

---

# 62. Vocal Processing

Where local models/engines support it:

- Pitch correction
- Pitch shifting
- Formant shifting
- Timing correction
- De-essing
- Noise reduction
- EQ
- Compression
- Reverb
- Delay

---

# 63. Audio-to-MIDI

Where a suitable local model is installed:

```text
Audio
 ↓
Pitch/onset detection
 ↓
Note estimation
 ↓
MIDI
```

Output:

- MIDI file
- Note list
- Pitch
- Onset
- Duration
- Confidence

---

# 64. MIDI Architecture

Design for future MIDI support:

- MIDI tracks
- MIDI clips
- Notes
- Velocity
- Duration
- Quantization
- Instrument assignment

---

# 65. Looping

Any selected region can be looped.

Examples:

```text
Loop 2x
Loop 4x
Loop 8x
Loop until marker
```

Looped content remains non-destructive.

---

# 66. Crossfades

When adjacent clips overlap:

```text
Clip A ███████╲
              ╲███████ Clip B
```

Allow:

- Linear crossfade
- Equal-power crossfade
- Adjustable length

---

# 67. Reverse

Allow clip reversal where the processing engine supports it.

Must be non-destructive.

---

# 68. Slip Editing

Where implemented, allow changing the source window inside a clip without moving the clip's timeline position.

---

# 69. A/B Comparison

Compare:

- Original
- Current
- AI result
- Previous version

Controls:

```text
A
B
Toggle
```

---

# 70. History

Display operation history:

```text
Original
↓
Stem separation
↓
Split chorus
↓
Bass +2 dB
↓
Vocal pitch +1
↓
Reverb
↓
Master
```

---

# 71. Undo/Redo

Every mutation must be represented as a command.

Support:

- Undo
- Redo
- Command history
- Grouped operations

AI operations must use the same command system.

---

# 72. Render Preview

Before final export, provide a preview render.

Allow:

- Selected range
- Current track
- Full project

---

# 73. Offline Rendering

Final rendering should use a local high-quality rendering pipeline.

Order:

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

---

# 74. Export Formats

Support:

- WAV
- FLAC
- MP3
- OGG
- AAC where locally supported

---

# 75. Export Settings

Provide:

- Sample rate
- Bit depth
- Channels
- Bitrate for lossy formats
- Dither where appropriate
- Normalization option

Do not silently apply destructive normalization.

---

# 76. Stem Export

Export:

```text
Vocals.wav
Drums.wav
Bass.wav
Other.wav
```

All stems must remain synchronized.

---

# 77. Selected Region Export

Export only:

```text
01:24 → 01:52
```

Possible outputs:

- Full mix
- Selected track
- Selected stem
- All stems for selection

---

# 78. Mastering

Master chain:

```text
EQ
 ↓
Compression
 ↓
Saturation
 ↓
Limiter
```

Meters:

- LUFS
- True peak
- RMS
- Dynamic range
- Stereo correlation

---

# 79. Mastering Presets

Provide starting presets:

- Streaming
- YouTube
- Podcast
- Club
- Cinematic

Presets are starting points, not guaranteed platform compliance.

---

# 80. Loudness Meter

Display:

```text
Integrated LUFS
Short-term LUFS
Momentary LUFS
True Peak
```

---

# 81. System Diagnostics

Provide a diagnostics page showing:

```text
CPU
RAM
GPU
VRAM
CUDA
PyTorch
FFmpeg
Installed Models
Available Disk
```

---

# 82. GPU Model Manager

Show:

```text
Model
Version
Size
VRAM requirement
Installed
Device
```

Allow:

- Enable/disable
- Validate
- Load test
- Benchmark

Models remain local.

---

# 83. GPU Job Scheduler

Manage:

- Queue
- Priority
- VRAM requirement
- Model reuse
- Cancellation
- Progress

Avoid simultaneous jobs that exceed VRAM.

---

# 84. Caching

Cache:

- Waveforms
- Analysis
- Stems
- AI outputs
- Preview renders
- Final renders

Cache invalidation must depend on source/model/settings hashes.

---

# 85. Offline Mode

After dependencies/models are installed, the application must continue to work with the network disabled.

Provide:

```text
OFFLINE MODE
```

and diagnostics showing any missing local dependency/model.

---

# 86. Local Security

Protect against:

- Path traversal
- Unsafe filenames
- Arbitrary shell execution
- AI-generated code execution
- Malicious subprocess arguments
- Invalid media files

AI must never execute arbitrary code.

---

# 87. Performance

Target:

- Smooth timeline interaction
- 60 FPS where hardware permits
- No heavy work on UI thread
- GPU inference
- Cached waveform rendering
- Efficient large-project scrolling
- Model warm loading
- Efficient VRAM usage

---

# 88. Keyboard Shortcuts

Minimum:

```text
Space       Play/Pause
S           Split
Delete      Delete
M           Mute
Ctrl+Z      Undo
Ctrl+Y      Redo
Ctrl+C      Copy
Ctrl+V      Paste
L           Loop
Home        Start
End         End
```

Allow customizable shortcuts later.

---

# 89. Accessibility

Support:

- Keyboard navigation
- Focus indicators
- Tooltips
- Clear labels
- Status messages
- Non-color-only state indicators
- Readable controls

---

# 90. Local API

FastAPI should expose endpoints for:

- System information
- Projects
- Media
- Analysis
- Stems
- Jobs
- AI planning
- AI application
- Rendering
- Export
- Models

Use WebSocket or SSE for long-running job progress.

---

# 91. Job States

Every heavy operation uses:

```text
QUEUED
RUNNING
COMPLETED
FAILED
CANCELLED
```

Show:

- Progress
- Current stage
- Estimated status where reliable
- Error
- Retry

---

# 92. Local Project Format

Recommended:

```text
Project.maxaudio/
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

---

# 93. Non-Destructive Architecture

Original media is immutable.

Edits modify:

```text
Project State
```

not:

```text
Original Audio
```

Derived media may be regenerated from source + settings.

---

# 94. AI Model Abstraction

All AI capabilities should use adapters:

```text
StemSeparator
MusicAnalyzer
MusicGenerator
AudioToMIDI
CommandPlanner
InstrumentTransformer
```

This makes models replaceable without rewriting the editor.

---

# 95. Quality Controls

For every AI result provide:

- Model
- Version
- Parameters
- Confidence where available
- Preview
- A/B
- Apply
- Reject
- Undo

---

# 96. Error Recovery

Errors must explain:

```text
What failed
Why it failed
How to fix it
```

Example:

```text
Stem separation failed.

The selected model requires more VRAM than available.

Try:
- close other GPU applications
- choose another model
- enable CPU fallback
```

---

# 97. Advanced Analysis

Future-compatible analysis should include:

- Chord detection
- Key changes
- Tempo changes
- Beat confidence
- Instrument activity over time
- Vocal activity
- Energy
- Spectral balance
- Harmonic/percussive analysis

---

# 98. Musical Intelligence Timeline

The timeline can eventually display:

```text
INTRO       VERSE       CHORUS       VERSE       CHORUS
|-----------|-----------|------------|-----------|-----------|

BPM 120     BPM 120     BPM 124      BPM 120     BPM 124
C Minor                 C Minor
```

This creates an intelligent musical map.

---

# 99. AI Creative Workspace

The user should eventually be able to select a region and choose:

```text
Generate
Extend
Replace
Variation
Remove
Transform
Analyze
```

This should become the primary AI workflow.

---

# 100. Final Feature Philosophy

MaxAudioEditor should not feel like:

```text
Audio player + random AI buttons
```

It should feel like:

```text
Professional DAW
+
AI music understanding
+
Local GPU processing
+
Natural-language editing
+
Non-destructive workflow
```

The architecture must therefore prioritize:

1. Audio correctness
2. Editing precision
3. Non-destructive state
4. Local GPU processing
5. High-quality offline rendering
6. Modular local AI models
7. Responsive UI
8. Reliable undo/redo
9. Honest AI limitations
10. Extensibility

Every future feature should fit into the same project, clip, track, command, render, and model architecture.
