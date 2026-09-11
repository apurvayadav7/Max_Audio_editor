/**
 * Parameter Automation Engine
 * 
 * Supports multi-lane sample-accurate curve automation for:
 * - Track Volume (-60 dB to +12 dB)
 * - Track Pan (-1.0 to +1.0)
 * - Insert Effect Parameters (e.g. Cutoff, Drive, Reverb Mix)
 */

import { bus } from "../core/event-bus.js";
import { store } from "../state/store.js";
import { audioEngine } from "../audio/engine.js";

export class AutomationEngine {
  constructor() {
    // Map of trackId -> { [paramName]: { points: [{ id, time, value, curve }], isVisible, min, max, defaultVal } }
    this.lanes = new Map();
    this.activeParam = "volume"; // Currently selected visible parameter lane
    this.hoverPoint = null;
    this.dragPoint = null;
  }

  init() {
    bus.on("project:loaded", (project) => {
      this.initProjectLanes(project);
    });

    bus.on("track:added", (track) => {
      this.initTrackLanes(track);
    });

    bus.on("track:removed", (trackId) => {
      this.lanes.delete(trackId);
    });

    bus.on("transport:seek", (time) => {
      this.syncAllParametersToTime(time);
    });
  }

  initProjectLanes(project) {
    this.lanes.clear();
    if (!project || !project.tracks) return;
    project.tracks.forEach((track) => {
      this.initTrackLanes(track);
    });
  }

  initTrackLanes(track) {
    if (!this.lanes.has(track.id)) {
      this.lanes.set(track.id, {
        isExpanded: false,
        activeParam: "volume",
        params: {
          volume: {
            name: "Volume",
            min: -60,
            max: 12,
            defaultVal: track.volume ?? 0.0,
            unit: "dB",
            points: [],
          },
          pan: {
            name: "Pan",
            min: -1.0,
            max: 1.0,
            defaultVal: track.pan ?? 0.0,
            unit: "",
            points: [],
          },
        },
      });
    }

    // Load any existing automation from project state
    if (track.automation_lanes && Array.isArray(track.automation_lanes)) {
      const trackLanes = this.lanes.get(track.id);
      track.automation_lanes.forEach((lane) => {
        if (trackLanes.params[lane.parameter]) {
          trackLanes.params[lane.parameter].points = (lane.points || []).map((p) => ({
            id: p.id || `pt_${Math.random().toString(36).substring(2, 9)}`,
            time: p.time,
            value: p.value,
            curve: p.curve || "linear",
          }));
        }
      });
    }
  }

  getTrackLane(trackId) {
    return this.lanes.get(trackId);
  }

  toggleLaneExpanded(trackId) {
    const lane = this.lanes.get(trackId);
    if (lane) {
      lane.isExpanded = !lane.isExpanded;
      bus.emit("automation:visibility-changed", { trackId, isExpanded: lane.isExpanded });
      return lane.isExpanded;
    }
    return false;
  }

  setActiveParam(trackId, paramName) {
    const lane = this.lanes.get(trackId);
    if (lane && lane.params[paramName]) {
      lane.activeParam = paramName;
      bus.emit("automation:param-changed", { trackId, paramName });
    }
  }

  addPoint(trackId, paramName, time, value) {
    const lane = this.lanes.get(trackId);
    if (!lane || !lane.params[paramName]) return null;

    const paramConfig = lane.params[paramName];
    const clampedVal = Math.max(paramConfig.min, Math.min(paramConfig.max, value));
    const clampedTime = Math.max(0, time);

    const point = {
      id: `pt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      time: clampedTime,
      value: clampedVal,
      curve: "linear",
    };

    paramConfig.points.push(point);
    paramConfig.points.sort((a, b) => a.time - b.time);

    bus.emit("automation:point-added", { trackId, paramName, point });
    return point;
  }

  movePoint(trackId, paramName, pointId, newTime, newValue) {
    const lane = this.lanes.get(trackId);
    if (!lane || !lane.params[paramName]) return;

    const paramConfig = lane.params[paramName];
    const pt = paramConfig.points.find((p) => p.id === pointId);
    if (!pt) return;

    pt.time = Math.max(0, newTime);
    pt.value = Math.max(paramConfig.min, Math.min(paramConfig.max, newValue));
    paramConfig.points.sort((a, b) => a.time - b.time);

    bus.emit("automation:point-moved", { trackId, paramName, point: pt });
  }

  deletePoint(trackId, paramName, pointId) {
    const lane = this.lanes.get(trackId);
    if (!lane || !lane.params[paramName]) return;

    const paramConfig = lane.params[paramName];
    const idx = paramConfig.points.findIndex((p) => p.id === pointId);
    if (idx !== -1) {
      const removed = paramConfig.points.splice(idx, 1)[0];
      bus.emit("automation:point-deleted", { trackId, paramName, point: removed });
    }
  }

  getValueAtTime(trackId, paramName, time) {
    const lane = this.lanes.get(trackId);
    if (!lane || !lane.params[paramName]) return null;

    const paramConfig = lane.params[paramName];
    const points = paramConfig.points;

    if (!points || points.length === 0) {
      return paramConfig.defaultVal;
    }

    if (time <= points[0].time) {
      return points[0].value;
    }

    if (time >= points[points.length - 1].time) {
      return points[points.length - 1].value;
    }

    // Binary search or linear scan for bracket
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (time >= p1.time && time <= p2.time) {
        const span = p2.time - p1.time;
        if (span <= 0.0001) return p2.value;
        const norm = (time - p1.time) / span;
        return p1.value + (p2.value - p1.value) * norm;
      }
    }

    return paramConfig.defaultVal;
  }

  syncAllParametersToTime(time) {
    if (!audioEngine.isInitialized) return;

    for (const [trackId, lane] of this.lanes.entries()) {
      for (const [paramName, config] of Object.entries(lane.params)) {
        if (config.points.length > 0) {
          const val = this.getValueAtTime(trackId, paramName, time);
          this.applyValueToEngine(trackId, paramName, val);
        }
      }
    }
  }

  applyValueToEngine(trackId, paramName, val) {
    if (paramName === "volume") {
      audioEngine.setTrackVolume(trackId, val);
    } else if (paramName === "pan") {
      audioEngine.setTrackPan(trackId, val);
    }
  }
}

export const automationEngine = new AutomationEngine();
