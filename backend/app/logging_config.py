"""Structured Logging Configuration for MaxAudioEditor."""

import logging
import sys
from pathlib import Path
from backend.app.config import settings


def setup_logging():
    """Configure console and file loggers."""
    log_format = "%(asctime)s [%(levelname)s] [%(name)s]: %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    handlers: list[logging.Handler] = [
        logging.StreamHandler(sys.stdout),
    ]

    try:
        log_file = settings.LOGS_DIR / "app.log"
        handlers.append(logging.FileHandler(log_file, encoding="utf-8"))
    except Exception as e:
        print(f"Warning: Could not create file log handler: {e}")

    logging.basicConfig(
        level=logging.DEBUG if settings.DEBUG else logging.INFO,
        format=log_format,
        datefmt=date_format,
        handlers=handlers,
    )

    # Suppress excessive uvicorn access noise if needed
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


setup_logging()
logger = logging.getLogger("maxaudio")
