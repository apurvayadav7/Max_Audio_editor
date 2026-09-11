/**
 * Studio Effects Rack Panel UI
 * 
 * Hardware DSP aesthetic, real-time interactive parameters,
 * live Parametric EQ curve canvas, and per-track / master routing.
 */

import { bus } from "../core/event-bus.js";
import { store } from "../state/store.js";
import { audioEngine } from "../audio/engine.js";
import { presetManager } from "../audio/presets.js";

export class EffectsPanel {
  constructor() {
    this.container = null;
    this.selectedTarget = "master"; // 'master' or trackId
    this.rafId = null;
  }

  init() {
    this.container = document.getElementById("panel-effects");
    if (!this.container) return;

    this.bindEvents();
    this.render();
    this.startAnimationLoop();
  }

  bindEvents() {
    bus.on("project:loaded", () => {
      this.render();
    });

    bus.on("effects:updated", () => {
      this.render();
    });

    bus.on("track:selected", (trackId) => {
      this.selectedTarget = trackId;
      this.render();
    });
  }

  getTargetName() {
    if (this.selectedTarget === "master") return "Master Output Bus";
    const { project } = store.getState();
    if (project && project.tracks) {
      const trk = project.tracks.find((t) => t.id === this.selectedTarget);
      if (trk) return `Track: ${trk.name}`;
    }
    return "Selected Track";
  }

  getEffectsList() {
    if (this.selectedTarget === "master") {
      return audioEngine.getMasterEffects();
    }
    return audioEngine.getTrackEffects(this.selectedTarget);
  }

  render() {
    if (!this.container) return;
    const { project } = store.getState();
    const tracks = project ? project.tracks || [] : [];
    const effects = this.getEffectsList();

    this.container.innerHTML = `
      <div class="fx-rack-toolbar">
        <div class="fx-rack-title">
          <span>⚡ FX RACK</span>
          <select id="fx-target-select" style="padding: 4px 8px; border-radius: 4px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-subtle); font-size: 11px;">
            <option value="master" ${this.selectedTarget === "master" ? "selected" : ""}>🎛 Master Output Bus</option>
            ${tracks
              .map(
                (t) => `
              <option value="${t.id}" ${this.selectedTarget === t.id ? "selected" : ""}>🎵 Track: ${t.name}</option>
            `
              )
              .join("")}
          </select>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <select id="fx-add-type" style="padding: 4px 8px; border-radius: 4px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-subtle); font-size: 11px;">
            <option value="eq">Parametric EQ (4-Band)</option>
            <option value="compressor">Dynamics Compressor</option>
            <option value="delay">Stereo Delay</option>
            <option value="reverb">Algorithmic Reverb</option>
            <option value="limiter">Peak Limiter</option>
            <option value="saturation">Tape Saturation</option>
            <option value="distortion">Overdrive Distortion</option>
            <option value="chorus">Stereo Chorus</option>
            <option value="width">Stereo Width</option>
          </select>
          <button id="btn-add-fx" class="btn btn-primary" style="padding: 4px 10px; font-size: 11px;">+ Insert Effect</button>
        </div>
      </div>

      <div class="fx-rack-container" id="fx-rack-bay">
        ${
          effects.length === 0
            ? `
          <div class="fx-empty-state">
            <div style="font-size: 28px; margin-bottom: 8px;">🎛️</div>
            <div>No insert effects on <b>${this.getTargetName()}</b>.</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
              Select an effect above and click <b>+ Insert Effect</b> to start shaping your sound.
            </div>
          </div>
        `
            : effects.map((fx) => this.renderEffectCard(fx)).join("")
        }
      </div>
    `;

    this.bindRackActions();
    this.drawAllEQCurves();
  }

