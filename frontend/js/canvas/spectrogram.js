/**
 * Spectrogram & Pitch Canvas Rendering Engine
 * Handles async tile loading, caching, Mel-spectrogram rendering,
 * pitch contour overlays, and frequency scale markings.
 */

import { api } from "../api/client.js";
import { bus } from "../core/event-bus.js";

export class SpectrogramRenderer {
  constructor() {
    // Caches: key -> HTMLImageElement
    this.spectrogramCache = new Map();
    // Caches: mediaId -> Object
    this.pitchCache = new Map();
    // Loading promises to avoid duplicate parallel fetches
    this.loadingImages = new Map();
    this.loadingPitch = new Map();

    // Configuration state
    this.viewMode = "waveform"; // 'waveform' | 'spectrogram' | 'split'
    this.colormap = "cyberpunk"; // 'cyberpunk' | 'magma' | 'viridis'
    this.showPitch = false;
  }

  setViewMode(mode) {
    if (["waveform", "spectrogram", "split"].includes(mode)) {
      this.viewMode = mode;
      bus.emit("viewmode:changed", this.viewMode);
    }
  }

  setColormap(colormap) {
    if (["cyberpunk", "magma", "viridis"].includes(colormap)) {
      this.colormap = colormap;
      bus.emit("colormap:changed", this.colormap);
    }
  }

  togglePitch(forceState = null) {
    this.showPitch = forceState !== null ? forceState : !this.showPitch;
    bus.emit("pitch:toggled", this.showPitch);
    return this.showPitch;
  }

