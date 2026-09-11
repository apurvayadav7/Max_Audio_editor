/**
 * Track & Project Level Commands
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

export class TrackVolumeCommand extends Command {
  constructor(trackId, oldVol, newVol) {
    super(`Track Volume: ${newVol.toFixed(1)} dB`);
    this.trackId = trackId;
    this.oldVol = oldVol;
    this.newVol = newVol;
  }

  async execute() {
    const project = getProject();
    const track = project.tracks.find((t) => t.id === this.trackId);
    if (track) {
      track.volume = this.newVol;
      audioEngine.setTrackVolume(this.trackId, this.newVol, project.tracks);
    }
    bus.emit("project:loaded", project);
  }

  async undo() {
    const project = getProject();
    const track = project.tracks.find((t) => t.id === this.trackId);
    if (track) {
      track.volume = this.oldVol;
      audioEngine.setTrackVolume(this.trackId, this.oldVol, project.tracks);
    }
    bus.emit("project:loaded", project);
  }
}

export class TrackPanCommand extends Command {
  constructor(trackId, oldPan, newPan) {
    super(`Track Pan: ${newPan}`);
    this.trackId = trackId;
    this.oldPan = oldPan;
    this.newPan = newPan;
  }

  async execute() {
    const project = getProject();
    const track = project.tracks.find((t) => t.id === this.trackId);
    if (track) {
      track.pan = this.newPan;
      audioEngine.setTrackPan(this.trackId, this.newPan);
    }
    bus.emit("project:loaded", project);
  }

  async undo() {
    const project = getProject();
    const track = project.tracks.find((t) => t.id === this.trackId);
    if (track) {
      track.pan = this.oldPan;
      audioEngine.setTrackPan(this.trackId, this.oldPan);
    }
    bus.emit("project:loaded", project);
  }
}

export class TrackMuteCommand extends Command {
  constructor(trackId, oldState, newState) {
    super(newState ? "Mute Track" : "Unmute Track");
    this.trackId = trackId;
    this.oldState = oldState;
    this.newState = newState;
  }

  async execute() {
    const project = getProject();
    const track = project.tracks.find((t) => t.id === this.trackId);
    if (track) {
      track.is_muted = this.newState;
      audioEngine.setTrackMute(this.trackId, this.newState, project.tracks);
    }
    bus.emit("project:loaded", project);
  }

  async undo() {
    const project = getProject();
    const track = project.tracks.find((t) => t.id === this.trackId);
    if (track) {
      track.is_muted = this.oldState;
      audioEngine.setTrackMute(this.trackId, this.oldState, project.tracks);
    }
    bus.emit("project:loaded", project);
  }
}

export class TrackSoloCommand extends Command {
  constructor(trackId, oldState, newState) {
    super(newState ? "Solo Track" : "Unsolo Track");
    this.trackId = trackId;
    this.oldState = oldState;
    this.newState = newState;
  }

  async execute() {
    const project = getProject();
    const track = project.tracks.find((t) => t.id === this.trackId);
    if (track) {
      track.is_soloed = this.newState;
      audioEngine.setTrackSolo(this.trackId, this.newState, project.tracks);
    }
    bus.emit("project:loaded", project);
  }

  async undo() {
    const project = getProject();
    const track = project.tracks.find((t) => t.id === this.trackId);
    if (track) {
      track.is_soloed = this.oldState;
      audioEngine.setTrackSolo(this.trackId, this.oldState, project.tracks);
    }
    bus.emit("project:loaded", project);
  }
}

export class AddTrackCommand extends Command {
  constructor(trackData) {
    super(`Add Track '${trackData.name}'`);
    this.trackData = trackData;
  }

  async execute() {
    const project = getProject();
    project.tracks.push(this.trackData);
    bus.emit("project:loaded", project);
  }

  async undo() {
    const project = getProject();
    const idx = project.tracks.findIndex((t) => t.id === this.trackData.id);
    if (idx !== -1) {
      project.tracks.splice(idx, 1);
    }
    bus.emit("project:loaded", project);
  }
}

export class RemoveTrackCommand extends Command {
  constructor(trackId) {
    super("Remove Track");
    this.trackId = trackId;
    this.savedTrack = null;
    this.savedIndex = -1;
  }

  async execute() {
    const project = getProject();
    const idx = project.tracks.findIndex((t) => t.id === this.trackId);
    if (idx !== -1) {
      this.savedTrack = { ...project.tracks[idx] };
      this.savedIndex = idx;
      project.tracks.splice(idx, 1);
    }
    bus.emit("project:loaded", project);
  }

  async undo() {
    const project = getProject();
    if (this.savedTrack) {
      project.tracks.splice(this.savedIndex, 0, this.savedTrack);
    }
    bus.emit("project:loaded", project);
  }
}
