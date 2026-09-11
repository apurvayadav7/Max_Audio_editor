"""Stem Separation Background Worker Pipeline.

Orchestrates audio separation, peak pyramid pre-generation, track creation,
and project bundle synchronization.
"""

import asyncio
import hashlib
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import soundfile as sf

from backend.app.ai.stem_models import DemucsAdapter
from backend.app.audio.waveform import WaveformPyramid
from backend.app.jobs.manager import job_manager
from backend.app.schemas.clip import Clip
from backend.app.schemas.media import MediaAsset
from backend.app.schemas.track import Track
from backend.app.storage.project_format import ProjectFormat

logger = logging.getLogger("maxaudio.workers.stems")

STEM_COLORS = {
    "vocals": "#a855f7",  # Purple
    "drums": "#ffb800",   # Amber
    "bass": "#00e676",    # Emerald Green
    "other": "#00f0ff",   # Electric Cyan
}


class StemSeparationWorker:
    """Coordinates Demucs stem separation and DAW timeline track ingestion."""

    async def run(
        self,
        project_id: str,
        media_id: Optional[str] = None,
        model_name: str = "htdemucs",
        job_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        project = ProjectFormat.load(project_id)
        if not project:
            raise ValueError(f"Project '{project_id}' not found")

        bundle_dir = ProjectFormat.get_bundle_path(project_id)
        media_dir = bundle_dir / "media"
        stems_dir = bundle_dir / "stems"
        stems_dir.mkdir(parents=True, exist_ok=True)

        # 1. Resolve source audio file
        audio_path: Optional[Path] = None
        if media_id:
            candidates = list(media_dir.glob(f"{media_id}.*"))
            if candidates:
                audio_path = candidates[0]

        if not audio_path:
            all_media = list(media_dir.glob("*.*"))
            if all_media:
                audio_path = all_media[0]

        if not audio_path or not audio_path.exists():
            raise FileNotFoundError(f"No source audio file found for stem separation in '{project_id}'")

        loop = asyncio.get_running_loop()

        def progress_cb(pct: float, stage_msg: str) -> None:
            if job_id:
                asyncio.run_coroutine_threadsafe(
                    job_manager.update_progress(job_id, pct, stage_msg),
                    loop,
                )

        # 2. Run Separation in Threadpool (enforces CPU/GPU semaphore)
        adapter = DemucsAdapter(model_name=model_name)
        stems_out_dir = stems_dir / f"sep_{job_id or 'latest'}"

        stem_files = await loop.run_in_executor(
            None,
            adapter.separate,
            audio_path,
            stems_out_dir,
            progress_cb,
        )

        # 3. Ingest Stems as Tracks and Pre-compute Waveforms
        if progress_cb:
            progress_cb(92.0, "Ingesting separated stems into project tracks...")

        created_tracks: List[Dict[str, Any]] = []

        for stem_name, stem_path in stem_files.items():
            info = sf.info(str(stem_path))
            stem_asset_id = f"med_stem_{stem_name}_{job_id or 'out'}"

            # Copy or move stem into bundle media directory so it can be streamed
            dest_stem_path = media_dir / f"{stem_asset_id}.wav"
            with open(stem_path, "rb") as src_f, open(dest_stem_path, "wb") as dst_f:
                dst_f.write(src_f.read())

            # Pre-compute waveform peak pyramid
            waveform_cache_dir = bundle_dir / "cache" / "waveforms"
            waveform_cache_dir.mkdir(parents=True, exist_ok=True)
            cache_json_path = waveform_cache_dir / f"{stem_asset_id}.json"
            WaveformPyramid.generate_from_file(dest_stem_path, cache_json_path)

            # Compute sha256 checksum
            stem_bytes = dest_stem_path.read_bytes()
            stem_sha256 = hashlib.sha256(stem_bytes).hexdigest()

            # Create media asset schema
            media_asset = MediaAsset(
                id=stem_asset_id,
                project_id=project_id,
                name=f"Stem • {stem_name.capitalize()}",
                original_filename=f"{stem_name}.wav",
                format="WAV",
                duration=info.duration,
                sample_rate=info.samplerate,
                channels=info.channels,
                frames=info.frames,
                file_size_bytes=len(stem_bytes),
                sha256=stem_sha256,
                filepath=str(dest_stem_path),
                waveform_cached=True,
            )

            # Create Timeline Track & Clip
            track_color = STEM_COLORS.get(stem_name.lower(), "#00f0ff")
            new_track = Track(
                name=f"{stem_name.capitalize()} (Stem)",
                color=track_color,
                order=len(project.tracks),
            )

            new_clip = Clip(
                name=f"{stem_name.capitalize()} Stem",
                source_id=stem_asset_id,
                track_id=new_track.id,
                start_time=0.0,
                duration=info.duration,
                source_offset=0.0,
                gain=0.0,
            )

            new_track.clips.append(new_clip)
            project.tracks.append(new_track)
            created_tracks.append({"track_id": new_track.id, "name": new_track.name, "stem": stem_name})

        # Persist updated project state
        ProjectFormat.save(project)
        logger.info(f"[StemWorker] Separation complete for '{project_id}': 4 stems ingested as tracks")

        return {
            "status": "completed",
            "model": model_name,
            "stems": list(stem_files.keys()),
            "tracks_created": created_tracks,
        }


stem_worker = StemSeparationWorker()
