"""Unit tests for Phase 12: Local AI Music Generation, Clip Extension & Timeline Ingestion."""

import asyncio
import time
from pathlib import Path
import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.ai.generation_models import MusicGenerator
from backend.app.schemas.project import Project
from backend.app.schemas.track import Track
from backend.app.schemas.clip import Clip
from backend.app.storage.project_format import ProjectFormat
from backend.app.services.project_service import ProjectService
from backend.app.jobs.manager import job_manager


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def test_project(tmp_path, monkeypatch):
    """Create a temporary project with a track and an audio clip."""
    from backend.app.config import settings
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path / "projects")

    proj = Project(name="Phase 12 AI Music Project", tempo=120.0, sample_rate=44100)
    bundle_dir = ProjectFormat.initialize_bundle(proj)
    project_id = proj.id

    # Create dummy audio asset
    media_dir = bundle_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    media_id = "med_phase12_orig"
    wav_path = media_dir / f"{media_id}.wav"

    sr = 44100
    duration = 2.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    sig = np.sin(2 * np.pi * 220.0 * t).astype(np.float32)
    stereo = np.column_stack([sig, sig])
    sf.write(str(wav_path), stereo, sr)

    # Track and clip
    trk = Track(name="Synth Base", type="audio", color="#00f0ff")
    clp = Clip(name="Base Clip", source_id=media_id, track_id=trk.id, start_time=0.0, duration=duration)
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


def test_music_generator_synthesis_styles():
    """Test harmonic synthesis across different style directives."""
    # 1. Synth Arp
    synth_audio = MusicGenerator.generate(
        prompt="Cyberpunk fast 16th-note arpeggiator in A minor 128 BPM",
        duration=1.5,
        sample_rate=44100,
    )
    assert isinstance(synth_audio, np.ndarray)
    assert synth_audio.shape == (int(1.5 * 44100), 2)
    assert synth_audio.dtype == np.float32
    assert np.max(np.abs(synth_audio)) > 0.05
    assert np.max(np.abs(synth_audio)) <= 1.0

    # 2. Heavy Bass
    bass_audio = MusicGenerator.generate(
        prompt="Punchy 808 sub bassline in D minor",
        duration=1.0,
        sample_rate=44100,
    )
    assert bass_audio.shape == (44100, 2)
    assert np.max(np.abs(bass_audio)) > 0.05

    # 3. Drums
    drum_audio = MusicGenerator.generate(
        prompt="Four on the floor industrial drum beat with snappy snare 130 BPM",
        duration=1.0,
        sample_rate=44100,
    )
    assert drum_audio.shape == (44100, 2)
    assert np.max(np.abs(drum_audio)) > 0.05

    # 4. Ambient Pad Chords
    ambient_audio = MusicGenerator.generate(
        prompt="Lo-Fi warm ambient synthesizer pad chords in C major",
        duration=1.0,
        sample_rate=44100,
    )
    assert ambient_audio.shape == (44100, 2)
    assert np.max(np.abs(ambient_audio)) > 0.05


def test_music_generator_clip_extension(tmp_path):
    """Test audio continuation and smooth boundary crossfade."""
    source_wav = tmp_path / "src_test.wav"
    sr = 44100
    orig_dur = 1.5
    t = np.linspace(0, orig_dur, int(sr * orig_dur), endpoint=False)
    sig = (0.5 * np.sin(2 * np.pi * 330.0 * t)).astype(np.float32)
    stereo = np.column_stack([sig, sig])
    sf.write(str(source_wav), stereo, sr)

    extended = MusicGenerator.extend_clip(
        source_audio_path=source_wav,
        prompt="Seamless harmonic continuation",
        extension_seconds=1.5,
        overlap_seconds=0.3,
        sample_rate=sr,
    )

    expected_len = int((orig_dur + 1.5 - 0.3) * sr)
    assert abs(len(extended) - expected_len) < 100
    assert extended.shape[1] == 2
    assert extended.dtype == np.float32