  renderEffectCard(fx) {
    const isBypassed = fx.bypassed;
    let bodyContent = "";

    if (fx.type === "eq") {
      bodyContent = `
        <canvas class="fx-eq-canvas" data-fx-id="${fx.id}" width="280" height="85"></canvas>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <div class="fx-param-row">
              <span class="fx-param-label">LOW GAIN</span>
              <span class="fx-param-value" id="val-${fx.id}-low_gain">${(fx.params.low_gain || 0) > 0 ? "+" : ""}${fx.params.low_gain || 0} dB</span>
            </div>
            <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="low_gain" min="-18" max="18" step="0.5" value="${fx.params.low_gain || 0}">
          </div>
          <div>
            <div class="fx-param-row">
              <span class="fx-param-label">HIGH GAIN</span>
              <span class="fx-param-value" id="val-${fx.id}-high_gain">${(fx.params.high_gain || 0) > 0 ? "+" : ""}${fx.params.high_gain || 0} dB</span>
            </div>
            <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="high_gain" min="-18" max="18" step="0.5" value="${fx.params.high_gain || 0}">
          </div>
          <div>
            <div class="fx-param-row">
              <span class="fx-param-label">MID 1 GAIN</span>
              <span class="fx-param-value" id="val-${fx.id}-mid1_gain">${(fx.params.mid1_gain || 0) > 0 ? "+" : ""}${fx.params.mid1_gain || 0} dB</span>
            </div>
            <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="mid1_gain" min="-18" max="18" step="0.5" value="${fx.params.mid1_gain || 0}">
          </div>
          <div>
            <div class="fx-param-row">
              <span class="fx-param-label">MID 2 GAIN</span>
              <span class="fx-param-value" id="val-${fx.id}-mid2_gain">${(fx.params.mid2_gain || 0) > 0 ? "+" : ""}${fx.params.mid2_gain || 0} dB</span>
            </div>
            <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="mid2_gain" min="-18" max="18" step="0.5" value="${fx.params.mid2_gain || 0}">
          </div>
        </div>
      `;
    } else if (fx.type === "compressor") {
      bodyContent = `
        <div class="fx-param-row">
          <span class="fx-param-label">THRESHOLD</span>
          <span class="fx-param-value" id="val-${fx.id}-threshold">${fx.params.threshold} dB</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="threshold" min="-60" max="0" step="1" value="${fx.params.threshold}">

        <div class="fx-param-row">
          <span class="fx-param-label">RATIO</span>
          <span class="fx-param-value" id="val-${fx.id}-ratio">${fx.params.ratio}:1</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="ratio" min="1" max="20" step="0.5" value="${fx.params.ratio}">

        <div class="fx-param-row">
          <span class="fx-param-label">ATTACK</span>
          <span class="fx-param-value" id="val-${fx.id}-attack">${(fx.params.attack * 1000).toFixed(0)} ms</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="attack" min="0.001" max="0.2" step="0.005" value="${fx.params.attack}">

        <div class="fx-param-row">
          <span class="fx-param-label">RELEASE</span>
          <span class="fx-param-value" id="val-${fx.id}-release">${(fx.params.release * 1000).toFixed(0)} ms</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="release" min="0.05" max="1.0" step="0.05" value="${fx.params.release}">

        <div class="fx-param-row">
          <span class="fx-param-label">MAKEUP GAIN</span>
          <span class="fx-param-value" id="val-${fx.id}-makeup_gain">${(fx.params.makeup_gain || 0) > 0 ? "+" : ""}${fx.params.makeup_gain || 0} dB</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="makeup_gain" min="-12" max="18" step="0.5" value="${fx.params.makeup_gain || 0}">
      `;
    } else if (fx.type === "delay") {
      bodyContent = `
        <div class="fx-param-row">
          <span class="fx-param-label">DELAY TIME</span>
          <span class="fx-param-value" id="val-${fx.id}-time">${(fx.params.time * 1000).toFixed(0)} ms</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="time" min="0.05" max="1.0" step="0.01" value="${fx.params.time}">

        <div class="fx-param-row">
          <span class="fx-param-label">FEEDBACK</span>
          <span class="fx-param-value" id="val-${fx.id}-feedback">${(fx.params.feedback * 100).toFixed(0)}%</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="feedback" min="0.0" max="0.9" step="0.05" value="${fx.params.feedback}">

        <div class="fx-param-row">
          <span class="fx-param-label">DAMPING</span>
          <span class="fx-param-value" id="val-${fx.id}-damping">${fx.params.damping} Hz</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="damping" min="500" max="10000" step="250" value="${fx.params.damping}">

        <div class="fx-param-row">
          <span class="fx-param-label">WET / DRY MIX</span>
          <span class="fx-param-value" id="val-${fx.id}-mix">${(fx.params.mix * 100).toFixed(0)}%</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="mix" min="0.0" max="1.0" step="0.02" value="${fx.params.mix}">
      `;
    } else if (fx.type === "reverb") {
      bodyContent = `
        <div class="fx-param-row">
          <span class="fx-param-label">DECAY TIME</span>
          <span class="fx-param-value" id="val-${fx.id}-decay">${fx.params.decay.toFixed(1)} s</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="decay" min="0.5" max="6.0" step="0.2" value="${fx.params.decay}">

        <div class="fx-param-row">
          <span class="fx-param-label">WET / DRY MIX</span>
          <span class="fx-param-value" id="val-${fx.id}-mix">${(fx.params.mix * 100).toFixed(0)}%</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="mix" min="0.0" max="1.0" step="0.02" value="${fx.params.mix}">
      `;
    } else if (fx.type === "limiter") {
      bodyContent = `
        <div class="fx-param-row">
          <span class="fx-param-label">CEILING (MAX PEAK)</span>
          <span class="fx-param-value" id="val-${fx.id}-ceiling">${fx.params.ceiling.toFixed(1)} dBFS</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="ceiling" min="-6.0" max="0.0" step="0.1" value="${fx.params.ceiling}">

        <div class="fx-param-row">
          <span class="fx-param-label">RELEASE SPEED</span>
          <span class="fx-param-value" id="val-${fx.id}-release">${(fx.params.release * 1000).toFixed(0)} ms</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="release" min="0.01" max="0.5" step="0.01" value="${fx.params.release}">
      `;
    } else if (fx.type === "saturation") {
      bodyContent = `
        <div class="fx-param-row">
          <span class="fx-param-label">DRIVE (WARMTH)</span>
          <span class="fx-param-value" id="val-${fx.id}-drive">${fx.params.drive.toFixed(1)}x</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="drive" min="1" max="15" step="0.5" value="${fx.params.drive}">

        <div class="fx-param-row">
          <span class="fx-param-label">WARMTH FILTER</span>
          <span class="fx-param-value" id="val-${fx.id}-warmth">${fx.params.warmth} Hz</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="warmth" min="2000" max="16000" step="250" value="${fx.params.warmth}">

        <div class="fx-param-row">
          <span class="fx-param-label">WET / DRY MIX</span>
          <span class="fx-param-value" id="val-${fx.id}-mix">${(fx.params.mix * 100).toFixed(0)}%</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="mix" min="0.0" max="1.0" step="0.02" value="${fx.params.mix}">
      `;
    } else if (fx.type === "distortion") {
      bodyContent = `
        <div class="fx-param-row">
          <span class="fx-param-label">OVERDRIVE GAIN</span>
          <span class="fx-param-value" id="val-${fx.id}-drive">${fx.params.drive.toFixed(1)}x</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="drive" min="1" max="40" step="1" value="${fx.params.drive}">

        <div class="fx-param-row">
          <span class="fx-param-label">TONE FILTER</span>
          <span class="fx-param-value" id="val-${fx.id}-tone">${fx.params.tone} Hz</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="tone" min="1000" max="12000" step="250" value="${fx.params.tone}">

        <div class="fx-param-row">
          <span class="fx-param-label">WET / DRY MIX</span>
          <span class="fx-param-value" id="val-${fx.id}-mix">${(fx.params.mix * 100).toFixed(0)}%</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="mix" min="0.0" max="1.0" step="0.02" value="${fx.params.mix}">
      `;
    } else if (fx.type === "chorus") {
      bodyContent = `
        <div class="fx-param-row">
          <span class="fx-param-label">LFO RATE</span>
          <span class="fx-param-value" id="val-${fx.id}-rate">${fx.params.rate.toFixed(1)} Hz</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="rate" min="0.2" max="5.0" step="0.1" value="${fx.params.rate}">

        <div class="fx-param-row">
          <span class="fx-param-label">DEPTH</span>
          <span class="fx-param-value" id="val-${fx.id}-depth">${(fx.params.depth * 1000).toFixed(1)} ms</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="depth" min="0.001" max="0.012" step="0.0005" value="${fx.params.depth}">

        <div class="fx-param-row">
          <span class="fx-param-label">WET / DRY MIX</span>
          <span class="fx-param-value" id="val-${fx.id}-mix">${(fx.params.mix * 100).toFixed(0)}%</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="mix" min="0.0" max="1.0" step="0.02" value="${fx.params.mix}">
      `;
    } else if (fx.type === "width") {
      bodyContent = `
        <div class="fx-param-row">
          <span class="fx-param-label">STEREO SPREAD</span>
          <span class="fx-param-value" id="val-${fx.id}-width">${(fx.params.width * 100).toFixed(0)}%</span>
        </div>
        <input type="range" class="fx-slider" data-fx-id="${fx.id}" data-param="width" min="0.0" max="2.0" step="0.05" value="${fx.params.width}">
      `;
    }

    const presetData = presetManager.getAllPresets(fx.type);
    const factoryKeys = Object.keys(presetData.factory);
    const userKeys = Object.keys(presetData.user);

    return `
      <div class="fx-unit ${isBypassed ? "bypassed" : ""}" id="fx-unit-${fx.id}">
        <div class="fx-header">
          <div class="fx-header-left">
            <span class="fx-led"></span>
            <span class="fx-title">${fx.name}</span>
          </div>
          <div class="fx-controls">
            <button class="btn btn-bypass" data-fx-id="${fx.id}" style="padding: 2px 6px; font-size: 10px; background: ${isBypassed ? "#21262d" : "var(--accent-cyan)"}; color: ${isBypassed ? "inherit" : "#000"}; font-weight: bold; border-radius: 2px;">
              ${isBypassed ? "OFF" : "ON"}
            </button>
            <button class="btn btn-danger btn-remove-fx" data-fx-id="${fx.id}" style="padding: 2px 6px; font-size: 10px; border-radius: 2px;">✕</button>
          </div>
        </div>

        <div style="display: flex; gap: 6px; padding: 6px 12px; background: rgba(0, 0, 0, 0.2); border-bottom: 1px solid var(--border-subtle); align-items: center;">
          <span style="font-size: 9px; color: var(--text-muted); font-weight: 700;">PRESET</span>
          <select class="fx-preset-select" data-fx-id="${fx.id}" data-type="${fx.type}" style="flex: 1; padding: 2px 4px; font-size: 10px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-subtle); border-radius: 3px;">
            <option value="">Choose / Custom...</option>
            <optgroup label="Factory Presets">
              ${factoryKeys.map((k) => `<option value="f:${k}">${k}</option>`).join("")}
            </optgroup>
            ${userKeys.length > 0 ? `
              <optgroup label="User Presets">
                ${userKeys.map((k) => `<option value="u:${k}">${k}</option>`).join("")}
              </optgroup>
            ` : ""}
          </select>
          <button class="btn btn-save-preset" data-fx-id="${fx.id}" data-type="${fx.type}" style="padding: 2px 5px; font-size: 10px; border-radius: 3px;" title="Save current settings as user preset">💾</button>
        </div>

        <div class="fx-body">
          ${bodyContent}
        </div>
      </div>
    `;
  }

