/**
 * 8D Binaural Spatial Audio Processor
 * Real-time 360° orbital panning, HRTF rear acoustic shadowing, distance depth modulation,
 * and multi-trajectory LFO (Circular Orbit, Figure-8, Pendulum Sweep).
 */

import { bus } from "../core/event-bus.js";

export class SpatialAudioProcessor {
  constructor() {
    this.ctx = null;
    this.inputNode = null;
    this.outputNode = null;
    this.dryGain = null;
    this.wetGain = null;
    this.pannerNode = null;
    this.hrtfFilter = null;
    this.distanceGain = null;

    // Spatial parameters
    this.enabled = false;
    this.speed = 7.5; // seconds per full orbit
    this.depth = 0.95; // orbit width [0, 1]
    this.trajectory = "circular"; // 'circular' | 'figure8' | 'pendulum'
    this.phase = 0.0;
    this.lastTime = null;
    this.animId = null;

    // Visual state for UI meter
    this.currentPosition = { x: 0, y: 1, angle: 0 };
  }

  init(audioContext) {
    if (this.ctx) return;
    this.ctx = audioContext;

    this.inputNode = this.ctx.createGain();
    this.outputNode = this.ctx.createGain();

    this.dryGain = this.ctx.createGain();
    this.wetGain = this.ctx.createGain();

    // Default: bypassed (dry = 1, wet = 0)
    this.dryGain.gain.value = 1.0;
    this.wetGain.gain.value = 0.0;

    // Spatial processing chain:
    // inputNode -> wetGain -> pannerNode -> hrtfFilter -> distanceGain -> outputNode
    // inputNode -> dryGain -> outputNode
    this.pannerNode = this.ctx.createStereoPanner();
    this.hrtfFilter = this.ctx.createBiquadFilter();
    this.hrtfFilter.type = "lowpass";
    this.hrtfFilter.frequency.value = 20000;
    this.hrtfFilter.Q.value = 0.7;

    this.distanceGain = this.ctx.createGain();
    this.distanceGain.gain.value = 1.0;

    // Dry chain
    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);

    // Wet chain
    this.inputNode.connect(this.wetGain);
    this.wetGain.connect(this.pannerNode);
    this.pannerNode.connect(this.hrtfFilter);
    this.hrtfFilter.connect(this.distanceGain);
    this.distanceGain.connect(this.outputNode);

    this.startLoop();
  }

  setEnabled(enable) {
    this.enabled = !!enable;
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const fadeTime = 0.05; // 50ms anti-pop crossfade

    if (this.enabled) {
      this.dryGain.gain.cancelScheduledValues(now);
      this.wetGain.gain.cancelScheduledValues(now);
      this.dryGain.gain.linearRampToValueAtTime(0.0, now + fadeTime);
      this.wetGain.gain.linearRampToValueAtTime(1.0, now + fadeTime);
    } else {
      this.dryGain.gain.cancelScheduledValues(now);
      this.wetGain.gain.cancelScheduledValues(now);
      this.dryGain.gain.linearRampToValueAtTime(1.0, now + fadeTime);
      this.wetGain.gain.linearRampToValueAtTime(0.0, now + fadeTime);
      // Reset panner to center
      this.pannerNode.pan.linearRampToValueAtTime(0.0, now + fadeTime);
      this.hrtfFilter.frequency.linearRampToValueAtTime(20000, now + fadeTime);
    }

    bus.emit("spatial:changed", {
      enabled: this.enabled,
      speed: this.speed,
      depth: this.depth,
      trajectory: this.trajectory,
    });
  }

  setSpeed(seconds) {
    this.speed = Math.max(1.0, Math.min(30.0, parseFloat(seconds) || 7.5));
  }

  setDepth(depth) {
    this.depth = Math.max(0.0, Math.min(1.0, parseFloat(depth) || 0.95));
  }

  setTrajectory(type) {
    if (["circular", "figure8", "pendulum"].includes(type)) {
      this.trajectory = type;
    }
  }

  startLoop() {
    const update = (timestamp) => {
      if (this.lastTime === null) this.lastTime = timestamp;
      const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
      this.lastTime = timestamp;

      if (this.enabled && this.ctx && this.pannerNode) {
        // Advance phase
        const speedRate = (2 * Math.PI) / this.speed;
        this.phase = (this.phase + speedRate * dt) % (2 * Math.PI);

        let panX = 0;
        let depthY = 1; // 1 = front, -1 = rear

        if (this.trajectory === "circular") {
          panX = Math.sin(this.phase) * this.depth;
          depthY = Math.cos(this.phase);
        } else if (this.trajectory === "figure8") {
          panX = Math.sin(this.phase) * this.depth;
          depthY = Math.sin(2 * this.phase);
        } else if (this.trajectory === "pendulum") {
          panX = Math.sin(this.phase) * this.depth;
          depthY = 0.5;
        }

        // Clamp pan between -1 and 1
        panX = Math.max(-1.0, Math.min(1.0, panX));
        this.pannerNode.pan.value = panX;

        // HRTF rear ear-shadow filter:
        // When depthY is negative (behind listener), cut frequencies above 4000Hz - 8000Hz
        // to simulate pinna / head acoustic shadow
        const rearRatio = Math.max(0, -depthY); // 0 at front/sides, 1 at full rear
        const hrtfCutoff = 20000 - rearRatio * 15500; // Drops from 20kHz down to 4.5kHz
        this.hrtfFilter.frequency.value = hrtfCutoff;

        // Distance gain attenuation (subtle 3D depth)
        const distanceAtten = 1.0 - 0.12 * rearRatio;
        this.distanceGain.gain.value = distanceAtten;

        this.currentPosition = {
          x: panX,
          y: depthY,
          angle: (this.phase * 180) / Math.PI,
        };
      }

      this.animId = requestAnimationFrame(update);
    };

    this.animId = requestAnimationFrame(update);
  }

  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
  }
}

export const spatialEngine = new SpatialAudioProcessor();
