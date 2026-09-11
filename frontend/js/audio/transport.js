/**
 * Transport Controller & Microsecond Scheduling Clock
 */

import { audioEngine } from "./engine.js";
import { bufferCache } from "./buffer-cache.js";
import { store } from "../state/store.js";
import { bus } from "../core/event-bus.js";

class Transport {
  constructor() {
    this.state = "stopped"; // 'stopped' | 'playing' | 'paused'
    this.playheadPosition = 0.0; // Seconds on timeline
    this.audioStartTime = 0.0; // AudioContext.currentTime when playback began
    this.offsetPosition = 0.0; // Timeline seconds offset when started
    this.activeSources = []; // Active AudioBufferSourceNode instances
    this.rafId = null;
    this.tempo = 120.0;
    this.isLooping = false;
  }

  init() {
    bus.on("transport:toggle-play", () => this.togglePlay());
    bus.on("transport:seek", (time) => this.seek(time));
    bus.on("transport:stop", () => this.stop());
    bus.on("transport:toggle-loop", () => this.toggleLoop());

    // Connect transport buttons with single event source
    const playBtn = document.getElementById("btn-play");
    const stopBtn = document.getElementById("btn-stop");
    const rewindBtn = document.getElementById("btn-rewind");
    const loopBtn = document.getElementById("btn-loop");
    const tempoInput = document.getElementById("input-tempo");

    if (playBtn) playBtn.onclick = () => this.togglePlay();
    if (stopBtn) stopBtn.onclick = () => this.stop();
    if (rewindBtn) rewindBtn.onclick = () => this.seek(0.0);
    if (loopBtn) loopBtn.onclick = () => this.toggleLoop();

    if (tempoInput) {
      tempoInput.onchange = (e) => {
        this.tempo = parseFloat(e.target.value) || 120.0;
      };
    }
  }

  toggleLoop() {
    this.isLooping = !this.isLooping;
    const loopBtn = document.getElementById("btn-loop");
    if (loopBtn) {
      loopBtn.style.color = this.isLooping ? "var(--accent-cyan)" : "inherit";
    }
  }

  togglePlay() {
    if (this.state === "playing") {
      this.pause();
    } else {
      this.play();
    }
  }

  async play() {
    const ctx = audioEngine.ensureContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    if (this.state === "playing") return;

    this.state = "playing";
    this.updatePlayButtonUI(true);

    // Schedule active project clips
    await this.schedulePlayback(this.playheadPosition);

    // Align audioStartTime at the exact moment scheduled playback commences
    this.audioStartTime = ctx.currentTime;
    this.offsetPosition = this.playheadPosition;

    this.startClock();
    bus.emit("transport:state-changed", { state: this.state, position: this.playheadPosition });
  }

  pause() {
    if (this.state !== "playing") return;

    this.stopAllAudioNodes();
    this.state = "paused";
    this.updatePlayButtonUI(false);
    this.stopClock();
    bus.emit("transport:state-changed", { state: this.state, position: this.playheadPosition });
  }

  stop() {
    this.stopAllAudioNodes();
    this.state = "stopped";
    this.playheadPosition = 0.0;
    this.offsetPosition = 0.0;
    this.updatePlayButtonUI(false);
    this.stopClock();
    this.updateDisplays(0.0);
    bus.emit("transport:tick", 0.0);
    bus.emit("transport:state-changed", { state: this.state, position: 0.0 });
  }

  async seek(targetSeconds) {
    targetSeconds = Math.max(0.0, targetSeconds);
    const wasPlaying = this.state === "playing";

    if (wasPlaying) {
      this.stopAllAudioNodes();
    }

    this.playheadPosition = targetSeconds;
    this.offsetPosition = targetSeconds;
    this.updateDisplays(targetSeconds);
    bus.emit("transport:tick", targetSeconds);

    if (wasPlaying) {
      const ctx = audioEngine.ensureContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      await this.schedulePlayback(targetSeconds);
      this.audioStartTime = ctx.currentTime;
      this.startClock();
    }

    bus.emit("transport:seeked", targetSeconds);
  }

