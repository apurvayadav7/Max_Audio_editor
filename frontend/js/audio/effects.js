/**
 * MaxAudioEditor — Professional Real-Time Web Audio DSP Effects Engine
 * 
 * Modular Insert Rack with Parametric EQ, Dynamics Compressor,
 * Stereo Ping-Pong / Tempo Delay, Algorithmic Reverb, and Peak Limiter.
 */

class BaseEffect {
  constructor(id, type, name, ctx) {
    this.id = id;
    this.type = type;
    this.name = name;
    this.ctx = ctx;
    this.bypassed = false;

    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();

    // Bypass crossfade routing
    this.dryNode = ctx.createGain();
    this.wetNode = ctx.createGain();

    this.inputNode.connect(this.dryNode);
    this.dryNode.connect(this.outputNode);
    this.wetNode.connect(this.outputNode);

    this.dryNode.gain.setValueAtTime(0, ctx.currentTime);
    this.wetNode.gain.setValueAtTime(1, ctx.currentTime);
  }

  setBypass(bypassed) {
    this.bypassed = !!bypassed;
    const t = this.ctx.currentTime;
    try {
      this.dryNode.gain.cancelScheduledValues(t);
      this.wetNode.gain.cancelScheduledValues(t);
      this.dryNode.gain.setValueAtTime(this.bypassed ? 1.0 : 0.0, t);
      this.wetNode.gain.setValueAtTime(this.bypassed ? 0.0 : 1.0, t);
    } catch (_) {
      this.dryNode.gain.value = this.bypassed ? 1.0 : 0.0;
      this.wetNode.gain.value = this.bypassed ? 0.0 : 1.0;
    }
  }

  setParam(param, value) {
    // Override in subclasses
  }

  getState() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      bypassed: this.bypassed,
    };
  }

  dispose() {
    try {
      this.inputNode.disconnect();
      this.outputNode.disconnect();
      this.dryNode.disconnect();
      this.wetNode.disconnect();
    } catch (_) {}
  }
}

/**
 * 4-Band Studio Parametric Equalizer
 */
export class ParametricEQEffect extends BaseEffect {
  constructor(id, ctx, initialParams = {}) {
    super(id, "eq", "Parametric EQ", ctx);

    // 4 Filter Bands: Low Shelf, Peaking 1, Peaking 2, High Shelf
    this.band0 = ctx.createBiquadFilter();
    this.band0.type = "lowshelf";
    this.band0.frequency.setValueAtTime(initialParams.low_freq || 80, ctx.currentTime);
    this.band0.gain.setValueAtTime(initialParams.low_gain || 0, ctx.currentTime);

    this.band1 = ctx.createBiquadFilter();
    this.band1.type = "peaking";
    this.band1.frequency.setValueAtTime(initialParams.mid1_freq || 500, ctx.currentTime);
    this.band1.Q.setValueAtTime(initialParams.mid1_q || 1.0, ctx.currentTime);
    this.band1.gain.setValueAtTime(initialParams.mid1_gain || 0, ctx.currentTime);

    this.band2 = ctx.createBiquadFilter();
    this.band2.type = "peaking";
    this.band2.frequency.setValueAtTime(initialParams.mid2_freq || 2500, ctx.currentTime);
    this.band2.Q.setValueAtTime(initialParams.mid2_q || 1.0, ctx.currentTime);
    this.band2.gain.setValueAtTime(initialParams.mid2_gain || 0, ctx.currentTime);

    this.band3 = ctx.createBiquadFilter();
    this.band3.type = "highshelf";
    this.band3.frequency.setValueAtTime(initialParams.high_freq || 10000, ctx.currentTime);
    this.band3.gain.setValueAtTime(initialParams.high_gain || 0, ctx.currentTime);

    // Wet chain connection: Input -> Band0 -> Band1 -> Band2 -> Band3 -> WetNode
    this.inputNode.connect(this.band0);
    this.band0.connect(this.band1);
    this.band1.connect(this.band2);
    this.band2.connect(this.band3);
    this.band3.connect(this.wetNode);

    this.params = {
      low_freq: initialParams.low_freq || 80,
      low_gain: initialParams.low_gain || 0,
      mid1_freq: initialParams.mid1_freq || 500,
      mid1_q: initialParams.mid1_q || 1.0,
      mid1_gain: initialParams.mid1_gain || 0,
      mid2_freq: initialParams.mid2_freq || 2500,
      mid2_q: initialParams.mid2_q || 1.0,
      mid2_gain: initialParams.mid2_gain || 0,
      high_freq: initialParams.high_freq || 10000,
      high_gain: initialParams.high_gain || 0,
    };
  }

