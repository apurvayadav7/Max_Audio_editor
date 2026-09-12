"""High-Resolution Spectrogram Engine — Log/Mel Frequency & Decibel Visualization."""

import io
import json
import struct
import zlib
from pathlib import Path
from typing import Optional, Tuple, Dict, Any
import numpy as np
import soundfile as sf
import librosa

from backend.app.logging_config import logger


def _create_png_bytes(rgba_arr: np.ndarray) -> bytes:
    """
    Encode an H x W x 4 uint8 numpy array to PNG bytes in pure Python without PIL or Matplotlib.
    rgba_arr: shape (H, W, 4) of uint8.
    """
    H, W, C = rgba_arr.shape
    assert C == 4, "Array must have 4 channels (RGBA)"
    
    # Construct raw scanlines with filter byte 0 (None) for each row
    raw = bytearray()
    for row in rgba_arr:
        raw.append(0)
        raw.extend(row.tobytes())
        
    def chunk(tag: bytes, data: bytes) -> bytes:
        payload = tag + data
        crc = zlib.crc32(payload) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + payload + struct.pack('>I', crc)
        
    ihdr = struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), level=6)
    
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')


class SpectrogramEngine:
    """Computes Mel/Log-frequency decibel spectrograms with custom color palettes."""
    
    COLORMAPS = {
        "magma": [
            (0.00, (10, 5, 20)),
            (0.20, (60, 15, 80)),
            (0.40, (140, 30, 90)),
            (0.65, (220, 70, 60)),
            (0.85, (250, 180, 50)),
            (1.00, (255, 255, 220)),
        ],
        "viridis": [
            (0.00, (68, 1, 84)),
            (0.25, (59, 82, 139)),
            (0.50, (33, 145, 140)),
            (0.75, (94, 201, 98)),
            (1.00, (253, 231, 37)),
        ],
        "cyberpunk": [
            (0.00, (8, 10, 26)),
            (0.25, (10, 60, 120)),
            (0.50, (0, 240, 255)),
            (0.75, (255, 0, 128)),
            (0.95, (255, 120, 220)),
            (1.00, (255, 255, 255)),
        ],
    }

    @classmethod
    def apply_colormap(cls, norm_matrix: np.ndarray, colormap_name: str = "cyberpunk") -> np.ndarray:
        """
        Map a 2D float array in [0, 1] to an H x W x 4 uint8 RGBA array.
        Matrix rows: high frequency at row 0 (top), low frequency at row H-1 (bottom).
        """
        palette = cls.COLORMAPS.get(colormap_name, cls.COLORMAPS["cyberpunk"])
        H, W = norm_matrix.shape
        flat = np.clip(norm_matrix.flatten(), 0.0, 1.0)
        
        r = np.zeros_like(flat)
        g = np.zeros_like(flat)
        b = np.zeros_like(flat)
        
        # Linear interpolation across palette stops
        for i in range(len(palette) - 1):
            pos0, col0 = palette[i]
            pos1, col1 = palette[i + 1]
            mask = (flat >= pos0) & (flat <= pos1)
            t = (flat - pos0) / max(pos1 - pos0, 1e-6)
            
            r[mask] = col0[0] + t[mask] * (col1[0] - col0[0])
            g[mask] = col0[1] + t[mask] * (col1[1] - col0[1])
            b[mask] = col0[2] + t[mask] * (col1[2] - col0[2])
            
        # Handle edges
        mask_low = flat < palette[0][0]
        r[mask_low] = palette[0][1][0]
        g[mask_low] = palette[0][1][1]
        b[mask_low] = palette[0][1][2]
        
        mask_high = flat > palette[-1][0]
        r[mask_high] = palette[-1][1][0]
        g[mask_high] = palette[-1][1][1]
        b[mask_high] = palette[-1][1][2]
        
        rgba = np.zeros((H * W, 4), dtype=np.uint8)
        rgba[:, 0] = np.clip(r, 0, 255).astype(np.uint8)
        rgba[:, 1] = np.clip(g, 0, 255).astype(np.uint8)
        rgba[:, 2] = np.clip(b, 0, 255).astype(np.uint8)
        rgba[:, 3] = 255  # fully opaque
        
        return rgba.reshape((H, W, 4))

    @classmethod
    def generate_spectrogram_image(
        cls,
        audio_path: Path,
        cache_png_path: Optional[Path] = None,
        colormap: str = "cyberpunk",
        n_mels: int = 128,
        n_fft: int = 2048,
        hop_length: int = 512,
        fmin: float = 20.0,
        fmax: float = 20000.0,
        top_db: float = 80.0,
    ) -> Tuple[bytes, Dict[str, Any]]:
        """
        Compute Mel spectrogram from audio, apply colormap, save/load from cache,
        and return (png_bytes, metadata).
        """
        if cache_png_path and cache_png_path.exists():
            meta_path = cache_png_path.with_suffix(".json")
            if meta_path.exists():
                try:
                    with open(meta_path, "r", encoding="utf-8") as f:
                        metadata = json.load(f)
                    with open(cache_png_path, "rb") as f:
                        png_bytes = f.read()
                    return png_bytes, metadata
                except Exception as e:
                    logger.warning(f"Error reading spectrogram cache, recomputing: {e}")

        # Read audio
        y, sr = sf.read(str(audio_path), dtype="float32", always_2d=True)
        # Convert stereo to mono for spectral analysis
        if y.shape[1] > 1:
            y_mono = np.mean(y, axis=1)
        else:
            y_mono = y[:, 0]
            
        duration = float(len(y_mono)) / sr
        fmax = min(fmax, sr / 2.0)

        # Compute Mel-scaled power spectrogram
        mel_spec = librosa.feature.melspectrogram(
            y=y_mono,
            sr=sr,
            n_fft=n_fft,
            hop_length=hop_length,
            n_mels=n_mels,
            fmin=fmin,
            fmax=fmax,
            power=2.0,
        )

        # Convert to Decibels relative to peak
        db_spec = librosa.power_to_db(mel_spec, ref=np.max, top_db=top_db)
        # db_spec is in [-top_db, 0] dB
        norm_spec = (db_spec + top_db) / top_db
        # Invert rows so high frequencies are at top (row 0)
        norm_spec = np.flipud(norm_spec)

        # Apply colormap to get RGBA uint8 matrix
        rgba = cls.apply_colormap(norm_spec, colormap_name=colormap)
        H, W, _ = rgba.shape

        # Encode to PNG
        png_bytes = _create_png_bytes(rgba)

        metadata = {
            "sample_rate": sr,
            "duration": duration,
            "n_mels": n_mels,
            "hop_length": hop_length,
            "width": W,
            "height": H,
            "colormap": colormap,
            "fmin": fmin,
            "fmax": fmax,
            "top_db": top_db,
        }

        # Cache if requested
        if cache_png_path:
            cache_png_path.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_png_path, "wb") as f:
                f.write(png_bytes)
            meta_path = cache_png_path.with_suffix(".json")
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2)
            logger.info(f"Cached spectrogram PNG ({W}x{H}) to {cache_png_path.name}")

        return png_bytes, metadata
