/**
 * Audio Clip Edit Commands — Non-destructive timeline slice, move, trim, duplicate, gain, and delete.
 */

import { Command } from "./manager.js";
import { store } from "../state/store.js";
import { bus } from "../core/event-bus.js";
import { audioEngine } from "../audio/engine.js";

function getProject() {
  const { project } = store.getState();
  if (!project) throw new Error("No active project found");
  return project;
}

function findTrackAndClip(trackId, clipId) {
  const project = getProject();
  let foundTrack = null;
  let foundClip = null;
  let clipIndex = -1;

  for (const track of project.tracks) {
    if (!trackId || track.id === trackId) {
      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx !== -1) {
        foundTrack = track;
        foundClip = track.clips[idx];
        clipIndex = idx;
        break;
      }
    }
  }

  if (!foundClip) throw new Error(`Clip '${clipId}' not found on track '${trackId}'`);
  return { project, track: foundTrack, clip: foundClip, index: clipIndex };
}

/**
 * SplitClipCommand: Splits a clip at playhead time into two non-destructive slices.
 */
export class SplitClipCommand extends Command {
  constructor(trackId, clipId, splitTime) {
    super(`Split Clip at ${splitTime.toFixed(2)}s`);
    this.trackId = trackId;
    this.clipId = clipId;
    this.splitTime = splitTime;
    this.originalDuration = null;
    this.originalFadeOut = null;
    this.createdRightClip = null;
  }

  async execute() {
    const { project, track, clip, index } = findTrackAndClip(this.trackId, this.clipId);

    const clipStart = clip.start_time;
    const clipEnd = clip.start_time + clip.duration;

    if (this.splitTime <= clipStart || this.splitTime >= clipEnd) {
      throw new Error(`Split time ${this.splitTime.toFixed(2)}s is outside clip boundaries [${clipStart.toFixed(2)}s, ${clipEnd.toFixed(2)}s]`);
    }

    const splitOffset = this.splitTime - clipStart;
    this.originalDuration = clip.duration;
    this.originalFadeOut = clip.fade_out || 0.0;

    // 1. Shrink left slice
    clip.duration = splitOffset;
    clip.fade_out = 0.0;

    // 2. Create right slice
    const stretch = clip.stretch_ratio || 1.0;
    const rightOffset = (clip.source_offset || 0.0) + splitOffset * stretch;
    const rightDuration = this.originalDuration - splitOffset;

    this.createdRightClip = {
      id: `clp_${Math.random().toString(36).substr(2, 8)}`,
      name: `${clip.name} (R)`,
      source_id: clip.source_id,
      track_id: track.id,
      start_time: this.splitTime,
      duration: rightDuration,
      source_offset: rightOffset,
      gain: clip.gain || 0.0,
      fade_in: 0.0,
      fade_out: this.originalFadeOut,
      stretch_ratio: stretch,
      pitch_semitones: clip.pitch_semitones || 0.0,
      is_muted: clip.is_muted || false,
      is_reversed: clip.is_reversed || false,
    };

    track.clips.splice(index + 1, 0, this.createdRightClip);
    bus.emit("project:loaded", project);
  }

  async undo() {
    const { project, track, clip } = findTrackAndClip(this.trackId, this.clipId);

    // Remove right clip
    if (this.createdRightClip) {
      const rightIdx = track.clips.findIndex((c) => c.id === this.createdRightClip.id);
      if (rightIdx !== -1) {
        track.clips.splice(rightIdx, 1);
      }
    }

    // Restore left clip
    clip.duration = this.originalDuration;
    clip.fade_out = this.originalFadeOut;

    bus.emit("project:loaded", project);
  }
}

/**
 * MoveClipCommand: Move clip across time or tracks.
 */
export class MoveClipCommand extends Command {
  constructor(clipId, fromTrackId, toTrackId, oldStartTime, newStartTime) {
    super(`Move Clip to ${newStartTime.toFixed(2)}s`);
    this.clipId = clipId;
    this.fromTrackId = fromTrackId;
    this.toTrackId = toTrackId || fromTrackId;
    this.oldStartTime = oldStartTime;
    this.newStartTime = Math.max(0.0, newStartTime);
  }

  async execute() {
    const { project } = findTrackAndClip(this.fromTrackId, this.clipId);
    const sourceTrack = project.tracks.find((t) => t.id === this.fromTrackId);
    const destTrack = project.tracks.find((t) => t.id === this.toTrackId);

    if (!sourceTrack || !destTrack) throw new Error("Source or destination track not found");

    const clipIdx = sourceTrack.clips.findIndex((c) => c.id === this.clipId);
    if (clipIdx === -1) throw new Error("Clip not found on source track");

    const [clip] = sourceTrack.clips.splice(clipIdx, 1);
    clip.start_time = this.newStartTime;
    clip.track_id = destTrack.id;
    destTrack.clips.push(clip);

    bus.emit("project:loaded", project);
  }

  async undo() {
    const { project } = findTrackAndClip(this.toTrackId, this.clipId);
    const sourceTrack = project.tracks.find((t) => t.id === this.fromTrackId);
    const destTrack = project.tracks.find((t) => t.id === this.toTrackId);

    const clipIdx = destTrack.clips.findIndex((c) => c.id === this.clipId);
    if (clipIdx === -1) throw new Error("Clip not found on dest track for undo");

    const [clip] = destTrack.clips.splice(clipIdx, 1);
    clip.start_time = this.oldStartTime;
    clip.track_id = sourceTrack.id;
    sourceTrack.clips.push(clip);

    bus.emit("project:loaded", project);
  }
}

/**
 * TrimClipCommand: Slips start (left edge) or trims duration (right edge).
 */
