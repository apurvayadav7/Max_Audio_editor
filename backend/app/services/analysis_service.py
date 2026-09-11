"""Music Analysis Service — BPM, Key/Scale, LUFS loudness, and Structural Section Segmentation."""

import asyncio
from dataclasses import asdict, dataclass
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pyloudnorm as pyln
import soundfile as sf

from backend.app.jobs.manager import job_manager
from backend.app.storage.project_format import ProjectFormat

logger = logging.getLogger("maxaudio.analysis")

# Krumhansl-Kessler key profiles for 12 Major and 12 Minor keys
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


@dataclass
class SectionSegment:
    name: str
    start: float
    end: float
    duration: float
    energy: float


@dataclass
class AudioAnalysisResult:
    bpm: float
    bpm_confidence: float
    key: str
    scale: str
    key_confidence: float
    integrated_lufs: float
    loudness_range_lu: float
    rms_db: float
    peak_db: float
    sample_rate: int
    duration: float
    beats: List[float]
    sections: List[Dict[str, Any]]


class MusicAnalysisService:
    """Performs comprehensive musical and acoustic intelligence analysis on audio files."""

    def estimate_key(self, chroma: np.ndarray) -> Tuple[str, str, float]:
        """Estimate musical key and scale using Krumhansl-Kessler pitch class profiles."""
        # Mean chroma vector across time (12 elements)
        chroma_mean = np.mean(chroma, axis=1)
        # Normalize
        norm = np.linalg.norm(chroma_mean)
        if norm > 0:
            chroma_mean = chroma_mean / norm

        major_corrs = []
        minor_corrs = []

        for shift in range(12):
            shifted_major = np.roll(MAJOR_PROFILE, shift)
            shifted_minor = np.roll(MINOR_PROFILE, shift)

            # Pearson correlation
            corr_maj = np.corrcoef(chroma_mean, shifted_major)[0, 1]
            corr_min = np.corrcoef(chroma_mean, shifted_minor)[0, 1]

            major_corrs.append(corr_maj)
            minor_corrs.append(corr_min)

        best_maj_idx = int(np.argmax(major_corrs))
        best_min_idx = int(np.argmax(minor_corrs))

        best_maj_score = major_corrs[best_maj_idx]
        best_min_score = minor_corrs[best_min_idx]

        if best_maj_score >= best_min_score:
            key_name = NOTE_NAMES[best_maj_idx]
            scale = "Major"
            confidence = float(np.clip((best_maj_score + 1.0) / 2.0, 0.0, 1.0))
        else:
            key_name = NOTE_NAMES[best_min_idx]
            scale = "Minor"
            confidence = float(np.clip((best_min_score + 1.0) / 2.0, 0.0, 1.0))

        return key_name, scale, confidence

    def analyze_audio_sync(
        self,
        file_path: Path,
        job_id: Optional[str] = None,
        progress_cb: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Synchronously compute full music analysis (intended for background worker thread)."""
        import librosa

        logger.info(f"[AnalysisService] Analyzing audio: {file_path}")

        # 1. Load Audio
        if progress_cb:
            progress_cb(10.0, "Loading audio file...")
        y, sr = librosa.load(str(file_path), sr=22050, mono=True)
        duration = float(len(y) / sr)

        # 2. Loudness Analysis (LUFS, RMS, Peak)
        if progress_cb:
            progress_cb(25.0, "Computing ITU-R BS.1770 LUFS loudness...")
        meter = pyln.Meter(sr)  # Standard BS.1770 loudness meter
        try:
            integrated_lufs = float(meter.integrated_loudness(y))
        except Exception:
            integrated_lufs = -24.0

        peak_val = float(np.max(np.abs(y)))
        peak_db = float(20 * np.log10(peak_val + 1e-9))
        rms_val = float(np.sqrt(np.mean(y**2)))
        rms_db = float(20 * np.log10(rms_val + 1e-9))

        # 3. Tempo & Beat Tracking
        if progress_cb:
            progress_cb(45.0, "Detecting BPM and beat grid...")
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        if isinstance(tempo, np.ndarray):
            detected_bpm = float(tempo[0]) if len(tempo) > 0 else 0.0
        elif hasattr(tempo, "item"):
            detected_bpm = float(tempo.item())
        else:
            detected_bpm = float(tempo)

        beat_times: List[float] = []
        if detected_bpm <= 0.0:
            # Fallback for steady non-percussive signals or short clips
            detected_bpm = 120.0
            bpm_confidence = 0.2
            # Generate synthetic 120 BPM beats
            beat_times = [float(i * 0.5) for i in range(int(duration / 0.5))]
        else:
            detected_bpm = round(detected_bpm, 1)
            beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
            bpm_confidence = 0.85 if len(beat_times) > 4 else 0.5

        # 4. Musical Key & Chroma Profile
        if progress_cb:
            progress_cb(65.0, "Estimating musical key and harmonic scale...")
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        key_name, scale, key_conf = self.estimate_key(chroma)

        # 5. Structural Section Segmentation
        if progress_cb:
            progress_cb(85.0, "Segmenting song sections (Intro, Verse, Chorus, Outro)...")
        sections = self.detect_sections(y, sr, duration)

        if progress_cb:
            progress_cb(95.0, "Finalizing analysis report...")

        result = AudioAnalysisResult(
            bpm=detected_bpm,
            bpm_confidence=round(bpm_confidence, 2),
            key=f"{key_name} {scale}",
            scale=scale,
            key_confidence=round(key_conf, 2),
            integrated_lufs=round(integrated_lufs, 2),
            loudness_range_lu=round(abs(peak_db - rms_db), 2),
            rms_db=round(rms_db, 2),
            peak_db=round(peak_db, 2),
            sample_rate=sr,
            duration=round(duration, 3),
            beats=[round(b, 3) for b in beat_times[:128]],  # First 128 beats for grid sync
            sections=[asdict(s) for s in sections],
        )

        return asdict(result)

    def detect_sections(self, y: np.ndarray, sr: int, duration: float) -> List[SectionSegment]:
        """Heuristic musical structural segmentation dividing track into coherent sections."""
        import librosa

        # Compute RMS energy over 1-second hops
        hop_length = int(sr * 0.5)
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        times = librosa.times_like(rms, sr=sr, hop_length=hop_length)

        if duration <= 10.0:
            # Short sample: treat as single phrase / loop
            avg_energy = float(np.mean(rms))
            return [SectionSegment(name="Main Riff", start=0.0, end=duration, duration=duration, energy=avg_energy)]

        # Determine section boundaries every 8-16 bars or ~15-30s
        section_length = min(16.0, duration / 3.0)
        num_sections = max(1, int(np.ceil(duration / section_length)))
        boundaries = np.linspace(0.0, duration, num_sections + 1)

        section_names = ["Intro", "Verse 1", "Chorus", "Verse 2", "Bridge", "Chorus 2", "Outro"]
        sections: List[SectionSegment] = []

        for i in range(len(boundaries) - 1):
            s_start = float(boundaries[i])
            s_end = float(boundaries[i + 1])
            s_dur = s_end - s_start

            # Calculate slice energy
            mask = (times >= s_start) & (times < s_end)
            energy = float(np.mean(rms[mask])) if np.any(mask) else 0.0

            if i == 0 and num_sections > 2:
                name = "Intro"
            elif i == len(boundaries) - 2 and num_sections > 2:
                name = "Outro"
            else:
                idx = min(i, len(section_names) - 1)
                name = section_names[idx]

            sections.append(SectionSegment(name=name, start=round(s_start, 2), end=round(s_end, 2), duration=round(s_dur, 2), energy=round(energy, 4)))

        return sections

    async def analyze_project_async(self, project_id: str, media_id: Optional[str] = None, job_id: Optional[str] = None) -> Dict[str, Any]:
        """Asynchronous entry point that updates JobManager progress and caches output."""
        project = ProjectFormat.load(project_id)
        if not project:
            raise ValueError(f"Project '{project_id}' not found")

        # Find media file
        bundle_dir = ProjectFormat.get_bundle_path(project_id)
        media_dir = bundle_dir / "media"

        audio_path: Optional[Path] = None
        if media_id:
            # Look for specific media asset
            candidates = list(media_dir.glob(f"{media_id}.*"))
            if candidates:
                audio_path = candidates[0]

        if not audio_path:
            # Pick first available media file or clip source
            all_media = list(media_dir.glob("*.*"))
            if all_media:
                audio_path = all_media[0]

        if not audio_path or not audio_path.exists():
            raise FileNotFoundError(f"No audio files found to analyze in project '{project_id}'")

        loop = asyncio.get_running_loop()

        def progress_cb(pct: float, stage_msg: str) -> None:
            if job_id:
                asyncio.run_coroutine_threadsafe(
                    job_manager.update_progress(job_id, pct, stage_msg),
                    loop,
                )

        # Run CPU-intensive analysis in default executor thread
        analysis_data = await loop.run_in_executor(None, self.analyze_audio_sync, audio_path, job_id, progress_cb)

        # Save to cache/analysis/analysis.json inside project bundle
        cache_dir = bundle_dir / "cache" / "analysis"
        cache_dir.mkdir(parents=True, exist_ok=True)
        out_file = cache_dir / "analysis.json"

        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(analysis_data, f, indent=2)

        # Update project tempo if auto-update is desired
        if analysis_data.get("bpm") and analysis_data["bpm"] > 30:
            project.tempo = analysis_data["bpm"]
            ProjectFormat.save(project)

        logger.info(f"[AnalysisService] Analysis completed and cached for project '{project_id}': BPM={analysis_data.get('bpm')}, Key={analysis_data.get('key')}")
        return analysis_data

    async def get_cached_analysis(self, project_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve previously computed analysis if present."""
        bundle_dir = ProjectFormat.get_bundle_path(project_id)
        cached = bundle_dir / "cache" / "analysis" / "analysis.json"
        if cached.exists():
            try:
                with open(cached, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to read analysis cache: {e}")
        return None


analysis_service = MusicAnalysisService()
