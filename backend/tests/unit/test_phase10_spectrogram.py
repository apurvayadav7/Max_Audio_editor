"""Unit tests for Phase 10: Spectrogram Engine, Pitch Tracker, and API Endpoints."""

import io
import json
from pathlib import Path
import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.audio.spectrogram import SpectrogramEngine, _create_png_bytes
from backend.app.audio.pitch import PitchTracker
from backend.app.schemas.project import Project
from backend.app.storage.project_format import ProjectFormat


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def test_audio_project(tmp_path, monkeypatch):
    """Create a temporary project with a synthetic sine wave audio asset."""
    from backend.app.config import settings
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path / "projects")

    # Create project
    proj = Project(name="Phase 10 Test Project", tempo=120.0, sample_rate=44100)
    bundle_dir = ProjectFormat.initialize_bundle(proj)
    project_id = proj.id

    # Generate synthetic 440 Hz A4 sine wave audio
    sr = 22050
    duration = 1.5
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    y = (0.7 * np.sin(2 * np.pi * 440.0 * t)).astype(np.float32)

    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    media_dir = bundle_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)

    media_id = "med_test_phase10"
    wav_path = media_dir / f"{media_id}.wav"
    sf.write(str(wav_path), y, sr)

    return {"project_id": project_id, "media_id": media_id, "wav_path": wav_path, "sr": sr}


def test_png_encoder():
    """Test pure-python PNG encoder generates valid PNG bytes."""
    rgba = np.zeros((32, 64, 4), dtype=np.uint8)
    rgba[:, :, 0] = 255  # Red
    rgba[:, :, 3] = 255  # Alpha

    png_bytes = _create_png_bytes(rgba)
    assert png_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(png_bytes) > 50


def test_spectrogram_engine_computation(test_audio_project, tmp_path):
    """Test SpectrogramEngine generates valid Mel spectrogram PNG and metadata."""
    wav_path = test_audio_project["wav_path"]
    cache_png = tmp_path / "test_spec.png"

    png_bytes, metadata = SpectrogramEngine.generate_spectrogram_image(
        audio_path=wav_path,
        cache_png_path=cache_png,
        colormap="cyberpunk",
        n_mels=64,
        hop_length=256,
    )

    assert png_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    assert metadata["n_mels"] == 64
    assert metadata["height"] == 64
    assert metadata["width"] > 0
    assert metadata["duration"] > 1.0
    assert metadata["colormap"] == "cyberpunk"
    assert cache_png.exists()

    # Test cache hit
    cached_bytes, cached_meta = SpectrogramEngine.generate_spectrogram_image(
        audio_path=wav_path,
        cache_png_path=cache_png,
        colormap="cyberpunk",
        n_mels=64,
    )
    assert cached_bytes == png_bytes
    assert cached_meta["width"] == metadata["width"]


def test_spectrogram_colormaps(test_audio_project):
    """Test colormap palette mappings for magma, viridis, and cyberpunk."""
    matrix = np.linspace(0, 1, 100).reshape(10, 10)
    for cmap in ["cyberpunk", "magma", "viridis"]:
        rgba = SpectrogramEngine.apply_colormap(matrix, colormap_name=cmap)
        assert rgba.shape == (10, 10, 4)
        assert rgba.dtype == np.uint8
        assert np.all(rgba[:, :, 3] == 255)  # Alpha fully opaque


def test_pitch_tracker_synthetic_sine(test_audio_project, tmp_path):
    """Test PitchTracker detects 440 Hz (A4) on synthetic sine wave."""
    wav_path = test_audio_project["wav_path"]
    cache_json = tmp_path / "test_pitch.json"

    pitch_data = PitchTracker.analyze_pitch(
        audio_path=wav_path,
        cache_json_path=cache_json,
        fmin=100.0,
        fmax=800.0,
        hop_length=256,
    )

    assert "frames" in pitch_data
    assert "stats" in pitch_data
    assert pitch_data["total_frames"] > 0
    assert pitch_data["voiced_percentage"] > 80.0

    # Mean frequency should be within 5 Hz of 440 Hz
    mean_hz = pitch_data["stats"]["mean_hz"]
    assert 435.0 <= mean_hz <= 445.0
    assert "A4" in (pitch_data["stats"]["lowest_note"], pitch_data["stats"]["highest_note"])
    assert cache_json.exists()


def test_spectrogram_api_endpoints(client, test_audio_project):
    """Test GET /api/projects/{id}/media/{media_id}/spectrogram."""
    p_id = test_audio_project["project_id"]
    m_id = test_audio_project["media_id"]

    # 1. Test PNG response
    res_png = client.get(f"/api/projects/{p_id}/media/{m_id}/spectrogram?colormap=magma&n_mels=64")
    assert res_png.status_code == 200
    assert res_png.headers["content-type"] == "image/png"
    assert res_png.content.startswith(b"\x89PNG\r\n\x1a\n")

    # 2. Test JSON metadata response
    res_json = client.get(f"/api/projects/{p_id}/media/{m_id}/spectrogram?format=json&colormap=magma&n_mels=64")
    assert res_json.status_code == 200
    data = res_json.json()
    assert data["n_mels"] == 64
    assert data["colormap"] == "magma"

    # 3. Test 404 for non-existent media
    res_404 = client.get(f"/api/projects/{p_id}/media/med_invalid/spectrogram")
    assert res_404.status_code == 404


def test_pitch_api_endpoint(client, test_audio_project):
    """Test GET /api/projects/{id}/media/{media_id}/pitch."""
    p_id = test_audio_project["project_id"]
    m_id = test_audio_project["media_id"]

    res = client.get(f"/api/projects/{p_id}/media/{m_id}/pitch")
    assert res.status_code == 200
    data = res.json()
    assert "frames" in data
    assert "stats" in data
    assert data["stats"]["mean_hz"] > 400.0

    # Test 404 for non-existent media
    res_404 = client.get(f"/api/projects/{p_id}/media/med_invalid/pitch")
    assert res_404.status_code == 404
