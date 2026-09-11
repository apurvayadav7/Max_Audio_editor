# MaxAudioEditor — AI Subsystem Architecture & Execution Plan

This document specifies the architecture, data contracts, prompt engineering, safety guardrails, and execution pipelines for **MaxAudioEditor's local AI subsystem**.

---

## 1. Subsystem Architecture Overview

MaxAudioEditor features a three-tier local AI architecture:

```
┌────────────────────────────────────────────────────────┐
│                   FRONTEND AI CLIENT                   │
│   - Natural language chat drawer & quick command bar   │
│   - Proposal visualizer ("AI plans to modify 3 items") │
│   - Candidate preview audition player (A/B testing)    │
│   - One-click Apply / Reject / Undo                    │
└──────────────────────────┬─────────────────────────────┘
                           │ JSON REST / WebSocket
┌──────────────────────────┴─────────────────────────────┐
│                 FASTAPI AI SERVICE TIER                │
│   - Context Builder (compresses project to tokens)     │
│   - System Prompt & Few-Shot Instruction Engine        │
│   - Schema Validation & Safety Sandbox (Pydantic)      │
│   - Track Name Fuzzy Matching & Disambiguation         │
└──────────────────────────┬─────────────────────────────┘
                           │
         ┌─────────────────┼──────────────────┐
         ▼                 ▼                  ▼
┌─────────────────┐ ┌───────────────┐ ┌────────────────┐
│   Command LLM   │ │ Generative AI │ │ Transcription  │
│ Phi-3-mini GGUF │ │MusicGen-small │ │  Basic Pitch   │
│(llama-cpp-cuda) │ │  (AudioCraft) │ │  (Audio2MIDI)  │
└─────────────────┘ └───────────────┘ └────────────────┘
```

---

## 2. Natural Language Command Planner (Phi-3-mini)

### 2.1 Context Serialization

Before prompting the local LLM, the current project state is serialized into a minimal, token-efficient JSON summary:

```json
{
  "tempo": 124.0,
  "key": "F# Minor",
  "tracks": [
    { "id": "trk_vox", "name": "Vocals", "vol_db": -2.0, "pan": 0.0, "muted": false },
    { "id": "trk_drm", "name": "Drums", "vol_db": 0.0, "pan": 0.0, "muted": false },
    { "id": "trk_bas", "name": "Bass", "vol_db": -1.5, "pan": 0.0, "muted": false },
    { "id": "trk_syn", "name": "Synth Pad", "vol_db": -6.0, "pan": 0.3, "muted": false }
  ],
  "markers": [
    { "name": "Verse 1", "time": 15.5 },
    { "name": "Chorus", "time": 46.5 }
  ],
  "selection": { "trackId": "trk_vox", "timeRange": [15.5, 46.5] }
}
```

### 2.2 System Prompt & Few-Shot Instruction

The model is constrained via system prompts and strict grammar to return **only valid JSON**:

```markdown
You are the MaxAudioEditor AI Engine. Your task is to convert the user's natural language audio editing command into a structured list of discrete, executable operations.

You must respond ONLY with a JSON object conforming to the following schema:
{
  "explanation": "<Short human-readable summary of what will change>",
  "operations": [
    {
      "type": "<operation_type>",
      "track_id": "<target_track_id>",
      "parameters": { ... }
    }
  ]
}

ALLOWED OPERATION TYPES:
- "set_track_volume": { "volume_db": float (-60.0 to +12.0) }
- "set_track_pan": { "pan": float (-1.0 to +1.0) }
- "set_track_mute": { "is_muted": boolean }
- "set_track_solo": { "is_soloed": boolean }
- "add_effect": { "effect_type": "eq"|"compressor"|"reverb"|"delay"|"limiter"|"saturation", "preset": string }
- "set_effect_param": { "effect_id": string, "param_name": string, "value": float }
- "split_clip": { "clip_id": string, "split_time": float }
- "delete_clip": { "clip_id": string }
- "set_tempo": { "bpm": float (40.0 to 260.0) }

EXAMPLES:
User: "Make the vocals a bit louder and pan the synth slightly to the left"
Output:
{
  "explanation": "Boosted Vocals volume by +2 dB and panned Synth Pad to -0.3",
  "operations": [
    { "type": "set_track_volume", "track_id": "trk_vox", "parameters": { "volume_db": 0.0 } },
    { "type": "set_track_pan", "track_id": "trk_syn", "parameters": { "pan": -0.3 } }
  ]
}
```