  async schedulePlayback(fromTime) {
    const { project } = store.getState();
    if (!project || !project.tracks) return;

    const ctx = audioEngine.ensureContext();

    for (const track of project.tracks) {
      if (track.is_muted) continue;

      for (const clip of track.clips) {
        if (clip.is_muted) continue;

        const clipEnd = clip.start_time + clip.duration;
        // Check if playhead intersects or is before clip
        if (fromTime < clipEnd) {
          try {
            const buffer = await bufferCache.getBuffer(project.id, clip.source_id);
            const sourceNode = ctx.createBufferSource();
            sourceNode.buffer = buffer;

            // Clip gain node
            const clipGain = ctx.createGain();
            const gainLinear = Math.pow(10, (clip.gain || 0) / 20);
            clipGain.gain.setValueAtTime(gainLinear, ctx.currentTime);

            // Connect through persistent Track mixing node (pan -> gain -> master)
            const trackNode = audioEngine.getOrCreateTrackNode(track.id, track);
            const targetTrackInput = trackNode.panNode || trackNode.gainNode;

            sourceNode.connect(clipGain);
            clipGain.connect(targetTrackInput);

            audioEngine.registerClipGain(clip.id, clipGain, clip.gain);

            let scheduleWhen = 0;
            let bufferOffset = clip.source_offset || 0;
            let durationToPlay = clip.duration;

            if (fromTime <= clip.start_time) {
              // Started before clip begins
              scheduleWhen = ctx.currentTime + (clip.start_time - fromTime);
            } else {
              // Started inside clip
              scheduleWhen = ctx.currentTime;
              const elapsedInClip = fromTime - clip.start_time;
              bufferOffset += elapsedInClip * (clip.stretch_ratio || 1.0);
              durationToPlay = clip.duration - elapsedInClip;
            }

            sourceNode.start(scheduleWhen, bufferOffset, durationToPlay);
            this.activeSources.push(sourceNode);

            sourceNode.onended = () => {
              audioEngine.unregisterClipGain(clip.id, clipGain);
              const idx = this.activeSources.indexOf(sourceNode);
              if (idx !== -1) this.activeSources.splice(idx, 1);
            };
          } catch (e) {
            console.error(`[Transport] Error scheduling clip ${clip.id}:`, e);
          }
        }
      }
    }
  }

  stopAllAudioNodes() {
    this.activeSources.forEach((node) => {
      try {
        node.stop();
        node.disconnect();
      } catch (_) {}
    });
    this.activeSources = [];
    if (audioEngine.activeClipGains) {
      audioEngine.activeClipGains.clear();
    }
  }

  startClock() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    const tick = () => {
      if (this.state === "playing") {
        const ctx = audioEngine.ctx;
        if (ctx) {
          const elapsed = ctx.currentTime - this.audioStartTime;
          this.playheadPosition = this.offsetPosition + elapsed;
          this.updateDisplays(this.playheadPosition);
          bus.emit("transport:tick", this.playheadPosition);

          // Auto stop when song finishes if not looping
          const { project } = store.getState();
          if (project && project.tracks) {
            let maxEnd = 0;
            for (const t of project.tracks) {
              for (const c of t.clips) {
                maxEnd = Math.max(maxEnd, c.start_time + c.duration);
              }
            }
            if (maxEnd > 0 && this.playheadPosition >= maxEnd + 0.15) {
              if (this.isLooping) {
                this.seek(0.0);
              } else {
                this.stop();
                return;
              }
            }
          }
        }
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stopClock() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  updateDisplays(seconds) {
    const timeDisplay = document.getElementById("display-timecode");
    const barsDisplay = document.getElementById("display-bars");

    if (timeDisplay) timeDisplay.textContent = this.formatTimecode(seconds);
    if (barsDisplay) barsDisplay.textContent = this.formatBars(seconds, this.tempo);
  }

  formatTimecode(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }

  formatBars(seconds, bpm = 120.0, timeSigNum = 4, timeSigDenom = 4) {
    const beatsPerSec = bpm / 60.0;
    const totalBeats = seconds * beatsPerSec;
    const bar = Math.floor(totalBeats / timeSigNum) + 1;
    const beat = Math.floor(totalBeats % timeSigNum) + 1;
    const tick = Math.floor(((totalBeats % timeSigNum) % 1) * 100);
    return `${bar}.${beat}.${String(tick).padStart(2, "0")}`;
  }

  updatePlayButtonUI(isPlaying) {
    const playBtn = document.getElementById("btn-play");
    if (playBtn) {
      playBtn.textContent = isPlaying ? "⏸" : "▶";
      if (isPlaying) {
        playBtn.classList.add("playing");
      } else {
        playBtn.classList.remove("playing");
      }
    }
  }
}

export const transport = new Transport();
