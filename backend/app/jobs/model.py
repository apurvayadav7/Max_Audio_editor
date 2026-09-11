"""Job domain models and state machine."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
import uuid


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobType(str, Enum):
    ANALYSIS = "analysis"
    STEM_SEPARATION = "stem_separation"
    EXPORT = "export"
    AI_TRANSCRIPTION = "ai_transcription"
    AI_ASSISTANT = "ai_assistant"


class Job(BaseModel):
    id: str = Field(default_factory=lambda: f"job_{uuid.uuid4().hex[:10]}")
    type: JobType
    title: str = "Background Job"
    status: JobStatus = JobStatus.QUEUED
    project_id: Optional[str] = None
    progress: float = Field(default=0.0, ge=0.0, le=100.0)
    stage: str = "Queued"
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    requires_gpu: bool = False
    priority: int = 10  # Lower number = higher priority
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