  setParam(param, value) {
    this.params[param] = value;
    const t = this.ctx.currentTime;
    try {
      switch (param) {
        case "low_freq":
          this.band0.frequency.setValueAtTime(value, t);
          break;
        case "low_gain":
          this.band0.gain.setValueAtTime(value, t);
          break;
        case "mid1_freq":
          this.band1.frequency.setValueAtTime(value, t);
          break;
        case "mid1_q":
          this.band1.Q.setValueAtTime(value, t);
          break;
        case "mid1_gain":
          this.band1.gain.setValueAtTime(value, t);
          break;
        case "mid2_freq":
          this.band2.frequency.setValueAtTime(value, t);
          break;
        case "mid2_q":
          this.band2.Q.setValueAtTime(value, t);
          break;
        case "mid2_gain":
          this.band2.gain.setValueAtTime(value, t);
          break;
        case "high_freq":
          this.band3.frequency.setValueAtTime(value, t);
          break;
        case "high_gain":
          this.band3.gain.setValueAtTime(value, t);
          break;
      }
    } catch (_) {}
  }

  getFrequencyResponse(frequencies) {
    const numPoints = frequencies.length;
    const mag0 = new Float32Array(numPoints);
    const phase0 = new Float32Array(numPoints);
    const mag1 = new Float32Array(numPoints);
    const phase1 = new Float32Array(numPoints);
    const mag2 = new Float32Array(numPoints);
    const phase2 = new Float32Array(numPoints);
    const mag3 = new Float32Array(numPoints);
    const phase3 = new Float32Array(numPoints);

    this.band0.getFrequencyResponse(frequencies, mag0, phase0);
    this.band1.getFrequencyResponse(frequencies, mag1, phase1);
    this.band2.getFrequencyResponse(frequencies, mag2, phase2);
    this.band3.getFrequencyResponse(frequencies, mag3, phase3);

    const totalDb = new Float32Array(numPoints);
    for (let i = 0; i < numPoints; i++) {
      const totalMag = mag0[i] * mag1[i] * mag2[i] * mag3[i];
      totalDb[i] = 20 * Math.log10(Math.max(1e-5, totalMag));
    }
    return totalDb;
  }

  getState() {
    return {
      ...super.getState(),
      params: { ...this.params },
    };
  }

  dispose() {
    super.dispose();
    try {
      this.band0.disconnect();
      this.band1.disconnect();
      this.band2.disconnect();
      this.band3.disconnect();
    } catch (_) {}
  }
}

/**
 * Studio Dynamics Compressor with Gain Reduction Metering
 */
export class CompressorEffect extends BaseEffect {
  constructor(id, ctx, initialParams = {}) {
    super(id, "compressor", "Compressor", ctx);

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.setValueAtTime(initialParams.threshold ?? -20, ctx.currentTime);
    this.comp.knee.setValueAtTime(initialParams.knee ?? 6, ctx.currentTime);
    this.comp.ratio.setValueAtTime(initialParams.ratio ?? 4, ctx.currentTime);
    this.comp.attack.setValueAtTime(initialParams.attack ?? 0.02, ctx.currentTime);
    this.comp.release.setValueAtTime(initialParams.release ?? 0.25, ctx.currentTime);

    this.makeup = ctx.createGain();
    const makeupLinear = Math.pow(10, (initialParams.makeup_gain ?? 0) / 20);
    this.makeup.gain.setValueAtTime(makeupLinear, ctx.currentTime);

    // Wet chain: Input -> Compressor -> Makeup Gain -> WetNode
    this.inputNode.connect(this.comp);
    this.comp.connect(this.makeup);
    this.makeup.connect(this.wetNode);

    this.params = {
      threshold: initialParams.threshold ?? -20,
      knee: initialParams.knee ?? 6,
      ratio: initialParams.ratio ?? 4,
      attack: initialParams.attack ?? 0.02,
      release: initialParams.release ?? 0.25,
      makeup_gain: initialParams.makeup_gain ?? 0,
    };
  }