  bindRackActions() {
    // Target Selector
    const targetSelect = document.getElementById("fx-target-select");
    if (targetSelect) {
      targetSelect.onchange = (e) => {
        this.selectedTarget = e.target.value;
        this.render();
      };
    }

    // Add Effect Button
    const addBtn = document.getElementById("btn-add-fx");
    const typeSelect = document.getElementById("fx-add-type");
    if (addBtn && typeSelect) {
      addBtn.onclick = () => {
        const fxType = typeSelect.value;
        if (this.selectedTarget === "master") {
          audioEngine.addMasterEffect(fxType);
        } else {
          audioEngine.addTrackEffect(this.selectedTarget, fxType);
        }
      };
    }

    // Bypass Buttons
    this.container.querySelectorAll(".btn-bypass").forEach((btn) => {
      btn.onclick = () => {
        const fxId = btn.getAttribute("data-fx-id");
        const effects = this.getEffectsList();
        const fx = effects.find((e) => e.id === fxId);
        if (fx) {
          if (this.selectedTarget === "master") {
            audioEngine.setMasterEffectBypass(fxId, !fx.bypassed);
          } else {
            audioEngine.setTrackEffectBypass(this.selectedTarget, fxId, !fx.bypassed);
          }
        }
      };
    });

    // Remove Buttons
    this.container.querySelectorAll(".btn-remove-fx").forEach((btn) => {
      btn.onclick = () => {
        const fxId = btn.getAttribute("data-fx-id");
        if (this.selectedTarget === "master") {
          audioEngine.removeMasterEffect(fxId);
        } else {
          audioEngine.removeTrackEffect(this.selectedTarget, fxId);
        }
      };
    });

    // Parameter Sliders
    this.container.querySelectorAll(".fx-slider").forEach((slider) => {
      const fxId = slider.getAttribute("data-fx-id");
      const param = slider.getAttribute("data-param");
      const valLabel = document.getElementById(`val-${fxId}-${param}`);

      slider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        if (this.selectedTarget === "master") {
          audioEngine.setMasterEffectParam(fxId, param, val);
        } else {
          audioEngine.setTrackEffectParam(this.selectedTarget, fxId, param, val);
        }

        // Format label
        if (valLabel) {
          valLabel.textContent = this.formatParamValue(param, val);
        }

        // Redraw EQ canvas if EQ changed
        if (param.includes("gain") || param.includes("freq") || param.includes("q")) {
          this.drawEQCurve(fxId);
        }
      };
    });

