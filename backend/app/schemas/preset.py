"""Audio Effect & Channel Strip Preset Schemas."""

from typing import Any
from pydantic import BaseModel, Field
import uuid
from backend.app.schemas.effect import Effect


class EffectPreset(BaseModel):
    id: str = Field(default_factory=lambda: f"pst_{uuid.uuid4().hex[:8]}")
    name: str
    effect_type: str
    category: str = "General"
    is_factory: bool = False
    parameters: dict[str, Any] = Field(default_factory=dict)


class ChannelStripPreset(BaseModel):
    id: str = Field(default_factory=lambda: f"strip_{uuid.uuid4().hex[:8]}")
    name: str
    description: str = ""
    is_factory: bool = False
    effects: list[Effect] = Field(default_factory=list)