---

## 3. Pydantic Operation Contract & Safety Sandbox

To eliminate AI hallucinations and security hazards:

1. **Schema Validation:** The raw text from the LLM is parsed with Pydantic (`AIOperationPlan`). If parsing fails, the model is re-queried with an error hint or falls back gracefully.
2. **Track Reference Resolution:** Users often refer to tracks colloquially ("the singer", "kick drum", "pads"). The backend resolves names using Levenshtein fuzzy matching against existing track names.
3. **Parameter Clamping:** All numerical values are clamped strictly within safe boundaries (e.g. gain between -60 dB and +12 dB; frequency between 20 Hz and 20,000 Hz).
4. **No Code Execution:** AI plans are pure declarative data payloads. The AI **never** executes system commands or writes Python code.

```python
class AIOperation(BaseModel):
    type: Literal[
        "set_track_volume", "set_track_pan", "set_track_mute", "set_track_solo",
        "add_effect", "set_effect_param", "split_clip", "delete_clip", "set_tempo"
    ]
    track_id: str
    clip_id: str | None = None
    parameters: dict[str, Any]

class AIOperationPlan(BaseModel):
    explanation: str = Field(..., max_length=500)
    operations: list[AIOperation] = Field(..., min_length=1)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
```

---

## 4. Generative Music Pipeline (MusicGen-small)

MaxAudioEditor provides local generative audio capabilities without internet connectivity:

### Capabilities
- **Text-to-Audio Generation:** Synthesizes new musical loops or textures from descriptive prompts (e.g. "Lo-fi hip-hop drum break with vinyl crackle, 85 bpm").
- **Melodic Continuation:** Takes the last 3 to 5 seconds of an existing track clip and generates a seamless 10-second musical extension.
- **Instrument Replacement:** Replaces an isolated stem (e.g. an acoustic bass stem) with a newly synthesized alternative (e.g. 808 sub bass).

### Execution Directives
- Standard output sample rate: 32 kHz -> automatically resampled to project sample rate (44.1 or 48 kHz).
- Enforces user-selected key and tempo conditioning where applicable.
- Generates into a candidate buffer (`data/temp/ai_candidates/`). The user auditions the generated audio via an A/B candidate card on the UI before committing it to the timeline.

---

## 5. Audio-to-MIDI Transcription Engine (Basic Pitch)

Using Spotify's lightweight neural model `basic-pitch`:

1. **Audio Ingestion:** Analyzes monophonic or polyphonic audio buffers (e.g. extracted guitar or bass stem).
2. **Neural Prediction:** Generates multi-pitch activation maps with onset and note frame probabilities.
3. **MIDI Note Extraction:**
   - Filters out ghost notes below configurable confidence threshold (default: 0.5).
   - Generates discrete note events: `[pitch_midi, start_sec, end_sec, velocity]`.
4. **Export:** Generates standard `.mid` file for immediate export or piano-roll visualization.

---

## 6. AI Mix Assistant & Intelligent Advice Engine

In Phase 14, MaxAudioEditor provides automated audio engineering feedback:

1. **Frequency Collision Detection:**
   - Computes 1/3-octave band energy distribution across all active stems.
   - Detects masking collisions (e.g. Kick Drum dominant at 60-80 Hz overlapping with Bass Guitar dominant at 60-80 Hz).
2. **Stereo & Phase Coherence:**
   - Detects low-frequency stereo widening (which destroys mono club playback) and suggests mono-collapsing below 120 Hz.
3. **Actionable Suggestions:**
   - Mix Assistant cards offer immediate "1-Click Fixes" (e.g. "Apply dynamic EQ notch at 70 Hz to Bass track").
