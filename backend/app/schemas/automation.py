"""Automation Lane & Point Schemas."""

from typing import Literal
from pydantic import BaseModel, Field
import uuid


class AutomationPoint(BaseModel):
    time: float = Field(ge=0.0, description="Timeline position in seconds")
    value: float = Field(description="Parameter target value")
    curve: Literal["linear", "exponential", "s_curve", "step"] = "linear"


class AutomationLane(BaseModel):
    id: str = Field(default_factory=lambda: f"auto_{uuid.uuid4().hex[:8]}")
    target_type: Literal["track", "effect", "master"] = "track"
    target_id: str
    parameter_id: str  # e.g., "volume", "pan", "filter_cutoff"
    points: list[AutomationPoint] = Field(default_factory=list)
    is_enabled: bool = True
