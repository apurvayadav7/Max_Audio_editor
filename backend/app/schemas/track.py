"""Audio Track Domain Schemas."""

from typing import Literal
from pydantic import BaseModel, Field
import uuid
from backend.app.schemas.clip import Clip
from backend.app.schemas.effect import Effect
from backend.app.schemas.automation import AutomationLane


class TrackSend(BaseModel):
    target_bus_id: str
    gain_db: float = Field(default=-60.0, ge=-60.0, le=12.0)
    is_pre_fader: bool = False


class Track(BaseModel):
    id: str = Field(default_factory=lambda: f"trk_{uuid.uuid4().hex[:8]}")
    name: str = "Audio Track"
    type: Literal["audio", "stem", "bus", "master"] = "audio"
    stem_type: Literal["vocals", "drums", "bass", "other", "guitar", "piano", "none"] = "none"
    color: str = "#00f0ff"
    volume: float = Field(default=0.0, ge=-60.0, le=12.0, description="Volume in dB")
    pan: float = Field(default=0.0, ge=-1.0, le=1.0, description="Pan (-1.0 Left to +1.0 Right)")
    is_muted: bool = False
    is_soloed: bool = False
    order: int = 0
    clips: list[Clip] = Field(default_factory=list)
    effects: list[Effect] = Field(default_factory=list)
    automation_lanes: list[AutomationLane] = Field(default_factory=list)
    sends: list[TrackSend] = Field(default_factory=list)
