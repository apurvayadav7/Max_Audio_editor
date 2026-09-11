"""Audio Effect Insert Schemas."""

from typing import Any, Literal
from pydantic import BaseModel, Field
import uuid


class Effect(BaseModel):
    id: str = Field(default_factory=lambda: f"fx_{uuid.uuid4().hex[:8]}")
    type: Literal[
        "eq",
        "parametric_eq",
        "compressor",
        "limiter",
        "reverb",
        "delay",
        "filter",
        "gate",
        "saturation",
        "distortion",
        "chorus",
        "width",
        "spatial"
    ]
    name: str = ""
    is_bypassed: bool = False
    order: int = 0
    parameters: dict[str, Any] = Field(default_factory=dict)
