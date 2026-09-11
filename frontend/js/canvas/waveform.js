/**
 * High-DPI Canvas 2D Waveform & Playhead Renderer
 */

import { bus } from "../core/event-bus.js";
import { store } from "../state/store.js";
import { api } from "../api/client.js";

class WaveformCanvas {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.rulerCanvas = null;
    this.rulerCtx = null;
    this.waveformCache = new Map(); // mediaId -> peakData
    this.zoom = 80; // pixels per second
    this.playheadPos = 0.0;
    this.dpr = window.devicePixelRatio || 1;
  }

  init() {
    this.canvas = document.getElementById("timeline-canvas");
    this.rulerCanvas = document.getElementById("ruler-canvas");
    if (!this.canvas || !this.rulerCanvas) return;

    this.ctx = this.canvas.getContext("2d");
    this.rulerCtx = this.rulerCanvas.getContext("2d");

    this.handleResize();
    window.addEventListener("resize", () => this.handleResize());

    // Listen to transport ticks
    bus.on("transport:tick", (pos) => {
      this.playheadPos = pos;
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

    // Click to seek on timeline
    this.canvas.addEventListener("click", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const targetTime = x / this.zoom;
      bus.emit("transport:seek", targetTime);
    });

    // Click to seek on ruler
    this.rulerCanvas.addEventListener("click", (e) => {
      const rect = this.rulerCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const targetTime = x / this.zoom;
      bus.emit("transport:seek", targetTime);
    });

    this.render();
  }

  handleResize() {
    if (!this.canvas || !this.rulerCanvas) return;

    const viewport = document.getElementById("timeline-viewport");
    const ruler = document.getElementById("timeline-ruler");

    const w = Math.max(viewport.clientWidth, 2000);
    const h = viewport.clientHeight || 400;
    const rh = ruler.clientHeight || 28;

    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    this.rulerCanvas.width = w * this.dpr;
    this.rulerCanvas.height = rh * this.dpr;
    this.rulerCanvas.style.width = `${w}px`;
    this.rulerCanvas.style.height = `${rh}px`;

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
            console.error(`[Waveform] Failed to load peaks for ${clip.source_id}:`, e);
          }
        }
      }
    }
  }

  render() {
    this.renderRuler();
    this.renderTimeline();
  }

  renderRuler() {
    if (!this.rulerCtx) return;
    const ctx = this.rulerCtx;
    const dpr = this.dpr;
    const w = this.rulerCanvas.width / dpr;
    const h = this.rulerCanvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#161b22";
    ctx.fillRect(0, 0, w, h);

    // Tick marks and time labels
    ctx.fillStyle = "#8b949e";
    ctx.strokeStyle = "#30363d";
    ctx.font = "10px SF Mono, Consolas, monospace";

    const secStep = 5; // Major tick every 5 seconds
    const maxSec = w / this.zoom;

    for (let sec = 0; sec <= maxSec; sec += 1) {
      const x = sec * this.zoom;
      const isMajor = sec % secStep === 0;

      ctx.beginPath();
      ctx.moveTo(x, isMajor ? h - 12 : h - 6);
      ctx.lineTo(x, h);
      ctx.stroke();

      if (isMajor) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        const timeStr = `${m}:${String(s).padStart(2, "0")}`;
        ctx.fillText(timeStr, x + 4, h - 8);
      }
    }

    // Ruler Playhead Indicator (triangle)
    const playheadX = this.playheadPos * this.zoom;
    ctx.fillStyle = "#00f0ff";
    ctx.beginPath();
    ctx.moveTo(playheadX - 6, 0);
    ctx.lineTo(playheadX + 6, 0);
    ctx.lineTo(playheadX, 10);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  renderTimeline() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dpr = this.dpr;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Dark track background
    ctx.fillStyle = "#12151b";
    ctx.fillRect(0, 0, w, h);

    const { project } = store.getState();
    const trackHeight = 110;
    const trackSpacing = 10;

    if (project && project.tracks && project.tracks.length > 0) {
      project.tracks.forEach((track, trkIdx) => {
        const trackY = 16 + trkIdx * (trackHeight + trackSpacing);

        // Track lane backdrop
        ctx.fillStyle = "#181d24";
        ctx.strokeStyle = "#30363d";
        ctx.lineWidth = 1;
        ctx.fillRect(0, trackY, w, trackHeight);
        ctx.strokeRect(0, trackY, w, trackHeight);

        // Track title
        ctx.fillStyle = track.color || "#00f0ff";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(track.name, 12, trackY + 18);

        // Clips in track
        track.clips.forEach((clip) => {
          const clipX = clip.start_time * this.zoom;
          const clipW = clip.duration * this.zoom;
          const clipY = trackY + 24;
          const clipH = trackHeight - 32;

          // Clip box
          ctx.fillStyle = "#232a35";
          ctx.strokeStyle = track.color || "#00f0ff";
          ctx.lineWidth = 1;
          ctx.fillRect(clipX, clipY, clipW, clipH);
          ctx.strokeRect(clipX, clipY, clipW, clipH);

          // Waveform rendering
          const peakData = this.waveformCache.get(clip.source_id);
          if (peakData) {
            this.drawClipWaveform(ctx, peakData, clipX, clipY, clipW, clipH, track.color);
          }
        });
      });
    }

    // Playhead line across full canvas
    const playheadX = this.playheadPos * this.zoom;
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();

    ctx.restore();
  }

  drawClipWaveform(ctx, peakData, x, y, width, height, color = "#00f0ff") {
    // Select resolution level based on zoom
    const step = 64;
    const level = peakData.levels[String(step)] || peakData.levels["256"] || Object.values(peakData.levels)[0];
    if (!level || !level.channels || level.channels.length === 0) return;

    const ch0 = level.channels[0];
    const totalPeaks = ch0.max.length;
    const midY = y + height / 2;
    const ampScale = (height / 2) * 0.9;

    ctx.strokeStyle = color;
    ctx.fillStyle = "rgba(0, 240, 255, 0.25)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(x, midY);

    // Draw top edge (max peaks)
    for (let px = 0; px < width; px += 1) {
      const peakIdx = Math.floor((px / width) * totalPeaks);
      if (peakIdx < totalPeaks) {
        const peakVal = ch0.max[peakIdx];
        ctx.lineTo(x + px, midY - peakVal * ampScale);
      }
    }

    // Draw bottom edge in reverse (min peaks)
    for (let px = width - 1; px >= 0; px -= 1) {
      const peakIdx = Math.floor((px / width) * totalPeaks);
      if (peakIdx < totalPeaks) {
        const peakVal = ch0.min[peakIdx];
        ctx.lineTo(x + px, midY - peakVal * ampScale);
      }
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Zero-crossing center line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.beginPath();
    ctx.moveTo(x, midY);
    ctx.lineTo(x + width, midY);
    ctx.stroke();
  }
}

export const waveformCanvas = new WaveformCanvas();
