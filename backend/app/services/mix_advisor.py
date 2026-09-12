"""AI Mix Assistant & Intelligent Acoustic Analysis Service.

Provides 100% local analysis of multi-track sessions:
1. Frequency masking & collision detection (Kick vs Bass, Vocals vs Guitars/Keys)
2. Stereo phase correlation & sub-bass mono compatibility analysis
3. Dynamic headroom & crest factor evaluation
4. Actionable mix advice cards with one-click executable fixes
5. Plain-English educational audio insight explanations
"""

import math
from typing import Optional, Any
from pathlib import Path
import numpy as np
from scipy import signal
from pydantic import BaseModel, Field

from backend.app.schemas.project import Project
from backend.app.schemas.track import Track
from backend.app.audio.render_graph import render_project_timeline
from backend.app.logging_config import logger


class MixAdviceAction(BaseModel):
    """Action payload for 1-click fix execution."""
    type: str  # "INSERT_EQ_NOTCH", "SET_STEREO_WIDTH", "ADJUST_GAIN", "MONO_SUB", "ADD_EFFECT"
    track_id: str
    params: dict[str, Any] = Field(default_factory=dict)


class MixAdviceCard(BaseModel):
    """Structured advice card for user review and 1-click resolution."""
    id: str
    category: str  # "masking", "stereo_phase", "dynamics", "headroom", "balance"
    severity: str  # "critical", "warning", "info"
    title: str
    description: str
    recommendation: str
    target_track_ids: list[str] = Field(default_factory=list)
    action: Optional[MixAdviceAction] = None


class AudioInsight(BaseModel):
    """Educational plain-English breakdown of audio characteristics."""
    track_name: str
    spectral_profile: str
    dynamics_profile: str
    stereo_profile: str
    summary_text: str
    dominant_frequency_hz: float
    crest_factor_db: float
    spectral_centroid_hz: float
    stereo_correlation: float
    energy_sub_pct: float
    energy_mid_pct: float
    energy_high_pct: float


class MixHealthReport(BaseModel):
    """Comprehensive multi-track mix analysis report."""
    mix_score: int = Field(ge=0, le=100)
    rating: str  # "Excellent", "Good", "Needs Attention", "Critical Issues"
    summary: str
    master_lufs: Optional[float] = None
    master_true_peak_dbfs: float
    master_headroom_db: float
    master_crest_factor_db: float
    master_phase_correlation: float
    advice_cards: list[MixAdviceCard] = Field(default_factory=list)
    active_tracks_analyzed: int = 0


# Frequency definition bands for acoustic masking detection
FREQUENCY_BANDS = [
    {"name": "Sub Bass", "low_hz": 20.0, "high_hz": 80.0, "weight": 1.2},
    {"name": "Low End", "low_hz": 80.0, "high_hz": 250.0, "weight": 1.1},
    {"name": "Low Mids", "low_hz": 250.0, "high_hz": 600.0, "weight": 1.0},
    {"name": "Midrange", "low_hz": 600.0, "high_hz": 2000.0, "weight": 0.9},
    {"name": "High Mids", "low_hz": 2000.0, "high_hz": 5000.0, "weight": 1.0},
    {"name": "Highs / Air", "low_hz": 5000.0, "high_hz": 16000.0, "weight": 0.8},
]


