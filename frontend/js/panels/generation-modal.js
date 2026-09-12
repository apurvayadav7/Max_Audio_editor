/**
 * Local AI Music Generation & Audio Extension Modal UI.
 * 100% GPU-accelerated local synthesis, audition preview, and timeline insertion.
 */

import { api } from "../api/client.js";
import { bus } from "../core/event-bus.js";
import { store } from "../state/store.js";
import { projectManager } from "../state/project.js";

export class GenerationModalUI {
  constructor() {
    this.modalEl = null;
    this.isOpen = false;
    this.currentMode = "generate"; // "generate" | "extend"
    this.activeJobId = null;
    this.audioPreview = null;
    this.isPlayingPreview = false;
    this.previewWaveformData = null;
    this.previewCanvas = null;
    this.previewCtx = null;
    this.animFrameId = null;
  }

  init() {
    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    const modal = document.createElement("div");
    modal.id = "ai-generation-modal";
    modal.className = "modal-backdrop";
    modal.style.display = "none";

    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 640px; width: 92%; background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: 8px; box-shadow: 0 20px 50px rgba(0,0,0,0.85); overflow: hidden; display: flex; flex-direction: column;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-secondary);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 18px;">✨</span>
            <b style="font-size: 14px; color: var(--text-primary); letter-spacing: 0.5px;">Local AI Music Generator</b>
            <span class="badge" style="background: #a855f7; color: #fff; font-size: 10px; font-weight: 700;">RTX TENSOR</span>
          </div>
          <button id="btn-gen-modal-close" class="btn" style="padding: 2px 8px; font-size: 12px;">✕</button>
        </div>

        <!-- Mode Navigation Bar -->
        <div style="display: flex; background: #12151b; border-bottom: 1px solid var(--border-subtle); padding: 4px 8px; gap: 6px;">
          <button id="btn-gen-mode-new" class="btn" style="flex: 1; border: none; background: var(--bg-secondary); color: var(--accent-cyan); font-weight: 600; font-size: 11px; padding: 7px 12px; border-radius: 4px;">⚡ Text-to-Music & Stems</button>
          <button id="btn-gen-mode-extend" class="btn" style="flex: 1; border: none; background: transparent; color: var(--text-secondary); font-weight: 600; font-size: 11px; padding: 7px 12px; border-radius: 4px;">↔ Seamless Audio Extension</button>
        </div>

        <!-- Body -->
        <div style="padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; max-height: 70vh; overflow-y: auto;">
          <!-- Hardware Telemetry Header -->
          <div style="background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 10px; color: #a855f7; font-weight: 700; letter-spacing: 0.5px;">LOCAL AI ACCELERATION</div>
              <div id="gen-hardware-label" style="font-size: 12px; font-weight: 600; color: var(--text-primary); margin-top: 2px;">Checking GPU VRAM...</div>
            </div>
            <span class="badge" style="background: rgba(0, 240, 255, 0.2); color: var(--accent-cyan); font-weight: 600; border: 1px solid var(--accent-cyan);">100% PRIVATE • ZERO CLOUD</span>
          </div>

          <!-- TAB 1: TEXT TO MUSIC -->
          <div id="gen-tab-new" style="display: flex; flex-direction: column; gap: 12px;">
            <div>
              <label style="font-size: 11px; color: var(--text-secondary); font-weight: 600; display: block; margin-bottom: 6px;">PROMPT / STYLE DIRECTIVE</label>
              <textarea id="input-gen-prompt" rows="3" style="width: 100%; box-sizing: border-box; padding: 10px; border-radius: 6px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); color: var(--text-primary); font-size: 12px; resize: vertical; font-family: var(--font-family);" placeholder="e.g. Cyberpunk industrial synth arpeggio with aggressive drive in A minor at 128 BPM..."></textarea>
            </div>