export class TrimClipCommand extends Command {
  constructor(trackId, clipId, edge, oldState, newState) {
    super(`Trim ${edge === "left" ? "Start" : "End"}`);
    this.trackId = trackId;
    this.clipId = clipId;
    this.edge = edge;
    this.oldState = { ...oldState };
    this.newState = { ...newState };
  }

  async execute() {
    const { project, clip } = findTrackAndClip(this.trackId, this.clipId);
    clip.start_time = this.newState.start_time;
    clip.source_offset = this.newState.source_offset;
    clip.duration = this.newState.duration;
    bus.emit("project:loaded", project);
  }

  async undo() {
    const { project, clip } = findTrackAndClip(this.trackId, this.clipId);
    clip.start_time = this.oldState.start_time;
    clip.source_offset = this.oldState.source_offset;
    clip.duration = this.oldState.duration;
    bus.emit("project:loaded", project);
  }
}

/**
 * DuplicateClipCommand: Duplicates a clip at next position or specified time.
 */
export class DuplicateClipCommand extends Command {
  constructor(trackId, clipId, newStartTime = null) {
    super("Duplicate Clip");
    this.trackId = trackId;
    this.clipId = clipId;
    this.newStartTime = newStartTime;
    this.duplicatedClip = null;
  }

  async execute() {
    const { project, track, clip, index } = findTrackAndClip(this.trackId, this.clipId);

    const startTime = this.newStartTime !== null ? this.newStartTime : clip.start_time + clip.duration;

    this.duplicatedClip = {
      ...clip,
      id: `clp_${Math.random().toString(36).substr(2, 8)}`,
      name: `${clip.name} (Copy)`,
      start_time: startTime,
    };

    track.clips.splice(index + 1, 0, this.duplicatedClip);
    bus.emit("project:loaded", project);
  }

  async undo() {
    const { project, track } = findTrackAndClip(this.trackId, this.clipId);
    if (this.duplicatedClip) {
      const idx = track.clips.findIndex((c) => c.id === this.duplicatedClip.id);
      if (idx !== -1) {
        track.clips.splice(idx, 1);
      }
    }
    bus.emit("project:loaded", project);
  }
}

/**
 * DeleteClipCommand: Non-destructively removes a clip, with complete restore on undo.
 */
export class DeleteClipCommand extends Command {
  constructor(trackId, clipId) {
    super("Delete Clip");
    this.trackId = trackId;
    this.clipId = clipId;
    this.deletedClip = null;
    this.originalIndex = -1;
  }

  async execute() {
    const { project, track, clip, index } = findTrackAndClip(this.trackId, this.clipId);
    this.deletedClip = { ...clip };
    this.originalIndex = index;

    track.clips.splice(index, 1);
    bus.emit("project:loaded", project);
  }

  async undo() {
    const project = getProject();
    const track = project.tracks.find((t) => t.id === this.trackId);
    if (!track) throw new Error("Track not found for delete undo");

    if (this.deletedClip) {
      const insertAt = Math.min(this.originalIndex, track.clips.length);
      track.clips.splice(insertAt, 0, this.deletedClip);
    }
    bus.emit("project:loaded", project);
  }
}

/**
 * ClipGainCommand: Adjusts clip gain in dB.
 */
export class ClipGainCommand extends Command {
  constructor(trackId, clipId, oldGain, newGain) {
    super(`Clip Gain: ${newGain > 0 ? "+" : ""}${newGain.toFixed(1)} dB`);
    this.trackId = trackId;
    this.clipId = clipId;
    this.oldGain = oldGain;
    this.newGain = newGain;
  }

  async execute() {
    const { project, clip } = findTrackAndClip(this.trackId, this.clipId);
    clip.gain = this.newGain;
    audioEngine.setClipGain(this.clipId, this.newGain);
    bus.emit("project:loaded", project);
  }

  async undo() {
    const { project, clip } = findTrackAndClip(this.trackId, this.clipId);
    clip.gain = this.oldGain;
    audioEngine.setClipGain(this.clipId, this.oldGain);
    bus.emit("project:loaded", project);
  }
}

/**
 * ClipFadeCommand: Adjusts fade in or fade out.
 */
export class ClipFadeCommand extends Command {
  constructor(trackId, clipId, fadeType, oldVal, newVal) {
    super(`Fade ${fadeType === "fade_in" ? "In" : "Out"}: ${newVal.toFixed(2)}s`);
    this.trackId = trackId;
    this.clipId = clipId;
    this.fadeType = fadeType; // 'fade_in' | 'fade_out'
    this.oldVal = oldVal;
    this.newVal = newVal;
  }

  async execute() {
    const { project, clip } = findTrackAndClip(this.trackId, this.clipId);
    clip[this.fadeType] = this.newVal;
    bus.emit("project:loaded", project);
  }

  async undo() {
    const { project, clip } = findTrackAndClip(this.trackId, this.clipId);
    clip[this.fadeType] = this.oldVal;
    bus.emit("project:loaded", project);
  }
}

/**
 * ClipRenameCommand: Renames a clip.
 */
export class ClipRenameCommand extends Command {
  constructor(trackId, clipId, oldName, newName) {
    super(`Rename Clip to '${newName}'`);
    this.trackId = trackId;
    this.clipId = clipId;
    this.oldName = oldName;
    this.newName = newName;
  }

  async execute() {
    const { project, clip } = findTrackAndClip(this.trackId, this.clipId);
    clip.name = this.newName;
    bus.emit("project:loaded", project);
  }

  async undo() {
    const { project, clip } = findTrackAndClip(this.trackId, this.clipId);
    clip.name = this.oldName;
    bus.emit("project:loaded", project);
  }
}