class FrequencyMaskingDetector:
    """Detects frequency collisions and masking between conflicting tracks."""

    @staticmethod
    def compute_band_energies(audio_mono: np.ndarray, sr: int) -> dict[str, float]:
        """Compute relative RMS energy in each standard frequency band."""
        energies: dict[str, float] = {}
        if len(audio_mono) < 256:
            for b in FREQUENCY_BANDS:
                energies[b["name"]] = 0.0
            return energies

        # Compute power spectrum via Welch or FFT
        freqs, psd = signal.welch(audio_mono, fs=sr, nperseg=min(2048, len(audio_mono)))
        total_power = np.sum(psd) + 1e-12

        for band in FREQUENCY_BANDS:
            mask = (freqs >= band["low_hz"]) & (freqs < band["high_hz"])
            band_power = np.sum(psd[mask])
            energies[band["name"]] = float(band_power / total_power)

        return energies

    @staticmethod
    def find_peak_collision_frequency(
        audio1: np.ndarray,
        audio2: np.ndarray,
        sr: int,
        low_hz: float,
        high_hz: float,
    ) -> float:
        """Find the frequency where cross-spectral overlap is highest."""
        nperseg = min(2048, len(audio1), len(audio2))
        if nperseg < 128:
            return (low_hz + high_hz) / 2.0

        f1, psd1 = signal.welch(audio1, fs=sr, nperseg=nperseg)
        _, psd2 = signal.welch(audio2, fs=sr, nperseg=nperseg)

        # Overlap spectrum: element-wise product of normalized spectra
        norm1 = psd1 / (np.max(psd1) + 1e-12)
        norm2 = psd2 / (np.max(psd2) + 1e-12)
        cross_spectrum = norm1 * norm2

        mask = (f1 >= low_hz) & (f1 <= high_hz)
        if not np.any(mask):
            return (low_hz + high_hz) / 2.0

        band_freqs = f1[mask]
        band_cross = cross_spectrum[mask]
        peak_idx = int(np.argmax(band_cross))
        return float(round(band_freqs[peak_idx], 1))

    @classmethod
    def detect_pairwise_collisions(
        cls,
        track1_audio: np.ndarray,
        track1_info: dict[str, Any],
        track2_audio: np.ndarray,
        track2_info: dict[str, Any],
        sr: int,
    ) -> list[MixAdviceCard]:
        """Detect acoustic collisions between two tracks."""
        cards: list[MixAdviceCard] = []

        # Convert to mono if stereo
        mono1 = np.mean(track1_audio, axis=0) if track1_audio.ndim > 1 else track1_audio
        mono2 = np.mean(track2_audio, axis=0) if track2_audio.ndim > 1 else track2_audio

        # Ensure minimum length
        min_len = min(len(mono1), len(mono2))
        if min_len < sr // 4:  # At least 250ms
            return cards

        mono1 = mono1[:min_len]
        mono2 = mono2[:min_len]

        # Ignore silent tracks
        rms1 = float(np.sqrt(np.mean(mono1**2)))
        rms2 = float(np.sqrt(np.mean(mono2**2)))
        if rms1 < 1e-4 or rms2 < 1e-4:
            return cards

        energies1 = cls.compute_band_energies(mono1, sr)
        energies2 = cls.compute_band_energies(mono2, sr)

        name1 = track1_info.get("name", "Track 1")
        name2 = track2_info.get("name", "Track 2")
        id1 = track1_info.get("id", "")
        id2 = track2_info.get("id", "")
        stem1 = track1_info.get("stem_type", "").lower()
        stem2 = track2_info.get("stem_type", "").lower()

        for band in FREQUENCY_BANDS:
            b_name = band["name"]
            e1 = energies1.get(b_name, 0.0)
            e2 = energies2.get(b_name, 0.0)

            # Masking exists if both tracks have substantial energy in the same band
            overlap_energy = 2.0 * min(e1, e2) / (e1 + e2 + 1e-9)

            threshold = 0.35
            # Bass vs Drums / Kick: lower threshold in Sub Bass / Low End
            is_kick_bass = (
                ("kick" in name1.lower() or "drum" in name1.lower() or stem1 == "drums")
                and ("bass" in name2.lower() or "808" in name2.lower() or stem2 == "bass")
            ) or (
                ("kick" in name2.lower() or "drum" in name2.lower() or stem2 == "drums")
                and ("bass" in name1.lower() or "808" in name1.lower() or stem1 == "bass")
            )

            if is_kick_bass and b_name in ["Sub Bass", "Low End"]:
                threshold = 0.25

            if e1 > 0.15 and e2 > 0.15 and overlap_energy > threshold:
                peak_hz = cls.find_peak_collision_frequency(
                    mono1, mono2, sr, band["low_hz"], band["high_hz"]
                )

                # Determine which track is best to carve
                if is_kick_bass:
                    target_id = id2 if ("bass" in name2.lower() or stem2 == "bass") else id1
                    target_name = name2 if target_id == id2 else name1
                    other_name = name1 if target_id == id2 else name2
                else:
                    target_id = id2 if e2 >= e1 else id1
                    target_name = name2 if target_id == id2 else name1
                    other_name = name1 if target_id == id2 else name2

                card_id = f"masking_{id1}_{id2}_{int(peak_hz)}"
                severity = "critical" if (b_name in ["Sub Bass", "Low End"] or overlap_energy > 0.6) else "warning"

                cards.append(
                    MixAdviceCard(
                        id=card_id,
                        category="masking",
                        severity=severity,
                        title=f"{b_name} Collision ({int(peak_hz)} Hz)",
                        description=(
                            f"Significant frequency clash between '{name1}' ({e1*100:.0f}% band energy) and "
                            f"'{name2}' ({e2*100:.0f}% band energy) around {int(peak_hz)} Hz, causing auditory masking and low-end mud."
                        ),
                        recommendation=(
                            f"Carve a 3.5 dB notch at {int(peak_hz)} Hz with Q=2.5 on '{target_name}' to allow '{other_name}' to punch through."
                        ),
                        target_track_ids=[id1, id2],
                        action=MixAdviceAction(
                            type="INSERT_EQ_NOTCH",
                            track_id=target_id,
                            params={
                                "frequency": peak_hz,
                                "gain_db": -3.5,
                                "q": 2.5,
                                "filter_type": "notch"
                            }
                        )
                    )
                )

        return cards


