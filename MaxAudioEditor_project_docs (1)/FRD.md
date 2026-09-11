# MaxAudioEditor — Functional Requirements Document

## FR-001 Project creation
The system shall allow a user to create a project with:
- project name
- sample rate
- tempo
- time signature
- default project directory

## FR-002 Import
The system shall support common formats through a local decoder pipeline, including WAV, MP3, FLAC, OGG, M4A/AAC where available.

The backend shall normalize imported audio to an internal working representation without altering the original.

## FR-003 Waveform
The system shall generate multiresolution waveform data:
- overview waveform
- zoom-level waveform
- peak/RMS data where useful

Waveform generation should be cached.

## FR-004 Timeline
The timeline shall support:
- time ruler
- bars/beats
- clips
- tracks
- playhead
- loop range
- markers
- selection
- snapping
- horizontal zoom
- vertical track scrolling

## FR-005 Clip editing
Each clip shall support:
- move
- trim
- split
- duplicate
- delete
- mute
- gain
- fade-in
- fade-out
- crossfade
- loop
- reverse where supported

## FR-006 Non-destructive model
Editing shall update project metadata rather than overwrite source media.

## FR-007 Undo/redo
Every project mutation shall create an undoable command.

Undo/redo shall operate on project state, not require regenerating source stems.

## FR-008 BPM
The system shall:
- detect BPM
- allow manual BPM override
- change global project tempo
- change selected region tempo
- support tempo-preserving pitch processing

## FR-009 Key
The system shall:
- estimate key
- allow manual key override
- pitch-shift selected audio by semitones
- support key-aware transposition

## FR-010 Beat grid
The system shall display beats/bars and allow snapping to:
- bar
- beat
- subdivision
- off/free

## FR-011 Sections
The system shall detect probable sections and display:
- section name
- start
- end
- confidence

Users shall be able to manually rename or adjust sections.

## FR-012 Stem separation
The system shall provide a local GPU stem-separation job.

Minimum stem set:
- vocals
- drums
- bass
- other

Additional models may expose more stems.

## FR-013 Stem synchronization
All stems shall share a common project timeline and start reference.

## FR-014 Track controls
Each track shall support:
- volume
- pan
- mute
- solo
- gain
- insert chain
- send chain where implemented

## FR-015 Effects
The application shall support modular effect nodes.

Minimum:
- EQ
- compressor
- limiter
- reverb
- delay

Extended:
- gate
- de-esser
- saturation
- distortion
- chorus
- flanger
- phaser
- filter

## FR-016 Effect presets
Effects shall support:
- save preset
- load preset
- reset
- bypass

## FR-017 Automation
Automation shall support:
- parameter selection
- point creation
- point deletion
- point movement
- interpolation
- lane visibility

## FR-018 Master
Master chain shall support:
- EQ
- compressor
- limiter
- loudness meter
- peak meter
- bypass

## FR-019 AI assistant
The AI assistant shall:
1. Parse a natural-language command locally.
2. Resolve track/region references.
3. Produce a structured operation plan.
4. Display the plan.
5. Allow apply/cancel.
6. Record the operation in project history.

## FR-020 AI operation schema
AI output shall never directly execute arbitrary code.

AI must return a validated JSON command structure.

Example:

```json
{
  "operation": "set_track_gain",
  "track_id": "bass",
  "range": {
    "start": 84.2,
    "end": 112.4
  },
  "gain_db": 2.5
}
```

## FR-021 AI generation
The system shall allow selected regions to be sent to a local generation pipeline.

Operations:
- generate
- extend
- variation
- replace

Generated audio must appear as a new non-destructive clip/version.

## FR-022 A/B
The user shall be able to compare:
- original vs processed
- version A vs version B
- AI proposal vs current

## FR-023 Export
The system shall export:
- mix
- selection
- individual stem
- all stems

## FR-024 Export synchronization
Exported stems must have identical timeline alignment.

## FR-025 Project persistence
A project shall store:
- metadata
- tracks
- clips
- effects
- automation
- analysis
- model metadata
- versions
- render settings

## FR-026 Autosave
The project shall autosave at configurable intervals and after important operations.

## FR-027 Jobs
Long operations shall use a job system:
- queued
- running
- completed
- failed
- cancelled

## FR-028 Cancellation
GPU jobs should support cancellation where the underlying process/model allows it.

## FR-029 Error handling
Errors shall include:
- human-readable message
- technical detail for logs
- recovery suggestion
- job ID when applicable

## FR-030 Local-only enforcement
Runtime code shall not require third-party network APIs for AI or audio processing.

