"""Unit tests for Phase 13: Mastering Suite (ITU-R BS.1770-4 LUFS) and Audio-to-MIDI Transcription."""

from pathlib import Path
import numpy as np
import pytest
import soundfile as sf
import mido
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.audio.mastering import MasteringChain, LoudnessAnalyzer
from backend.app.ai.transcription_models import AudioTranscriber
from backend.app.schemas.project import Project
from backend.app.schemas.track import Track
from backend.app.schemas.clip import Clip
from backend.app.storage.project_format import ProjectFormat


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def test_project(tmp_path, monkeypatch):
    """Create a temporary project with an audio clip for mastering and MIDI testing."""
    from backend.app.config import settings
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path / "projects")

    proj = Project(name="Phase 13 Mastering Project", tempo=120.0, sample_rate=44100)
    bundle_dir = ProjectFormat.initialize_bundle(proj)
    project_id = proj.id

    media_dir = bundle_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    media_id = "med_phase13_audio"
    wav_path = media_dir / f"{media_id}.wav"

    sr = 44100
    duration = 2.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    # A4 (440 Hz) first second, C5 (523.25 Hz) second second
    sig1 = 0.5 * np.sin(2 * np.pi * 440.0 * t[:sr])
    sig2 = 0.5 * np.sin(2 * np.pi * 523.25 * t[sr:])
    sig = np.concatenate([sig1, sig2]).astype(np.float32)
    stereo = np.column_stack([sig, sig])
    sf.write(str(wav_path), stereo, sr)

    trk = Track(name="Lead Synth", type="audio", color="#00f0ff")
    clp = Clip(name="Synth Clip", source_id=media_id, track_id=trk.id, start_time=0.0, duration=duration)
    trk.clips.append(clp)
    proj.tracks.append(trk)
    proj.duration = duration
    ProjectFormat.save(proj)

    return {
        "project_id": project_id,
        "clip_id": clp.id,
        "track_id": trk.id,
        "wav_path": wav_path,
        "media_id": media_id,
    }


def test_loudness_analyzer_metrics():
    """Test ITU-R BS.1770-4 loudness and phase correlation analysis."""
    sr = 44100
    t = np.linspace(0, 1.0, sr, endpoint=False)
    sig = 0.4 * np.sin(2 * np.pi * 440.0 * t)

    # In-phase stereo
    stereo_in_phase = np.column_stack([sig, sig])
    metrics = LoudnessAnalyzer.analyze(stereo_in_phase, sr)
    assert -30.0 < metrics.integrated_lufs < 0.0
    assert metrics.true_peak_dbfs <= 0.0
    assert metrics.phase_correlation >= 0.99

    # Anti-phase stereo (inverted right channel)
    stereo_anti_phase = np.column_stack([sig, -sig])
    anti_metrics = LoudnessAnalyzer.analyze(stereo_anti_phase, sr)
    assert anti_metrics.phase_correlation <= -0.99


def test_mastering_chain_presets():
    """Test mastering targets across industry delivery standards."""
    sr = 44100
    t = np.linspace(0, 2.0, sr * 2, endpoint=False)
    raw = np.column_stack([0.35 * np.sin(2 * np.pi * 320.0 * t), 0.35 * np.sin(2 * np.pi * 320.0 * t)])

    # 1. Streaming target (-14.0 LUFS)
    mastered_stream, pre_m, post_m = MasteringChain.process(raw, sr, preset_name="streaming")
    assert abs(post_m.integrated_lufs - (-14.0)) <= 0.4
    assert post_m.true_peak_dbfs <= -0.9

    # 2. Club & EDM target (-8.0 LUFS)
    mastered_club, _, post_club = MasteringChain.process(raw, sr, preset_name="club")
    assert abs(post_club.integrated_lufs - (-8.0)) <= 0.5
    assert post_club.true_peak_dbfs <= -0.2

    # 3. Podcast target (-16.0 LUFS)
    mastered_pod, _, post_pod = MasteringChain.process(raw, sr, preset_name="podcast")
    assert abs(post_pod.integrated_lufs - (-16.0)) <= 0.4
    assert post_pod.true_peak_dbfs <= -1.4


def test_audio_to_midi_transcription(tmp_path):
    """Test extracting note events and building standard Type 0 MIDI binary file."""
    sr = 44100
    t = np.linspace(0, 1.0, sr, endpoint=False)
    # A4 (440Hz, MIDI 69) and C5 (523Hz, MIDI 72)
    y1 = 0.5 * np.sin(2 * np.pi * 440.0 * t[:sr // 2])
    y2 = 0.5 * np.sin(2 * np.pi * 523.25 * t[sr // 2:])
    y = np.concatenate([y1, y2])

    notes = AudioTranscriber.transcribe(y, sample_rate=sr)
    assert len(notes) >= 2
    pitches = [n.pitch for n in notes]
    assert 69 in pitches
    assert 72 in pitches

    # Export to .mid file and re-parse with mido
    out_mid = tmp_path / "test_notes.mid"
    AudioTranscriber.export_midi_file(notes, out_mid)
    assert out_mid.exists()

    loaded_mid = mido.MidiFile(str(out_mid))
    assert len(loaded_mid.tracks) == 1
    msg_types = [m.type for m in loaded_mid.tracks[0]]
    assert "set_tempo" in msg_types
    assert "note_on" in msg_types
    assert "note_off" in msg_types


def test_api_mastering_endpoints(client, test_project):
    """Test REST endpoints: master session -> stream -> commit to project."""
    project_id = test_project["project_id"]

    # 1. Master session
    resp = client.post(
        f"/api/projects/{project_id}/master",
        json={"preset": "streaming"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "master_id" in data
    assert "pre_metrics" in data
    assert "post_metrics" in data
    master_id = data["master_id"]

    # 2. Stream mastered audio
    stream_resp = client.get(f"/api/projects/{project_id}/master/{master_id}/stream")
    assert stream_resp.status_code == 200
    assert stream_resp.headers["content-type"] == "audio/wav"
    assert len(stream_resp.content) > 5000

    # 3. Waveform preview
    wf_resp = client.get(f"/api/projects/{project_id}/master/{master_id}/waveform")
    assert wf_resp.status_code == 200
    assert "levels" in wf_resp.json()

    # 4. Commit to session
    commit_resp = client.post(f"/api/projects/{project_id}/master/{master_id}/commit")
    assert commit_resp.status_code == 200
    commit_data = commit_resp.json()
    assert commit_data["status"] == "committed"

    # Verify project has new Master track
    proj = ProjectFormat.load(project_id)
    assert any("Final Master" in t.name for t in proj.tracks)


def test_api_transcribe_endpoints(client, test_project):
    """Test REST endpoints: transcribe clip -> download .mid file."""
    project_id = test_project["project_id"]
    clip_id = test_project["clip_id"]

    # 1. Transcribe
    resp = client.post(
        f"/api/projects/{project_id}/transcribe",
        json={"clip_id": clip_id},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["notes_count"] >= 1
    assert "notes" in data
    assert "midi_download_url" in data

    # 2. Download .mid file
    dl_resp = client.get(f"/api/projects/{project_id}/transcribe/{clip_id}/midi")
    assert dl_resp.status_code == 200
    assert dl_resp.headers["content-type"] == "audio/midi"
    assert len(dl_resp.content) > 50
    assert dl_resp.content.startswith(b"MThd") # Standard MIDI File Header Magic