    // Preset Selection
    this.container.querySelectorAll(".fx-preset-select").forEach((select) => {
      select.onchange = (e) => {
        const val = e.target.value;
        if (!val) return;
        const fxId = select.getAttribute("data-fx-id");
        const fxType = select.getAttribute("data-type");
        const isUser = val.startsWith("u:");
        const presetName = val.slice(2);
        const params = presetManager.getPreset(fxType, presetName, isUser);
        if (!params) return;

        const effects = this.getEffectsList();
        const fx = effects.find((item) => item.id === fxId);

        // Apply to audio engine
        for (const [p, v] of Object.entries(params)) {
          if (this.selectedTarget === "master") {
            audioEngine.setMasterEffectParam(fxId, p, v);
          } else {
            audioEngine.setTrackEffectParam(this.selectedTarget, fxId, p, v);
          }

          // Update UI slider
          const slider = this.container.querySelector(`.fx-slider[data-fx-id="${fxId}"][data-param="${p}"]`);
          if (slider) {
            slider.value = v;
          }
          const valLabel = document.getElementById(`val-${fxId}-${p}`);
          if (valLabel) {
            valLabel.textContent = this.formatParamValue(p, v);
          }
        }

        if (fxType === "parametric_eq") {
          this.drawEQCurve(fxId);
        }
      };
    });

