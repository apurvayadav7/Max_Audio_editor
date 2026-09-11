"""Sample-Accurate Multi-Track Timeline Offline Render Engine."""

import os
from pathlib import Path
from typing import Tuple, Optional
import numpy as np
import soundfile as sf
from scipy import signal

from backend.app.schemas.project import Project
from backend.app.schemas.track import Track
from backend.app.schemas.clip import Clip
from backend.app.logging_config import logger


def resample_audio(audio: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    """Resample multi-channel audio to target sample rate."""
    if orig_sr == target_sr:
        return audio
    # audio shape: (frames, channels)
    gcd = np.gcd(orig_sr, target_sr)
    up = target_sr // gcd
    down = orig_sr // gcd
    return signal.resample_poly(audio, up, down, axis=0).astype(np.float32)


def apply_equal_power_pan(audio_stereo: np.ndarray, pan: float) -> np.ndarray:
    """Apply constant-power panning (-3dB center) to a stereo buffer.
    
    pan: -1.0 (Hard Left) to +1.0 (Hard Right), 0.0 (Center)
    """
    pan = float(np.clip(pan, -1.0, 1.0))
    angle = (pan + 1.0) * (np.pi / 4.0)
    gain_l = float(np.cos(angle))
    gain_r = float(np.sin(angle))
    
    out = np.empty_like(audio_stereo)
    out[0] = audio_stereo[0] * gain_l
    out[1] = audio_stereo[1] * gain_r
    return out


def render_project_timeline(
    project: Project,
    bundle_dir: Path,
    target_sample_rate: int = 44100,
    render_tracks: Optional[list[str]] = None,
    time_range: Optional[Tuple[float, float]] = None,
) -> Tuple[np.ndarray, int]:
    """Render project timeline into a 32-bit float stereo PCM buffer (channels, frames).
    
    Args:
        project: Project schema model.
        bundle_dir: Path to .maxaudio project bundle.
        target_sample_rate: 44100, 48000, etc.
        render_tracks: List of track IDs to include, or None for all active tracks.
        time_range: Optional (start_time_sec, end_time_sec) bounce bounds.
        
    Returns:
        (buffer, sample_rate) where buffer is np.ndarray of shape (2, num_frames).
    """
    # 1. Determine timeline duration bounds
    max_time = 0.0
    for track in project.tracks:
        for clip in track.clips:
            clip_end = clip.start_time + clip.duration
            if clip_end > max_time:
                max_time = clip_end
                
    if time_range:
        start_sec, end_sec = time_range
        start_sec = max(0.0, start_sec)
        end_sec = max(start_sec + 0.1, end_sec)
    else:
        start_sec = 0.0
        end_sec = max(max_time, 1.0)
        
    total_sec = end_sec - start_sec
    total_frames = int(np.ceil(total_sec * target_sample_rate))
    
    master_buffer = np.zeros((2, total_frames), dtype=np.float32)
    
    # 2. Check track mute / solo states
    has_solo = any(t.is_soloed for t in project.tracks)
    active_tracks: list[Track] = []
    
    for t in project.tracks:
        if render_tracks is not None and t.id not in render_tracks:
            continue
        if has_solo:
            if t.is_soloed:
                active_tracks.append(t)
        else:
            if not t.is_muted:
                active_tracks.append(t)
                
    logger.info(f"Rendering {len(active_tracks)} tracks from {start_sec:.2f}s to {end_sec:.2f}s ({total_frames} frames)")
    
    # 3. Render each track
    for track in active_tracks:
        track_gain = float(10.0 ** (track.volume / 20.0))
        track_buffer = np.zeros((2, total_frames), dtype=np.float32)
        
        for clip in track.clips:
            clip_start = clip.start_time
            clip_end = clip_start + clip.duration
            
            # Check overlap with render range
            if clip_end <= start_sec or clip_start >= end_sec:
                continue
                
            # Locate media file on disk
            media_id = getattr(clip, "source_id", getattr(clip, "media_id", ""))
            media_path = None
            for search_dir in [bundle_dir / "media", bundle_dir / "stems", bundle_dir / "cache" / "time_pitch"]:
                if not search_dir.exists():
                    continue
                for f in search_dir.iterdir():
                    if f.is_file() and (media_id in f.name or f.stem == media_id):
                        media_path = f
                        break
                if media_path:
                    break
                    
            if not media_path or not media_path.exists():
                logger.warning(f"Media file for clip '{clip.id}' ({clip.name}) not found, rendering silence.")
                continue
                
            try:
                raw_audio, sr = sf.read(str(media_path), dtype="float32", always_2d=True)
            except Exception as e:
                logger.error(f"Failed to read audio from {media_path}: {e}")
                continue
                
            # Resample if sample rate mismatch
            if sr != target_sample_rate:
                raw_audio = resample_audio(raw_audio, sr, target_sample_rate)
                
            # Convert to stereo (frames, 2)
            if raw_audio.shape[1] == 1:
                raw_audio = np.repeat(raw_audio, 2, axis=1)
            elif raw_audio.shape[1] > 2:
                raw_audio = raw_audio[:, :2]
                
            # Clip offset & duration slicing
            offset_sec = getattr(clip, "source_offset", getattr(clip, "media_offset", 0.0))
            offset_frame = int(round(offset_sec * target_sample_rate))
            dur_frames = int(round(clip.duration * target_sample_rate))
            
            if offset_frame >= len(raw_audio):
                continue
                
            slice_end = min(len(raw_audio), offset_frame + dur_frames)
            clip_audio = raw_audio[offset_frame:slice_end].copy()
            
            # If source audio was shorter than clip duration, pad with zeros
            if len(clip_audio) < dur_frames:
                pad_width = ((0, dur_frames - len(clip_audio)), (0, 0))
                clip_audio = np.pad(clip_audio, pad_width, mode="constant")
                
            # Apply clip gain
            gain_db = getattr(clip, "gain", getattr(clip, "gain_db", 0.0))
            clip_gain = float(10.0 ** (gain_db / 20.0))
            clip_audio *= clip_gain
            
            # Apply fade in
            if clip.fade_in > 0:
                fade_in_len = min(len(clip_audio), int(round(clip.fade_in * target_sample_rate)))
                if fade_in_len > 0:
                    ramp = np.linspace(0.0, 1.0, fade_in_len, dtype=np.float32)[:, np.newaxis]
                    clip_audio[:fade_in_len] *= ramp
                    
            # Apply fade out
            if clip.fade_out > 0:
                fade_out_len = min(len(clip_audio), int(round(clip.fade_out * target_sample_rate)))
                if fade_out_len > 0:
                    ramp = np.linspace(1.0, 0.0, fade_out_len, dtype=np.float32)[:, np.newaxis]
                    clip_audio[-fade_out_len:] *= ramp
                    
            # Map clip onto track timeline buffer
            dest_start_sec = clip_start - start_sec
            dest_start_frame = int(round(dest_start_sec * target_sample_rate))
            dest_end_frame = dest_start_frame + len(clip_audio)
            
            # Boundary clipping
            src_start = 0
            src_end = len(clip_audio)
            if dest_start_frame < 0:
                src_start = -dest_start_frame
                dest_start_frame = 0
            if dest_end_frame > total_frames:
                src_end -= (dest_end_frame - total_frames)
                dest_end_frame = total_frames
                
            if dest_start_frame < dest_end_frame and src_start < src_end:
                # Transpose clip_audio to (2, frames) to add to track_buffer
                track_buffer[:, dest_start_frame:dest_end_frame] += clip_audio[src_start:src_end].T
                
        # Apply track volume & pan
        track_buffer *= track_gain
        panned_track = apply_equal_power_pan(track_buffer, track.pan)
        master_buffer += panned_track
        
    return master_buffer, target_sample_rate
