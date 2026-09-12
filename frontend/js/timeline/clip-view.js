/**
 * Audio Clip Canvas View & Interaction Renderer
 * High-DPI waveform rendering, fade curves, edge trim handles, and hit testing.
 */

import { TimelineCoordinate } from "./coordinate.js";
import { spectrogramRenderer } from "../canvas/spectrogram.js";

export class ClipView {
  static drawClip(
    ctx,
    clip,
    trackColor,
    peakData,
    trackY,
    trackHeight,
    zoom,
    isSelected = false,
    hoverEdge = null,
    options = {}
  ) {
    const {
      viewMode = "waveform",
      spectrogramImg = null,
      pitchData = null,
      showPitch = false,
    } = options;

    const x = TimelineCoordinate.timeToPixel(clip.start_time, zoom);
    const w = TimelineCoordinate.timeToPixel(clip.duration, zoom);
    const y = trackY + 22;
    const h = trackHeight - 30;

    // 1. Clip Box Background
    ctx.save();
    ctx.fillStyle = isSelected ? "#242d3d" : "#161d28";
    ctx.fillRect(x, y, w, h);

    // 2. Clip Border & Selection Glow
    if (isSelected) {
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(0, 240, 255, 0.45)";
      ctx.shadowBlur = 8;
    } else {
      ctx.strokeStyle = trackColor || "#00f0ff";
      ctx.lineWidth = 1;
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }
    ctx.strokeRect(x, y, w, h);
    ctx.restore();

    // 3. Clip Header Strip
    ctx.fillStyle = isSelected ? "rgba(0, 240, 255, 0.2)" : "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(x, y, w, 16);
    ctx.fillStyle = "#f0f6fc";
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.fillText(clip.name || "Audio Clip", x + 6, y + 12);

    const waveY = y + 16;
    const waveH = h - 16;
    const clipOffset = clip.source_offset || 0;
    const totalDuration = peakData?.duration || clip.duration;

    // 4. Multi-Mode Visualization
    if (viewMode === "spectrogram" && spectrogramImg) {
      // Full-height Spectrogram View
      spectrogramRenderer.drawSpectrogram(ctx, spectrogramImg, x, waveY, w, waveH, clipOffset, clip.duration, totalDuration);
      spectrogramRenderer.drawFrequencyOverlay(ctx, x, waveY, w, waveH);
    } else if (viewMode === "split") {
      // Split View: Top Half Waveform, Bottom Half Spectrogram
      const halfH = Math.floor(waveH / 2);

      // Top: Waveform
      this._drawWaveform(ctx, clip, trackColor, peakData, x, waveY, w, halfH, zoom, isSelected);

      // Bottom: Spectrogram
      if (spectrogramImg) {
        const specY = waveY + halfH;
        spectrogramRenderer.drawSpectrogram(ctx, spectrogramImg, x, specY, w, halfH, clipOffset, clip.duration, totalDuration);
        spectrogramRenderer.drawFrequencyOverlay(ctx, x, specY, w, halfH);
      }

      // Divider line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, waveY + halfH);
      ctx.lineTo(x + w, waveY + halfH);
      ctx.stroke();
    } else {
      // Default: Waveform View
      this._drawWaveform(ctx, clip, trackColor, peakData, x, waveY, w, waveH, zoom, isSelected);
    }

    // 5. Vocal Pitch Contour Overlay
    if (showPitch && pitchData) {
      spectrogramRenderer.drawPitchContour(ctx, pitchData, x, waveY, w, waveH, clipOffset, clip.duration);
    }

    // 6. Fade In & Fade Out Shading
    if (clip.fade_in && clip.fade_in > 0) {
      const fadeW = Math.min(w, TimelineCoordinate.timeToPixel(clip.fade_in, zoom));
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath();
      ctx.moveTo(x, waveY);
      ctx.lineTo(x, waveY + waveH);
      ctx.lineTo(x + fadeW, waveY);
      ctx.closePath();
      ctx.fill();
    }

    if (clip.fade_out && clip.fade_out > 0) {
      const fadeW = Math.min(w, TimelineCoordinate.timeToPixel(clip.fade_out, zoom));
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath();
      ctx.moveTo(x + w - fadeW, waveY);
      ctx.lineTo(x + w, waveY + waveH);
      ctx.lineTo(x + w, waveY);
      ctx.closePath();
      ctx.fill();
    }

    // 7. Edge Trim Handles (visual cues)
    const handleW = 6;
    if (isSelected || hoverEdge) {
      // Left handle
      ctx.fillStyle = hoverEdge === "left" ? "#00f0ff" : "rgba(255, 255, 255, 0.25)";
      ctx.fillRect(x, y, handleW, h);

      // Right handle
      ctx.fillStyle = hoverEdge === "right" ? "#00f0ff" : "rgba(255, 255, 255, 0.25)";
      ctx.fillRect(x + w - handleW, y, handleW, h);
    }
  }

  static _drawWaveform(ctx, clip, trackColor, peakData, x, waveY, w, waveH, zoom, isSelected) {
    if (!peakData || !peakData.levels) return;

    const step = zoom > 120 ? 64 : 256;
    const level = peakData.levels[String(step)] || peakData.levels["64"] || Object.values(peakData.levels)[0];
    if (!level || !level.channels || level.channels.length === 0) return;

    const ch0 = level.channels[0];
    const totalPeaks = ch0.max.length;
    const midY = waveY + waveH / 2;

    // Apply clip gain to amplitude
    const gainLinear = Math.pow(10, (clip.gain || 0) / 20);
    const ampScale = (waveH / 2) * 0.95 * gainLinear;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, waveY, w, waveH);
    ctx.clip();

    ctx.strokeStyle = trackColor || "#00f0ff";
    ctx.fillStyle = isSelected ? "rgba(0, 240, 255, 0.35)" : "rgba(0, 240, 255, 0.18)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(x, midY);

    for (let px = 0; px < w; px++) {
      const idx = Math.floor((px / w) * totalPeaks);
      if (idx < totalPeaks) {
        ctx.lineTo(x + px, midY - ch0.max[idx] * ampScale);
      }
    }

    for (let px = w - 1; px >= 0; px--) {
      const idx = Math.floor((px / w) * totalPeaks);
      if (idx < totalPeaks) {
        ctx.lineTo(x + px, midY - ch0.min[idx] * ampScale);
      }
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Zero-crossing center axis
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.moveTo(x, midY);
    ctx.lineTo(x + w, midY);
    ctx.stroke();

    ctx.restore();
  }

  static hitTest(clip, clickX, clickY, trackY, trackHeight, zoom) {
    const x = TimelineCoordinate.timeToPixel(clip.start_time, zoom);
    const w = TimelineCoordinate.timeToPixel(clip.duration, zoom);
    const y = trackY + 22;
    const h = trackHeight - 30;

    return clickX >= x && clickX <= x + w && clickY >= y && clickY <= y + h;
  }

  /**
   * Determine whether the mouse is on the left edge, right edge, or body of a clip.
   */
  static hitTestEdge(clip, clickX, clickY, trackY, trackHeight, zoom, edgeThresholdPx = 10) {
    if (!this.hitTest(clip, clickX, clickY, trackY, trackHeight, zoom)) {
      return null;
    }

    const x = TimelineCoordinate.timeToPixel(clip.start_time, zoom);
    const w = TimelineCoordinate.timeToPixel(clip.duration, zoom);

    if (clickX <= x + edgeThresholdPx) {
      return "left";
    }
    if (clickX >= x + w - edgeThresholdPx) {
      return "right";
    }
    return "body";
  }
}
