"""Application Configuration for MaxAudioEditor."""

import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Base application paths
    APP_NAME: str = "MaxAudioEditor"
    VERSION: str = "0.1.0"
    DEBUG: bool = True
    
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    FRONTEND_DIR: Path = BASE_DIR / "frontend"
    DATA_DIR: Path = BASE_DIR / "data"
    
    # Sub-data directories
    PROJECTS_DIR: Path = DATA_DIR / "projects"
    MODELS_DIR: Path = DATA_DIR / "models"
    CACHE_DIR: Path = DATA_DIR / "cache"
    TEMP_DIR: Path = DATA_DIR / "temp"
    LOGS_DIR: Path = DATA_DIR / "logs"
    DB_PATH: Path = DATA_DIR / "maxaudio.db"

    # Server settings
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    CORS_ORIGINS: list[str] = ["http://localhost:8000", "http://127.0.0.1:8000"]

    # Audio limits
    DEFAULT_SAMPLE_RATE: int = 44100
    SUPPORTED_SAMPLE_RATES: list[int] = [44100, 48000, 96000]
    MAX_UPLOAD_SIZE_BYTES: int = 2 * 1024 * 1024 * 1024  # 2 GB
    
    # GPU / Compute
    VRAM_LIMIT_MB: int = 4500  # Safe cap for 6GB RTX 4050 baseline
    DEFAULT_DEVICE: str = "cuda"

    model_config = SettingsConfigDict(
        env_prefix="MAXAUDIO_",
        extra="allow"
    )

    def ensure_directories(self):
        """Ensure all required filesystem directories exist."""
        for path in [
            self.DATA_DIR,
            self.PROJECTS_DIR,
            self.MODELS_DIR,
            self.CACHE_DIR,
            self.CACHE_DIR / "waveforms",
            self.CACHE_DIR / "spectrograms",
            self.TEMP_DIR,
            self.LOGS_DIR,
        ]:
            path.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_directories()
