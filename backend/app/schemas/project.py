"""Project Domain & Request/Response Schemas."""

from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, Field
import uuid
from backend.app.schemas.track import Track
from backend.app.schemas.marker import Marker, Section


class TimeSignature(BaseModel):
    numerator: int = Field(default=4, ge=1, le=32)
    denominator: int = Field(default=4, ge=1, le=32)


class Project(BaseModel):
    id: str = Field(default_factory=lambda: f"prj_{uuid.uuid4().hex[:12]}")
    name: str = "Untitled Project"
    sample_rate: Literal[44100, 48000, 96000] = 44100
    tempo: float = Field(default=120.0, ge=30.0, le=300.0)
    time_signature: TimeSignature = Field(default_factory=TimeSignature)
    musical_key: str = "C Major"
    duration: float = Field(default=0.0, ge=0.0)
    
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    version: int = 1
    
    tracks: list[Track] = Field(default_factory=list)
    markers: list[Marker] = Field(default_factory=list)
    sections: list[Section] = Field(default_factory=list)


# API Request/Response Models
class CreateProjectRequest(BaseModel):
    name: str = Field(default="New Song", min_length=1, max_length=100)
    sample_rate: Literal[44100, 48000, 96000] = 44100
    tempo: float = Field(default=120.0, ge=30.0, le=300.0)


class ProjectSummary(BaseModel):
    id: str
    name: str
    sample_rate: int
    tempo: float
    musical_key: str
    track_count: int
    duration: float
    updated_at: str