class StereoPhaseAnalyzer:
    """Analyzes stereo correlation and phase coherence."""

    @staticmethod
    def calculate_phase_correlation(audio_stereo: np.ndarray) -> float:
        """Compute standard Pearson phase correlation between L and R channels (-1.0 to +1.0)."""
        if audio_stereo.ndim < 2 or audio_stereo.shape[0] < 2:
            return 1.0  # Mono is perfectly correlated

        left = audio_stereo[0]
        right = audio_stereo[1]

        dot = np.sum(left * right)
        norm_l = np.sum(left ** 2)
        norm_r = np.sum(right ** 2)
        denom = math.sqrt(norm_l * norm_r) + 1e-12

        corr = float(dot / denom)
        return float(np.clip(corr, -1.0, 1.0))

    @staticmethod
    def check_sub_bass_mono_coherence(audio_stereo: np.ndarray, sr: int, cutoff_hz: float = 120.0) -> tuple[bool, float]:
        """Check if frequencies below cutoff_hz have out-of-phase or wide stereo content.
        
        Returns (has_stereo_sub, side_to_mid_ratio).
        """
        if audio_stereo.ndim < 2 or audio_stereo.shape[0] < 2:
            return False, 0.0

        # Butterworth lowpass filter at cutoff_hz
        sos = signal.butter(4, cutoff_hz, btype="lowpass", fs=sr, output="sos")
        left_sub = signal.sosfilt(sos, audio_stereo[0])
        right_sub = signal.sosfilt(sos, audio_stereo[1])

        mid = 0.5 * (left_sub + right_sub)
        side = 0.5 * (left_sub - right_sub)

        energy_mid = float(np.sum(mid ** 2))
        energy_side = float(np.sum(side ** 2))

        ratio = energy_side / (energy_mid + energy_side + 1e-12)
        return (ratio > 0.12, float(round(ratio, 3)))

    @classmethod
    def analyze_track(cls, audio_stereo: np.ndarray, track_info: dict[str, Any], sr: int) -> list[MixAdviceCard]:
        """Analyze a single track's stereo phase coherence."""
        cards: list[MixAdviceCard] = []
        if audio_stereo.ndim < 2 or audio_stereo.shape[0] < 2:
            return cards

        track_name = track_info.get("name", "Track")
        track_id = track_info.get("id", "")

        corr = cls.calculate_phase_correlation(audio_stereo)
        has_wide_sub, sub_ratio = cls.check_sub_bass_mono_coherence(audio_stereo, sr)

        # 1. Phase cancellation
        if corr < 0.2:
            severity = "critical" if corr < 0.0 else "warning"
            cards.append(
                MixAdviceCard(
                    id=f"phase_cancel_{track_id}",
                    category="stereo_phase",
                    severity=severity,
                    title=f"Stereo Phase Cancellation ({corr:+.2f})",
                    description=(
                        f"Track '{track_name}' has dangerously low phase correlation ({corr:+.2f}). "
                        "When summed to mono, this track will thin out or completely disappear due to destructive interference."
                    ),
                    recommendation="Narrow the stereo field or adjust channel pan / delay to restore mono compatibility.",
                    target_track_ids=[track_id],
                    action=MixAdviceAction(
                        type="SET_STEREO_WIDTH",
                        track_id=track_id,
                        params={"width": 0.6}
                    )
                )
            )

        # 2. Sub-bass in stereo
        stem_type = track_info.get("stem_type", "").lower()
        is_low_end = "bass" in track_name.lower() or "808" in track_name.lower() or "kick" in track_name.lower() or stem_type in ["bass", "drums"]
        if is_low_end and has_wide_sub:
            cards.append(
                MixAdviceCard(
                    id=f"stereo_sub_{track_id}",
                    category="stereo_phase",
                    severity="warning",
                    title="Stereo Sub-Bass Incoherence",
                    description=(
                        f"Track '{track_name}' contains {sub_ratio*100:.0f}% side/stereo information below 120 Hz. "
                        "Sub frequencies should almost always be centered in mono to avoid phase issues on club sound systems."
                    ),
                    recommendation="Apply a mono-bass filter to center frequencies below 120 Hz.",
                    target_track_ids=[track_id],
                    action=MixAdviceAction(
                        type="MONO_SUB",
                        track_id=track_id,
                        params={"cutoff_hz": 120.0}
                    )
                )
            )

        return cards


