/**
 * Mastering Suite Modal UI — Professional ITU-R BS.1770-4 LUFS Normalization,
 * 4-Band Mastering EQ, Bus Glue Compressor, Harmonic Exciter, and True-Peak Limiter.
 */

import { api } from "../api/client.js";
import { bus } from "../core/event-bus.js";
import { store } from "../state/store.js";
import { projectManager } from "../state/project.js";

export class MasteringModalUI {
  constructor() {
    this.modalEl = null;
    this.isOpen = false;
    this.currentPreset = "streaming";
    this.isProcessing = false;
    this.activeMasterId = null;
    this.audioPlayer = null;
    this.isPlaying = false;
  }

  init() {
    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    const modal = document.createElement("div");
    modal.id = "mastering-suite-modal";
    modal.className = "modal-backdrop";
    modal.style.display = "none";

    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 680px; width: 92%; background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,0.85); overflow: hidden; display: flex; flex-direction: column;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-secondary);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 18px;">🎚</span>
            <b style="font-size: 14px; color: var(--text-primary); letter-spacing: 0.5px;">Professional Mastering Suite</b>
            <span class="badge" style="background: var(--accent-magenta, #ff007f); color: #fff; font-size: 10px; font-weight: 700;">ITU-R BS.1770-4</span>
          </div>
          <button id="btn-master-close" class="btn" style="padding: 2px 8px; font-size: 12px;">✕</button>
        </div>

        <!-- Body -->
        <div style="padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; max-height: 72vh; overflow-y: auto;">
          <!-- Industry Preset Selection -->
          <div>
            <label style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 6px;">Target Delivery Standard</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <button class="btn btn-preset-master active" data-preset="streaming" style="text-align: left; padding: 10px; border-radius: 6px; border: 1px solid var(--accent-cyan); background: rgba(0, 240, 255, 0.08);">
                <div style="font-weight: 700; color: var(--accent-cyan); font-size: 12px;">Streaming Standard</div>
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Target -14.0 LUFS • -1.0 dBFS True Peak (Spotify/Apple Music)</div>
              </button>
              <button class="btn btn-preset-master" data-preset="club" style="text-align: left; padding: 10px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-secondary);">
                <div style="font-weight: 700; color: var(--text-primary); font-size: 12px;">Club & Electronic</div>
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Target -8.0 LUFS • -0.3 dBFS True Peak (Heavy Glue & Drive)</div>
              </button>
              <button class="btn btn-preset-master" data-preset="podcast" style="text-align: left; padding: 10px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-secondary);">
                <div style="font-weight: 700; color: var(--text-primary); font-size: 12px;">Podcast & Broadcast</div>
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Target -16.0 LUFS • -1.5 dBFS True Peak (Vocal Focus)</div>
              </button>
              <button class="btn btn-preset-master" data-preset="cinematic" style="text-align: left; padding: 10px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-secondary);">
                <div style="font-weight: 700; color: var(--text-primary); font-size: 12px;">Cinematic & Orchestral</div>
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Target -18.0 LUFS • -1.0 dBFS True Peak (High Dynamic Range)</div>
              </button>
            </div>
          </div>

          <!-- Loudness Metering Comparison Box -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary);">LOUDNESS & STEREO ANALYTICS</span>
              <span id="master-status-text" style="font-size: 10px; color: var(--text-muted);">Ready to process</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
              <!-- Before -->
              <div style="background: var(--bg-primary); padding: 10px; border-radius: 4px; border: 1px solid var(--border-subtle);">
                <div style="font-size: 10px; color: var(--text-muted); font-weight: 700; margin-bottom: 4px;">RAW SESSION MIX</div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
                  <span>Integrated:</span>
                  <b id="pre-lufs" style="color: var(--text-primary); font-family: var(--font-mono);">-- LUFS</b>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
                  <span>True Peak:</span>
                  <b id="pre-peak" style="color: var(--text-primary); font-family: var(--font-mono);">-- dBFS</b>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                  <span>Phase Corr:</span>
                  <b id="pre-corr" style="color: var(--text-primary); font-family: var(--font-mono);">--</b>
                </div>
              </div>

              <!-- After -->
              <div style="background: var(--bg-primary); padding: 10px; border-radius: 4px; border: 1px solid var(--border-subtle);">
                <div style="font-size: 10px; color: var(--accent-cyan); font-weight: 700; margin-bottom: 4px;">MASTERED RESULT</div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
                  <span>Integrated:</span>
                  <b id="post-lufs" style="color: #00e676; font-family: var(--font-mono);">-- LUFS</b>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
                  <span>True Peak:</span>
                  <b id="post-peak" style="color: var(--accent-cyan); font-family: var(--font-mono);">-- dBFS</b>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                  <span>Phase Corr:</span>
                  <b id="post-corr" style="color: #00e676; font-family: var(--font-mono);">--</b>
                </div>
              </div>
            </div>
          </div>

          <!-- Mastering Controls (4-Band EQ & Glue Compressor) -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
            <span style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">4-Band Mastering EQ Fine-Tuning</span>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px;">
              <div>
                <label style="font-size: 10px; color: var(--text-muted); display: block;">LOW SHELF (80Hz)</label>
                <input type="range" id="eq-low-shelf" min="-6" max="6" step="0.5" value="0.5" style="width: 100%;">
                <span id="label-low-shelf" style="font-size: 10px; font-family: var(--font-mono); color: var(--text-secondary);">+0.5 dB</span>
              </div>
              <div>
                <label style="font-size: 10px; color: var(--text-muted); display: block;">LOW-MID (300Hz)</label>
                <input type="range" id="eq-low-mid" min="-6" max="6" step="0.5" value="-0.5" style="width: 100%;">
                <span id="label-low-mid" style="font-size: 10px; font-family: var(--font-mono); color: var(--text-secondary);">-0.5 dB</span>
              </div>
              <div>
                <label style="font-size: 10px; color: var(--text-muted); display: block;">HIGH-MID (3.2kHz)</label>
                <input type="range" id="eq-high-mid" min="-6" max="6" step="0.5" value="0.5" style="width: 100%;">
                <span id="label-high-mid" style="font-size: 10px; font-family: var(--font-mono); color: var(--text-secondary);">+0.5 dB</span>
              </div>
              <div>
                <label style="font-size: 10px; color: var(--text-muted); display: block;">AIR SHELF (10kHz)</label>
                <input type="range" id="eq-high-shelf" min="-6" max="6" step="0.5" value="1.0" style="width: 100%;">
                <span id="label-high-shelf" style="font-size: 10px; font-family: var(--font-mono); color: var(--text-secondary);">+1.0 dB</span>
              </div>
            </div>
          </div>

          <!-- Audition Controls -->
          <div id="master-audition-bar" style="display: none; align-items: center; justify-content: space-between; background: var(--bg-secondary); padding: 10px 14px; border-radius: 6px; border: 1px solid var(--accent-cyan);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <button id="btn-master-play" class="btn" style="background: var(--accent-cyan); color: #000; font-weight: 700; font-size: 11px; padding: 6px 14px;">▶ Audition Master</button>
              <button id="btn-master-stop" class="btn" style="font-size: 11px; padding: 6px 10px;">⏹ Stop</button>
              <span id="master-duration-label" style="font-size: 11px; font-family: var(--font-mono); color: var(--text-secondary); margin-left: 6px;"></span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button id="btn-master-commit" class="btn btn-primary" style="background: #00e676; color: #000; font-weight: 700; font-size: 11px; padding: 6px 14px;">+ Insert Master Track</button>
              <button id="btn-master-download" class="btn" style="font-size: 11px; padding: 6px 12px;">⬇ Download WAV</button>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-top: 1px solid var(--border-subtle); background: var(--bg-secondary);">
          <div style="font-size: 10px; color: var(--text-muted);">
            * 4x oversampled True-Peak limiter guarantees zero inter-sample clipping on streaming services
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="btn-master-cancel" class="btn">Close</button>
            <button id="btn-master-execute" class="btn btn-primary" style="background: linear-gradient(135deg, #00f0ff, #ff007f); border: none; color: #000; font-weight: 700; padding: 8px 18px;">⚡ Render & Master</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;
  }

  bindEvents() {
    const triggerBtn = document.getElementById("btn-mastering-suite");
    if (triggerBtn) triggerBtn.onclick = () => this.open();

    const closeBtn = document.getElementById("btn-master-close");
    const cancelBtn = document.getElementById("btn-master-cancel");
    if (closeBtn) closeBtn.onclick = () => this.close();
    if (cancelBtn) cancelBtn.onclick = () => this.close();

    // Preset selector chips
    this.modalEl.querySelectorAll(".btn-preset-master").forEach((btn) => {
      btn.onclick = () => {
        this.modalEl.querySelectorAll(".btn-preset-master").forEach((b) => {
          b.style.border = "1px solid var(--border-subtle)";
          b.style.background = "var(--bg-secondary)";
          b.querySelector("div").style.color = "var(--text-primary)";
        });

        btn.style.border = "1px solid var(--accent-cyan)";
        btn.style.background = "rgba(0, 240, 255, 0.08)";
        btn.querySelector("div").style.color = "var(--accent-cyan)";
        this.currentPreset = btn.getAttribute("data-preset");
        this.updatePresetSliders(this.currentPreset);
      };
    });

    // EQ sliders
    this.setupSliderReadout("eq-low-shelf", "label-low-shelf");
    this.setupSliderReadout("eq-low-mid", "label-low-mid");
    this.setupSliderReadout("eq-high-mid", "label-high-mid");
    this.setupSliderReadout("eq-high-shelf", "label-high-shelf");

    // Main execute
    const execBtn = document.getElementById("btn-master-execute");
    if (execBtn) execBtn.onclick = () => this.executeMastering();

    // Audition controls
    const playBtn = document.getElementById("btn-master-play");
    const stopBtn = document.getElementById("btn-master-stop");
    if (playBtn) playBtn.onclick = () => this.playAudition();
    if (stopBtn) stopBtn.onclick = () => this.stopAudition();

    const commitBtn = document.getElementById("btn-master-commit");
    if (commitBtn) commitBtn.onclick = () => this.commitMasterTrack();

    const downloadBtn = document.getElementById("btn-master-download");
    if (downloadBtn) downloadBtn.onclick = () => this.downloadMasteredWav();
  }

  setupSliderReadout(sliderId, labelId) {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(labelId);
    if (slider && label) {
      slider.oninput = () => {
        const val = parseFloat(slider.value);
        label.textContent = `${val >= 0 ? "+" : ""}${val.toFixed(1)} dB`;
      };
    }
  }

  updatePresetSliders(preset) {
    const presets = {
      streaming: { ls: 0.5, lm: -0.5, hm: 0.5, hs: 1.0 },
      club: { ls: 2.0, lm: -1.0, hm: 1.5, hs: 2.0 },
      podcast: { ls: -2.0, lm: -1.5, hm: 2.0, hs: 1.0 },
      cinematic: { ls: 1.0, lm: 0.0, hm: 0.5, hs: 0.5 },
    };
    const p = presets[preset] || presets.streaming;
    this.setSliderValue("eq-low-shelf", "label-low-shelf", p.ls);
    this.setSliderValue("eq-low-mid", "label-low-mid", p.lm);
    this.setSliderValue("eq-high-mid", "label-high-mid", p.hm);
    this.setSliderValue("eq-high-shelf", "label-high-shelf", p.hs);
  }

  setSliderValue(sliderId, labelId, val) {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(labelId);
    if (slider) slider.value = val;
    if (label) label.textContent = `${val >= 0 ? "+" : ""}${val.toFixed(1)} dB`;
  }

  open() {
    const { project } = store.getState();
    if (!project) {
      alert("Please open or create a project first.");
      return;
    }

    this.isOpen = true;
    this.modalEl.style.display = "flex";
  }

  close() {
    this.stopAudition();
    this.isOpen = false;
    this.modalEl.style.display = "none";
  }

  async executeMastering() {
    const { project } = store.getState();
    if (!project) return;

    const execBtn = document.getElementById("btn-master-execute");
    const statusText = document.getElementById("master-status-text");

    if (execBtn) {
      execBtn.disabled = true;
      execBtn.textContent = "Mastering Audio...";
    }
    if (statusText) statusText.textContent = "Rendering session & running DSP mastering chain...";

    const customParams = {
      low_shelf_gain_db: parseFloat(document.getElementById("eq-low-shelf").value) || 0.0,
      low_mid_gain_db: parseFloat(document.getElementById("eq-low-mid").value) || 0.0,
      high_mid_gain_db: parseFloat(document.getElementById("eq-high-mid").value) || 0.0,
      high_shelf_gain_db: parseFloat(document.getElementById("eq-high-shelf").value) || 0.0,
    };

    try {
      const res = await api.request(`/api/projects/${project.id}/master`, {
        method: "POST",
        body: {
          preset: this.currentPreset,
          custom_params: customParams,
        },
      });

      console.log("[MasteringModal] Master generated successfully:", res);
      this.activeMasterId = res.master_id;

      // Update Metering Analytics
      document.getElementById("pre-lufs").textContent = `${res.pre_metrics.integrated_lufs.toFixed(1)} LUFS`;
      document.getElementById("pre-peak").textContent = `${res.pre_metrics.true_peak_dbfs.toFixed(1)} dBFS`;
      document.getElementById("pre-corr").textContent = `${res.pre_metrics.phase_correlation.toFixed(2)}`;

      document.getElementById("post-lufs").textContent = `${res.post_metrics.integrated_lufs.toFixed(1)} LUFS`;
      document.getElementById("post-peak").textContent = `${res.post_metrics.true_peak_dbfs.toFixed(1)} dBFS`;
      document.getElementById("post-corr").textContent = `${res.post_metrics.phase_correlation.toFixed(2)}`;

      if (statusText) statusText.textContent = "✅ Master completed & ready to audition";

      const auditionBar = document.getElementById("master-audition-bar");
      if (auditionBar) auditionBar.style.display = "flex";
      document.getElementById("master-duration-label").textContent = `${res.duration.toFixed(1)}s`;

      this.audioPlayer = new Audio(`/api/projects/${project.id}/master/${res.master_id}/stream`);
      this.audioPlayer.onended = () => this.stopAudition();

    } catch (err) {
      console.error("[MasteringModal] Mastering failed:", err);
      alert(`Mastering failed: ${err.message}`);
      if (statusText) statusText.textContent = "❌ Error in mastering pipeline";
    } finally {
      if (execBtn) {
        execBtn.disabled = false;
        execBtn.textContent = "⚡ Render & Master";
      }
    }
  }

  playAudition() {
    if (!this.audioPlayer) return;
    this.audioPlayer.play();
    this.isPlaying = true;
    const playBtn = document.getElementById("btn-master-play");
    if (playBtn) playBtn.textContent = "⏸ Pause";
  }

  stopAudition() {
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.currentTime = 0;
    }
    this.isPlaying = false;
    const playBtn = document.getElementById("btn-master-play");
    if (playBtn) playBtn.textContent = "▶ Audition Master";
  }

  async commitMasterTrack() {
    const { project } = store.getState();
    if (!project || !this.activeMasterId) return;

    this.stopAudition();

    try {
      const res = await api.request(`/api/projects/${project.id}/master/${this.activeMasterId}/commit`, {
        method: "POST",
      });
      console.log("[MasteringModal] Master track committed to session:", res);
      await projectManager.loadProject(project.id);
      this.close();
    } catch (err) {
      console.error("[MasteringModal] Error committing master track:", err);
      alert(`Could not commit master track: ${err.message}`);
    }
  }

  downloadMasteredWav() {
    const { project } = store.getState();
    if (!project || !this.activeMasterId) return;

    const streamUrl = `/api/projects/${project.id}/master/${this.activeMasterId}/stream`;
    const a = document.createElement("a");
    a.href = streamUrl;
    a.download = `${project.name.replace(/\s+/g, "_")}_Mastered.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export const masteringModalUI = new MasteringModalUI();
