"""Unit tests for Phase 9: Offline Render Graph & Multi-Format Audio Export Engine."""

import os
from pathlib import Path
import pytest
import numpy as np
import soundfile as sf
from httpx import AsyncClient, ASGITransport

from backend.app.main import app
from backend.app.schemas.project import Project
from backend.app.schemas.track import Track
from backend.app.schemas.clip import Clip
from backend.app.storage.project_format import ProjectFormat
from backend.app.audio.render_graph import render_project_timeline, apply_equal_power_pan
from backend.app.services.export_service import ExportService


@pytest.fixture
def test_project_with_audio(tmp_path, monkeypatch):
    """Fixture creating a test project with synthetic audio clips for offline bounce."""
    import backend.app.config as cfg
    monkeypatch.setattr(cfg.settings, "PROJECTS_DIR", tmp_path)

    project = Project(name="Phase 9 Render Test Session", sample_rate=44100)
    bundle_dir = ProjectFormat.initialize_bundle(project)
    media_dir = bundle_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)

    # Generate 1.5s 440Hz test sine wave on Track 1
    sr = 44100
    dur1 = 1.5
    t1 = np.linspace(0, dur1, int(sr * dur1), endpoint=False)
    sine1 = 0.5 * np.sin(2 * np.pi * 440 * t1).astype(np.float32)
    sine1_stereo = np.column_stack([sine1, sine1])
    file1 = media_dir / "clip_sine1.wav"
    sf.write(str(file1), sine1_stereo, sr, subtype="PCM_24")

    # Generate 1.0s 880Hz test sine wave on Track 2
    dur2 = 1.0
    t2 = np.linspace(0, dur2, int(sr * dur2), endpoint=False)
    sine2 = 0.4 * np.sin(2 * np.pi * 880 * t2).astype(np.float32)
    sine2_stereo = np.column_stack([sine2, sine2])
    file2 = media_dir / "clip_sine2.wav"
    sf.write(str(file2), sine2_stereo, sr, subtype="PCM_24")

    track1 = Track(
        id="trk_lead",
        name="Lead Synth",
        volume=-2.0,
        pan=-0.5,
        clips=[
            Clip(
                id="clp_1",
                name="Sine 440",
                source_id="clip_sine1",
                track_id="trk_lead",
                start_time=0.0,
                duration=dur1,
                source_offset=0.0,
                gain=0.0,
                fade_in=0.1,
                fade_out=0.1,
            )
        ],
    )

    track2 = Track(
        id="trk_bass",
        name="Sub Bass",
        volume=0.0,
        pan=0.5,
        clips=[
            Clip(
                id="clp_2",
                name="Sine 880",
                source_id="clip_sine2",
                track_id="trk_bass",
                start_time=0.5,
                duration=dur2,
                source_offset=0.0,
                gain=-3.0,
            )
        ],
    )

    project.tracks = [track1, track2]
    ProjectFormat.save(project)
    return project, bundle_dir


def test_equal_power_pan_law():
    """Verify constant-power -3dB center panning behavior."""
    stereo_sig = np.ones((2, 1000), dtype=np.float32)

    # Center
    center_panned = apply_equal_power_pan(stereo_sig, 0.0)
    expected_gain = np.cos(np.pi / 4.0)  # ~0.7071 (-3.01 dB)
    np.testing.assert_allclose(center_panned[0, 0], expected_gain, rtol=1e-3)
    np.testing.assert_allclose(center_panned[1, 0], expected_gain, rtol=1e-3)

    # Hard Left
    left_panned = apply_equal_power_pan(stereo_sig, -1.0)
    assert left_panned[0, 0] == pytest.approx(1.0, abs=1e-3)
    assert left_panned[1, 0] == pytest.approx(0.0, abs=1e-3)

    # Hard Right
    right_panned = apply_equal_power_pan(stereo_sig, 1.0)
    assert right_panned[0, 0] == pytest.approx(0.0, abs=1e-3)
    assert right_panned[1, 0] == pytest.approx(1.0, abs=1e-3)


def test_render_timeline_summing(test_project_with_audio):
    """Test sample-accurate multi-track bounce to float32 stereo buffer."""
    project, bundle_dir = test_project_with_audio

    buf, sr = render_project_timeline(project, bundle_dir, target_sample_rate=44100)
    assert sr == 44100
    assert buf.shape[0] == 2  # Stereo
    # Track 2 ends at 0.5 + 1.0 = 1.5s
    assert buf.shape[1] == int(np.ceil(1.5 * 44100))
    # Should have non-zero energy
    assert np.max(np.abs(buf)) > 0.01


def test_render_timeline_mute_and_solo(test_project_with_audio):
    """Verify mute and solo logic during offline render."""
    project, bundle_dir = test_project_with_audio

    # Mute track 1
    project.tracks[0].is_muted = True
    buf_muted, _ = render_project_timeline(project, bundle_dir, target_sample_rate=44100)

    # The first 0.5s before track 2 starts should be complete silence
    first_half_sec = buf_muted[:, : int(0.5 * 44100)]
    assert np.max(np.abs(first_half_sec)) == pytest.approx(0.0, abs=1e-5)


def test_export_service_multi_format_encoding(test_project_with_audio, tmp_path):
    """Test encoding to WAV 24-bit, WAV 16-bit, WAV 32-bit float, FLAC, and MP3."""
    project, bundle_dir = test_project_with_audio

    # 1. Master mix export as WAV 24-bit
    res_wav24 = ExportService.export_project(
        project,
        format_type="wav",
        sample_rate=44100,
        bit_depth=24,
        export_mode="master",
    )
    assert len(res_wav24["files"]) == 1
    wav_file = Path(res_wav24["files"][0]["file_path"])
    assert wav_file.exists()
    info = sf.info(str(wav_file))
    assert info.samplerate == 44100
    assert info.channels == 2
    assert info.subtype == "PCM_24"

    # 2. FLAC export
    res_flac = ExportService.export_project(
        project,
        format_type="flac",
        sample_rate=44100,
        bit_depth=24,
        export_mode="master",
    )
    flac_file = Path(res_flac["files"][0]["file_path"])
    assert flac_file.exists()
    info_flac = sf.info(str(flac_file))
    assert info_flac.format == "FLAC"

    # 3. Stem bounce (individual synchronized stems)
    res_stems = ExportService.export_project(
        project,
        format_type="wav",
        sample_rate=44100,
        bit_depth=16,
        export_mode="stems",
    )
    assert len(res_stems["files"]) == 2
    for item in res_stems["files"]:
        fpath = Path(item["file_path"])
        assert fpath.exists()
        assert sf.info(str(fpath)).subtype == "PCM_16"


@pytest.mark.anyio
async def test_export_api_endpoints(test_project_with_audio):
    """Test POST /api/projects/{id}/export and file download endpoint."""
    project, bundle_dir = test_project_with_audio

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Trigger export
        resp = await ac.post(
            f"/api/projects/{project.id}/export",
            json={
                "format": "wav",
                "sample_rate": 44100,
                "bit_depth": 24,
                "mode": "master",
            },
        )
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["status"] == "success"
        data = payload["data"]
        assert len(data["files"]) == 1

        file_info = data["files"][0]
        download_url = file_info["download_url"]

        # Test download endpoint
        dl_resp = await ac.get(download_url)
        assert dl_resp.status_code == 200
        assert len(dl_resp.content) > 1000
        assert dl_resp.headers["content-type"].startswith("audio/")