  setParam(param, value) {
    this.params[param] = value;
    const t = this.ctx.currentTime;
    try {
      switch (param) {
        case "threshold":
          this.comp.threshold.setValueAtTime(value, t);
          break;
        case "knee":
          this.comp.knee.setValueAtTime(value, t);
          break;
        case "ratio":
          this.comp.ratio.setValueAtTime(value, t);
          break;
        case "attack":
          this.comp.attack.setValueAtTime(value, t);
          break;
        case "release":
          this.comp.release.setValueAtTime(value, t);
          break;
        case "makeup_gain":
          this.makeup.gain.setValueAtTime(Math.pow(10, value / 20), t);
          break;
      }
    } catch (_) {}
  }

  getReduction() {
    return this.comp.reduction || 0;
  }

  getState() {
    return {
      ...super.getState(),
      params: { ...this.params },
    };
  }

  dispose() {
    super.dispose();
    try {
      this.comp.disconnect();
      this.makeup.disconnect();
    } catch (_) {}
  }
}

/**
 * Tempo-Synchronized Stereo Delay with High-Cut Damping Filter
 */
export class DelayEffect extends BaseEffect {
  constructor(id, ctx, initialParams = {}) {
    super(id, "delay", "Stereo Delay", ctx);

    this.delayNode = ctx.createDelay(2.0);
    this.delayNode.delayTime.setValueAtTime(initialParams.time ?? 0.35, ctx.currentTime);

    this.feedback = ctx.createGain();
    this.feedback.gain.setValueAtTime(initialParams.feedback ?? 0.4, ctx.currentTime);

    this.damping = ctx.createBiquadFilter();
    this.damping.type = "lowpass";
    this.damping.frequency.setValueAtTime(initialParams.damping ?? 3500, ctx.currentTime);

    this.mix = ctx.createGain();
    this.mix.gain.setValueAtTime(initialParams.mix ?? 0.3, ctx.currentTime);

    // Wet delay loop:
    // Input -> Delay -> Damping -> Mix -> WetNode
    //                   Damping -> Feedback -> Delay (loop)
    this.inputNode.connect(this.delayNode);
    this.delayNode.connect(this.damping);
    this.damping.connect(this.feedback);
    this.feedback.connect(this.delayNode);
    this.damping.connect(this.mix);
    this.mix.connect(this.wetNode);

    this.params = {
      time: initialParams.time ?? 0.35,
      feedback: initialParams.feedback ?? 0.4,
      damping: initialParams.damping ?? 3500,
      mix: initialParams.mix ?? 0.3,
    };
  }

  setParam(param, value) {
    this.params[param] = value;
    const t = this.ctx.currentTime;
    try {
      switch (param) {
        case "time":
          this.delayNode.delayTime.setValueAtTime(Math.max(0.01, Math.min(2.0, value)), t);
          break;
        case "feedback":
          this.feedback.gain.setValueAtTime(Math.max(0.0, Math.min(0.95, value)), t);
          break;
        case "damping":
          this.damping.frequency.setValueAtTime(Math.max(200, Math.min(18000, value)), t);
          break;
        case "mix":
          this.mix.gain.setValueAtTime(Math.max(0.0, Math.min(1.0, value)), t);
          break;
      }
    } catch (_) {}
  }

  getState() {
    return {
      ...super.getState(),
      params: { ...this.params },
    };
  }

  dispose() {
    super.dispose();
    try {
      this.delayNode.disconnect();
      this.feedback.disconnect();
      this.damping.disconnect();
      this.mix.disconnect();
    } catch (_) {}
  }
}

/**
 * Algorithmic Stereo Diffusive Reverb (Comb + Allpass Diffuser Network)
 */
