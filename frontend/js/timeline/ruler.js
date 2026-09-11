/**
 * Musical & Time Ruler Canvas Component
 * Bar/beat subdivisions, playhead arrow, and section cue markers.
 */

import { TimelineCoordinate } from "./coordinate.js";
import { bus } from "../core/event-bus.js";
import { store } from "../state/store.js";

export class TimelineRuler {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.zoom = 80;
    this.bpm = 120.0;
    this.timeSig = { num: 4, den: 4 };
    this.playheadPos = 0.0;
    this.dpr = window.devicePixelRatio || 1;
    this.isScrubbing = false;

    this.bindEvents();
  }

  bindEvents() {
    this.canvas.addEventListener("mousedown", (e) => {
      this.isScrubbing = true;
      this.handleSeekEvent(e);
    });

    window.addEventListener("mousemove", (e) => {
      if (this.isScrubbing) {
        this.handleSeekEvent(e);
      }
    });

    window.addEventListener("mouseup", () => {
      this.isScrubbing = false;
    });
  }

  handleSeekEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left);
    const targetSeconds = TimelineCoordinate.pixelToTime(x, this.zoom);
    bus.emit("transport:seek", targetSeconds);
  }

  render(playheadPos, zoom, bpm) {
    this.playheadPos = playheadPos;
    this.zoom = zoom;
    this.bpm = bpm;

    const ctx = this.ctx;
    const dpr = this.dpr;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#161b22";
    ctx.fillRect(0, 0, w, h);

    // Ruler Bottom Border
    ctx.strokeStyle = "#30363d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 0.5);
    ctx.lineTo(w, h - 0.5);
    ctx.stroke();

    // Beat / Bar Divisions
    const secondsPerBeat = 60.0 / this.bpm;
    const secondsPerBar = secondsPerBeat * this.timeSig.num;
    const barWidthPx = secondsPerBar * this.zoom;

    const totalBars = Math.ceil(w / barWidthPx) + 2;

    ctx.font = "10px SF Mono, Consolas, monospace";

    for (let bar = 0; bar < totalBars; bar++) {
      const barTime = bar * secondsPerBar;
      const barX = TimelineCoordinate.timeToPixel(barTime, this.zoom);

      // Major Bar Line
      ctx.strokeStyle = "#484f58";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(barX, h - 14);
      ctx.lineTo(barX, h);
      ctx.stroke();

      // Bar Number Text
      ctx.fillStyle = "#ffb800";
      ctx.fillText(`${bar + 1}`, barX + 4, 12);

      // Sub-divisions (Beats inside bar)
      if (barWidthPx > 40) {
        ctx.strokeStyle = "#30363d";
        for (let b = 1; b < this.timeSig.num; b++) {
          const beatTime = barTime + b * secondsPerBeat;
          const beatX = TimelineCoordinate.timeToPixel(beatTime, this.zoom);
          ctx.beginPath();
          ctx.moveTo(beatX, h - 7);
          ctx.lineTo(beatX, h);
          ctx.stroke();
        }
      }
    }

    // Section Cue Markers (Intro, Verse, Chorus, Outro)
    const { project } = store.getState();
    if (project && project.markers && project.markers.length > 0) {
      project.markers.forEach((marker) => {
        const markerX = TimelineCoordinate.timeToPixel(marker.time, this.zoom);
        const markerColor = marker.color || "#00f0ff";

        // Marker Flag
        ctx.fillStyle = markerColor;
        ctx.fillRect(markerX, 0, 2, h);

        // Marker Tag Box
        ctx.fillStyle = markerColor;
        ctx.font = "bold 9px Inter, system-ui, sans-serif";
        const tagText = ` ${marker.name} `;
        const tagW = ctx.measureText(tagText).width + 4;
        ctx.fillRect(markerX + 2, 1, tagW, 11);

        ctx.fillStyle = "#000000";
        ctx.fillText(tagText, markerX + 3, 10);
      });
    }

    // Playhead Indicator Arrow
    const playheadX = TimelineCoordinate.timeToPixel(this.playheadPos, this.zoom);
    ctx.fillStyle = "#00f0ff";
    ctx.beginPath();
    ctx.moveTo(playheadX - 6, 0);
    ctx.lineTo(playheadX + 6, 0);
    ctx.lineTo(playheadX, 10);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
