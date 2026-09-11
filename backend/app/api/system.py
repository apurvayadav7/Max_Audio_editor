"""System and Hardware Diagnostics API Routes."""

import os
import platform
import shutil
import sys
from fastapi import APIRouter
from backend.app.schemas.system import HealthResponse, SystemInfoResponse, GPUInfoResponse
from backend.app.config import settings

router = APIRouter(prefix="/api", tags=["System"])


@router.get("/health", response_model=HealthResponse)
async def get_health():
    """Health check endpoint."""
    return HealthResponse(
        status="ok",
        app_name=settings.APP_NAME,
        version=settings.VERSION,
    )


@router.get("/system/info", response_model=SystemInfoResponse)
async def get_system_info():
    """Get host system, CPU, memory, and disk diagnostics."""
    # Disk stats for the data partition
    total, used, free = shutil.disk_usage(settings.DATA_DIR)

    # Memory stats (standard library approximation)
    mem_total_gb = 16.0
    mem_avail_gb = 8.0
    try:
        import ctypes
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]
        stat = MEMORYSTATUSEX()
        stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
        mem_total_gb = round(stat.ullTotalPhys / (1024 ** 3), 2)
        mem_avail_gb = round(stat.ullAvailPhys / (1024 ** 3), 2)
    except Exception:
        pass

    logical_cores = os.cpu_count() or 4
    physical_cores = max(1, logical_cores // 2)

    return SystemInfoResponse(
        os=f"{platform.system()} {platform.release()} ({platform.version()})",
        python_version=sys.version.split()[0],
        cpu_cores_logical=logical_cores,
        cpu_cores_physical=physical_cores,
        memory_total_gb=mem_total_gb,
        memory_available_gb=mem_avail_gb,
        disk_total_gb=round(total / (1024 ** 3), 2),
        disk_free_gb=round(free / (1024 ** 3), 2),
    )


@router.get("/system/gpu", response_model=GPUInfoResponse)
async def get_gpu_info():
    """Get GPU and CUDA diagnostics."""
    try:
        import torch
        if torch.cuda.is_available():
            dev = torch.cuda.current_device()
            props = torch.cuda.get_device_properties(dev)
            free_b, total_b = torch.cuda.mem_get_info(dev)
            total_mb = total_b // (1024 * 1024)
            free_mb = free_b // (1024 * 1024)
            tier = "baseline" if total_mb <= 6144 else "pro"

            return GPUInfoResponse(
                cuda_available=True,
                device_count=torch.cuda.device_count(),
                device_name=props.name,
                vram_total_mb=total_mb,
                vram_free_mb=free_mb,
                cuda_version=str(torch.version.cuda),
                recommended_tier=tier,
                notice=f"Hardware acceleration active. Tier: {tier.upper()}",
            )
    except ImportError:
        pass
    except Exception as e:
        return GPUInfoResponse(
            cuda_available=False,
            notice=f"GPU interrogation error: {e}. Falling back to CPU.",
        )

    # Fallback to nvidia-smi if torch not yet installed in venv
    try:
        import subprocess
        output = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"],
            encoding="utf-8",
            timeout=3,
        ).strip().split("\n")[0]
        parts = [p.strip() for p in output.split(",")]
        if len(parts) >= 3:
            name = parts[0]
            total_mb = int(parts[1])
            free_mb = int(parts[2])
            tier = "baseline" if total_mb <= 6144 else "pro"
            return GPUInfoResponse(
                cuda_available=True,
                device_count=1,
                device_name=name,
                vram_total_mb=total_mb,
                vram_free_mb=free_mb,
                cuda_version="Detected via Driver",
                recommended_tier=tier,
                notice=f"NVIDIA GPU detected. PyTorch CUDA pending installation for Phase 6.",
            )
    except Exception:
        pass

    return GPUInfoResponse(
        cuda_available=False,
        device_count=0,
        device_name="CPU Execution Mode",
        vram_total_mb=0,
        vram_free_mb=0,
        cuda_version="None",
        recommended_tier="cpu",
        notice="No CUDA-capable GPU detected. Running in CPU fallback mode.",
    )