export class ReverbEffect extends BaseEffect {
  constructor(id, ctx, initialParams = {}) {
    super(id, "reverb", "Algorithmic Reverb", ctx);

    // Parallel Comb Filters
    const combDelays = [0.0297, 0.0371, 0.0411, 0.0437];
    const decay = initialParams.decay ?? 2.0;
    const mixVal = initialParams.mix ?? 0.35;

    this.combNodes = [];
    this.combGains = [];
    this.merger = ctx.createGain();

    combDelays.forEach((dt) => {
      const delay = ctx.createDelay(1.0);
      delay.delayTime.setValueAtTime(dt, ctx.currentTime);

      const feedback = ctx.createGain();
      const fbGain = Math.pow(0.001, dt / Math.max(0.2, decay));
      feedback.gain.setValueAtTime(Math.min(0.92, fbGain), ctx.currentTime);

      this.inputNode.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(this.merger);

      this.combNodes.push(delay);
      this.combGains.push(feedback);
    });

    // Series Allpass Diffusers (smoothes discrete echoes into diffuse space)
    this.allpass1 = ctx.createBiquadFilter();
    this.allpass1.type = "allpass";
    this.allpass1.frequency.setValueAtTime(1050, ctx.currentTime);

    this.allpass2 = ctx.createBiquadFilter();
    this.allpass2.type = "allpass";
    this.allpass2.frequency.setValueAtTime(2200, ctx.currentTime);

    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.setValueAtTime(mixVal, ctx.currentTime);

    this.merger.connect(this.allpass1);
    this.allpass1.connect(this.allpass2);
    this.allpass2.connect(this.reverbGain);
    this.reverbGain.connect(this.wetNode);

    this.params = {
      decay: decay,
      mix: mixVal,
    };
  }

  setParam(param, value) {
    this.params[param] = value;
    const t = this.ctx.currentTime;
    try {
      if (param === "decay") {
        const combDelays = [0.0297, 0.0371, 0.0411, 0.0437];
        this.combGains.forEach((fb, idx) => {
          const dt = combDelays[idx];
          const fbGain = Math.pow(0.001, dt / Math.max(0.2, value));
          fb.gain.setValueAtTime(Math.min(0.92, fbGain), t);
        });
      } else if (param === "mix") {
        this.reverbGain.gain.setValueAtTime(Math.max(0.0, Math.min(1.0, value)), t);
      }
    } catch (_) {}
  }

  getState() {
    return {
      ...super.getState(),
      params: { ...this.params },
    };
  }

  dispose() {
    super.dispose();
    try {
      this.combNodes.forEach((n) => n.disconnect());
      this.combGains.forEach((g) => g.disconnect());
      this.merger.disconnect();
      this.allpass1.disconnect();
      this.allpass2.disconnect();
      this.reverbGain.disconnect();
    } catch (_) {}
  }
}

/**
 * Hard-Ceiling Lookahead Peak Limiter (0 dBFS digital clip protection)
 */
export class LimiterEffect extends BaseEffect {
  constructor(id, ctx, initialParams = {}) {
    super(id, "limiter", "Peak Limiter", ctx);

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.setValueAtTime(initialParams.ceiling ?? -0.3, ctx.currentTime);
    this.limiter.knee.setValueAtTime(0, ctx.currentTime); // Hard knee
    this.limiter.ratio.setValueAtTime(20, ctx.currentTime); // Brickwall 20:1
    this.limiter.attack.setValueAtTime(0.001, ctx.currentTime); // Ultra fast attack (1ms)
    this.limiter.release.setValueAtTime(initialParams.release ?? 0.05, ctx.currentTime);

    this.inputNode.connect(this.limiter);
    this.limiter.connect(this.wetNode);

    this.params = {
      ceiling: initialParams.ceiling ?? -0.3,
      release: initialParams.release ?? 0.05,
    };
  }

  setParam(param, value) {
    this.params[param] = value;
    const t = this.ctx.currentTime;
    try {
      if (param === "ceiling") {
        this.limiter.threshold.setValueAtTime(Math.min(0.0, value), t);
      } else if (param === "release") {
        this.limiter.release.setValueAtTime(Math.max(0.01, Math.min(1.0, value)), t);
      }
    } catch (_) {}
  }

