/**
 * Stem Separation Modal UI — Local GPU model selection and track ingestion.
 */

import { api } from "../api/client.js";
import { bus } from "../core/event-bus.js";
import { store } from "../state/store.js";
import { projectManager } from "../state/project.js";

export class StemModalUI {
  constructor() {
    this.modalEl = null;
    this.isOpen = false;
  }

  init() {
    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    const modal = document.createElement("div");
    modal.id = "stem-separation-modal";
    modal.className = "modal-backdrop";
    modal.style.display = "none";

    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 520px; background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: 8px; box-shadow: 0 16px 40px rgba(0,0,0,0.8); overflow: hidden;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-secondary);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🎛</span>
            <b style="font-size: var(--font-size-sm); color: var(--text-primary);">Local AI Stem Separation</b>
          </div>
          <button id="btn-stem-close" class="btn" style="padding: 2px 8px; font-size: 12px;">✕</button>
        </div>

        <!-- Body -->
        <div style="padding: 18px; display: flex; flex-direction: column; gap: 14px;">
          <!-- GPU Hardware Badge -->
          <div style="background: rgba(0, 240, 255, 0.08); border: 1px solid rgba(0, 240, 255, 0.25); border-radius: 6px; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 10px; color: var(--accent-cyan); font-weight: 700;">ACCELERATION ENGINE</div>
              <div id="stem-gpu-label" style="font-size: 12px; font-weight: 600; color: var(--text-primary); margin-top: 2px;">Detecting CUDA GPU...</div>
            </div>
            <span class="badge" style="background: var(--accent-cyan); color: #000; font-weight: 700;">FP16 VRAM-SAFE</span>
          </div>

          <!-- Model Selection -->
          <div>
            <label style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 4px; font-weight: 600;">DEMUCS MODEL ARCHITECTURE</label>
            <select id="select-stem-model" style="width: 100%; padding: 8px; border-radius: 4px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); color: var(--text-primary); font-size: var(--font-size-sm);">
              <option value="htdemucs" selected>htdemucs (Hybrid Transformer • 4 Stems • Balanced)</option>
              <option value="htdemucs_ft">htdemucs_ft (Fine-Tuned Transformer • Studio Quality)</option>
              <option value="htdemucs_6s">htdemucs_6s (6 Stems • Vocals, Drums, Bass, Guitar, Piano, Other)</option>
            </select>
          </div>

          <!-- Stems to Extract -->
          <div>
            <label style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 6px; font-weight: 600;">EXTRACT SYNCHRONIZED TRACKS</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <label style="display: flex; align-items: center; gap: 8px; background: var(--bg-secondary); padding: 8px; border-radius: 4px; border-left: 3px solid #a855f7; font-size: var(--font-size-xs); cursor: pointer;">
                <input type="checkbox" checked disabled> <b style="color: #a855f7;">Vocals</b> (Lead & backing)
              </label>
              <label style="display: flex; align-items: center; gap: 8px; background: var(--bg-secondary); padding: 8px; border-radius: 4px; border-left: 3px solid #ffb800; font-size: var(--font-size-xs); cursor: pointer;">
                <input type="checkbox" checked disabled> <b style="color: #ffb800;">Drums</b> (Beat & percussion)
              </label>
              <label style="display: flex; align-items: center; gap: 8px; background: var(--bg-secondary); padding: 8px; border-radius: 4px; border-left: 3px solid #00e676; font-size: var(--font-size-xs); cursor: pointer;">
                <input type="checkbox" checked disabled> <b style="color: #00e676;">Bass</b> (Basslines & 808s)
              </label>
              <label style="display: flex; align-items: center; gap: 8px; background: var(--bg-secondary); padding: 8px; border-radius: 4px; border-left: 3px solid #00f0ff; font-size: var(--font-size-xs); cursor: pointer;">
                <input type="checkbox" checked disabled> <b style="color: #00f0ff;">Other</b> (Synths, keys, guitars)
              </label>
            </div>
          </div>

          <div style="font-size: 10px; color: var(--text-muted); line-height: 1.4;">
            * All inference executes 100% locally on your NVIDIA GeForce RTX 4050 with chunked overlap. Zero external network calls.
          </div>
        </div>

        <!-- Footer -->
        <div style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--border-subtle); background: var(--bg-secondary);">
          <button id="btn-stem-cancel" class="btn">Cancel</button>
          <button id="btn-stem-execute" class="btn btn-primary" style="background: var(--accent-cyan); color: #000; font-weight: 700;">🚀 Separate Stems</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;
  }

  bindEvents() {
    const triggerBtn = document.getElementById("btn-stem-separation");
    if (triggerBtn) {
      triggerBtn.onclick = () => this.open();
    }

    const closeBtn = document.getElementById("btn-stem-close");
    const cancelBtn = document.getElementById("btn-stem-cancel");
    if (closeBtn) closeBtn.onclick = () => this.close();
    if (cancelBtn) cancelBtn.onclick = () => this.close();

    const executeBtn = document.getElementById("btn-stem-execute");
    if (executeBtn) {
      executeBtn.onclick = () => this.executeSeparation();
    }

    // Auto-reload project when stem separation job completes
    bus.on("job:completed", async (job) => {
      const { project } = store.getState();
      if (project && job.project_id === project.id && job.type === "stem_separation") {
        console.log("[StemModal] Stem separation finished, reloading project tracks...");
        await projectManager.loadProject(project.id);
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

    // Query GPU info for display
    try {
      const gpu = await api.getGPUInfo();
      const label = document.getElementById("stem-gpu-label");
      if (label) {
        if (gpu.cuda_available) {
          label.textContent = `${gpu.device_name} (${gpu.vram_free_mb} MB Free)`;
        } else {
          label.textContent = "CPU Fallback Mode";
        }
      }
    } catch (_) {}
  }

  close() {
    this.isOpen = false;
    this.modalEl.style.display = "none";
  }

  async executeSeparation() {
    const { project } = store.getState();
    if (!project) return;

    const modelSelect = document.getElementById("select-stem-model");
    const modelName = modelSelect ? modelSelect.value : "htdemucs";

    const execBtn = document.getElementById("btn-stem-execute");
    if (execBtn) {
      execBtn.disabled = true;
      execBtn.textContent = "Queuing GPU Job...";
    }

    try {
      const res = await api.request(`/api/projects/${project.id}/stems`, {
        method: "POST",
        body: { model_name: modelName },
      });

      console.log("[StemModal] Stem separation job queued:", res.job_id);
      this.close();

      // Switch to Jobs tab to monitor progress
      const jobsTab = document.querySelector('.drawer-tab[data-target="panel-jobs"]');
      if (jobsTab) jobsTab.click();
    } catch (err) {
      console.error("[StemModal] Failed to start stem separation:", err);
      alert(`Could not start stem separation: ${err.message}`);
    } finally {
      if (execBtn) {
        execBtn.disabled = false;
        execBtn.textContent = "🚀 Separate Stems";
      }
    }
  }
}

export const stemModalUI = new StemModalUI();
