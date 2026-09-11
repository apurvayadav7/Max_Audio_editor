"""Hardware and GPU Device Profiler for MaxAudioEditor.

Manages CUDA discovery, VRAM budgeting, FP16 half-precision execution,
and memory garbage collection.
"""

import gc
import logging
from typing import Dict, Any, Optional
from pydantic import BaseModel

logger = logging.getLogger("maxaudio.ai.device")


class GPUProfile(BaseModel):
    available: bool = False
    device_name: str = "CPU Fallback"
    device_index: int = -1
    vram_total_mb: int = 0
    vram_free_mb: int = 0
    vram_allocated_mb: int = 0
    compute_capability: str = "N/A"
    fp16_supported: bool = False
    bf16_supported: bool = False
    tensor_cores: bool = False


class DeviceManager:
    """Singleton managing compute device selection and memory pools."""

    def __init__(self):
        self._device: Optional[str] = None
        self._torch_available: Optional[bool] = None

    def is_torch_available(self) -> bool:
        if self._torch_available is None:
            try:
                import torch
                self._torch_available = True
            except ImportError:
                self._torch_available = False
        return self._torch_available

    def get_device(self) -> str:
        """Return optimal compute device string ('cuda:0' or 'cpu')."""
        if self._device is not None:
            return self._device

        if not self.is_torch_available():
            self._device = "cpu"
            return self._device

        import torch
        if torch.cuda.is_available():
            try:
                # Probe device responsiveness
                _ = torch.zeros(1, device="cuda:0")
                self._device = "cuda:0"
                logger.info(f"[DeviceManager] CUDA initialized on {torch.cuda.get_device_name(0)}")
            except Exception as e:
                logger.warning(f"[DeviceManager] CUDA failed probe: {e}. Falling back to CPU.")
                self._device = "cpu"
        else:
            self._device = "cpu"

        return self._device

    def get_gpu_profile(self) -> GPUProfile:
        """Interrogate current GPU hardware, memory headroom, and compute capabilities."""
        if not self.is_torch_available():
            return GPUProfile(available=False, device_name="PyTorch Not Installed")

        import torch
        if not torch.cuda.is_available():
            return GPUProfile(available=False, device_name="CPU Fallback")

        try:
            device_idx = 0
            free_bytes, total_bytes = torch.cuda.mem_get_info(device_idx)
            allocated_bytes = torch.cuda.memory_allocated(device_idx)
            major, minor = torch.cuda.get_device_capability(device_idx)
            dev_name = torch.cuda.get_device_name(device_idx)

            # Ada Lovelace / Ampere / Turing architectures have Tensor Cores
            has_tensor_cores = major >= 7
            bf16_ok = major >= 8

            return GPUProfile(
                available=True,
                device_name=dev_name,
                device_index=device_idx,
                vram_total_mb=int(total_bytes / (1024 * 1024)),
                vram_free_mb=int(free_bytes / (1024 * 1024)),
                vram_allocated_mb=int(allocated_bytes / (1024 * 1024)),
                compute_capability=f"{major}.{minor}",
                fp16_supported=True,
                bf16_supported=bf16_ok,
                tensor_cores=has_tensor_cores,
            )
        except Exception as e:
            logger.error(f"[DeviceManager] Error querying GPU profile: {e}")
            return GPUProfile(available=False, device_name=f"Error querying CUDA: {e}")

    def clear_vram(self) -> None:
        """Aggressively release all unused GPU memory and run Python GC."""
        gc.collect()
        if self.is_torch_available():
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()
                logger.debug("[DeviceManager] VRAM cleared and cache emptied")

    def get_optimal_dtype(self):
        """Select optimal precision for models (FP16 for 6GB RTX 4050 baseline)."""
        if not self.is_torch_available():
            return "float32"

        import torch
        if torch.cuda.is_available():
            return torch.float16
        return torch.float32


device_manager = DeviceManager()