class DynamicHeadroomAnalyzer:
    """Evaluates dynamic range, headroom, and crest factor."""

    @staticmethod
    def analyze_dynamics(audio: np.ndarray) -> dict[str, float]:
        """Compute peak, RMS, crest factor, and headroom in dB."""
        peak = float(np.max(np.abs(audio))) if len(audio) > 0 else 0.0
        rms = float(np.sqrt(np.mean(audio**2))) if len(audio) > 0 else 0.0

        peak_dbfs = 20.0 * math.log10(max(peak, 1e-5))
        rms_dbfs = 20.0 * math.log10(max(rms, 1e-5))
        crest_factor_db = peak_dbfs - rms_dbfs
        headroom_db = -peak_dbfs

        return {
            "peak_dbfs": float(round(peak_dbfs, 2)),
            "rms_dbfs": float(round(rms_dbfs, 2)),
            "crest_factor_db": float(round(crest_factor_db, 2)),
            "headroom_db": float(round(headroom_db, 2)),
        }

    @classmethod
    def evaluate_master_headroom(cls, master_audio: np.ndarray) -> list[MixAdviceCard]:
        """Evaluate master bus dynamics and headroom."""
        cards: list[MixAdviceCard] = []
        metrics = cls.analyze_dynamics(master_audio)

        peak = metrics["peak_dbfs"]
        crest = metrics["crest_factor_db"]

        # 1. Digital Clipping / Dangerously low headroom
        if peak > 0.0:
            cards.append(
                MixAdviceCard(
                    id="headroom_clipping",
                    category="headroom",
                    severity="critical",
                    title="Digital Master Clipping Detected",
                    description=(
                        f"Master bus peaks at {peak:+.2f} dBFS, exceeding 0.0 dBFS. "
                        "This produces harsh inter-sample digital clipping and distortion on digital-to-analog converters."
                    ),
                    recommendation=f"Lower master bus fader by {abs(peak) + 1.5:.1f} dB to maintain clean headroom.",
                    action=MixAdviceAction(
                        type="ADJUST_GAIN",
                        track_id="master",
                        params={"gain_db": -(abs(peak) + 1.5)}
                    )
                )
            )
        elif peak > -0.5:
            cards.append(
                MixAdviceCard(
                    id="headroom_low",
                    category="headroom",
                    severity="warning",
                    title="Low Master Headroom",
                    description=(
                        f"Master bus peaks at {peak:+.2f} dBFS, leaving only {abs(peak):.1f} dB of headroom. "
                        "Downstream MP3/AAC codecs may clip during lossy encoding."
                    ),
                    recommendation="Gain stage down by 1.0 dB to achieve recommended -1.0 dBFS true peak headroom.",
                    action=MixAdviceAction(
                        type="ADJUST_GAIN",
                        track_id="master",
                        params={"gain_db": -1.0}
                    )
                )
            )

        # 2. Over-compression
        if crest < 6.0 and peak > -20.0:
            cards.append(
                MixAdviceCard(
                    id="dynamics_overcompressed",
                    category="dynamics",
                    severity="warning",
                    title="Mix Over-Compression (Low Dynamic Range)",
                    description=(
                        f"Master crest factor is {crest:.1f} dB (under 6.0 dB threshold). "
                        "Transients are flattened, which causes mix fatigue and robs the track of punch and life."
                    ),
                    recommendation="Back off compressor threshold or reduce limiter ratio to recover natural punch."
                )
            )

        return cards


