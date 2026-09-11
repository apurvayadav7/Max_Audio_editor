"""Phase 3 Multi-Track Timeline & Beat Grid Mathematical Unit Tests."""

import pytest
from backend.app.schemas.track import Track
from backend.app.schemas.clip import Clip
from backend.app.schemas.project import Project


def time_to_pixel(seconds: float, zoom: float = 80.0) -> float:
    return max(0.0, seconds * zoom)


def pixel_to_time(px: float, zoom: float = 80.0) -> float:
    return max(0.0, px / zoom)


def time_to_beats(seconds: float, bpm: float = 120.0) -> float:
    return seconds * (bpm / 60.0)


def beats_to_time(beats: float, bpm: float = 120.0) -> float:
    return beats * (60.0 / bpm)


def snap_time_to_grid(seconds: float, bpm: float = 120.0, snap_mode: str = "1/4", time_sig_num: int = 4) -> float:
    if snap_mode == "free":
        return seconds
    sec_per_beat = 60.0 / bpm
    steps = {
        "bar": time_sig_num,
        "1/2": 0.5,
        "1/4": 0.25,
        "1/8": 0.125,
        "1/16": 0.0625,
        "1/32": 0.03125,
    }
    step_sec = steps.get(snap_mode, 0.25) * sec_per_beat
    return max(0.0, round(seconds / step_sec) * step_sec)


def test_coordinate_conversions():
    """Verify time <-> pixel <-> beat conversions are mathematically exact."""
    zoom = 100.0  # 100 px per second
    bpm = 120.0   # 2 beats per second

    # 2.5 seconds -> 250 px
    assert time_to_pixel(2.5, zoom) == 250.0
    assert pixel_to_time(250.0, zoom) == 2.5

    # 2.5 seconds at 120 bpm -> 5 beats
    assert time_to_beats(2.5, bpm) == 5.0
    assert beats_to_time(5.0, bpm) == 2.5


def test_beat_snapping_precision():
    """Verify grid snapping accurately quantizes timeline positions."""
    bpm = 120.0  # 1 beat = 0.5s, 1 bar = 2.0s, 1/4 beat = 0.125s

    # Snapping to Bar (every 2.0s)
    assert snap_time_to_grid(1.8, bpm, "bar", 4) == 2.0
    assert snap_time_to_grid(0.9, bpm, "bar", 4) == 0.0

    # Snapping to 1/4 Beat (every 0.125s)
    # 0.13s -> rounds to 0.125s
    assert snap_time_to_grid(0.13, bpm, "1/4") == 0.125
    # 0.24s -> rounds to 0.250s
    assert snap_time_to_grid(0.24, bpm, "1/4") == 0.250

    # Free mode (no quantization)
    assert snap_time_to_grid(0.12345, bpm, "free") == 0.12345


def test_multitrack_data_model():
    """Verify multi-track project structure supports multiple audio tracks, colors, and clips."""
    proj = Project(name="Multi-Track Symphony", tempo=126.0)

    track1 = Track(name="Drums", type="audio", color="#ff3d71", volume=-2.0, pan=0.0)
    track2 = Track(name="Bass", type="audio", color="#ffb800", volume=-1.0, pan=0.0)
    track3 = Track(name="Synth", type="audio", color="#00f0ff", volume=-4.0, pan=-0.3)
    track4 = Track(name="Vocals", type="audio", color="#00e676", volume=0.0, pan=0.2)

    clip1 = Clip(name="Drum Beat", source_id="med_01", track_id=track1.id, start_time=0.0, duration=16.0)
    clip2 = Clip(name="Bassline", source_id="med_02", track_id=track2.id, start_time=0.0, duration=16.0)
    clip3 = Clip(name="Synth Pad", source_id="med_03", track_id=track3.id, start_time=4.0, duration=12.0)

    track1.clips.append(clip1)
    track2.clips.append(clip2)
    track3.clips.append(clip3)

    proj.tracks.extend([track1, track2, track3, track4])
    proj.duration = 16.0

    # Validate serialization roundtrip
    dumped = proj.model_dump()
    reloaded = Project.model_validate(dumped)

    assert len(reloaded.tracks) == 4
    assert reloaded.tracks[0].name == "Drums"
    assert reloaded.tracks[1].name == "Bass"
    assert reloaded.tracks[2].clips[0].name == "Synth Pad"
    assert reloaded.tracks[2].clips[0].start_time == 4.0
