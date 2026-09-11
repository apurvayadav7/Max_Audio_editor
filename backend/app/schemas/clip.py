"""Audio Clip Domain Schemas."""

from pydantic import BaseModel, Field
import uuid


class Clip(BaseModel):
    id: str = Field(default_factory=lambda: f"clp_{uuid.uuid4().hex[:8]}")
    name: str = "Audio Clip"
    source_id: str = Field(description="Referenced Media asset ID")
    track_id: str = Field(description="Parent Track ID")
    start_time: float = Field(default=0.0, ge=0.0, description="Start time on timeline (seconds)")
    duration: float = Field(default=1.0, gt=0.0, description="Active playback duration on timeline (seconds)")
    source_offset: float = Field(default=0.0, ge=0.0, description="Offset into raw media file (seconds)")
    gain: float = Field(default=0.0, description="Clip gain in decibels (-60.0 to +12.0)")
    fade_in: float = Field(default=0.0, ge=0.0, description="Fade-in duration (seconds)")
    fade_out: float = Field(default=0.0, ge=0.0, description="Fade-out duration (seconds)")
    stretch_ratio: float = Field(default=1.0, gt=0.1, le=10.0, description="Time stretch factor (1.0 = normal)")
    pitch_semitones: float = Field(default=0.0, ge=-24.0, le=24.0, description="Pitch shift in semitones")
    is_muted: bool = False
    is_reversed: bool = False
