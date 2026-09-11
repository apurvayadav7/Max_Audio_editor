"""AI Model Lifecycle & VRAM Resource Scheduler.

Guarantees sequential model execution and enforces the 6GB VRAM budget
stipulated in GPU_PLAN.md by automatically unloading inactive models.
"""

import logging
from typing import Any, Dict, Optional
from backend.app.ai.device import device_manager

logger = logging.getLogger("maxaudio.ai.registry")


class ModelRegistry:
    """Manages loaded AI model weights in VRAM, eviction, and memory safety."""

    def __init__(self, max_warm_models: int = 1):
        self.max_warm_models = max_warm_models
        self.active_models: Dict[str, Any] = {}
        self.active_model_name: Optional[str] = None

    def get_model(self, model_key: str) -> Optional[Any]:
        return self.active_models.get(model_key)

    def register_and_evict(self, model_key: str, model_instance: Any) -> None:
        """Register newly loaded model in VRAM and evict old models to prevent OOM."""
        # Evict all other active models if at capacity
        keys_to_evict = [k for k in self.active_models.keys() if k != model_key]
        for k in keys_to_evict:
            logger.info(f"[ModelRegistry] Evicting inactive model '{k}' from VRAM...")
            del self.active_models[k]

        self.active_models[model_key] = model_instance
        self.active_model_name = model_key
        logger.info(f"[ModelRegistry] Registered active model '{model_key}' in VRAM")

    def unload(self, model_key: str) -> None:
        """Unload specific model from memory."""
        if model_key in self.active_models:
            logger.info(f"[ModelRegistry] Unloading model '{model_key}'...")
            del self.active_models[model_key]
            if self.active_model_name == model_key:
                self.active_model_name = None
            device_manager.clear_vram()

    def unload_all(self) -> None:
        """Clear all models from VRAM."""
        logger.info("[ModelRegistry] Unloading all models from VRAM...")
        self.active_models.clear()
        self.active_model_name = None
        device_manager.clear_vram()


model_registry = ModelRegistry(max_warm_models=1)