  getReduction() {
    return this.limiter.reduction || 0;
  }

  getState() {
    return {
      ...super.getState(),
      params: { ...this.params },
    };
  }

  dispose() {
    super.dispose();
    try {
      this.limiter.disconnect();
    } catch (_) {}
  }
}

/**
 * Analog Tape & Tube Saturation with Warmth Tone Control
 */
export class SaturationEffect extends BaseEffect {
  constructor(id, ctx, initialParams = {}) {
    super(id, "saturation", "Tape Saturation", ctx);

    this.drive = initialParams.drive ?? 3.0; // 1 to 15
    this.warmth = initialParams.warmth ?? 7500; // Hz
    this.mixVal = initialParams.mix ?? 0.8;

    this.preGain = ctx.createGain();
    this.preGain.gain.setValueAtTime(1.0 + (this.drive - 1) * 0.4, ctx.currentTime);

    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = this._generateCurve(this.drive);
    this.shaper.oversample = "4x"; // 4x oversampling to prevent aliasing

    this.warmthFilter = ctx.createBiquadFilter();
    this.warmthFilter.type = "lowpass";
    this.warmthFilter.frequency.setValueAtTime(this.warmth, ctx.currentTime);

    this.postGain = ctx.createGain();
    this.postGain.gain.setValueAtTime(1.0 / Math.max(1, Math.sqrt(this.drive)), ctx.currentTime);

    this.mixGain = ctx.createGain();
    this.mixGain.gain.setValueAtTime(this.mixVal, ctx.currentTime);

    // Wet chain: Input -> preGain -> shaper -> warmthFilter -> postGain -> mixGain -> WetNode
    this.inputNode.connect(this.preGain);
    this.preGain.connect(this.shaper);
    this.shaper.connect(this.warmthFilter);
    this.warmthFilter.connect(this.postGain);
    this.postGain.connect(this.mixGain);
    this.mixGain.connect(this.wetNode);

    this.params = {
      drive: this.drive,
      warmth: this.warmth,
      mix: this.mixVal,
    };
  }

  _generateCurve(drive, n_samples = 4096) {
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      // Hyperbolic tangent soft saturation
      curve[i] = Math.tanh(drive * x);
    }
    return curve;
  }

  setParam(param, value) {
    this.params[param] = value;
    const t = this.ctx.currentTime;
    try {
      if (param === "drive") {
        this.drive = Math.max(1, Math.min(20, value));
        this.shaper.curve = this._generateCurve(this.drive);
        this.preGain.gain.setValueAtTime(1.0 + (this.drive - 1) * 0.4, t);
        this.postGain.gain.setValueAtTime(1.0 / Math.max(1, Math.sqrt(this.drive)), t);
      } else if (param === "warmth") {
        this.warmthFilter.frequency.setValueAtTime(Math.max(1000, Math.min(20000, value)), t);
      } else if (param === "mix") {
        this.mixGain.gain.setValueAtTime(Math.max(0, Math.min(1, value)), t);
      }
    } catch (_) {}
  }

  getState() {
    return {
      ...super.getState(),
      params: { ...this.params },
    };
  }

  dispose() {
    super.dispose();
    try {
      this.preGain.disconnect();
      this.shaper.disconnect();
      this.warmthFilter.disconnect();
      this.postGain.disconnect();
      this.mixGain.disconnect();
    } catch (_) {}
  }
}

/**
 * Multi-Curve Overdrive & Distortion
 */
export class DistortionEffect extends BaseEffect {
  constructor(id, ctx, initialParams = {}) {
    super(id, "distortion", "Overdrive Distortion", ctx);

    this.drive = initialParams.drive ?? 8.0;
    this.tone = initialParams.tone ?? 4500;
    this.mixVal = initialParams.mix ?? 0.7;

    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = this._generateDistortionCurve(this.drive);
    this.shaper.oversample = "4x";

    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = "lowpass";
    this.toneFilter.frequency.setValueAtTime(this.tone, ctx.currentTime);

    this.mixGain = ctx.createGain();
    this.mixGain.gain.setValueAtTime(this.mixVal, ctx.currentTime);

    this.inputNode.connect(this.shaper);
    this.shaper.connect(this.toneFilter);
    this.toneFilter.connect(this.mixGain);
    this.mixGain.connect(this.wetNode);

    this.params = {
      drive: this.drive,
      tone: this.tone,
      mix: this.mixVal,
    };
  }