  /**
   * Preload or retrieve cached Spectrogram Image.
   */
  async getSpectrogramImage(projectId, mediaId, colormap = null) {
    const pal = colormap || this.colormap;
    const cacheKey = `${projectId}_${mediaId}_${pal}`;

    if (this.spectrogramCache.has(cacheKey)) {
      return this.spectrogramCache.get(cacheKey);
    }

    if (this.loadingImages.has(cacheKey)) {
      return this.loadingImages.get(cacheKey);
    }

    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      const url = `/api/projects/${projectId}/media/${mediaId}/spectrogram?colormap=${pal}&format=png`;
      img.crossOrigin = "anonymous";

      img.onload = () => {
        this.spectrogramCache.set(cacheKey, img);
        this.loadingImages.delete(cacheKey);
        resolve(img);
        bus.emit("spectrogram:loaded", { mediaId, colormap: pal });
      };

      img.onerror = (err) => {
        this.loadingImages.delete(cacheKey);
        console.warn(`[Spectrogram] Failed to load spectrogram for ${mediaId}:`, err);
        resolve(null);
      };

      img.src = url;
    });

    this.loadingImages.set(cacheKey, promise);
    return promise;
  }

  /**
   * Preload or retrieve cached Vocal Pitch Contour Data.
   */
  async getPitchData(projectId, mediaId) {
    if (this.pitchCache.has(mediaId)) {
      return this.pitchCache.get(mediaId);
    }

    if (this.loadingPitch.has(mediaId)) {
      return this.loadingPitch.get(mediaId);
    }

    const promise = (async () => {
      try {
        const data = await api.request(`/api/projects/${projectId}/media/${mediaId}/pitch`);
        this.pitchCache.set(mediaId, data);
        this.loadingPitch.delete(mediaId);
        bus.emit("pitch:loaded", { mediaId });
        return data;
      } catch (e) {
        this.loadingPitch.delete(mediaId);
        console.warn(`[Pitch] Failed to load pitch data for ${mediaId}:`, e);
        return null;
      }
    })();

    this.loadingPitch.set(mediaId, promise);
    return promise;
  }

  /**
   * Draw Mel Spectrogram tile into clip box with time-accurate offset slicing.
   */
  drawSpectrogram(ctx, img, x, y, w, h, clipOffset = 0, clipDuration = 0, totalDuration = 0) {
    if (!img || !img.complete || img.naturalWidth === 0) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const natW = img.naturalWidth;
    const natH = img.naturalHeight;

    // Calculate sub-rectangle inside source image according to clip offset & duration
    const dur = totalDuration > 0 ? totalDuration : clipDuration;
    const startRatio = dur > 0 ? Math.max(0, clipOffset / dur) : 0;
    const durationRatio = dur > 0 ? Math.min(1.0, clipDuration / dur) : 1.0;

    const sx = startRatio * natW;
    const sw = Math.max(1, durationRatio * natW);
    const sy = 0;
    const sh = natH;

    // Draw sliced image scaled to clip display rect
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);

    // Subtle dark vignette gradient at top & bottom for DAW polish
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, "rgba(0, 0, 0, 0.35)");
    grad.addColorStop(0.1, "transparent");
    grad.addColorStop(0.9, "transparent");
    grad.addColorStop(1.0, "rgba(0, 0, 0, 0.45)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    ctx.restore();
  }

  /**
   * Draw Neon Pitch Contour line with note badges.
   */
  drawPitchContour(ctx, pitchData, x, y, w, h, clipOffset = 0, clipDuration = 0) {
    if (!pitchData || !pitchData.frames || pitchData.frames.length === 0) return;

    const frames = pitchData.frames;
    const minMidi = 36; // C2 (~65.4 Hz)
    const maxMidi = 84; // C6 (~1046.5 Hz)
    const midiSpan = maxMidi - minMidi;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#ff007f"; // Neon Cyber Magenta
    ctx.shadowColor = "rgba(255, 0, 128, 0.85)";
    ctx.shadowBlur = 6;

    let isDrawing = false;
    let noteToLabel = null;
    let labelPos = null;

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const relTime = f.t - clipOffset;
      if (relTime < 0 || relTime > clipDuration) continue;

      const px = x + (relTime / clipDuration) * w;

      if (f.midi !== null && f.midi >= minMidi && f.midi <= maxMidi) {
        // High pitch at top, low pitch at bottom
        const normY = 1.0 - (f.midi - minMidi) / midiSpan;
        const py = y + normY * h;

        if (!isDrawing) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          isDrawing = true;
          noteToLabel = f.note;
          labelPos = { x: px, y: py };
        } else {
          ctx.lineTo(px, py);
        }
      } else {
        if (isDrawing) {
          ctx.stroke();
          isDrawing = false;

          // Draw note badge at start of vocal segment
          if (noteToLabel && labelPos) {
            this.drawNoteBadge(ctx, noteToLabel, labelPos.x, labelPos.y);
            noteToLabel = null;
          }
        }
      }
    }

    if (isDrawing) {
      ctx.stroke();
      if (noteToLabel && labelPos) {
        this.drawNoteBadge(ctx, noteToLabel, labelPos.x, labelPos.y);
      }
    }

    ctx.restore();
  }

  drawNoteBadge(ctx, note, px, py) {
    ctx.save();
    ctx.font = "bold 9px 'JetBrains Mono', monospace";
    const pad = 3;
    const txtW = ctx.measureText(note).width;
    const bx = px + 4;
    const by = Math.max(py - 12, 16);

    ctx.fillStyle = "rgba(10, 10, 20, 0.85)";
    ctx.strokeStyle = "#ff007f";
    ctx.lineWidth = 1;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.roundRect(bx - pad, by - 8, txtW + pad * 2, 12, 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(note, bx, by + 1);
    ctx.restore();
  }

  /**
   * Draw Frequency Scale ticks on the edge of the spectrogram canvas.
   */
  drawFrequencyOverlay(ctx, x, y, w, h) {
    ctx.save();
    ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.textAlign = "right";

    const freqs = [
      { label: "16k", ratio: 0.05 },
      { label: "8k", ratio: 0.20 },
      { label: "4k", ratio: 0.40 },
      { label: "1k", ratio: 0.65 },
      { label: "250", ratio: 0.85 },
      { label: "60Hz", ratio: 0.96 },
    ];

    freqs.forEach((item) => {
      const ty = y + item.ratio * h;
      ctx.fillText(item.label, x + w - 4, ty + 3);
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(x + w - 24, ty, 20, 1);
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    });

    ctx.restore();
  }
}

export const spectrogramRenderer = new SpectrogramRenderer();