            <!-- Quick Style Presets -->
            <div>
              <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; font-weight: 700;">Quick Presets:</div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                <button class="btn btn-preset-chip" data-prompt="Cyberpunk 128 BPM synthwave lead with 16th-note arpeggiator in A minor" style="font-size: 10px; padding: 3px 8px; border-radius: 12px; background: var(--bg-secondary); border: 1px solid #30363d; color: var(--text-secondary);">⚡ Cyberpunk Arp</button>
                <button class="btn btn-preset-chip" data-prompt="Heavy 808 sub bassline with saturated distortion in D minor" style="font-size: 10px; padding: 3px 8px; border-radius: 12px; background: var(--bg-secondary); border: 1px solid #30363d; color: var(--text-secondary);">🎸 Punchy 808 Bass</button>
                <button class="btn btn-preset-chip" data-prompt="Lo-Fi chill ambient synthesizer pad chords in C major" style="font-size: 10px; padding: 3px 8px; border-radius: 12px; background: var(--bg-secondary); border: 1px solid #30363d; color: var(--text-secondary);">☁ Lo-Fi Ambient Pad</button>
                <button class="btn btn-preset-chip" data-prompt="Four on the floor industrial drum beat with snappy snare and metallic hats 130 BPM" style="font-size: 10px; padding: 3px 8px; border-radius: 12px; background: var(--bg-secondary); border: 1px solid #30363d; color: var(--text-secondary);">🥁 Industrial Drums</button>
                <button class="btn btn-preset-chip" data-prompt="80s Retrowave analog synth hook with lush stereo chorus in F# minor" style="font-size: 10px; padding: 3px 8px; border-radius: 12px; background: var(--bg-secondary); border: 1px solid #30363d; color: var(--text-secondary);">🌆 80s Retrowave</button>
              </div>
            </div>