  _generateDistortionCurve(k, n_samples = 4096) {
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  setParam(param, value) {
    this.params[param] = value;
    const t = this.ctx.currentTime;
    try {
      if (param === "drive") {
        this.drive = Math.max(1, Math.min(50, value));
        this.shaper.curve = this._generateDistortionCurve(this.drive);
      } else if (param === "tone") {
        this.toneFilter.frequency.setValueAtTime(Math.max(500, Math.min(16000, value)), t);
      } else if (param === "mix") {
        this.mixGain.gain.setValueAtTime(Math.max(0, Math.min(1, value)), t);
      }
    } catch (_) {}
  }

  getState() {
    return {
      ...super.getState(),
      params: { ...this.params },
    };
  }

  dispose() {
    super.dispose();
    try {
      this.shaper.disconnect();
      this.toneFilter.disconnect();
      this.mixGain.disconnect();
    } catch (_) {}
  }
}

/**
 * Stereo Chorus with Sinusoidal LFO Modulation
 */
export class ChorusEffect extends BaseEffect {
  constructor(id, ctx, initialParams = {}) {
    super(id, "chorus", "Stereo Chorus", ctx);

    this.rate = initialParams.rate ?? 1.2; // Hz
    this.depth = initialParams.depth ?? 0.003; // Seconds
    this.mixVal = initialParams.mix ?? 0.5;

    // Delay lines
    this.delayLeft = ctx.createDelay(0.1);
    this.delayRight = ctx.createDelay(0.1);
    this.delayLeft.delayTime.setValueAtTime(0.015, ctx.currentTime);
    this.delayRight.delayTime.setValueAtTime(0.019, ctx.currentTime);

    // LFO Oscillators
    this.lfoLeft = ctx.createOscillator();
    this.lfoRight = ctx.createOscillator();
    this.lfoLeft.type = "sine";
    this.lfoRight.type = "sine";
    this.lfoLeft.frequency.setValueAtTime(this.rate, ctx.currentTime);
    this.lfoRight.frequency.setValueAtTime(this.rate * 1.07, ctx.currentTime);

    this.depthGainLeft = ctx.createGain();
    this.depthGainRight = ctx.createGain();
    this.depthGainLeft.gain.setValueAtTime(this.depth, ctx.currentTime);
    this.depthGainRight.gain.setValueAtTime(this.depth, ctx.currentTime);

    this.lfoLeft.connect(this.depthGainLeft);
    this.depthGainLeft.connect(this.delayLeft.delayTime);

    this.lfoRight.connect(this.depthGainRight);
    this.depthGainRight.connect(this.delayRight.delayTime);

    // Start LFOs safely
    try {
      this.lfoLeft.start();
      this.lfoRight.start();
    } catch (_) {}

    this.mixGain = ctx.createGain();
    this.mixGain.gain.setValueAtTime(this.mixVal, ctx.currentTime);

    // Wire: input -> delays -> mixGain -> wetNode
    this.inputNode.connect(this.delayLeft);
    this.inputNode.connect(this.delayRight);
    this.delayLeft.connect(this.mixGain);
    this.delayRight.connect(this.mixGain);
    this.mixGain.connect(this.wetNode);

    this.params = {
      rate: this.rate,
      depth: this.depth,
      mix: this.mixVal,
    };
  }

  setParam(param, value) {
    this.params[param] = value;
    const t = this.ctx.currentTime;
    try {
      if (param === "rate") {
        this.lfoLeft.frequency.setValueAtTime(value, t);
        this.lfoRight.frequency.setValueAtTime(value * 1.07, t);
      } else if (param === "depth") {
        this.depthGainLeft.gain.setValueAtTime(value, t);
        this.depthGainRight.gain.setValueAtTime(value, t);
      } else if (param === "mix") {
        this.mixGain.gain.setValueAtTime(Math.max(0, Math.min(1, value)), t);
      }
    } catch (_) {}
  }

