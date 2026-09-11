"""Unit tests for Phase 8: Extended Effects Suite & Preset Engine."""

import pytest
from backend.app.schemas.effect import Effect
from backend.app.schemas.preset import EffectPreset, ChannelStripPreset
from backend.app.schemas.track import Track
from backend.app.schemas.project import Project
from backend.app.storage.project_format import ProjectFormat


def test_effect_schema_extended_dsp_types():
    """Verify that all Phase 7 & 8 effect types are supported by Pydantic."""
    dsp_types = [
        "parametric_eq",
        "compressor",
        "delay",
        "reverb",
        "limiter",
        "saturation",
        "distortion",
        "chorus",
        "width",
    ]
    
    for fx_type in dsp_types:
        fx = Effect(type=fx_type, name=f"Test {fx_type}")
        assert fx.type == fx_type
        assert fx.is_bypassed is False
        assert isinstance(fx.parameters, dict)


def test_effect_preset_serialization():
    """Test EffectPreset model instantiation and validation."""
    preset = EffectPreset(
        name="Warm Analog Tape",
        effect_type="saturation",
        category="Color",
        is_factory=True,
        parameters={"drive": 3.0, "warmth": 7500, "mix": 0.85},
    )
    
    dumped = preset.model_dump()
    assert dumped["name"] == "Warm Analog Tape"
    assert dumped["effect_type"] == "saturation"
    assert dumped["parameters"]["drive"] == 3.0
    
    # Re-validate
    loaded = EffectPreset.model_validate(dumped)
    assert loaded.id == preset.id
    assert loaded.parameters["warmth"] == 7500


def test_channel_strip_preset():
    """Test ChannelStripPreset with multi-effect chain."""
    eq_fx = Effect(
        type="parametric_eq",
        name="Vocal Air EQ",
        parameters={"low_gain": -2.0, "high_gain": 4.5, "mid1_gain": 1.0, "mid2_gain": -1.5},
    )
    comp_fx = Effect(
        type="compressor",
        name="Vocal Opto Comp",
        parameters={"threshold": -20.0, "ratio": 4.0, "attack": 0.01, "release": 0.2, "makeup_gain": 3.0},
    )
    sat_fx = Effect(
        type="saturation",
        name="Tube Warmth",
        parameters={"drive": 2.5, "warmth": 9000, "mix": 0.7},
    )
    width_fx = Effect(
        type="width",
        name="Stereo Spread",
        parameters={"width": 1.25},
    )
    
    strip = ChannelStripPreset(
        name="Modern Pop Vocal Strip",
        description="Pristine vocal chain with gentle warmth and stereo presence",
        is_factory=True,
        effects=[eq_fx, comp_fx, sat_fx, width_fx],
    )
    
    assert len(strip.effects) == 4
    assert strip.effects[0].type == "parametric_eq"
    assert strip.effects[2].parameters["drive"] == 2.5
    assert strip.effects[3].parameters["width"] == 1.25


def test_project_bundle_roundtrip_with_extended_effects(tmp_path, monkeypatch):
    """Verify that a project containing extended effects saves and loads without data loss."""
    import backend.app.config as cfg
    monkeypatch.setattr(cfg.settings, "PROJECTS_DIR", tmp_path)
    
    project = Project(name="Phase 8 FX Suite Session")
    track = Track(name="Lead Synth", color="#ff007f")
    
    # Add Saturation + Chorus + Delay + Width to the track
    track.effects = [
        Effect(type="saturation", name="Warmth", parameters={"drive": 4.0, "mix": 0.8}),
        Effect(type="chorus", name="Thick Chorus", parameters={"rate": 1.5, "depth": 0.005, "mix": 0.5}),
        Effect(type="delay", name="Ping Delay", parameters={"time": 0.35, "feedback": 0.45, "mix": 0.3}),
        Effect(type="width", name="Stereo Imager", parameters={"width": 1.4}),
    ]
    project.tracks.append(track)
    
    # Save bundle
    bundle_dir = ProjectFormat.initialize_bundle(project)
    assert bundle_dir.exists()
    assert (bundle_dir / "project.json").exists()
    
    # Load bundle
    loaded_project = ProjectFormat.load(project.id)
    assert len(loaded_project.tracks) == 1
    loaded_track = loaded_project.tracks[0]
    assert len(loaded_track.effects) == 4
    
    assert loaded_track.effects[0].type == "saturation"
    assert loaded_track.effects[0].parameters["drive"] == 4.0
    assert loaded_track.effects[1].type == "chorus"
    assert loaded_track.effects[1].parameters["rate"] == 1.5
    assert loaded_track.effects[3].type == "width"
    assert loaded_track.effects[3].parameters["width"] == 1.4
