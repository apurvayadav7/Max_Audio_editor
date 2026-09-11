"""System and Diagnostics Pydantic Schemas."""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    app_name: str = "MaxAudioEditor"
    version: str = "0.1.0"


class SystemInfoResponse(BaseModel):
    os: str
    python_version: str
    cpu_cores_logical: int
    cpu_cores_physical: int
    memory_total_gb: float
    memory_available_gb: float
    disk_total_gb: float
    disk_free_gb: float


class GPUInfoResponse(BaseModel):
    cuda_available: bool
    device_count: int = 0
    device_name: str = "None"
    vram_total_mb: int = 0
    vram_free_mb: int = 0
    cuda_version: str = "None"
    recommended_tier: str = "cpu"
    notice: str = ""