    // Save Preset Button
    this.container.querySelectorAll(".btn-save-preset").forEach((btn) => {
      btn.onclick = () => {
        const fxId = btn.getAttribute("data-fx-id");
        const fxType = btn.getAttribute("data-type");
        const effects = this.getEffectsList();
        const fx = effects.find((item) => item.id === fxId);
        if (!fx) return;

        const name = prompt(`Enter a name for this custom ${fx.name} preset:`);
        if (!name || !name.trim()) return;

        presetManager.saveUserPreset(fxType, name.trim(), fx.params);
        this.render();
      };
    });
  }

  formatParamValue(param, val) {
    if (param.includes("gain") || param === "threshold" || param === "ceiling") {
      return `${val > 0 ? "+" : ""}${val.toFixed(1)} dB`;
    } else if (param === "ratio") {
      return `${val.toFixed(1)}:1`;
    } else if (param === "time" || param === "attack" || param === "release") {
      return `${(val * 1000).toFixed(0)} ms`;
    } else if (param === "depth") {
      return `${(val * 1000).toFixed(1)} ms`;
    } else if (param === "mix" || param === "feedback" || param === "width") {
      return `${(val * 100).toFixed(0)}%`;
    } else if (param.includes("freq") || param === "damping" || param === "warmth" || param === "tone") {
      return `${val.toFixed(0)} Hz`;
    } else if (param === "decay") {
      return `${val.toFixed(1)} s`;
    } else if (param === "rate") {
      return `${val.toFixed(1)} Hz`;
    } else if (param === "drive") {
      return `${val.toFixed(1)}x`;
    }
    return String(val);
  }

  drawAllEQCurves() {
    const canvases = this.container.querySelectorAll(".fx-eq-canvas");
    canvases.forEach((c) => {
      const fxId = c.getAttribute("data-fx-id");
      this.drawEQCurve(fxId);
    });
  }

  drawEQCurve(fxId) {
    const canvas = this.container.querySelector(`.fx-eq-canvas[data-fx-id="${fxId}"]`);
    if (!canvas) return;
    const effects = this.getEffectsList();
    const fx = effects.find((e) => e.id === fxId);
    if (!fx || typeof fx.getFrequencyResponse !== "function") return;

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Grid lines (0dB center, 100Hz, 1kHz, 10kHz)
    ctx.strokeStyle = "#1a2333";
    ctx.lineWidth = 1;

    // 0dB Centerline
    const zeroY = height / 2;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();

    // Logarithmic frequency test points (20 Hz to 20,000 Hz)
    const numPoints = 120;
    const freqs = new Float32Array(numPoints);
    for (let i = 0; i < numPoints; i++) {
      const norm = i / (numPoints - 1);
      freqs[i] = 20 * Math.pow(1000, norm); // 20Hz -> 20000Hz
    }

    const responseDb = fx.getFrequencyResponse(freqs);

    // Draw Response Curve
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * width;
      // Range: -18dB to +18dB mapped to [height, 0]
      const db = Math.max(-18, Math.min(18, responseDb[i]));
      const y = zeroY - (db / 18) * (height / 2);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Fill gradient underneath
    ctx.lineTo(width, zeroY);
    ctx.lineTo(0, zeroY);
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 240, 255, 0.08)";
    ctx.fill();
  }

  startAnimationLoop() {
    // Metering animation if needed
  }
}

export const effectsPanel = new EffectsPanel();