class AudioInsightEngine:
    """Generates plain-English educational insights for tracks and stems."""

    @staticmethod
    def analyze_audio_characteristics(audio: np.ndarray, sr: int, name: str) -> AudioInsight:
        """Analyze frequency, dynamics, and stereo profile for educational explanation."""
        mono = np.mean(audio, axis=0) if audio.ndim > 1 else audio
        if len(mono) < 512:
            mono = np.pad(mono, (0, 512 - len(mono)))

        # 1. Dynamics
        dynamics = DynamicHeadroomAnalyzer.analyze_dynamics(audio)
        crest = dynamics["crest_factor_db"]

        # 2. Stereo correlation
        corr = StereoPhaseAnalyzer.calculate_phase_correlation(audio) if audio.ndim > 1 else 1.0

        # 3. Frequency profile & spectral centroid
        freqs, psd = signal.welch(mono, fs=sr, nperseg=min(2048, len(mono)))
        total_power = np.sum(psd) + 1e-12
        spectral_centroid = float(np.sum(freqs * psd) / total_power)
        dom_freq = float(freqs[np.argmax(psd)])

        # Sub / Mid / High energy split
        sub_mask = freqs < 250.0
        mid_mask = (freqs >= 250.0) & (freqs < 4000.0)
        high_mask = freqs >= 4000.0

        e_sub = float(np.sum(psd[sub_mask]) / total_power) * 100.0
        e_mid = float(np.sum(psd[mid_mask]) / total_power) * 100.0
        e_high = float(np.sum(psd[high_mask]) / total_power) * 100.0

        # 4. Synthesize educational descriptions
        if spectral_centroid < 600:
            spectral_profile = f"Warm and bass-heavy ({e_sub:.0f}% low-end energy) with prominent weight around {int(dom_freq)} Hz."
        elif spectral_centroid < 2000:
            spectral_profile = f"Balanced midrange body ({e_mid:.0f}% midrange) with strong fundamental resonance around {int(dom_freq)} Hz."
        else:
            spectral_profile = f"Bright and airy presence ({e_high:.0f}% high-frequency content) with spectral sparkle extending above 5 kHz."

        if crest > 16.0:
            dynamics_profile = f"High dynamic range ({crest:.1f} dB crest factor). Transients are energetic and punchy."
        elif crest > 9.0:
            dynamics_profile = f"Healthy dynamic balance ({crest:.1f} dB crest factor) with controlled transients and sustained body."
        else:
            dynamics_profile = f"Dense and compressed ({crest:.1f} dB crest factor). High RMS loudness with tightly controlled peaks."

        if corr > 0.85:
            stereo_profile = f"Centered and mono-coherent ({corr:+.2f} correlation). Stable across headphones and speaker systems."
        elif corr > 0.4:
            stereo_profile = f"Wide stereo spread ({corr:+.2f} correlation) offering dimensional space without phase cancellation."
        else:
            stereo_profile = f"Diffuse stereo width ({corr:+.2f} correlation) with potential mono phase cancellation warnings."

        summary = (
            f"'{name}' displays a {spectral_profile.lower()} "
            f"The dynamic profile is {dynamics_profile.lower()} "
            f"In the stereo field, it is {stereo_profile.lower()}"
        )

        return AudioInsight(
            track_name=name,
            spectral_profile=spectral_profile,
            dynamics_profile=dynamics_profile,
            stereo_profile=stereo_profile,
            summary_text=summary,
            dominant_frequency_hz=round(dom_freq, 1),
            crest_factor_db=round(crest, 1),
            spectral_centroid_hz=round(spectral_centroid, 1),
            stereo_correlation=round(corr, 2),
            energy_sub_pct=round(e_sub, 1),
            energy_mid_pct=round(e_mid, 1),
            energy_high_pct=round(e_high, 1),
        )


