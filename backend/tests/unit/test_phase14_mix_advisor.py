"""Unit Tests for Phase 14: AI Mix Assistant & Intelligent Acoustic Analysis."""

import pytest
import numpy as np
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.mix_advisor import (
    FrequencyMaskingDetector,
    StereoPhaseAnalyzer,
    DynamicHeadroomAnalyzer,
    AudioInsightEngine,
    MixAdvisor,
)
from backend.app.schemas.project import Project
from backend.app.schemas.track import Track
from backend.app.schemas.clip import Clip
from backend.app.storage.project_format import ProjectFormat


def test_frequency_masking_detector_kick_bass():
    """Verify frequency masking detection correctly flags overlapping Kick and Bass low-end."""
    sr = 44100
    duration = 2.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)

    # Kick: low frequency punch around 60 Hz
    kick = np.sin(2 * np.pi * 60.0 * t) * np.exp(-t * 3.0)
    # 808 Bass: sustained low frequency around 60 Hz
    bass = np.sin(2 * np.pi * 60.0 * t) * 0.8

    info_kick = {"id": "trk_kick", "name": "Kick Drum", "stem_type": "drums"}
    info_bass = {"id": "trk_bass", "name": "808 Sub Bass", "stem_type": "bass"}

    cards = FrequencyMaskingDetector.detect_pairwise_collisions(
        kick, info_kick, bass, info_bass, sr
    )

    assert len(cards) > 0
    masking_card = next((c for c in cards if c.category == "masking"), None)
    assert masking_card is not None
    assert "Collision" in masking_card.title
    assert 40.0 <= masking_card.action.params["frequency"] <= 80.0
    assert masking_card.action.type == "INSERT_EQ_NOTCH"
    assert masking_card.action.track_id == "trk_bass"


def test_stereo_phase_analyzer_inverted_channels():
    """Verify phase cancellation detector catches out-of-phase stereo tracks."""
    sr = 44100
    duration = 1.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)

    # Perfectly inverted L and R channels
    left = np.sin(2 * np.pi * 440.0 * t).astype(np.float32)
    right = -left
    stereo_inverted = np.array([left, right])

    corr = StereoPhaseAnalyzer.calculate_phase_correlation(stereo_inverted)
    assert corr < -0.95

    t_info = {"id": "trk_synth", "name": "Stereo Synth Pad", "stem_type": "other"}
    cards = StereoPhaseAnalyzer.analyze_track(stereo_inverted, t_info, sr)

    assert len(cards) > 0
    phase_card = next((c for c in cards if c.category == "stereo_phase"), None)
    assert phase_card is not None
    assert phase_card.severity == "critical"
    assert phase_card.action.type == "SET_STEREO_WIDTH"
    assert phase_card.action.track_id == "trk_synth"


def test_dynamic_headroom_analyzer_clipping_and_compression():
    """Verify headroom evaluation flags clipping master signals and over-compression."""
    sr = 44100
    t = np.linspace(0, 1.0, sr, endpoint=False)

    # 1. Clipped master audio with peak > 0 dBFS
    clipped_signal = np.sin(2 * np.pi * 100.0 * t) * 1.5  # +3.5 dBFS
    cards = DynamicHeadroomAnalyzer.evaluate_master_headroom(clipped_signal)
    clip_card = next((c for c in cards if c.id == "headroom_clipping"), None)
    assert clip_card is not None
    assert clip_card.severity == "critical"
    assert clip_card.action.type == "ADJUST_GAIN"

    # 2. Over-compressed square wave (low crest factor < 4 dB)
    square_signal = np.sign(np.sin(2 * np.pi * 200.0 * t)) * 0.5
    comp_cards = DynamicHeadroomAnalyzer.evaluate_master_headroom(square_signal)
    comp_card = next((c for c in comp_cards if c.id == "dynamics_overcompressed"), None)
    assert comp_card is not None
    assert comp_card.severity == "warning"


def test_audio_insight_engine_explanation():
    """Verify educational audio insight synthesizer produces comprehensive explanations."""
    sr = 44100
    t = np.linspace(0, 1.0, sr, endpoint=False)

    # Warm low bass audio
    bass_audio = np.sin(2 * np.pi * 55.0 * t) * 0.7
    stereo_bass = np.array([bass_audio, bass_audio])

    insight = AudioInsightEngine.analyze_audio_characteristics(stereo_bass, sr, "Sub Bass")
    assert insight.track_name == "Sub Bass"
    assert len(insight.summary_text) > 20
    assert insight.dominant_frequency_hz > 0
    assert insight.energy_sub_pct > 50.0
    assert insight.stereo_correlation >= 0.95


def test_api_mix_assistant_endpoints(tmp_path, monkeypatch):
    """Test full API lifecycle: /mix/analyze, /mix/apply-fix, /mix/explain."""
    from backend.app.config import settings
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path / "projects")

    # Create dummy project bundle
    proj = Project(
        id="proj_mix_test",
        name="Mix Assistant Test Session",
        sample_rate=44100,
        bpm=120.0,
        tracks=[
            Track(
                id="trk_kick",
                name="Kick Drum",
                stem_type="drums",
                volume=0.0,
                clips=[Clip(id="c1", name="Kick Clip", source_id="m1", track_id="trk_kick", start_time=0.0, duration=2.0)]
            ),
            Track(
                id="trk_bass",
                name="808 Bass",
                stem_type="bass",
                volume=-2.0,
                clips=[Clip(id="c2", name="Bass Clip", source_id="m2", track_id="trk_bass", start_time=0.0, duration=2.0)]
            )
        ]
    )
    bundle_dir = ProjectFormat.initialize_bundle(proj)
    media_dir = bundle_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)

    import soundfile as sf
    sr = 44100
    t = np.linspace(0, 2.0, int(sr * 2.0), endpoint=False)
    # Write kick media
    kick_data = (np.sin(2 * np.pi * 60.0 * t) * np.exp(-t * 2.0)).astype(np.float32)
    sf.write(str(media_dir / "m1.wav"), kick_data, sr)
    # Write bass media
    bass_data = (np.sin(2 * np.pi * 60.0 * t) * 0.7).astype(np.float32)
    sf.write(str(media_dir / "m2.wav"), bass_data, sr)

    ProjectFormat.save(proj)

    client = TestClient(app)

    # 1. Test /mix/analyze
    res = client.post("/api/projects/proj_mix_test/mix/analyze")
    assert res.status_code == 200
    data = res.json()
    assert "mix_score" in data
    assert "advice_cards" in data
    assert data["active_tracks_analyzed"] == 2

    # 2. Test /mix/apply-fix
    fix_req = {
        "card_id": "card_test_1",
        "action_type": "INSERT_EQ_NOTCH",
        "track_id": "trk_bass",
        "params": {"frequency": 60.0, "gain_db": -3.5, "q": 2.5}
    }
    res_fix = client.post("/api/projects/proj_mix_test/mix/apply-fix", json=fix_req)
    assert res_fix.status_code == 200
    fix_data = res_fix.json()
    assert fix_data["status"] == "applied"
    assert "Carved" in fix_data["description"]

    # 3. Test /mix/explain/{track_id}
    res_exp = client.get("/api/projects/proj_mix_test/mix/explain/trk_bass")
    assert res_exp.status_code == 200
    exp_data = res_exp.json()
    assert exp_data["track_name"] == "808 Bass"
    assert "spectral_profile" in exp_data
    assert exp_data["energy_sub_pct"] > 50.0
