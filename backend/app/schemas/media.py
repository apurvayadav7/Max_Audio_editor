"""Media Asset Domain & API Schemas."""

from pydantic import BaseModel, Field
import uuid


class MediaAsset(BaseModel):
    id: str = Field(default_factory=lambda: f"med_{uuid.uuid4().hex[:10]}")
    project_id: str
    name: str
    original_filename: str
    format: str
    duration: float = Field(ge=0.0)
    sample_rate: int = Field(ge=8000)
    channels: int = Field(ge=1, le=8)
    frames: int = Field(ge=0)
    file_size_bytes: int = Field(ge=0)
    sha256: str
    filepath: str
    waveform_cached: bool = True


class MediaUploadResponse(BaseModel):
    asset: MediaAsset
    waveform_url: str
    stream_url: str
    created_track_id: str | None = None
    created_clip_id: str | None = None
