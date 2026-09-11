/**
 * MaxAudioEditor Web Audio Engine Core
 */

import { bus } from "../core/event-bus.js";
import { createEffect } from "./effects.js";

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.masterBusInput = null;
    this.analyser = null;
    this.isInitialized = false;

    // Track node map: trackId -> { gainNode, panNode, effects: [], volumeDb, pan, isMuted, isSoloed }
    this.trackNodes = new Map();

    // Master insert rack: Array<BaseEffect>
    this.masterEffects = [];

    // Active clip gain nodes: clipId -> Set<GainNode>
    this.activeClipGains = new Map();
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass({ latencyHint: "interactive" });

      // Master output chain: masterBusInput -> masterGain -> analyser -> destination
      this.masterBusInput = this.ctx.createGain();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;

      // Master Analyser Node for metering
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;

      this.masterBusInput.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      this.isInitialized = true;
      console.log(`[AudioEngine] Context initialized: ${this.ctx.sampleRate} Hz, state: ${this.ctx.state}`);
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setMasterVolume(gainDb) {
    if (this.masterGain && this.ctx) {
      const linear = Math.pow(10, gainDb / 20);
      try {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setValueAtTime(linear, this.ctx.currentTime);
      } catch (_) {}
      this.masterGain.gain.value = linear;
    }
  }

  getOrCreateTrackNode(trackId, trackData = null) {
    const ctx = this.ensureContext();
    if (!this.trackNodes.has(trackId)) {
      const gainNode = ctx.createGain();
      let panNode = null;
      if (typeof ctx.createStereoPanner === "function") {
        panNode = ctx.createStereoPanner();
      }

      const trackState = {
        gainNode,
        panNode,
        effects: [],
        volumeDb: trackData?.volume !== undefined ? trackData.volume : 0,
        pan: trackData?.pan || 0,
        isMuted: trackData?.is_muted || false,
        isSoloed: trackData?.is_soloed || false,
      };

      // Set initial values
      const linear = trackState.isMuted ? 0 : Math.pow(10, trackState.volumeDb / 20);
      gainNode.gain.setValueAtTime(linear, ctx.currentTime);
      gainNode.gain.value = linear;
      if (panNode) {
        panNode.pan.setValueAtTime(trackState.pan, ctx.currentTime);
      }

      this.trackNodes.set(trackId, trackState);
      this.rebuildTrackGraph(trackId);
    }

    return this.trackNodes.get(trackId);
  }

  rebuildTrackGraph(trackId) {
    const node = this.trackNodes.get(trackId);
    if (!node || !this.ctx) return;

    // Disconnect internal nodes cleanly
    try {
      if (node.panNode) node.panNode.disconnect();
      node.gainNode.disconnect();
      for (const fx of node.effects) {
        fx.outputNode.disconnect();
      }
    } catch (_) {}

    // Connect: Pan -> Effect[0] -> Effect[1] -> ... -> Gain -> MasterBusInput
    let currentOut = node.panNode || null;

    if (node.effects.length === 0) {
      if (node.panNode) {
        node.panNode.connect(node.gainNode);
      }
    } else {
      for (let i = 0; i < node.effects.length; i++) {
        const fx = node.effects[i];
        if (i === 0) {
          if (node.panNode) {
            node.panNode.connect(fx.inputNode);
          }
        } else {
          node.effects[i - 1].outputNode.connect(fx.inputNode);
        }
      }
      // Connect last effect to track gain
      node.effects[node.effects.length - 1].outputNode.connect(node.gainNode);
    }

    // Connect track gain to master bus input
    node.gainNode.connect(this.masterBusInput);
  }

  addTrackEffect(trackId, effectType, params = {}) {
    const ctx = this.ensureContext();
    const trackNode = this.getOrCreateTrackNode(trackId);
    const fxId = `fx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const effect = createEffect(effectType, fxId, ctx, params);
    trackNode.effects.push(effect);
    this.rebuildTrackGraph(trackId);
    bus.emit("effects:updated", { trackId, effect: effect.getState() });
    return effect;
  }

  removeTrackEffect(trackId, effectId) {
    const trackNode = this.trackNodes.get(trackId);
    if (!trackNode) return;
    const idx = trackNode.effects.findIndex((e) => e.id === effectId);
    if (idx !== -1) {
      const fx = trackNode.effects.splice(idx, 1)[0];
      fx.dispose();
      this.rebuildTrackGraph(trackId);
      bus.emit("effects:updated", { trackId, effectId, removed: true });
    }
  }

  setTrackEffectParam(trackId, effectId, param, value) {
    const trackNode = this.trackNodes.get(trackId);
    if (!trackNode) return;
    const fx = trackNode.effects.find((e) => e.id === effectId);
    if (fx) {
      fx.setParam(param, value);
    }
  }

  setTrackEffectBypass(trackId, effectId, bypassed) {
    const trackNode = this.trackNodes.get(trackId);
    if (!trackNode) return;
    const fx = trackNode.effects.find((e) => e.id === effectId);
    if (fx) {
      fx.setBypass(bypassed);
      bus.emit("effects:updated", { trackId, effectId, bypassed: fx.bypassed });
    }
  }

  getTrackEffects(trackId) {
    const trackNode = this.trackNodes.get(trackId);
    return trackNode ? trackNode.effects : [];
  }

  // Master Effects
  rebuildMasterGraph() {
    if (!this.ctx || !this.masterBusInput || !this.masterGain) return;
    try {
      this.masterBusInput.disconnect();
      for (const fx of this.masterEffects) {
        fx.outputNode.disconnect();
      }
    } catch (_) {}

    if (this.masterEffects.length === 0) {
      this.masterBusInput.connect(this.masterGain);
    } else {
      this.masterBusInput.connect(this.masterEffects[0].inputNode);
      for (let i = 0; i < this.masterEffects.length; i++) {
        if (i < this.masterEffects.length - 1) {
          this.masterEffects[i].outputNode.connect(this.masterEffects[i + 1].inputNode);
        }
      }
      this.masterEffects[this.masterEffects.length - 1].outputNode.connect(this.masterGain);
    }
  }

  addMasterEffect(effectType, params = {}) {
    const ctx = this.ensureContext();
    const fxId = `mfx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const effect = createEffect(effectType, fxId, ctx, params);
    this.masterEffects.push(effect);
    this.rebuildMasterGraph();
    bus.emit("effects:updated", { trackId: "master", effect: effect.getState() });
    return effect;
  }

  removeMasterEffect(effectId) {
    const idx = this.masterEffects.findIndex((e) => e.id === effectId);
    if (idx !== -1) {
      const fx = this.masterEffects.splice(idx, 1)[0];
      fx.dispose();
      this.rebuildMasterGraph();
      bus.emit("effects:updated", { trackId: "master", effectId, removed: true });
    }
  }

  setMasterEffectParam(effectId, param, value) {
    const fx = this.masterEffects.find((e) => e.id === effectId);
    if (fx) {
      fx.setParam(param, value);
    }
  }

  setMasterEffectBypass(effectId, bypassed) {
    const fx = this.masterEffects.find((e) => e.id === effectId);
    if (fx) {
      fx.setBypass(bypassed);
      bus.emit("effects:updated", { trackId: "master", effectId, bypassed: fx.bypassed });
    }
  }

  getMasterEffects() {
    return this.masterEffects;
  }

  setTrackVolume(trackId, volumeDb, allTracks = null) {
    const node = this.getOrCreateTrackNode(trackId);
    node.volumeDb = volumeDb;
    this.updateTrackEffectiveGain(trackId, allTracks);
  }

  setTrackPan(trackId, pan) {
    const node = this.getOrCreateTrackNode(trackId);
    node.pan = pan;
    if (node.panNode && this.ctx) {
      try {
        node.panNode.pan.cancelScheduledValues(this.ctx.currentTime);
        node.panNode.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), this.ctx.currentTime);
      } catch (_) {}
      node.panNode.pan.value = Math.max(-1, Math.min(1, pan));
    }
  }

  setTrackMute(trackId, isMuted, allTracks = null) {
    const node = this.getOrCreateTrackNode(trackId);
    node.isMuted = isMuted;
    this.updateAllTracksEffectiveGains(allTracks);
  }

  setTrackSolo(trackId, isSoloed, allTracks = null) {
    const node = this.getOrCreateTrackNode(trackId);
    node.isSoloed = isSoloed;
    this.updateAllTracksEffectiveGains(allTracks);
  }

  updateAllTracksEffectiveGains(allTracks = null) {
    if (!this.ctx) return;

    // Check if any track is soloed
    let anySolo = false;
    if (allTracks) {
      anySolo = allTracks.some((t) => t.is_soloed);
    } else {
      for (const node of this.trackNodes.values()) {
        if (node.isSoloed) {
          anySolo = true;
          break;
        }
      }
    }

    // Apply effective gain to each track
    for (const [trackId, node] of this.trackNodes.entries()) {
      let isAudible = true;
      let trackObj = allTracks ? allTracks.find((t) => t.id === trackId) : null;
      let isMuted = trackObj ? trackObj.is_muted : node.isMuted;
      let isSoloed = trackObj ? trackObj.is_soloed : node.isSoloed;
      let vol = (trackObj && trackObj.volume !== undefined) ? trackObj.volume : node.volumeDb;

      if (isMuted) {
        isAudible = false;
      } else if (anySolo && !isSoloed) {
        isAudible = false;
      }

      const targetLinear = isAudible ? Math.pow(10, (vol || 0) / 20) : 0;
      try {
        node.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
        node.gainNode.gain.setValueAtTime(targetLinear, this.ctx.currentTime);
      } catch (_) {}
      node.gainNode.gain.value = targetLinear;
    }
  }

  updateTrackEffectiveGain(trackId, allTracks = null) {
    if (!this.ctx) return;
    const node = this.trackNodes.get(trackId);
    if (!node) return;

    let anySolo = false;
    if (allTracks) {
      anySolo = allTracks.some((t) => t.is_soloed);
    } else {
      for (const n of this.trackNodes.values()) {
        if (n.isSoloed) {
          anySolo = true;
          break;
        }
      }
    }

    let trackObj = allTracks ? allTracks.find((t) => t.id === trackId) : null;
    let isMuted = trackObj ? trackObj.is_muted : node.isMuted;
    let isSoloed = trackObj ? trackObj.is_soloed : node.isSoloed;
    let vol = (trackObj && trackObj.volume !== undefined) ? trackObj.volume : node.volumeDb;

    let isAudible = !isMuted;
    if (anySolo && !isSoloed) {
      isAudible = false;
    }

    const targetLinear = isAudible ? Math.pow(10, (vol || 0) / 20) : 0;
    try {
      node.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
      node.gainNode.gain.setValueAtTime(targetLinear, this.ctx.currentTime);
    } catch (_) {}
    node.gainNode.gain.value = targetLinear;
  }

  registerClipGain(clipId, gainNode, initialGainDb = 0) {
    if (!this.activeClipGains.has(clipId)) {
      this.activeClipGains.set(clipId, new Set());
    }
    this.activeClipGains.get(clipId).add(gainNode);
  }

  unregisterClipGain(clipId, gainNode) {
    const set = this.activeClipGains.get(clipId);
    if (set) {
      set.delete(gainNode);
      if (set.size === 0) {
        this.activeClipGains.delete(clipId);
      }
    }
  }

  setClipGain(clipId, gainDb) {
    if (!this.ctx) return;
    const set = this.activeClipGains.get(clipId);
    if (set) {
      const linear = Math.pow(10, gainDb / 20);
      for (const gainNode of set) {
        try {
          gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
          gainNode.gain.setValueAtTime(linear, this.ctx.currentTime);
        } catch (_) {}
        gainNode.gain.value = linear;
      }
    }
  }
}

export const audioEngine = new AudioEngine();
