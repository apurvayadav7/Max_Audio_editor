/**
 * Channel Strip & Effect Preset Management Engine
 */

export const FACTORY_PRESETS = {
  eq: {
    "Default (Flat)": { low_gain: 0, mid1_gain: 0, mid2_gain: 0, high_gain: 0 },
    "Vocal Air Boost": { low_gain: -2, mid1_gain: 1.5, mid2_gain: 3.0, high_gain: 6.0 },
    "808 Bass Punch": { low_gain: 6.5, mid1_gain: -3.5, mid2_gain: -1.0, high_gain: -3.0 },
    "Snare Crack": { low_gain: -4.0, mid1_gain: 2.5, mid2_gain: 5.0, high_gain: 3.5 },
    "Telephone Lo-Fi": { low_gain: -15.0, mid1_gain: 6.0, mid2_gain: 4.0, high_gain: -18.0 },
  },
  compressor: {
    "Default (Transparent)": { threshold: -20, ratio: 4, attack: 0.02, release: 0.25, makeup_gain: 2 },
    "Vocal Opto Leveler": { threshold: -24, ratio: 3.5, attack: 0.01, release: 0.4, makeup_gain: 4 },
    "Drum Smash (Punch)": { threshold: -32, ratio: 10, attack: 0.005, release: 0.08, makeup_gain: 7 },
    "Master Bus Glue": { threshold: -14, ratio: 2.0, attack: 0.03, release: 0.15, makeup_gain: 1.5 },
  },
  delay: {
    "Default (1/4 Note)": { time: 0.35, feedback: 0.4, damping: 3500, mix: 0.3 },
    "Slapback 80ms": { time: 0.08, feedback: 0.15, damping: 3000, mix: 0.35 },
    "Dotted Eighth Ping-Pong": { time: 0.375, feedback: 0.45, damping: 4500, mix: 0.4 },
    "Ambient Space Trail": { time: 0.65, feedback: 0.75, damping: 2200, mix: 0.55 },
  },
  reverb: {
    "Default (Medium Hall)": { decay: 2.0, mix: 0.35 },
    "Vocal Plate (Bright)": { decay: 2.4, mix: 0.38 },
    "Cyberpunk Space (Huge)": { decay: 5.0, mix: 0.55 },
    "Tight Drum Room": { decay: 0.85, mix: 0.22 },
  },
  limiter: {
    "Safety Ceiling (-0.3 dBFS)": { ceiling: -0.3, release: 0.05 },
    "Loud Commercial Master": { ceiling: -0.1, release: 0.02 },
    "Gentle Limiting (-1.0 dBFS)": { ceiling: -1.0, release: 0.08 },
  },
  saturation: {
    "Warm Analog Tape": { drive: 3.5, warmth: 6800, mix: 0.85 },
    "Tube Preamp Drive": { drive: 6.5, warmth: 5200, mix: 0.75 },
    "Extreme Saturated Crunch": { drive: 12.0, warmth: 9000, mix: 0.95 },
  },
  distortion: {
    "Guitar Stompbox": { drive: 14.0, tone: 3800, mix: 0.8 },
    "Sub Bass Growl": { drive: 6.0, tone: 1800, mix: 0.65 },
    "Fuzz Lead": { drive: 25.0, tone: 5500, mix: 0.85 },
  },
  chorus: {
    "Lush Stereo Dimension": { rate: 1.2, depth: 0.003, mix: 0.5 },
    "Fast Shimmer": { rate: 3.5, depth: 0.002, mix: 0.6 },
    "Deep Flange Sweep": { rate: 0.4, depth: 0.008, mix: 0.65 },
  },
  width: {
    "Mono Check (0%)": { width: 0.0 },
    "Natural Stereo (100%)": { width: 1.0 },
    "Super Wide Spatial (160%)": { width: 1.6 },
  },
};

class PresetManager {
  constructor() {
    this.storageKey = "maxaudio_user_presets";
  }

  getUserPresets() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : {};
    } catch (_) {
      return {};
    }
  }

  getAllPresets(effectType) {
    const factory = FACTORY_PRESETS[effectType] || {};
    const user = this.getUserPresets()[effectType] || {};
    return {
      factory,
      user,
    };
  }

  applyPreset(effectInstance, presetParams) {
    if (!effectInstance || !presetParams) return;
    for (const [param, val] of Object.entries(presetParams)) {
      effectInstance.setParam(param, val);
    }
  }

  saveUserPreset(effectType, presetName, params) {
    const current = this.getUserPresets();
    if (!current[effectType]) {
      current[effectType] = {};
    }
    current[effectType][presetName] = { ...params };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(current));
      return true;
    } catch (e) {
      console.error("[PresetManager] Error saving user preset:", e);
      return false;
    }
  }

  deleteUserPreset(effectType, presetName) {
    const current = this.getUserPresets();
    if (current[effectType] && current[effectType][presetName]) {
      delete current[effectType][presetName];
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(current));
        return true;
      } catch (_) {}
    }
    return false;
  }
}

export const presetManager = new PresetManager();