def test_api_generate_workflow(client, test_project):
    """Test full API lifecycle: generate -> preview -> waveform -> accept -> insert."""
    project_id = test_project["project_id"]

    # 1. Queue generation job
    resp = client.post(
        f"/api/projects/{project_id}/generate",
        json={
            "prompt": "Cyberpunk 128 BPM Synth Arp in A minor",
            "duration": 1.5,
            "tempo": 128.0,
            "key": "A minor",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data
    job_id = data["job_id"]

    # Wait for job completion (max 5s)
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    candidate_wav = bundle_dir / "cache" / "generated" / f"{job_id}.wav"
    candidate_json = bundle_dir / "cache" / "generated" / f"{job_id}.json"

    for _ in range(50):
        if candidate_wav.exists() and candidate_json.exists():
            break
        time.sleep(0.1)

    assert candidate_wav.exists(), "Candidate WAV was not written by worker"
    assert candidate_json.exists(), "Candidate waveform JSON was not written by worker"

    # 2. Preview streaming endpoint
    prev_resp = client.get(f"/api/projects/{project_id}/generate/{job_id}/preview")
    assert prev_resp.status_code == 200
    assert prev_resp.headers["content-type"] == "audio/wav"
    assert len(prev_resp.content) > 1000

    # 3. Preview waveform endpoint
    wf_resp = client.get(f"/api/projects/{project_id}/generate/{job_id}/waveform")
    assert wf_resp.status_code == 200
    wf_data = wf_resp.json()
    assert "duration" in wf_data
    assert "levels" in wf_data

    # 4. Accept into new track
    acc_resp = client.post(
        f"/api/projects/{project_id}/generate/{job_id}/accept",
        json={
            "insert_mode": "new_track",
            "playhead_time": 0.0,
            "track_name": "AI Synth Lead",
        },
    )
    assert acc_resp.status_code == 200
    acc_data = acc_resp.json()
    assert acc_data["status"] == "accepted"
    assert "asset_id" in acc_data
    assert "track_id" in acc_data
    assert "clip_id" in acc_data

    # Verify project bundle has the new track and clip
    proj = ProjectFormat.load(project_id)
    assert len(proj.tracks) == 2
    ai_track = next((t for t in proj.tracks if t.id == acc_data["track_id"]), None)
    assert ai_track is not None
    assert ai_track.name == "AI Synth Lead"
    assert len(ai_track.clips) == 1
    assert ai_track.clips[0].source_id == acc_data["asset_id"]


def test_api_extend_workflow(client, test_project):
    """Test clip continuation endpoint via REST."""
    project_id = test_project["project_id"]
    clip_id = test_project["clip_id"]

    resp = client.post(
        f"/api/projects/{project_id}/extend",
        json={
            "clip_id": clip_id,
            "prompt": "Extend synth lead with harmonic motion",
            "extension_seconds": 1.5,
            "overlap_seconds": 0.2,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data
    job_id = data["job_id"]

    # Wait for completion
    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    candidate_wav = bundle_dir / "cache" / "generated" / f"{job_id}.wav"

    for _ in range(50):
        if candidate_wav.exists():
            break
        time.sleep(0.1)

    assert candidate_wav.exists(), "Extended candidate WAV was not written"

    # Accept replacing existing clip
    acc_resp = client.post(
        f"/api/projects/{project_id}/generate/{job_id}/accept",
        json={
            "insert_mode": "replace_clip",
            "target_clip_id": clip_id,
        },
    )
    assert acc_resp.status_code == 200

    proj = ProjectFormat.load(project_id)
    replaced_clip = next((c for t in proj.tracks for c in t.clips if c.id == clip_id), None)
    assert replaced_clip is not None
    assert "(AI)" in replaced_clip.name
    assert replaced_clip.duration > 2.0
