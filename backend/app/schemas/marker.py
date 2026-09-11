"""Timeline Marker & Section Cue Schemas."""

from typing import Literal
from pydantic import BaseModel, Field
import uuid


class Marker(BaseModel):
    id: str = Field(default_factory=lambda: f"mrk_{uuid.uuid4().hex[:8]}")
    name: str
    time: float = Field(ge=0.0, description="Position on timeline in seconds")
    type: Literal["cue", "section", "loop_start", "loop_end"] = "cue"
    color: str = "#ffb800"


class Section(BaseModel):
    id: str = Field(default_factory=lambda: f"sec_{uuid.uuid4().hex[:8]}")
    name: str = Field(description="Intro, Verse, Chorus, Bridge, Outro, etc.")
    start_time: float = Field(ge=0.0)
    end_time: float = Field(gt=0.0)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    color: str = "#00f0ff"
