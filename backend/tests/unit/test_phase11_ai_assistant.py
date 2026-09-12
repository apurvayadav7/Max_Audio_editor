"""Unit tests for Phase 11: Local AI Assistant, Context Serialization & Natural Language DAW Commands."""

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.schemas.project import Project
from backend.app.schemas.track import Track
from backend.app.schemas.clip import Clip
from backend.app.storage.project_format import ProjectFormat
from backend.app.services.ai_service import AIService


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def test_project(tmp_path, monkeypatch):
    """Create a temporary project with multiple named tracks for AI assistant testing."""
    from backend.app.config import settings
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path / "projects")

    proj = Project(name="AI Test Session", tempo=120.0, sample_rate=44100)
    track_drums = Track(name="Drums", volume=-2.0, pan=0.0)
    track_vocals = Track(name="Vocals", volume=0.0, pan=0.0)
    track_bass = Track(name="Bass Guitar", volume=-1.0, pan=0.0)

    # Add a dummy clip on Vocals
    clip1 = Clip(
        name="Lead Vocals Clip",
        track_id=track_vocals.id,
        source_id="med_vox_1",
        start_time=0.0,
        duration=10.0,
    )
    track_vocals.clips.append(clip1)

    proj.tracks = [track_drums, track_vocals, track_bass]
    ProjectFormat.initialize_bundle(proj)
    return proj


def test_context_serialization(test_project):
    """Test serializing project state into compact AI context."""
    ctx = AIService.get_project_context(test_project)
    assert ctx["project_name"] == "AI Test Session"
    assert ctx["tempo"] == 120.0
    assert ctx["total_tracks"] == 3
    assert ctx["total_clips"] == 1
    assert len(ctx["tracks"]) == 3
    assert ctx["tracks"][0]["name"] == "Drums"


def test_suggestions_generator(test_project):
    """Test generating context-aware prompt suggestions."""
    suggestions = AIService.generate_suggestions(test_project)
    assert len(suggestions) >= 2
    prompts = [s["prompt"] for s in suggestions]
    assert any("drums" in p.lower() for p in prompts)
    assert any("vocals" in p.lower() or "reverb" in p.lower() for p in prompts)


def test_fuzzy_track_resolution(test_project):
    """Test track name and synonym matching."""
    tracks = test_project.tracks
    # Exact / partial
    assert AIService.resolve_track("drums", tracks).name == "Drums"
    assert AIService.resolve_track("vocals", tracks).name == "Vocals"
    # Synonyms
    assert AIService.resolve_track("vox", tracks).name == "Vocals"
    assert AIService.resolve_track("singer", tracks).name == "Vocals"
    assert AIService.resolve_track("beat", tracks).name == "Drums"
    assert AIService.resolve_track("sub", tracks).name == "Bass Guitar"
    # Track order
    assert AIService.resolve_track("track 1", tracks).name == "Drums"
    assert AIService.resolve_track("first track", tracks).name == "Drums"


def test_parse_volume_plan(test_project):
    """Test parsing relative and absolute volume adjustments."""
    plan = AIService.parse_plan("Lower drums by 3dB", test_project)
    assert len(plan.operations) == 1
    op = plan.operations[0]
    assert op.op == "set_volume"
    assert op.track_name == "Drums"
    assert op.params["volume"] == -5.0  # -2.0 - 3.0 = -5.0


def test_parse_multi_clause_plan(test_project):
    """Test parsing compound instructions spanning multiple tracks."""
    plan = AIService.parse_plan("Lower drums by 4dB and add Reverb to vocals with 30% wet", test_project)
    assert len(plan.operations) == 2
    
    op_vol = plan.operations[0]
    assert op_vol.op == "set_volume"
    assert op_vol.track_name == "Drums"
    assert op_vol.params["volume"] == -6.0

    op_fx = plan.operations[1]
    assert op_fx.op == "add_effect"
    assert op_fx.track_name == "Vocals"
    assert op_fx.params["type"] == "reverb"
    assert op_fx.params["params"]["mix"] == 0.3


def test_parse_mute_and_pan(test_project):
    """Test mute and pan instructions."""
    plan = AIService.parse_plan("Mute bass guitar and pan vocals 40% left", test_project)
    assert len(plan.operations) == 2

    assert plan.operations[0].op == "mute_track"
    assert plan.operations[0].track_name == "Bass Guitar"

    assert plan.operations[1].op == "set_pan"
    assert plan.operations[1].track_name == "Vocals"
    assert plan.operations[1].params["pan"] == -0.4


def test_parse_tempo_and_spatial(test_project):
    """Test global tempo and 8D spatial audio instructions."""
    plan_tempo = AIService.parse_plan("Change tempo to 128 BPM", test_project)
    assert plan_tempo.operations[0].op == "set_tempo"
    assert plan_tempo.operations[0].params["tempo"] == 128.0

    plan_spatial = AIService.parse_plan("Enable 8D audio with figure-8 orbit", test_project)
    assert plan_spatial.operations[0].op == "apply_spatial"
    assert plan_spatial.operations[0].params["trajectory"] == "figure8"


def test_ai_api_endpoints(client, test_project):
    """Test POST /api/projects/{id}/ai/plan and GET /api/projects/{id}/ai/suggestions."""
    pid = test_project.id

    # 1. Test suggestions
    res_sug = client.get(f"/api/projects/{pid}/ai/suggestions")
    assert res_sug.status_code == 200
    sug_data = res_sug.json()
    assert len(sug_data["suggestions"]) > 0

    # 2. Test plan generation
    res_plan = client.post(
        f"/api/projects/{pid}/ai/plan",
        json={"prompt": "Lower drums by 3dB and mute bass"}
    )
    assert res_plan.status_code == 200
    plan_data = res_plan.json()
    assert len(plan_data["operations"]) == 2
    assert plan_data["confidence"] > 0.8
