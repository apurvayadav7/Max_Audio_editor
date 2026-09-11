/**
 * Master Multi-Track Timeline Controller
 * Canvas rendering, virtual viewport, clip dragging/trimming, split/delete commands, and undo/redo shortcuts.
 */

import { TimelineCoordinate } from "./coordinate.js";
import { TimelineRuler } from "./ruler.js";
import { TimelineGrid } from "./grid.js";
import { ClipView } from "./clip-view.js";
import { bus } from "../core/event-bus.js";
import { store } from "../state/store.js";
import { api } from "../api/client.js";
import { projectManager } from "../state/project.js";
import { commandManager } from "../commands/manager.js";
import {
  SplitClipCommand,
  MoveClipCommand,
  TrimClipCommand,
  DuplicateClipCommand,
  DeleteClipCommand,
} from "../commands/clip-commands.js";
import { AddTrackCommand } from "../commands/track-commands.js";
import { automationEngine } from "./automation.js";

export class TimelineController {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.ruler = null;
    this.zoom = 80; // pixels per second
    this.playheadPos = 0.0;
    this.dpr = window.devicePixelRatio || 1;
    this.selectedClipId = null;
    this.selectedTrackId = null;
    this.waveformCache = new Map();
    this.trackHeight = 110;
    this.trackSpacing = 10;