class MixAdvisor:
    """Master Mix Advisor coordinator service."""

    @classmethod
    def analyze_project(
        cls,
        project: Project,
        bundle_dir: Path,
        sr: int = 44100
    ) -> MixHealthReport:
        """Run full acoustic analysis across multi-track project."""
        advice_cards: list[MixAdviceCard] = []

        # 1. Render master mix
        master_audio, _ = render_project_timeline(project, bundle_dir, target_sample_rate=sr)
        master_dynamics = DynamicHeadroomAnalyzer.analyze_dynamics(master_audio)
        master_corr = StereoPhaseAnalyzer.calculate_phase_correlation(master_audio)

        # 2. Master Headroom & Dynamics checks
        master_headroom_cards = DynamicHeadroomAnalyzer.evaluate_master_headroom(master_audio)
        advice_cards.extend(master_headroom_cards)

        # Master stereo check
        if master_corr < 0.2:
            advice_cards.append(
                MixAdviceCard(
                    id="master_phase_issue",
                    category="stereo_phase",
                    severity="critical" if master_corr < 0 else "warning",
                    title=f"Master Phase Imbalance ({master_corr:+.2f})",
                    description=(
                        f"The overall master mix has weak stereo correlation ({master_corr:+.2f}). "
                        "Listening on mobile phones, Bluetooth speakers, or club PAs will cause comb filtering."
                    ),
                    recommendation="Review panned elements and stereo wideners; ensure bass and lead elements are centered.",
                )
            )

        # 3. Individual track renders & track-level checks
        track_buffers: dict[str, np.ndarray] = {}
        active_tracks: list[Track] = []

        for track in project.tracks:
            if not track.is_muted and len(track.clips) > 0:
                active_tracks.append(track)
                try:
                    trk_audio, _ = render_project_timeline(
                        project, bundle_dir, target_sample_rate=sr, render_tracks=[track.id]
                    )
                    track_buffers[track.id] = trk_audio

                    t_info = {"id": track.id, "name": track.name, "stem_type": track.stem_type}
                    t_phase_cards = StereoPhaseAnalyzer.analyze_track(trk_audio, t_info, sr)
                    advice_cards.extend(t_phase_cards)

                except Exception as e:
                    logger.warning(f"Could not render track {track.id} for mix analysis: {e}")

        # 4. Pairwise frequency masking detection
        for i in range(len(active_tracks)):
            for j in range(i + 1, len(active_tracks)):
                t1 = active_tracks[i]
                t2 = active_tracks[j]
                buf1 = track_buffers.get(t1.id)
                buf2 = track_buffers.get(t2.id)
                if buf1 is not None and buf2 is not None:
                    info1 = {"id": t1.id, "name": t1.name, "stem_type": t1.stem_type}
                    info2 = {"id": t2.id, "name": t2.name, "stem_type": t2.stem_type}
                    collision_cards = FrequencyMaskingDetector.detect_pairwise_collisions(
                        buf1, info1, buf2, info2, sr
                    )
                    advice_cards.extend(collision_cards)

        # 5. Compute overall mix health score (0 to 100)
        score = 100
        for card in advice_cards:
            if card.severity == "critical":
                score -= 14
            elif card.severity == "warning":
                score -= 7
            elif card.severity == "info":
                score -= 2

        score = max(15, min(100, score))

        if score >= 90:
            rating = "Excellent"
            summary = "Your mix is clean, dynamic, and well-balanced across the frequency spectrum."
        elif score >= 75:
            rating = "Good"
            summary = "Solid mix balance with minor collision or headroom tweaks recommended."
        elif score >= 55:
            rating = "Needs Attention"
            summary = "Auditory masking or phase cancellation detected. Applying the recommended fixes will clarify your mix."
        else:
            rating = "Critical Issues"
            summary = "Severe frequency collisions or clipping detected that compromise translation across playback systems."

        severity_rank = {"critical": 0, "warning": 1, "info": 2}
        advice_cards.sort(key=lambda c: severity_rank.get(c.severity, 3))

        return MixHealthReport(
            mix_score=score,
            rating=rating,
            summary=summary,
            master_true_peak_dbfs=master_dynamics["peak_dbfs"],
            master_headroom_db=master_dynamics["headroom_db"],
            master_crest_factor_db=master_dynamics["crest_factor_db"],
            master_phase_correlation=round(master_corr, 2),
            advice_cards=advice_cards,
            active_tracks_analyzed=len(active_tracks),
        )

    @classmethod
    def explain_track(
        cls,
        track_id: str,
        project: Project,
        bundle_dir: Path,
        sr: int = 44100
    ) -> AudioInsight:
        """Produce educational audio insight for a single track."""
        track = next((t for t in project.tracks if t.id == track_id), None)
        if not track:
            raise ValueError(f"Track with ID '{track_id}' not found in project.")

        trk_audio, _ = render_project_timeline(
            project, bundle_dir, target_sample_rate=sr, render_tracks=[track.id]
        )

        return AudioInsightEngine.analyze_audio_characteristics(trk_audio, sr, track.name)
