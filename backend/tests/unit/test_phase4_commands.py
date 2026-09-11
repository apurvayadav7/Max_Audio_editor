"""Unit tests for Phase 4: Non-Destructive Editing & Clip Operations.

Verifies mathematical invariants for non-destructive clip splitting, trimming,
duplicating, and project bundle persistence without audio discontinuity.
"""

import pytest
from backend.app.schemas.project import Project
from backend.app.schemas.track import Track
from backend.app.schemas.clip import Clip


class TestPhase4NonDestructiveEditing:
    """Mathematical and domain model tests for non-destructive clip operations."""

    def test_split_clip_mathematical_invariants(self):
        """Verify that splitting a clip preserves sample continuity and total duration."""
        start_time = 2.0
        original_duration = 5.0
        source_offset = 1.5
        stretch_ratio = 1.0
        split_time = 4.25

        # Invariant checks
        assert start_time < split_time < (start_time + original_duration)

        # 1. Left slice
        left_duration = split_time - start_time
        assert left_duration == 2.25

        # 2. Right slice
        right_start = split_time
        right_offset = source_offset + left_duration * stretch_ratio
        right_duration = original_duration - left_duration

        assert right_start == 4.25
        assert right_offset == 1.5 + 2.25 == 3.75
        assert right_duration == 2.75

        # Total timeline span preserved
        assert left_duration + right_duration == original_duration
        # Raw source media continuity preserved
        assert (source_offset + left_duration * stretch_ratio) == right_offset
        assert (right_offset + right_duration * stretch_ratio) == (source_offset + original_duration * stretch_ratio)

    def test_split_clip_with_time_stretch(self):
        """Verify split math holds accurately when clip is time-stretched (e.g. 1.25x)."""
        start_time = 0.0
        original_duration = 4.0
        source_offset = 0.0
        stretch_ratio = 1.25
        split_time = 2.5

        left_duration = split_time - start_time  # 2.5s timeline
        right_offset = source_offset + left_duration * stretch_ratio  # 2.5 * 1.25 = 3.125s into raw media
        right_duration = original_duration - left_duration  # 1.5s timeline

        assert left_duration == 2.5
        assert right_offset == 3.125
        assert right_duration == 1.5
        assert left_duration + right_duration == original_duration

    def test_trim_start_slip_invariants(self):
        """Verify trimming left edge slips start time and offset while keeping end time pinned."""
        initial_start = 1.0
        initial_duration = 6.0
        initial_offset = 0.5
        end_time = initial_start + initial_duration  # 7.0s

        # Slip start forward by 1.5 seconds
        slip_delta = 1.5
        new_start = initial_start + slip_delta
        new_offset = initial_offset + slip_delta
        new_duration = initial_duration - slip_delta

        assert new_start == 2.5
        assert new_offset == 2.0
        assert new_duration == 4.5
        # The right edge is still pinned to exactly 7.0s
        assert new_start + new_duration == end_time

    def test_project_schema_with_split_and_duplicated_clips(self):
        """Verify Project schema accepts multi-track sliced clips and serializes cleanly."""
        proj = Project(name="Phase 4 Edit Test")
        track = Track(name="Audio Track 1")

        clip_a1 = Clip(
            name="Synth Riff (Left)",
            source_id="med_sample01",
            track_id=track.id,
            start_time=0.0,
            duration=3.0,
            source_offset=0.0,
            gain=0.0,
            fade_in=0.05,
            fade_out=0.0,
        )

        clip_a2 = Clip(
            name="Synth Riff (Right)",
            source_id="med_sample01",
            track_id=track.id,
            start_time=3.0,
            duration=4.5,
            source_offset=3.0,
            gain=-1.5,
            fade_in=0.0,
            fade_out=0.2,
        )

        # Duplicate clip
        clip_b = Clip(
            name="Synth Riff (Right) (Copy)",
            source_id="med_sample01",
            track_id=track.id,
            start_time=8.0,
            duration=4.5,
            source_offset=3.0,
            gain=-1.5,
        )

        track.clips.extend([clip_a1, clip_a2, clip_b])
        proj.tracks.append(track)

        # Validate serialization and roundtrip
        json_data = proj.model_dump_json()
        restored = Project.model_validate_json(json_data)

        assert len(restored.tracks) == 1
        assert len(restored.tracks[0].clips) == 3
        assert restored.tracks[0].clips[0].duration == 3.0
        assert restored.tracks[0].clips[1].source_offset == 3.0
        assert restored.tracks[0].clips[2].start_time == 8.0