            <!-- Musical Parameters Controls -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; background: var(--bg-secondary); padding: 12px; border-radius: 6px; border: 1px solid var(--border-subtle);">
              <div>
                <label style="font-size: 10px; color: var(--text-secondary); display: block; margin-bottom: 4px; font-weight: 700;">DURATION</label>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <input type="range" id="slider-gen-duration" min="2" max="30" step="1" value="8" style="flex: 1;">
                  <span id="label-gen-duration" style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-cyan); min-width: 36px; text-align: right;">8.0s</span>
                </div>
              </div>
              <div>
                <label style="font-size: 10px; color: var(--text-secondary); display: block; margin-bottom: 4px; font-weight: 700;">TEMPO (BPM)</label>
                <input type="number" id="input-gen-tempo" min="40" max="240" step="1" value="120" style="width: 100%; box-sizing: border-box; padding: 4px 8px; border-radius: 4px; background: var(--bg-primary); border: 1px solid var(--border-subtle); color: var(--text-primary); font-family: var(--font-mono); font-size: 11px;">
              </div>
              <div>
                <label style="font-size: 10px; color: var(--text-secondary); display: block; margin-bottom: 4px; font-weight: 700;">SCALE & KEY</label>
                <select id="select-gen-key" style="width: 100%; box-sizing: border-box; padding: 4px 8px; border-radius: 4px; background: var(--bg-primary); border: 1px solid var(--border-subtle); color: var(--text-primary); font-size: 11px;">
                  <option value="A minor" selected>A minor</option>
                  <option value="C major">C major</option>
                  <option value="D minor">D minor</option>
                  <option value="E minor">E minor</option>
                  <option value="F major">F major</option>
                  <option value="G minor">G minor</option>
                  <option value="F# minor">F# minor</option>
                  <option value="B minor">B minor</option>
                </select>
              </div>
            </div>
          </div>

          <!-- TAB 2: EXTEND AUDIO CLIP -->
          <div id="gen-tab-extend" style="display: none; flex-direction: column; gap: 12px;">
            <div>
              <label style="font-size: 11px; color: var(--text-secondary); font-weight: 600; display: block; margin-bottom: 4px;">SOURCE TIMELINE CLIP</label>
              <select id="select-extend-clip" style="width: 100%; padding: 8px; border-radius: 4px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); color: var(--text-primary); font-size: 12px;">
                <option value="">-- Select a timeline clip to extend --</option>
              </select>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: var(--bg-secondary); padding: 12px; border-radius: 6px; border: 1px solid var(--border-subtle);">
              <div>
                <label style="font-size: 10px; color: var(--text-secondary); display: block; margin-bottom: 4px; font-weight: 700;">ADDITIONAL TIME (+s)</label>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <input type="range" id="slider-extend-duration" min="2" max="20" step="1" value="6" style="flex: 1;">
                  <span id="label-extend-duration" style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-cyan); min-width: 36px; text-align: right;">+6.0s</span>
                </div>
              </div>
              <div>
                <label style="font-size: 10px; color: var(--text-secondary); display: block; margin-bottom: 4px; font-weight: 700;">CROSSFADE OVERLAP</label>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <input type="range" id="slider-extend-overlap" min="0.1" max="1.5" step="0.1" value="0.5" style="flex: 1;">
                  <span id="label-extend-overlap" style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-cyan); min-width: 36px; text-align: right;">0.5s</span>
                </div>
              </div>
            </div>

            <div>
              <label style="font-size: 11px; color: var(--text-secondary); font-weight: 600; display: block; margin-bottom: 4px;">OPTIONAL EXTENSION DIRECTIVE</label>
              <input type="text" id="input-extend-prompt" placeholder="e.g. Continue rhythmic groove with progressive harmonic variation" style="width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 4px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); color: var(--text-primary); font-size: 12px;">
            </div>
          </div>

          <!-- PROGRESS & STATUS CONTAINER -->
          <div id="gen-progress-container" style="display: none; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span id="gen-progress-stage" style="font-size: 11px; color: var(--text-secondary);">Initializing local tensor pipeline...</span>
              <span id="gen-progress-pct" style="font-size: 11px; font-family: var(--font-mono); font-weight: 700; color: #a855f7;">0%</span>
            </div>
            <div style="height: 6px; background: var(--bg-primary); border-radius: 3px; overflow: hidden;">
              <div id="gen-progress-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #a855f7, #00f0ff); transition: width 0.2s ease;"></div>
            </div>
          </div>

          <!-- AUDITION & PREVIEW CONTAINER -->
          <div id="gen-preview-container" style="display: none; flex-direction: column; gap: 10px; background: var(--bg-secondary); border: 1px solid #a855f7; border-radius: 6px; padding: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="badge" style="background: #00e676; color: #000; font-weight: 700; font-size: 10px;">READY</span>
                <span id="gen-preview-title" style="font-size: 12px; font-weight: 600; color: var(--text-primary);">Candidate Audio Preview</span>
              </div>
              <span id="gen-preview-duration" style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-cyan);">0.0s</span>
            </div>

            <!-- Waveform Canvas -->
            <div style="position: relative; height: 64px; background: #0e1117; border-radius: 4px; overflow: hidden; border: 1px solid var(--border-subtle);">
              <canvas id="gen-waveform-canvas" width="580" height="64" style="width: 100%; height: 100%; display: block;"></canvas>
              <div id="gen-preview-playhead" style="position: absolute; top: 0; bottom: 0; left: 0%; width: 2px; background: #ff007f; box-shadow: 0 0 6px #ff007f; pointer-events: none; display: none;"></div>
            </div>

            <!-- Audition Player Bar -->
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; gap: 8px;">
                <button id="btn-gen-play-preview" class="btn" style="background: #a855f7; color: #fff; font-weight: 600; font-size: 11px; padding: 6px 14px;">▶ Audition</button>
                <button id="btn-gen-stop-preview" class="btn" style="font-size: 11px; padding: 6px 10px;">⏹ Stop</button>
              </div>

              <!-- Insertion Options -->
              <div style="display: flex; gap: 6px;">
                <button id="btn-gen-accept-new" class="btn btn-primary" style="background: #00e676; color: #000; font-weight: 700; font-size: 11px; padding: 6px 12px;">+ New Track</button>
                <button id="btn-gen-accept-playhead" class="btn" style="background: var(--accent-cyan); color: #000; font-weight: 700; font-size: 11px; padding: 6px 12px;">⚡ At Playhead</button>
                <button id="btn-gen-accept-replace" class="btn" style="background: #ffb800; color: #000; font-weight: 700; font-size: 11px; padding: 6px 12px; display: none;">🔁 Replace Clip</button>
                <button id="btn-gen-discard" class="btn" style="font-size: 11px; padding: 6px 10px; color: var(--text-muted);">✕ Discard</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-top: 1px solid var(--border-subtle); background: var(--bg-secondary);">
          <div style="font-size: 10px; color: var(--text-muted);">
            * 32-bit float stereo • Sample-accurate timeline insertion • Full Undo/Redo supported
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="btn-gen-modal-cancel" class="btn">Close</button>
            <button id="btn-gen-modal-execute" class="btn btn-primary" style="background: linear-gradient(135deg, #a855f7, #ff007f); border: none; color: #fff; font-weight: 700; padding: 8px 18px;">⚡ Generate Locally</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;
    this.previewCanvas = modal.querySelector("#gen-waveform-canvas");
    if (this.previewCanvas) {
      this.previewCtx = this.previewCanvas.getContext("2d");
    }
  }

  bindEvents() {
    // Open trigger from top header
    const triggerBtn = document.getElementById("btn-ai-generate");
    if (triggerBtn) {
      triggerBtn.onclick = () => this.open();
    }

    // Modal Close
    const closeBtn = document.getElementById("btn-gen-modal-close");
    const cancelBtn = document.getElementById("btn-gen-modal-cancel");
    if (closeBtn) closeBtn.onclick = () => this.close();
    if (cancelBtn) cancelBtn.onclick = () => this.close();

    // Mode Switcher
    const btnModeNew = document.getElementById("btn-gen-mode-new");
    const btnModeExtend = document.getElementById("btn-gen-mode-extend");
    const tabNew = document.getElementById("gen-tab-new");
    const tabExtend = document.getElementById("gen-tab-extend");

    if (btnModeNew && btnModeExtend) {
      btnModeNew.onclick = () => {
        this.currentMode = "generate";
        btnModeNew.style.background = "var(--bg-secondary)";
        btnModeNew.style.color = "var(--accent-cyan)";
        btnModeExtend.style.background = "transparent";
        btnModeExtend.style.color = "var(--text-secondary)";
        tabNew.style.display = "flex";
        tabExtend.style.display = "none";
        document.getElementById("btn-gen-accept-replace").style.display = "none";
      };

      btnModeExtend.onclick = () => {
        this.currentMode = "extend";
        btnModeExtend.style.background = "var(--bg-secondary)";
        btnModeExtend.style.color = "var(--accent-cyan)";
        btnModeNew.style.background = "transparent";
        btnModeNew.style.color = "var(--text-secondary)";
        tabNew.style.display = "none";
        tabExtend.style.display = "flex";
        this.populateClipsDropdown();
        document.getElementById("btn-gen-accept-replace").style.display = "inline-block";
      };
    }

    // Presets chips
    this.modalEl.querySelectorAll(".btn-preset-chip").forEach((chip) => {
      chip.onclick = () => {
        const promptInput = document.getElementById("input-gen-prompt");
        if (promptInput) {
          promptInput.value = chip.getAttribute("data-prompt") || "";
          promptInput.focus();
        }
      };
    });

    // Sliders readouts
    const durSlider = document.getElementById("slider-gen-duration");
    const durLabel = document.getElementById("label-gen-duration");
    if (durSlider && durLabel) {
      durSlider.oninput = () => {
        durLabel.textContent = `${durSlider.value}.0s`;
      };
    }

    const extSlider = document.getElementById("slider-extend-duration");
    const extLabel = document.getElementById("label-extend-duration");
    if (extSlider && extLabel) {
      extSlider.oninput = () => {
        extLabel.textContent = `+${extSlider.value}.0s`;
      };
    }

    const ovlSlider = document.getElementById("slider-extend-overlap");
    const ovlLabel = document.getElementById("label-extend-overlap");
    if (ovlSlider && ovlLabel) {
      ovlSlider.oninput = () => {
        ovlLabel.textContent = `${ovlSlider.value}s`;
      };
    }

    // Main execute button
    const execBtn = document.getElementById("btn-gen-modal-execute");
    if (execBtn) {
      execBtn.onclick = () => this.executeGeneration();
    }

    // Audition controls
    const playBtn = document.getElementById("btn-gen-play-preview");
    const stopBtn = document.getElementById("btn-gen-stop-preview");
    if (playBtn) playBtn.onclick = () => this.playAudition();
    if (stopBtn) stopBtn.onclick = () => this.stopAudition();

    // Commit actions
    const acceptNewBtn = document.getElementById("btn-gen-accept-new");
    const acceptPlayheadBtn = document.getElementById("btn-gen-accept-playhead");
    const acceptReplaceBtn = document.getElementById("btn-gen-accept-replace");
    const discardBtn = document.getElementById("btn-gen-discard");

    if (acceptNewBtn) acceptNewBtn.onclick = () => this.commitCandidate("new_track");
    if (acceptPlayheadBtn) acceptPlayheadBtn.onclick = () => this.commitCandidate("at_playhead");
    if (acceptReplaceBtn) acceptReplaceBtn.onclick = () => this.commitCandidate("replace_clip");
    if (discardBtn) discardBtn.onclick = () => this.discardCandidate();

    // Job progress listeners
    bus.on("job:progress", (jobData) => {
      if (this.activeJobId && jobData.id === this.activeJobId) {
        this.updateJobProgress(jobData.progress, jobData.stage);
      }
    });

    bus.on("job:completed", (job) => {
      if (this.activeJobId && job.id === this.activeJobId) {
        this.onJobCompleted(job);
      }
    });
  }

  async open() {
    const { project } = store.getState();
    if (!project) {
      alert("Please open or create a project first.");
      return;
    }

    this.isOpen = true;
    this.modalEl.style.display = "flex";

    // Sync tempo from project
    const tempoInput = document.getElementById("input-gen-tempo");
    if (tempoInput && project.tempo) {
      tempoInput.value = Math.round(project.tempo);
    }

    // Query GPU info
    try {
      const gpu = await api.getGPUInfo();
      const label = document.getElementById("gen-hardware-label");
      if (label) {
        if (gpu.cuda_available) {
          label.textContent = `${gpu.device_name} • ${gpu.vram_free_mb} MB Free • FP16 CUDA`;
        } else {
          label.textContent = "CPU Fallback Mode";
        }
      }
    } catch (_) {}

    this.populateClipsDropdown();
  }

  close() {
    this.stopAudition();
    this.isOpen = false;
    this.modalEl.style.display = "none";
  }

  populateClipsDropdown() {
    const { project } = store.getState();
    const select = document.getElementById("select-extend-clip");
    if (!select) return;

    select.innerHTML = "";
    if (!project || !project.tracks || project.tracks.length === 0) {
      select.innerHTML = '<option value="">(No clips on timeline)</option>';
      return;
    }

    let clipCount = 0;
    project.tracks.forEach((track) => {
      if (track.clips && track.clips.length > 0) {
        const optgroup = document.createElement("optgroup");
        optgroup.label = `Track: ${track.name}`;
        track.clips.forEach((clip) => {
          const opt = document.createElement("option");
          opt.value = clip.id;
          opt.textContent = `${clip.name} (${clip.duration.toFixed(1)}s at ${clip.start_time.toFixed(1)}s)`;
          optgroup.appendChild(opt);
          clipCount++;
        });
        select.appendChild(optgroup);
      }
    });

    if (clipCount === 0) {
      select.innerHTML = '<option value="">(No clips on timeline)</option>';
    }
  }

  async executeGeneration() {
    const { project } = store.getState();
    if (!project) return;

    const execBtn = document.getElementById("btn-gen-modal-execute");
    const progressContainer = document.getElementById("gen-progress-container");
    const previewContainer = document.getElementById("gen-preview-container");

    this.stopAudition();
    previewContainer.style.display = "none";
    progressContainer.style.display = "flex";
    this.updateJobProgress(5, "Queuing local AI tensor job...");

    if (execBtn) {
      execBtn.disabled = true;
      execBtn.textContent = "Processing...";
    }

    try {
      let res;
      if (this.currentMode === "generate") {
        const prompt = document.getElementById("input-gen-prompt").value.trim() || "Cyberpunk synth lead";
        const duration = parseFloat(document.getElementById("slider-gen-duration").value) || 8.0;
        const tempo = parseFloat(document.getElementById("input-gen-tempo").value) || 120.0;
        const key = document.getElementById("select-gen-key").value || "A minor";

        res = await api.request(`/api/projects/${project.id}/generate`, {
          method: "POST",
          body: { prompt, duration, tempo, key },
        });
      } else {
        const clipId = document.getElementById("select-extend-clip").value;
        if (!clipId) {
          throw new Error("Please select a timeline clip to extend");
        }
        const prompt = document.getElementById("input-extend-prompt").value.trim();
        const extension_seconds = parseFloat(document.getElementById("slider-extend-duration").value) || 6.0;
        const overlap_seconds = parseFloat(document.getElementById("slider-extend-overlap").value) || 0.5;

        res = await api.request(`/api/projects/${project.id}/extend`, {
          method: "POST",
          body: { clip_id: clipId, prompt, extension_seconds, overlap_seconds },
        });
      }

      this.activeJobId = res.job_id;
      console.log(`[GenerationModal] Active job queued: ${this.activeJobId}`);
    } catch (err) {
      console.error("[GenerationModal] Error triggering generation:", err);
      alert(`Generation failed: ${err.message}`);
      progressContainer.style.display = "none";
      if (execBtn) {
        execBtn.disabled = false;
        execBtn.textContent = "⚡ Generate Locally";
      }
    }
  }

  updateJobProgress(progress, stage) {
    const bar = document.getElementById("gen-progress-bar");
    const pct = document.getElementById("gen-progress-pct");
    const stg = document.getElementById("gen-progress-stage");

    const p = Math.round(progress);
    if (bar) bar.style.width = `${p}%`;
    if (pct) pct.textContent = `${p}%`;
    if (stg && stage) stg.textContent = stage;
  }

  async onJobCompleted(job) {
    console.log("[GenerationModal] Job completed:", job);
    const execBtn = document.getElementById("btn-gen-modal-execute");
    if (execBtn) {
      execBtn.disabled = false;
      execBtn.textContent = "⚡ Generate Locally";
    }

    const progressContainer = document.getElementById("gen-progress-container");
    const previewContainer = document.getElementById("gen-preview-container");

    this.updateJobProgress(100, "Audio generated successfully!");
    setTimeout(() => {
      progressContainer.style.display = "none";
      previewContainer.style.display = "flex";
      this.loadAuditionPreview();
    }, 400);
  }

  async loadAuditionPreview() {
    const { project } = store.getState();
    if (!project || !this.activeJobId) return;

    const streamUrl = `/api/projects/${project.id}/generate/${this.activeJobId}/preview`;
    this.audioPreview = new Audio(streamUrl);

    this.audioPreview.onended = () => {
      this.stopAudition();
    };

    // Fetch candidate waveform pyramid for visualization
    try {
      const waveformData = await api.request(`/api/projects/${project.id}/generate/${this.activeJobId}/waveform`);
      this.previewWaveformData = waveformData;
      this.drawPreviewWaveform(0);
      const durLabel = document.getElementById("gen-preview-duration");
      if (durLabel && waveformData.duration) {
        durLabel.textContent = `${waveformData.duration.toFixed(2)}s`;
      }
    } catch (err) {
      console.warn("[GenerationModal] Could not fetch candidate waveform:", err);
    }
  }

  drawPreviewWaveform(playheadProgress = 0) {
    if (!this.previewCanvas || !this.previewCtx) return;
    const ctx = this.previewCtx;
    const width = this.previewCanvas.width;
    const height = this.previewCanvas.height;

    ctx.clearRect(0, 0, width, height);

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, "#161b22");
    bgGrad.addColorStop(1, "#0e1117");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Center line
    ctx.strokeStyle = "#30363d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (!this.previewWaveformData || !this.previewWaveformData.levels) return;

    // Use lowest resolution level (e.g. 512 or 256) for crisp modal preview
    const levelKeys = Object.keys(this.previewWaveformData.levels);
    const peaks = this.previewWaveformData.levels[levelKeys[0]] || [];
    if (peaks.length === 0) return;

    const barWidth = width / peaks.length;
    for (let i = 0; i < peaks.length; i++) {
      const [minVal, maxVal] = peaks[i];
      const x = i * barWidth;
      const yMin = (1 - (minVal + 1) / 2) * height;
      const yMax = (1 - (maxVal + 1) / 2) * height;
      const h = Math.max(2, yMin - yMax);

      const isPlayed = (i / peaks.length) <= playheadProgress;
      ctx.fillStyle = isPlayed ? "#00f0ff" : "#a855f7";
      ctx.fillRect(x, yMax, Math.max(1, barWidth - 0.5), h);
    }
  }

  playAudition() {
    if (!this.audioPreview) return;
    this.audioPreview.play();
    this.isPlayingPreview = true;

    const playBtn = document.getElementById("btn-gen-play-preview");
    if (playBtn) {
      playBtn.textContent = "⏸ Pause";
    }

    const playheadEl = document.getElementById("gen-preview-playhead");
    if (playheadEl) playheadEl.style.display = "block";

    const updateLoop = () => {
      if (!this.isPlayingPreview || !this.audioPreview) return;
      const cur = this.audioPreview.currentTime;
      const dur = this.audioPreview.duration || 1;
      const prog = Math.min(1.0, cur / dur);

      if (playheadEl) {
        playheadEl.style.left = `${prog * 100}%`;
      }
      this.drawPreviewWaveform(prog);

      this.animFrameId = requestAnimationFrame(updateLoop);
    };

    this.animFrameId = requestAnimationFrame(updateLoop);
  }

  stopAudition() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioPreview) {
      this.audioPreview.pause();
      this.audioPreview.currentTime = 0;
    }
    this.isPlayingPreview = false;

    const playBtn = document.getElementById("btn-gen-play-preview");
    if (playBtn) playBtn.textContent = "▶ Audition";

    const playheadEl = document.getElementById("gen-preview-playhead");
    if (playheadEl) playheadEl.style.display = "none";

    this.drawPreviewWaveform(0);
  }

  async commitCandidate(insertMode = "new_track") {
    const { project } = store.getState();
    if (!project || !this.activeJobId) return;

    this.stopAudition();

    const { transport } = store.getState();
    const playheadTime = transport ? transport.currentTime : 0.0;
    const selectedClipId = store.getState().selectedClipId;
    const selectedTrackId = store.getState().selectedTrackId;

    try {
      const res = await api.request(`/api/projects/${project.id}/generate/${this.activeJobId}/accept`, {
        method: "POST",
        body: {
          insert_mode: insertMode,
          playhead_time: playheadTime,
          target_track_id: selectedTrackId,
          target_clip_id: selectedClipId || document.getElementById("select-extend-clip").value,
          track_name: this.currentMode === "extend" ? "Extended Audio (AI)" : "AI Generated Track",
        },
      });

      console.log("[GenerationModal] Candidate committed successfully:", res);
      await projectManager.loadProject(project.id);
      this.close();
    } catch (err) {
      console.error("[GenerationModal] Error committing candidate:", err);
      alert(`Could not insert audio: ${err.message}`);
    }
  }

  async discardCandidate() {
    const { project } = store.getState();
    if (!project || !this.activeJobId) return;

    this.stopAudition();

    try {
      await api.request(`/api/projects/${project.id}/generate/${this.activeJobId}`, {
        method: "DELETE",
      });
    } catch (_) {}

    this.activeJobId = null;
    document.getElementById("gen-preview-container").style.display = "none";
    document.getElementById("gen-progress-container").style.display = "none";
  }
}

export const generationModalUI = new GenerationModalUI();