    // Interaction state
    this.dragMode = null; // null | 'move' | 'trim-left' | 'trim-right'
    this.dragTarget = null; // { clip, track, initialStartTime, initialDuration, initialOffset, startMouseX, startMouseY }
    this.hoverEdge = null;
  }

  init() {
    this.canvas = document.getElementById("timeline-canvas");
    const rulerCanvas = document.getElementById("ruler-canvas");
    if (!this.canvas || !rulerCanvas) return;

    this.ctx = this.canvas.getContext("2d");
    this.ruler = new TimelineRuler(rulerCanvas);

    this.bindEvents();
    this.handleResize();
    window.addEventListener("resize", () => this.handleResize());

    this.render();
  }

  bindEvents() {
    // Transport sync
    bus.on("transport:tick", (pos) => {
      this.playheadPos = pos;
      automationEngine.syncAllParametersToTime(pos);
      this.render();
    });

    bus.on("transport:seeked", (pos) => {
      this.playheadPos = pos;
      this.render();
    });

    bus.on("project:loaded", () => {
      this.preloadWaveforms();
      this.render();
    });

    // Split request handler
    bus.on("clip:request-split", ({ trackId, clipId, splitTime }) => {
      this.splitClipAt(trackId, clipId, splitTime);
    });

    // Zooming with Wheel (Ctrl + Wheel or Trackpad Pinch)
    this.canvas.addEventListener("wheel", (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const zoomDelta = e.deltaY < 0 ? 1.15 : 0.85;
        this.setZoom(this.zoom * zoomDelta);
      }
    });

    // Mouse interactions: selection, move, trim, cursor styling
    this.canvas.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    this.canvas.addEventListener("mousedown", (e) => this.handleMouseDown(e));
    window.addEventListener("mouseup", (e) => this.handleMouseUp(e));

    // Global timeline keyboard shortcuts
    window.addEventListener("keydown", (e) => this.handleKeyDown(e));
  }

  getSnapMode() {
    const select = document.getElementById("select-snap");
    return select ? select.value : "1/4";
  }

  getBpm() {
    const { project } = store.getState();
    return project ? project.tempo || 120.0 : 120.0;
  }

  handleMouseMove(e) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (this.dragMode === "auto-point" && this.dragTarget) {
      const { trackId, paramName, point, autoY, autoH, paramConfig } = this.dragTarget;
      const newTime = TimelineCoordinate.pixelToTime(mouseX, this.zoom);
      const norm = 1.0 - Math.max(0, Math.min(autoH, mouseY - autoY)) / autoH;
      const newVal = paramConfig.min + norm * (paramConfig.max - paramConfig.min);
      automationEngine.movePoint(trackId, paramName, point.id, newTime, newVal);
      this.render();
      return;
    }

    if (this.dragMode && this.dragTarget) {
      this.handleDragMove(mouseX, mouseY);
      return;
    }

    // Hover hit test for cursor styling
    const hit = this.hitTestClipsDetailed(mouseX, mouseY);
    if (hit) {
      if (hit.edge === "left" || hit.edge === "right") {
        this.canvas.style.cursor = "col-resize";
        this.hoverEdge = hit.edge;
      } else {
        this.canvas.style.cursor = "grab";
        this.hoverEdge = null;
      }
    } else {
      this.canvas.style.cursor = "default";
      this.hoverEdge = null;
    }
  }

  handleMouseDown(e) {
    if (e.button !== 0) return; // Left click only
    const rect = this.canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const { project } = store.getState();
    if (project && project.tracks) {
      // Check if clicked in an automation sub-lane
      for (let i = 0; i < project.tracks.length; i++) {
        const track = project.tracks[i];
        const layout = this.getTrackLayout(i);
        if (layout.isAuto && clickY >= layout.y + 110 && clickY <= layout.y + layout.height) {
          const lane = automationEngine.getTrackLane(track.id);
          const activeParam = lane ? lane.activeParam : "volume";
          const paramConfig = lane ? lane.params[activeParam] : null;
          if (paramConfig) {
            const autoY = layout.y + 110;
            const autoH = 40;
            const time = TimelineCoordinate.pixelToTime(clickX, this.zoom);
            const norm = 1.0 - Math.max(0, Math.min(autoH, clickY - autoY)) / autoH;
            const val = paramConfig.min + norm * (paramConfig.max - paramConfig.min);

            // Check if clicked near an existing point (within 10px)
            const nearPt = paramConfig.points.find((p) => {
              const px = TimelineCoordinate.timeToPixel(p.time, this.zoom);
              const py = autoY + autoH - ((p.value - paramConfig.min) / (paramConfig.max - paramConfig.min)) * autoH;
              return Math.abs(px - clickX) <= 10 && Math.abs(py - clickY) <= 10;
            });

            if (e.altKey && nearPt) {
              automationEngine.deletePoint(track.id, activeParam, nearPt.id);
            } else if (nearPt) {
              this.dragMode = "auto-point";
              this.dragTarget = { trackId: track.id, paramName: activeParam, point: nearPt, autoY, autoH, paramConfig };
            } else {
              const newPt = automationEngine.addPoint(track.id, activeParam, time, val);
              this.dragMode = "auto-point";
              this.dragTarget = { trackId: track.id, paramName: activeParam, point: newPt, autoY, autoH, paramConfig };
            }
            this.render();
            return;
          }
        }
      }
    }

    const hit = this.hitTestClipsDetailed(clickX, clickY);
    if (hit) {
      this.selectedClipId = hit.clip.id;
      this.selectedTrackId = hit.track.id;
      bus.emit("clip:selected", hit.clip);

      // Start drag / trim operation
      this.dragMode = hit.edge === "left" ? "trim-left" : hit.edge === "right" ? "trim-right" : "move";
      this.dragTarget = {
        clip: hit.clip,
        track: hit.track,
        initialStartTime: hit.clip.start_time,
        initialDuration: hit.clip.duration,
        initialOffset: hit.clip.source_offset || 0.0,
        startMouseX: clickX,
        startMouseY: clickY,
      };

      this.canvas.style.cursor = hit.edge === "body" ? "grabbing" : "col-resize";
    } else {
      this.selectedClipId = null;
      this.selectedTrackId = null;
      bus.emit("clip:deselected");

      // Click on background seeks playhead
      const targetTime = TimelineCoordinate.pixelToTime(clickX, this.zoom);
      bus.emit("transport:seek", targetTime);
    }
    this.render();
  }

  handleDragMove(mouseX, mouseY) {
    if (!this.dragTarget || !this.dragMode) return;

    const deltaX = mouseX - this.dragTarget.startMouseX;
    const deltaTime = TimelineCoordinate.pixelToTime(deltaX, this.zoom);
    const snapMode = this.getSnapMode();
    const bpm = this.getBpm();
    const clip = this.dragTarget.clip;

    if (this.dragMode === "move") {
      let candidateStart = this.dragTarget.initialStartTime + deltaTime;
      if (snapMode !== "free") {
        candidateStart = TimelineCoordinate.snapTimeToGrid(candidateStart, bpm, snapMode);
      }
      clip.start_time = Math.max(0.0, candidateStart);
    } else if (this.dragMode === "trim-left") {
      let candidateStart = this.dragTarget.initialStartTime + deltaTime;
      if (snapMode !== "free") {
        candidateStart = TimelineCoordinate.snapTimeToGrid(candidateStart, bpm, snapMode);
      }
      const actualShift = candidateStart - this.dragTarget.initialStartTime;
      const newDuration = this.dragTarget.initialDuration - actualShift;

      if (newDuration >= 0.1 && candidateStart >= 0.0) {
        clip.start_time = candidateStart;
        clip.source_offset = Math.max(0.0, this.dragTarget.initialOffset + actualShift * (clip.stretch_ratio || 1.0));
        clip.duration = newDuration;
      }
    } else if (this.dragMode === "trim-right") {
      let candidateEnd = this.dragTarget.initialStartTime + this.dragTarget.initialDuration + deltaTime;
      if (snapMode !== "free") {
        candidateEnd = TimelineCoordinate.snapTimeToGrid(candidateEnd, bpm, snapMode);
      }
      const newDuration = candidateEnd - clip.start_time;
      if (newDuration >= 0.1) {
        clip.duration = newDuration;
      }
    }

    this.render();
  }

  async handleMouseUp(e) {
    if (this.dragMode === "auto-point") {
      this.dragMode = null;
      this.dragTarget = null;
      this.canvas.style.cursor = "default";
      return;
    }

    if (!this.dragMode || !this.dragTarget) return;

    const target = this.dragTarget;
    const clip = target.clip;
    const track = target.track;
    const mode = this.dragMode;

    this.dragMode = null;
    this.dragTarget = null;
    this.canvas.style.cursor = "default";

    // Commit commands if values actually changed
    if (mode === "move") {
      if (Math.abs(clip.start_time - target.initialStartTime) > 0.005) {
        const newStart = clip.start_time;
        clip.start_time = target.initialStartTime; // Reset before command executes
        await commandManager.execute(new MoveClipCommand(clip.id, track.id, track.id, target.initialStartTime, newStart));
      }
    } else if (mode === "trim-left" || mode === "trim-right") {
      const oldState = {
        start_time: target.initialStartTime,
        source_offset: target.initialOffset,
        duration: target.initialDuration,
      };
      const newState = {
        start_time: clip.start_time,
        source_offset: clip.source_offset || 0.0,
        duration: clip.duration,
      };

      if (
        Math.abs(newState.start_time - oldState.start_time) > 0.005 ||
        Math.abs(newState.duration - oldState.duration) > 0.005
      ) {
        // Reset before command execution
        clip.start_time = oldState.start_time;
        clip.source_offset = oldState.source_offset;
        clip.duration = oldState.duration;
        await commandManager.execute(new TrimClipCommand(track.id, clip.id, mode === "trim-left" ? "left" : "right", oldState, newState));
      }
    }

    this.render();
  }

  handleKeyDown(e) {
    // Ignore keystrokes when typing inside inputs
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    // Undo: Ctrl+Z or Cmd+Z
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      commandManager.undo();
      return;
    }

    // Redo: Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z
    if (
      ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
    ) {
      e.preventDefault();
      commandManager.redo();
      return;
    }

    // Split: S key
    if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      this.splitSelectedClipAtPlayhead();
      return;
    }

    // Duplicate: Ctrl+D
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      this.duplicateSelectedClip();
      return;
    }

    // Delete: Delete or Backspace
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.deleteSelectedClip();
      return;
    }
  }

  async splitSelectedClipAtPlayhead() {
    if (!this.selectedClipId) {
      console.warn("[Timeline] No clip selected to split");
      return;
    }
    await this.splitClipAt(this.selectedTrackId, this.selectedClipId, this.playheadPos);
  }

  async splitClipAt(trackId, clipId, splitTime) {
    try {
      await commandManager.execute(new SplitClipCommand(trackId, clipId, splitTime));
    } catch (err) {
      console.warn(`[Timeline] Could not split clip: ${err.message}`);
    }
  }

  async duplicateSelectedClip() {
    if (!this.selectedClipId) return;
    try {
      await commandManager.execute(new DuplicateClipCommand(this.selectedTrackId, this.selectedClipId));
    } catch (err) {
      console.error("[Timeline] Could not duplicate clip:", err);
    }
  }

  async deleteSelectedClip() {
    if (!this.selectedClipId) return;
    const clipId = this.selectedClipId;
    const trackId = this.selectedTrackId;
    this.selectedClipId = null;
    this.selectedTrackId = null;
    bus.emit("clip:deselected");

    try {
      await commandManager.execute(new DeleteClipCommand(trackId, clipId));
    } catch (err) {
      console.error("[Timeline] Could not delete clip:", err);
    }
  }

  setZoom(newZoom) {
    this.zoom = Math.min(Math.max(15, newZoom), 600);
    this.handleResize();
  }

  getTrackLayout(index) {
    const { project } = store.getState();
    if (!project || !project.tracks) return { y: 16, height: 110, isAuto: false };
    let currentY = 16;
    for (let i = 0; i < index; i++) {
      const t = project.tracks[i];
      const isAuto = automationEngine.getTrackLane(t.id)?.isExpanded;
      currentY += (isAuto ? 150 : 110) + this.trackSpacing;
    }
    const currentTrack = project.tracks[index];
    const isAuto = currentTrack ? automationEngine.getTrackLane(currentTrack.id)?.isExpanded : false;
    return { y: currentY, height: isAuto ? 150 : 110, isAuto };
  }

  handleResize() {
    if (!this.canvas) return;

    const viewport = document.getElementById("timeline-viewport");
    const rulerEl = document.getElementById("timeline-ruler");

    const w = Math.max(viewport.clientWidth, 2500);
    const { project } = store.getState();
    let totalTrackHeight = 30;
    if (project && project.tracks && project.tracks.length > 0) {
      for (let i = 0; i < project.tracks.length; i++) {
        totalTrackHeight += this.getTrackLayout(i).height + this.trackSpacing;
      }
    } else {
      totalTrackHeight = 30 + 3 * (this.trackHeight + this.trackSpacing);
    }

    const h = Math.max(viewport.clientHeight, totalTrackHeight);
    const rh = rulerEl.clientHeight || 28;

    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const rulerCanvas = document.getElementById("ruler-canvas");
    if (rulerCanvas) {
      rulerCanvas.width = w * this.dpr;
      rulerCanvas.height = rh * this.dpr;
      rulerCanvas.style.width = `${w}px`;
      rulerCanvas.style.height = `${rh}px`;
    }

    this.render();
  }

  async preloadWaveforms() {
    const { project } = store.getState();
    if (!project || !project.tracks) return;

    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (!this.waveformCache.has(clip.source_id)) {
          try {
            const data = await api.request(`/api/projects/${project.id}/media/${clip.source_id}/waveform`);
            this.waveformCache.set(clip.source_id, data);
            this.render();
          } catch (e) {
            console.error(`[Timeline] Error loading waveform for ${clip.source_id}:`, e);
          }
        }
      }
    }
  }

  hitTestClipsDetailed(clickX, clickY) {
    const { project } = store.getState();
    if (!project || !project.tracks) return null;

    for (let i = 0; i < project.tracks.length; i++) {
      const track = project.tracks[i];
      const { y: trackY } = this.getTrackLayout(i);

      for (const clip of track.clips) {
        const edge = ClipView.hitTestEdge(clip, clickX, clickY, trackY, 110, this.zoom, 10);
        if (edge) {
          return { clip, track, edge };
        }
      }
    }
    return null;
  }

  render() {
    const { project } = store.getState();
    const bpm = this.getBpm();

    // 1. Render Ruler
    if (this.ruler) {
      this.ruler.render(this.playheadPos, this.zoom, bpm);
    }

    // 2. Render Timeline
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dpr = this.dpr;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#0e1117";
    ctx.fillRect(0, 0, w, h);

    // Musical Grid
    TimelineGrid.drawGrid(ctx, w, h, this.zoom, bpm, 4);

    // Track Lanes, Clips, and Automation Curves
    if (project && project.tracks && project.tracks.length > 0) {
      project.tracks.forEach((track, i) => {
        const { y: trackY, height: totalTrackHeight, isAuto } = this.getTrackLayout(i);
        const clipAreaHeight = 110;

        // Track Lane Box
        ctx.fillStyle = "#161b22";
        ctx.strokeStyle = "#30363d";
        ctx.lineWidth = 1;
        ctx.fillRect(0, trackY, w, totalTrackHeight);
        ctx.strokeRect(0, trackY, w, totalTrackHeight);

        // Render Clips on this Track
        track.clips.forEach((clip) => {
          const peaks = this.waveformCache.get(clip.source_id);
          const isSelected = clip.id === this.selectedClipId;
          ClipView.drawClip(ctx, clip, track.color, peaks, trackY, clipAreaHeight, this.zoom, isSelected, isSelected ? this.hoverEdge : null);
        });

        // If Automation Lane is Expanded, Draw Automation Curve & Points
        if (isAuto) {
          const autoY = trackY + clipAreaHeight;
          const autoH = 40;

          // Sub-lane Background
          ctx.fillStyle = "#0a0e14";
          ctx.fillRect(0, autoY, w, autoH);
          ctx.strokeStyle = "rgba(0, 240, 255, 0.25)";
          ctx.beginPath();
          ctx.moveTo(0, autoY);
          ctx.lineTo(w, autoY);
          ctx.stroke();

          // Reference Centerline (Dashed)
          ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(0, autoY + autoH / 2);
          ctx.lineTo(w, autoY + autoH / 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Automation Points & Line
          const lane = automationEngine.getTrackLane(track.id);
          const activeParam = lane ? lane.activeParam : "volume";
          const paramConfig = lane ? lane.params[activeParam] : null;

          if (paramConfig) {
            const points = paramConfig.points;
            const valToY = (val) => {
              const norm = (val - paramConfig.min) / (paramConfig.max - paramConfig.min);
              return autoY + autoH - norm * autoH;
            };

            ctx.strokeStyle = activeParam === "volume" ? "#00f0ff" : "#ffb800";
            ctx.lineWidth = 2;
            ctx.beginPath();

            if (!points || points.length === 0) {
              // Flat line at default value
              const defY = valToY(paramConfig.defaultVal);
              ctx.moveTo(0, defY);
              ctx.lineTo(w, defY);
              ctx.stroke();
            } else {
              // Line from time 0 to first point
              const firstPt = points[0];
              const firstX = TimelineCoordinate.timeToPixel(firstPt.time, this.zoom);
              const firstY = valToY(firstPt.value);
              ctx.moveTo(0, firstY);
              ctx.lineTo(firstX, firstY);

              // Connecting lines
              for (let p = 0; p < points.length; p++) {
                const pt = points[p];
                const px = TimelineCoordinate.timeToPixel(pt.time, this.zoom);
                const py = valToY(pt.value);
                ctx.lineTo(px, py);
              }

              // Line from last point to edge of canvas
              const lastPt = points[points.length - 1];
              const lastY = valToY(lastPt.value);
              ctx.lineTo(w, lastY);
              ctx.stroke();

              // Draw Glowing Automation Nodes
              points.forEach((pt) => {
                const px = TimelineCoordinate.timeToPixel(pt.time, this.zoom);
                const py = valToY(pt.value);

                ctx.fillStyle = activeParam === "volume" ? "#00f0ff" : "#ffb800";
                ctx.shadowColor = activeParam === "volume" ? "#00f0ff" : "#ffb800";
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(px, py, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;

                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(px, py, 4, 0, Math.PI * 2);
                ctx.stroke();
              });
            }
          }
        }
      });
    }

    // Full Vertical Playhead Line
    const playheadX = TimelineCoordinate.timeToPixel(this.playheadPos, this.zoom);
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX + 0.5, 0);
    ctx.lineTo(playheadX + 0.5, h);
    ctx.stroke();

    ctx.restore();
  }

  async addAudioTrack(name = "Audio Track", color = "#00f0ff") {
    const { project } = store.getState();
    if (!project) return;

    const colors = ["#00f0ff", "#00e676", "#ffb800", "#a855f7", "#ff3d71"];
    const trackColor = color || colors[project.tracks.length % colors.length];

    const newTrack = {
      id: `trk_${Math.random().toString(36).substr(2, 8)}`,
      name: `${name} ${project.tracks.length + 1}`,
      type: "audio",
      color: trackColor,
      volume: 0.0,
      pan: 0.0,
      is_muted: false,
      is_soloed: false,
      order: project.tracks.length,
      clips: [],
      effects: [],
      automation_lanes: [],
      sends: [],
    };

    await commandManager.execute(new AddTrackCommand(newTrack));
    this.handleResize();
  }
}

export const timelineController = new TimelineController();
