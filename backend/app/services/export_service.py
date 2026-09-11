"""Multi-Format Audio Export & Stem Bounce Service."""

import os
import subprocess
import uuid
from pathlib import Path
from typing import Literal, Optional
import numpy as np
import soundfile as sf

from backend.app.schemas.project import Project
from backend.app.storage.project_format import ProjectFormat
from backend.app.audio.render_graph import render_project_timeline
from backend.app.audio.decode import FFMPEG_PATH
from backend.app.logging_config import logger


class ExportService:
    @staticmethod
    def encode_buffer(
        audio_buffer: np.ndarray,  # shape (2, frames)
        sample_rate: int,
        output_path: Path,
        format_type: Literal["wav", "flac", "mp3"] = "wav",
        bit_depth: Literal[16, 24, 32] = 24,
    ) -> Path:
        """Encode float32 audio buffer to specified format and bit depth."""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        # Transpose to (frames, channels) for soundfile/ffmpeg
        audio_frames = audio_buffer.T
        
        if format_type == "wav":
            subtypes = {16: "PCM_16", 24: "PCM_24", 32: "FLOAT"}
            subtype = subtypes.get(bit_depth, "PCM_24")
            sf.write(str(output_path), audio_frames, sample_rate, subtype=subtype, format="WAV")
            
        elif format_type == "flac":
            subtypes = {16: "PCM_16", 24: "PCM_24", 32: "PCM_24"}
            subtype = subtypes.get(bit_depth, "PCM_24")
            sf.write(str(output_path), audio_frames, sample_rate, subtype=subtype, format="FLAC")
            
        elif format_type == "mp3":
            # Write temp wav and transcode via ffmpeg to high-quality 320k MP3
            temp_wav = output_path.with_suffix(".temp.wav")
            try:
                sf.write(str(temp_wav), audio_frames, sample_rate, subtype="PCM_24", format="WAV")
                cmd = [
                    FFMPEG_PATH,
                    "-y",
                    "-i", str(temp_wav),
                    "-b:a", "320k",
                    "-ar", str(sample_rate),
                    str(output_path),
                ]
                subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            finally:
                if temp_wav.exists():
                    try:
                        temp_wav.unlink()
                    except Exception:
                        pass
                        
        logger.info(f"Audio exported successfully to {output_path} ({format_type.upper()} {bit_depth}-bit)")
        return output_path

    @classmethod
    def export_project(
        cls,
        project: Project,
        format_type: Literal["wav", "flac", "mp3"] = "wav",
        sample_rate: int = 44100,
        bit_depth: Literal[16, 24, 32] = 24,
        export_mode: Literal["master", "stems"] = "master",
        time_range: Optional[tuple[float, float]] = None,
    ) -> dict:
        """Execute project export and return output artifacts."""
        bundle_dir = ProjectFormat.get_bundle_path(project.id)
        renders_dir = bundle_dir / "renders"
        renders_dir.mkdir(parents=True, exist_ok=True)
        
        export_id = f"exp_{uuid.uuid4().hex[:8]}"
        clean_name = "".join(c for c in project.name if c.isalnum() or c in (" ", "_", "-")).strip()
        if not clean_name:
            clean_name = "Export"
            
        results = {
            "export_id": export_id,
            "project_id": project.id,
            "mode": export_mode,
            "format": format_type,
            "sample_rate": sample_rate,
            "bit_depth": bit_depth,
            "files": [],
        }
        
        if export_mode == "master":
            filename = f"{clean_name}_{export_id}.{format_type}"
            out_file = renders_dir / filename
            
            # Render master timeline
            audio_buf, sr = render_project_timeline(
                project=project,
                bundle_dir=bundle_dir,
                target_sample_rate=sample_rate,
                render_tracks=None,
                time_range=time_range,
            )
            
            cls.encode_buffer(audio_buf, sr, out_file, format_type, bit_depth)
            
            duration_sec = audio_buf.shape[1] / float(sr)
            file_size = os.path.getsize(out_file)
            
            results["files"].append({
                "name": "Master Mix",
                "filename": filename,
                "file_path": str(out_file),
                "download_url": f"/api/projects/{project.id}/export/{export_id}/download?filename={filename}",
                "duration": duration_sec,
                "file_size": file_size,
            })
            
        elif export_mode == "stems":
            # Bounce each track individually with identical timeline origin
            for track in project.tracks:
                if not track.clips:
                    continue
                    
                track_clean = "".join(c for c in track.name if c.isalnum() or c in ("_", "-")).strip() or track.id
                filename = f"{clean_name}_{track_clean}_{export_id}.{format_type}"
                out_file = renders_dir / filename
                
                track_buf, sr = render_project_timeline(
                    project=project,
                    bundle_dir=bundle_dir,
                    target_sample_rate=sample_rate,
                    render_tracks=[track.id],
                    time_range=time_range,
                )
                
                cls.encode_buffer(track_buf, sr, out_file, format_type, bit_depth)
                
                duration_sec = track_buf.shape[1] / float(sr)
                file_size = os.path.getsize(out_file)
                
                results["files"].append({
                    "name": track.name,
                    "track_id": track.id,
                    "filename": filename,
                    "file_path": str(out_file),
                    "download_url": f"/api/projects/{project.id}/export/{export_id}/download?filename={filename}",
                    "duration": duration_sec,
                    "file_size": file_size,
                })
                
        return results