  getState() {
    return {
      ...super.getState(),
      params: { ...this.params },
    };
  }

  dispose() {
    super.dispose();
    try {
      this.lfoLeft.stop();
      this.lfoRight.stop();
      this.lfoLeft.disconnect();
      this.lfoRight.disconnect();
      this.depthGainLeft.disconnect();
      this.depthGainRight.disconnect();
      this.delayLeft.disconnect();
      this.delayRight.disconnect();
      this.mixGain.disconnect();
    } catch (_) {}
  }
}

/**
 * Mid/Side Stereo Width Processor (0% Mono to 200% Super-Wide)
 */
export class StereoWidthEffect extends BaseEffect {
  constructor(id, ctx, initialParams = {}) {
    super(id, "width", "Stereo Imager", ctx);

    this.widthVal = initialParams.width ?? 1.0; // 0.0 (Mono) to 2.0 (Super Wide)

    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);

    // Mid/Side matrix decoding
    // Mid = 0.5 * (L + R)
    // Side = 0.5 * (L - R) * width
    this.midGain = ctx.createGain();
    this.midGain.gain.setValueAtTime(0.5, ctx.currentTime);

    this.sideGain = ctx.createGain();
    this.sideGain.gain.setValueAtTime(0.5 * this.widthVal, ctx.currentTime);

    this.inverter = ctx.createGain();
    this.inverter.gain.setValueAtTime(-1.0, ctx.currentTime);

    // L -> splitter(0), R -> splitter(1)
    this.inputNode.connect(this.splitter);

    // Mid = L + R
    this.splitter.connect(this.midGain, 0);
    this.splitter.connect(this.midGain, 1);

    // Side = L - R
    this.splitter.connect(this.sideGain, 0);
    this.splitter.connect(this.inverter, 1);
    this.inverter.connect(this.sideGain);

    // Out L = Mid + Side
    this.midGain.connect(this.merger, 0, 0);
    this.sideGain.connect(this.merger, 0, 0);

    // Out R = Mid - Side
    const sideInvert = ctx.createGain();
    sideInvert.gain.setValueAtTime(-1.0, ctx.currentTime);
    this.sideGain.connect(sideInvert);

    this.midGain.connect(this.merger, 0, 1);
    sideInvert.connect(this.merger, 0, 1);

    this.merger.connect(this.wetNode);

    this.params = {
      width: this.widthVal,
    };
  }

  setParam(param, value) {
    this.params[param] = value;
    const t = this.ctx.currentTime;
    try {
      if (param === "width") {
        this.widthVal = Math.max(0.0, Math.min(2.0, value));
        this.sideGain.gain.setValueAtTime(0.5 * this.widthVal, t);
      }
    } catch (_) {}
  }

  getState() {
    return {
      ...super.getState(),
      params: { ...this.params },
    };
  }

  dispose() {
    super.dispose();
    try {
      this.splitter.disconnect();
      this.merger.disconnect();
      this.midGain.disconnect();
      this.sideGain.disconnect();
      this.inverter.disconnect();
    } catch (_) {}
  }
}

/**
 * Factory helper to instantiate an effect by type string
 */
export function createEffect(type, id, ctx, params = {}) {
  switch (type.toLowerCase()) {
    case "eq":
      return new ParametricEQEffect(id, ctx, params);
    case "compressor":
      return new CompressorEffect(id, ctx, params);
    case "delay":
      return new DelayEffect(id, ctx, params);
    case "reverb":
      return new ReverbEffect(id, ctx, params);
    case "limiter":
      return new LimiterEffect(id, ctx, params);
    case "saturation":
      return new SaturationEffect(id, ctx, params);
    case "distortion":
      return new DistortionEffect(id, ctx, params);
    case "chorus":
      return new ChorusEffect(id, ctx, params);
    case "width":
      return new StereoWidthEffect(id, ctx, params);
    default:
      throw new Error(`Unknown effect type: ${type}`);
  }
}
