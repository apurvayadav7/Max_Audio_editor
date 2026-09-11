"""Audio Decoding & Format Normalization Engine."""

import hashlib
import os
import subprocess
from pathlib import Path
import numpy as np
import soundfile as sf
from backend.app.logging_config import logger

try:
    import imageio_ffmpeg
    FFMPEG_PATH = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_PATH = "ffmpeg"


class AudioMetadata:
    def __init__(
        self,
        duration: float,
        sample_rate: int,
        channels: int,
        frames: int,
        format_name: str,
        file_size_bytes: int,
        sha256: str,
    ):
        self.duration = duration
        self.sample_rate = sample_rate
        self.channels = channels
        self.frames = frames
        self.format_name = format_name
        self.file_size_bytes = file_size_bytes
        self.sha256 = sha256

    def to_dict(self) -> dict:
        return {
            "duration": self.duration,
            "sample_rate": self.sample_rate,
            "channels": self.channels,
            "frames": self.frames,
            "format_name": self.format_name,
            "file_size_bytes": self.file_size_bytes,
            "sha256": self.sha256,
        }


def compute_sha256(filepath: Path) -> str:
    """Calculate SHA256 checksum of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def probe_audio(filepath: Path) -> AudioMetadata:
    """Probe audio file and extract complete metadata."""
    size = os.path.getsize(filepath)
    checksum = compute_sha256(filepath)

    # 1. Attempt direct soundfile probe (fastest for WAV/FLAC/OGG)
    try:
        info = sf.info(str(filepath))
        return AudioMetadata(
            duration=float(info.duration),
            sample_rate=int(info.samplerate),
            channels=int(info.channels),
            frames=int(info.frames),
            format_name=str(info.format),
            file_size_bytes=size,
            sha256=checksum,
        )
    except Exception as e:
        logger.debug(f"soundfile probe failed ({e}), falling back to FFmpeg for {filepath}")

    # 2. Fallback to FFmpeg probe
    cmd = [
        FFMPEG_PATH,
        "-i", str(filepath),
        "-f", "null",
        "-"
    ]
    process = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    stderr = process.stderr

    # Parse duration and sample rate from ffmpeg stderr
    duration = 0.0
    sample_rate = 44100
    channels = 2

    for line in stderr.splitlines():
        if "Duration:" in line:
            # Duration: 00:03:25.45, start: ...
            parts = line.split("Duration:")[1].split(",")[0].strip().split(":")
            if len(parts) == 3:
                duration = float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
        if "Stream" in line and "Audio:" in line:
            # Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp...
            if "Hz" in line:
                for segment in line.split(","):
                    if "Hz" in segment:
                        try:
                            sample_rate = int(segment.replace("Hz", "").strip())
                        except ValueError:
                            pass
                    if "stereo" in segment:
                        channels = 2
                    elif "mono" in segment:
                        channels = 1

    frames = int(duration * sample_rate)
    return AudioMetadata(
        duration=duration,
        sample_rate=sample_rate,
        channels=channels,
        frames=frames,
        format_name=filepath.suffix.lstrip(".").upper(),
        file_size_bytes=size,
        sha256=checksum,
    )


def decode_audio_to_pcm(input_path: Path, output_wav_path: Path, target_sample_rate: int | None = None) -> AudioMetadata:
    """
    Decode any audio format (MP3, FLAC, M4A, OGG, WAV) into standard 32-bit float PCM WAV.
    Preserves exact timing, dynamic range, and stereo imaging.
    """
    try:
        # Try direct soundfile read if it's already a clean WAV
        data, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
        if target_sample_rate and sr != target_sample_rate:
            # Resample needed, pass through FFmpeg
            raise ValueError("Resample required")
        sf.write(str(output_wav_path), data, sr, subtype="FLOAT")
        return probe_audio(output_wav_path)
    except Exception:
        # Use FFmpeg for universal decoding
        cmd = [
            FFMPEG_PATH,
            "-y",
            "-i", str(input_path),
            "-acodec", "pcm_f32le",
        ]
        if target_sample_rate:
            cmd.extend(["-ar", str(target_sample_rate)])
        cmd.append(str(output_wav_path))

        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg decoding failed: {res.stderr}")

        return probe_audio(output_wav_path)
