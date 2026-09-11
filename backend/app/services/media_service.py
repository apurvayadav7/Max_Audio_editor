"""Media Management Service — Audio Ingestion, Decoding & Waveform Orchestration."""

import os
import shutil
import uuid
from pathlib import Path
from fastapi import UploadFile
from backend.app.schemas.media import MediaAsset, MediaUploadResponse
from backend.app.schemas.track import Track
from backend.app.schemas.clip import Clip
from backend.app.storage.project_format import ProjectFormat, safe_resolve
from backend.app.services.project_service import ProjectService
from backend.app.audio.decode import decode_audio_to_pcm, probe_audio
from backend.app.audio.waveform import WaveformPyramid
from backend.app.logging_config import logger


class MediaService:
    @classmethod
    async def ingest_media(
        cls,
        project_id: str,
        upload_file: UploadFile,
        create_timeline_track: bool = True
    ) -> MediaUploadResponse:
        """
        Ingest audio file into project bundle:
        1. Save uploaded file to temp
        2. Decode to normalized 32-bit float WAV in project media directory
        3. Extract metadata and compute waveform peak pyramid
        4. Optionally auto-create track and clip on project timeline
        """
        bundle_dir = ProjectFormat.get_bundle_path(project_id)
        if not bundle_dir.exists():
            raise FileNotFoundError(f"Project bundle not found: {project_id}")

        media_dir = bundle_dir / "media"
        cache_dir = bundle_dir / "cache" / "waveforms"
        temp_dir = bundle_dir / "cache" / "temp"
        media_dir.mkdir(parents=True, exist_ok=True)
        cache_dir.mkdir(parents=True, exist_ok=True)
        temp_dir.mkdir(parents=True, exist_ok=True)

        asset_id = f"med_{uuid.uuid4().hex[:10]}"
        orig_filename = upload_file.filename or "audio_import"
        temp_path = temp_dir / f"{asset_id}_{orig_filename}"

        # Write uploaded stream to temp file
        with open(temp_path, "wb") as f:
            while chunk := await upload_file.read(1024 * 1024):
                f.write(chunk)

        target_wav_path = media_dir / f"{asset_id}.wav"
        logger.info(f"Decoding uploaded audio '{orig_filename}' -> '{target_wav_path.name}'")

        # Normalize and decode to PCM float32 WAV
        meta = decode_audio_to_pcm(temp_path, target_wav_path)
        # Clean up temp upload file
        if temp_path.exists():
            os.remove(temp_path)

        # Generate multi-resolution peak pyramid
        waveform_cache_path = cache_dir / f"{asset_id}.json"
        WaveformPyramid.generate_from_file(target_wav_path, waveform_cache_path)

        # Clean display name without extension
        display_name = Path(orig_filename).stem

        asset = MediaAsset(
            id=asset_id,
            project_id=project_id,
            name=display_name,
            original_filename=orig_filename,
            format=meta.format_name,
            duration=meta.duration,
            sample_rate=meta.sample_rate,
            channels=meta.channels,
            frames=meta.frames,
            file_size_bytes=meta.file_size_bytes,
            sha256=meta.sha256,
            filepath=str(target_wav_path),
            waveform_cached=True,
        )

        created_track_id = None
        created_clip_id = None

        if create_timeline_track:
            project = await ProjectService.get_project(project_id)

            # Create audio track
            track = Track(
                name=display_name,
                type="audio",
                color="#00f0ff" if len(project.tracks) == 0 else "#00e676",
                volume=0.0,
                pan=0.0,
                order=len(project.tracks),
            )

            # Create timeline clip
            clip = Clip(
                name=display_name,
                source_id=asset.id,
                track_id=track.id,
                start_time=0.0,
                duration=asset.duration,
                source_offset=0.0,
                gain=0.0,
            )

            track.clips.append(clip)
            project.tracks.append(track)
            
            # Update project duration if this clip extends it
            if asset.duration > project.duration:
                project.duration = asset.duration

            await ProjectService.update_project(project_id, project)
            created_track_id = track.id
            created_clip_id = clip.id
            logger.info(f"Auto-created track '{track.name}' with clip '{clip.id}' for project '{project_id}'")

        return MediaUploadResponse(
            asset=asset,
            waveform_url=f"/api/projects/{project_id}/media/{asset.id}/waveform",
            stream_url=f"/api/projects/{project_id}/media/{asset.id}/stream",
            created_track_id=created_track_id,
            created_clip_id=created_clip_id,
        )

    @classmethod
    def get_media_path(cls, project_id: str, media_id: str) -> Path:
        """Get absolute path to media file."""
        bundle_dir = ProjectFormat.get_bundle_path(project_id)
        path = safe_resolve(bundle_dir / "media", f"{media_id}.wav")
        if not path.exists():
            raise FileNotFoundError(f"Media asset not found: {media_id}")
        return path

    @classmethod
    def get_waveform_data(cls, project_id: str, media_id: str) -> dict:
        """Get pre-computed waveform peak pyramid."""
        bundle_dir = ProjectFormat.get_bundle_path(project_id)
        cache_file = safe_resolve(bundle_dir / "cache" / "waveforms", f"{media_id}.json")
        return WaveformPyramid.load_cached(cache_file)
