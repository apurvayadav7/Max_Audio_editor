"""Professional Mastering DSP Pipeline and ITU-R BS.1770-4 Metering Engine."""

import math
from typing import Any, Dict, Optional, Tuple
import numpy as np
import pyloudnorm as pyln
import scipy.signal

from backend.app.logging_config import logger


class LoudnessMetrics:
    """Container for standards-compliant loudness and stereo field analytics."""

    def __init__(
        self,
        integrated_lufs: float,
        short_term_max_lufs: float,
        momentary_max_lufs: float,
        loudness_range_lu: float,
        true_peak_dbfs: float,
        phase_correlation: float,
    ):
        self.integrated_lufs = round(float(integrated_lufs), 2)
        self.short_term_max_lufs = round(float(short_term_max_lufs), 2)
        self.momentary_max_lufs = round(float(momentary_max_lufs), 2)
        self.loudness_range_lu = round(float(loudness_range_lu), 2)
        self.true_peak_dbfs = round(float(true_peak_dbfs), 2)
        self.phase_correlation = round(float(phase_correlation), 3)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "integrated_lufs": self.integrated_lufs,
            "short_term_max_lufs": self.short_term_max_lufs,
            "momentary_max_lufs": self.momentary_max_lufs,
            "loudness_range_lu": self.loudness_range_lu,
            "true_peak_dbfs": self.true_peak_dbfs,
            "phase_correlation": self.phase_correlation,
        }


class LoudnessAnalyzer:
    """ITU-R BS.1770-4 loudness measurement and True-Peak analysis."""

    @staticmethod
    def analyze(audio: np.ndarray, sample_rate: int = 44100) -> LoudnessMetrics:
        """Analyze audio signal (1D or 2D) and return complete metrics."""
        data = np.asarray(audio, dtype=np.float32)
        if data.ndim == 1:
            data = np.column_stack([data, data])

        num_samples, channels = data.shape

        # 1. Integrated Loudness via pyloudnorm
        meter = pyln.Meter(sample_rate)
        try:
            integrated_lufs = meter.integrated_loudness(data)
            if math.isinf(integrated_lufs) or math.isnan(integrated_lufs):
                integrated_lufs = -70.0
        except Exception:
            integrated_lufs = -70.0

        # 2. Momentary (400ms) & Short-term (3s) windows
        win_momentary = int(0.400 * sample_rate)
        win_short = int(3.0 * sample_rate)

        mom_vals = []
        short_vals = []

        step = max(1, int(0.100 * sample_rate)) # 100ms hop
        for start in range(0, max(1, num_samples - win_momentary), step):
            block = data[start : start + win_momentary]
            if np.max(np.abs(block)) > 1e-5:
                try:
                    val = meter.integrated_loudness(block)
                    if not (math.isinf(val) or math.isnan(val)):
                        mom_vals.append(val)
                except Exception:
                    pass

        for start in range(0, max(1, num_samples - win_short), step * 2):
            block = data[start : start + win_short]
            if np.max(np.abs(block)) > 1e-5:
                try:
                    val = meter.integrated_loudness(block)
                    if not (math.isinf(val) or math.isnan(val)):
                        short_vals.append(val)
                except Exception:
                    pass

        momentary_max = max(mom_vals) if mom_vals else integrated_lufs
        short_term_max = max(short_vals) if short_vals else integrated_lufs

        # Loudness range (approx 95th - 10th percentile of short-term values)
        if len(short_vals) >= 4:
            sorted_short = np.sort(short_vals)
            p10 = sorted_short[int(len(sorted_short) * 0.1)]
            p95 = sorted_short[int(len(sorted_short) * 0.95)]
            lra = max(0.0, float(p95 - p10))
        else:
            lra = 4.0

        # 3. 4x Oversampled True-Peak calculation
        try:
            # Resample by 4x polyphase for inter-sample peak detection
            oversampled = scipy.signal.resample_poly(data, 4, 1, axis=0)
            peak_val = np.max(np.abs(oversampled))
        except Exception:
            peak_val = np.max(np.abs(data))

        true_peak_dbfs = 20.0 * math.log10(max(1e-6, peak_val))

        # 4. Stereo Phase Correlation
        left = data[:, 0]
        right = data[:, 1]
        denom = math.sqrt(np.sum(left**2) * np.sum(right**2)) + 1e-9
        phase_corr = float(np.sum(left * right) / denom)
        phase_corr = max(-1.0, min(1.0, phase_corr))

        return LoudnessMetrics(
            integrated_lufs=integrated_lufs,
            short_term_max_lufs=short_term_max,
            momentary_max_lufs=momentary_max,
            loudness_range_lu=lra,
            true_peak_dbfs=true_peak_dbfs,
            phase_correlation=phase_corr,
        )


class MasteringChain:
    """Professional mastering chain with 4-band EQ, glue compression, harmonic exciter, and True-Peak limiter."""

    PRESETS = {
        "streaming": {
            "name": "Streaming Standard",
            "target_lufs": -14.0,
            "ceiling_dbfs": -1.0,
            "low_shelf_gain_db": 0.5,
            "low_mid_gain_db": -0.5,
            "high_mid_gain_db": 0.5,
            "high_shelf_gain_db": 1.0,
            "glue_threshold_db": -16.0,
            "glue_ratio": 2.5,
            "exciter_drive": 0.15,
        },
        "club": {
            "name": "Club & EDM Master",
            "target_lufs": -8.0,
            "ceiling_dbfs": -0.3,
            "low_shelf_gain_db": 2.0,
            "low_mid_gain_db": -1.0,
            "high_mid_gain_db": 1.5,
            "high_shelf_gain_db": 2.0,
            "glue_threshold_db": -12.0,
            "glue_ratio": 4.0,
            "exciter_drive": 0.35,
        },
        "podcast": {
            "name": "Podcast & Broadcast Vocal",
            "target_lufs": -16.0,
            "ceiling_dbfs": -1.5,
            "low_shelf_gain_db": -2.0,
            "low_mid_gain_db": -1.5,
            "high_mid_gain_db": 2.0,
            "high_shelf_gain_db": 1.0,
            "glue_threshold_db": -18.0,
            "glue_ratio": 3.0,
            "exciter_drive": 0.10,
        },
        "cinematic": {
            "name": "Cinematic & Dynamic Orchestral",
            "target_lufs": -18.0,
            "ceiling_dbfs": -1.0,
            "low_shelf_gain_db": 1.0,
            "low_mid_gain_db": 0.0,
            "high_mid_gain_db": 0.5,
            "high_shelf_gain_db": 0.5,
            "glue_threshold_db": -22.0,
            "glue_ratio": 1.8,
            "exciter_drive": 0.05,
        },
    }

    @classmethod
    def apply_4band_eq(
        cls,
        audio: np.ndarray,
        sample_rate: int,
        low_shelf_db: float = 0.0,
        low_mid_db: float = 0.0,
        high_mid_db: float = 0.0,
        high_shelf_db: float = 0.0,
    ) -> np.ndarray:
        """Apply 4-band mastering EQ using minimum-phase IIR biquads."""
        out = audio.copy()
        nyq = sample_rate / 2.0

        # 1. Low Shelf (80 Hz)
        if abs(low_shelf_db) > 0.1:
            gain_lin = 10.0 ** (low_shelf_db / 20.0)
            b, a = scipy.signal.iirfilter(
                2,
                min(0.99, 80.0 / nyq),
                btype="lowpass",
                ftype="butter",
            )
            filtered = scipy.signal.lfilter(b, a, out, axis=0)
            out = out + filtered * (gain_lin - 1.0)

        # 2. Low-Mid Bell (300 Hz)
        if abs(low_mid_db) > 0.1:
            gain_lin = 10.0 ** (low_mid_db / 20.0)
            w0 = 300.0 / nyq
            bw = w0 / 1.5
            low_f = max(0.01, w0 - bw / 2)
            high_f = min(0.99, w0 + bw / 2)
            b, a = scipy.signal.iirfilter(
                2,
                [low_f, high_f],
                btype="bandpass",
                ftype="butter",
            )
            filtered = scipy.signal.lfilter(b, a, out, axis=0)
            out = out + filtered * (gain_lin - 1.0)

        # 3. High-Mid Bell (3.2 kHz)
        if abs(high_mid_db) > 0.1:
            gain_lin = 10.0 ** (high_mid_db / 20.0)
            w0 = 3200.0 / nyq
            bw = w0 / 1.5
            low_f = max(0.01, w0 - bw / 2)
            high_f = min(0.99, w0 + bw / 2)
            b, a = scipy.signal.iirfilter(
                2,
                [low_f, high_f],
                btype="bandpass",
                ftype="butter",
            )
            filtered = scipy.signal.lfilter(b, a, out, axis=0)
            out = out + filtered * (gain_lin - 1.0)

        # 4. High Shelf (10 kHz)
        if abs(high_shelf_db) > 0.1:
            gain_lin = 10.0 ** (high_shelf_db / 20.0)
            b, a = scipy.signal.iirfilter(
                2,
                min(0.99, 10000.0 / nyq),
                btype="highpass",
                ftype="butter",
            )
            filtered = scipy.signal.lfilter(b, a, out, axis=0)
            out = out + filtered * (gain_lin - 1.0)

        return out

    @classmethod
    def apply_glue_compressor(
        cls,
        audio: np.ndarray,
        sample_rate: int,
        threshold_db: float = -16.0,
        ratio: float = 2.5,
        attack_ms: float = 30.0,
        release_ms: float = 100.0,
    ) -> np.ndarray:
        """Apply VCA bus glue compressor with smooth gain reduction envelope."""
        out = audio.copy()
        thresh_lin = 10.0 ** (threshold_db / 20.0)
        slope = 1.0 - (1.0 / max(1.0, ratio))

        # Envelope follower coefficients
        att_coef = math.exp(-1.0 / (sample_rate * (attack_ms / 1000.0)))
        rel_coef = math.exp(-1.0 / (sample_rate * (release_ms / 1000.0)))

        # Sidechain detector
        detector = np.max(np.abs(out), axis=1)
        env = np.zeros_like(detector)
        cur_env = 0.0

        for i in range(len(detector)):
            d = detector[i]
            if d > cur_env:
                cur_env = att_coef * cur_env + (1.0 - att_coef) * d
            else:
                cur_env = rel_coef * cur_env + (1.0 - rel_coef) * d
            env[i] = cur_env

        # Gain reduction calculation
        env_safe = np.maximum(1e-6, env)
        env_db = 20.0 * np.log10(env_safe)
        over_db = np.maximum(0.0, env_db - threshold_db)
        gr_db = -slope * over_db
        gr_lin = 10.0 ** (gr_db / 20.0)

        out[:, 0] *= gr_lin
        out[:, 1] *= gr_lin
        return out

    @classmethod
    def apply_harmonic_exciter(
        cls,
        audio: np.ndarray,
        drive: float = 0.2,
    ) -> np.ndarray:
        """Apply analog tape saturation and exciter with gentle odd/even harmonics."""
        if drive <= 0.01:
            return audio

        drive_gain = 1.0 + drive * 2.5
        x = audio * drive_gain
        # Soft cubic saturation with subtle asymmetric 2nd harmonic warmth
        saturated = np.tanh(x) + 0.08 * (x**2) * np.sign(x)
        # Normalize gain
        norm = 1.0 / (1.0 + drive * 0.8)
        return (saturated * norm).astype(np.float32)

    @classmethod
    def apply_true_peak_limiter(
        cls,
        audio: np.ndarray,
        ceiling_dbfs: float = -1.0,
        lookahead_samples: int = 64,
    ) -> np.ndarray:
        """Lookahead true-peak brickwall limiter preventing inter-sample clipping."""
        out = audio.copy()
        ceil_lin = 10.0 ** (ceiling_dbfs / 20.0)

        # Pad with lookahead
        padded = np.pad(out, ((lookahead_samples, lookahead_samples), (0, 0)), mode="edge")
        peaks = np.max(np.abs(padded), axis=1)

        # Moving peak envelope over lookahead window
        win_size = lookahead_samples * 2 + 1
        peak_env = scipy.ndimage.maximum_filter1d(peaks, size=win_size)
        peak_env = peak_env[lookahead_samples : lookahead_samples + len(out)]

        # Gain curve
        over = np.maximum(1.0, peak_env / (ceil_lin * 0.999))
        gain = 1.0 / over

        # Smooth gain curve
        smooth_b = np.ones(32) / 32.0
        gain_smooth = scipy.signal.convolve(gain, smooth_b, mode="same")

        out[:, 0] *= gain_smooth
        out[:, 1] *= gain_smooth

        # Absolute hard clip guard at ceiling
        out = np.clip(out, -ceil_lin, ceil_lin)
        return out.astype(np.float32)

    @classmethod
    def process(
        cls,
        audio: np.ndarray,
        sample_rate: int = 44100,
        preset_name: str = "streaming",
        custom_params: Optional[Dict[str, Any]] = None,
    ) -> Tuple[np.ndarray, LoudnessMetrics, LoudnessMetrics]:
        """
        Execute the complete mastering chain:
        1. Measure pre-master loudness
        2. 4-Band Mastering EQ
        3. Bus Glue Compressor
        4. Harmonic Exciter
        5. Target Loudness Makeup Gain Normalization
        6. True-Peak Lookahead Brickwall Limiter
        7. Measure post-master loudness
        """
        data = np.asarray(audio, dtype=np.float32)
        if data.ndim == 1:
            data = np.column_stack([data, data])

        params = cls.PRESETS.get(preset_name.lower(), cls.PRESETS["streaming"]).copy()
        if custom_params:
            params.update(custom_params)

        target_lufs = float(params.get("target_lufs", -14.0))
        ceiling_dbfs = float(params.get("ceiling_dbfs", -1.0))

        # 1. Pre-Master Analysis
        pre_metrics = LoudnessAnalyzer.analyze(data, sample_rate)

        # 2. 4-Band EQ
        mastered = cls.apply_4band_eq(
            data,
            sample_rate=sample_rate,
            low_shelf_db=params.get("low_shelf_gain_db", 0.5),
            low_mid_db=params.get("low_mid_gain_db", -0.5),
            high_mid_db=params.get("high_mid_gain_db", 0.5),
            high_shelf_db=params.get("high_shelf_gain_db", 1.0),
        )

        # 3. Glue Compression
        mastered = cls.apply_glue_compressor(
            mastered,
            sample_rate=sample_rate,
            threshold_db=params.get("glue_threshold_db", -16.0),
            ratio=params.get("glue_ratio", 2.5),
        )

        # 4. Harmonic Exciter
        mastered = cls.apply_harmonic_exciter(
            mastered,
            drive=params.get("exciter_drive", 0.15),
        )

        # 5. Loudness Normalization to Target LUFS
        current_metrics = LoudnessAnalyzer.analyze(mastered, sample_rate)
        if current_metrics.integrated_lufs > -60.0:
            gain_needed_db = target_lufs - current_metrics.integrated_lufs
            # Prevent excessive boost
            gain_needed_db = max(-18.0, min(18.0, gain_needed_db))
            mastered *= 10.0 ** (gain_needed_db / 20.0)

        # 6. True-Peak Brickwall Limiter
        mastered = cls.apply_true_peak_limiter(
            mastered,
            ceiling_dbfs=ceiling_dbfs,
        )

        # 7. Post-Master Analysis
        post_metrics = LoudnessAnalyzer.analyze(mastered, sample_rate)

        logger.info(
            f"[Mastering] Preset '{preset_name}': "
            f"Pre={pre_metrics.integrated_lufs} LUFS -> Post={post_metrics.integrated_lufs} LUFS "
            f"(Target={target_lufs} LUFS, TruePeak={post_metrics.true_peak_dbfs} dBFS)"
        )

        return mastered, pre_metrics, post_metrics
