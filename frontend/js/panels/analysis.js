/**
 * Music Analysis Panel UI — BPM, Key/Scale, LUFS loudness, and Section markers.
 */

import { api } from "../api/client.js";
import { bus } from "../core/event-bus.js";
import { store } from "../state/store.js";
import { projectManager } from "../state/project.js";

export class MusicAnalysisPanel {
  constructor() {
    this.container = null;
    this.currentAnalysis = null;
  }

  init() {
    this.container = document.getElementById("panel-analysis");
    if (!this.container) return;

    this.renderSkeleton();
    this.bindEvents();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%; max-width: 950px; margin: 0 auto; gap: 12px;">
        <!-- Header & Action Row -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
          <div>
            <span style="font-weight: 600; color: var(--text-primary); font-size: var(--font-size-sm);">Musical & Acoustic Intelligence</span>
            <span style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-left: 8px;">Local DSP & Acoustic Analysis</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="btn-run-analysis" class="btn btn-accent" style="padding: 4px 12px; font-size: 11px;">⚡ Run Musical Analysis</button>
            <button id="btn-add-markers" class="btn" style="padding: 4px 12px; font-size: 11px;" disabled>📌 Add Section Markers</button>
          </div>
        </div>

        <!-- Metric Stat Cards -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
          <!-- BPM Card -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="font-size: 10px; color: var(--text-secondary); font-weight: 600;">TEMPO / BPM</div>
            <div style="display: flex; align-items: baseline; gap: 6px; margin: 4px 0;">
              <span id="analysis-stat-bpm" style="font-size: 26px; font-family: var(--font-mono); color: var(--accent-amber); font-weight: 700;">--</span>
              <span style="font-size: 11px; color: var(--text-muted);">BPM</span>
            </div>
            <button id="btn-apply-bpm" class="btn" style="padding: 2px 6px; font-size: 10px; width: 100%;" disabled>Sync Project Tempo</button>
          </div>

          <!-- Key Card -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="font-size: 10px; color: var(--text-secondary); font-weight: 600;">KEY & SCALE</div>
            <div id="analysis-stat-key" style="font-size: 24px; font-family: var(--font-mono); color: var(--accent-cyan); font-weight: 700; margin: 4px 0;">--</div>
            <div id="analysis-stat-key-conf" style="font-size: 10px; color: var(--text-muted);">Confidence: --</div>
          </div>

          <!-- LUFS Loudness Card -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="font-size: 10px; color: var(--text-secondary); font-weight: 600;">INTEGRATED LOUDNESS</div>
            <div style="display: flex; align-items: baseline; gap: 6px; margin: 4px 0;">
              <span id="analysis-stat-lufs" style="font-size: 26px; font-family: var(--font-mono); color: var(--text-primary); font-weight: 700;">--</span>
              <span style="font-size: 11px; color: var(--text-muted);">LUFS</span>
            </div>
            <div id="analysis-stat-lra" style="font-size: 10px; color: var(--text-muted);">Range: -- LU</div>
          </div>

          <!-- Dynamic Range & Peaks -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="font-size: 10px; color: var(--text-secondary); font-weight: 600;">TRUE PEAK / RMS</div>
            <div id="analysis-stat-peak" style="font-size: 16px; font-family: var(--font-mono); color: var(--accent-green); font-weight: 600; margin-top: 4px;">Peak: -- dBFS</div>
            <div id="analysis-stat-rms" style="font-size: 12px; font-family: var(--font-mono); color: var(--text-secondary);">RMS: -- dBFS</div>
          </div>
        </div>

        <!-- Detected Song Sections -->
        <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600;">DETECTED SONG STRUCTURE</div>
          <div id="analysis-sections-list" style="display: flex; gap: 8px; overflow-x: auto; padding: 4px 0;">
            <div style="color: var(--text-muted); font-size: var(--font-size-xs); padding: 10px;">
              Run analysis to detect structural song sections (Intro, Verse, Chorus, Outro).
            </div>
          </div>
        </div>
      </div>
    `;

    const runBtn = document.getElementById("btn-run-analysis");
    if (runBtn) runBtn.onclick = () => this.triggerAnalysis();

    const applyBpmBtn = document.getElementById("btn-apply-bpm");
    if (applyBpmBtn) {
      applyBpmBtn.onclick = () => {
        if (this.currentAnalysis && this.currentAnalysis.bpm) {
          const { project } = store.getState();
          if (project) {
            project.tempo = this.currentAnalysis.bpm;
            const tempoInput = document.getElementById("input-tempo");
            if (tempoInput) tempoInput.value = this.currentAnalysis.bpm;
            projectManager.saveCurrentProject();
            bus.emit("project:loaded", project);
            applyBpmBtn.textContent = "Synced ✓";
          }
        }
      };
    }

    const addMarkersBtn = document.getElementById("btn-add-markers");
    if (addMarkersBtn) {
      addMarkersBtn.onclick = () => this.addSectionMarkersToProject();
    }
  }

  bindEvents() {
    bus.on("project:loaded", async (project) => {
      if (project) {
        await this.loadExistingAnalysis(project.id);
      }
    });

    bus.on("job:completed", async (job) => {
      const { project } = store.getState();
      if (project && job.project_id === project.id && job.type === "analysis") {
        if (job.result) {
          this.applyAnalysisData(job.result);
        } else {
          await this.loadExistingAnalysis(project.id);
        }
      }
    });
  }

  async triggerAnalysis() {
    const { project } = store.getState();
    if (!project) {
      alert("Please open or create a project first.");
      return;
    }

    const runBtn = document.getElementById("btn-run-analysis");
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = "Analyzing Audio...";
    }

    try {
      const res = await api.request(`/api/projects/${project.id}/analysis`, { method: "POST" });
      console.log("[AnalysisPanel] Analysis job queued:", res.job_id);

      // Switch to Jobs tab to show progress
      const jobsTab = document.querySelector('.drawer-tab[data-target="panel-jobs"]');
      if (jobsTab) jobsTab.click();
    } catch (e) {
      console.error("[AnalysisPanel] Failed to start analysis:", e);
      alert(`Could not start analysis: ${e.message}`);
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = "⚡ Run Musical Analysis";
      }
    }
  }

  async loadExistingAnalysis(projectId) {
    try {
      const data = await api.request(`/api/projects/${projectId}/analysis`);
      if (data) {
        this.applyAnalysisData(data);
      }
    } catch (e) {
      // Not yet analyzed, perfectly normal
    }
  }

  applyAnalysisData(data) {
    this.currentAnalysis = data;

    const bpmEl = document.getElementById("analysis-stat-bpm");
    const keyEl = document.getElementById("analysis-stat-key");
    const keyConfEl = document.getElementById("analysis-stat-key-conf");
    const lufsEl = document.getElementById("analysis-stat-lufs");
    const lraEl = document.getElementById("analysis-stat-lra");
    const peakEl = document.getElementById("analysis-stat-peak");
    const rmsEl = document.getElementById("analysis-stat-rms");
    const applyBpmBtn = document.getElementById("btn-apply-bpm");
    const addMarkersBtn = document.getElementById("btn-add-markers");
    const runBtn = document.getElementById("btn-run-analysis");

    if (runBtn) {
      runBtn.disabled = false;
      runBtn.textContent = "⚡ Re-analyze Audio";
    }

    if (bpmEl) bpmEl.textContent = data.bpm || "--";
    if (keyEl) keyEl.textContent = data.key || "--";
    if (keyConfEl) keyConfEl.textContent = `Confidence: ${(data.key_confidence * 100 || 0).toFixed(0)}%`;
    if (lufsEl) lufsEl.textContent = data.integrated_lufs || "--";
    if (lraEl) lraEl.textContent = `Range: ${data.loudness_range_lu || 0} LU`;
    if (peakEl) peakEl.textContent = `Peak: ${data.peak_db || 0} dBFS`;
    if (rmsEl) rmsEl.textContent = `RMS: ${data.rms_db || 0} dBFS`;

    if (applyBpmBtn) applyBpmBtn.disabled = !data.bpm;
    if (addMarkersBtn) addMarkersBtn.disabled = !data.sections || data.sections.length === 0;

    // Render section cards
    const sectionsList = document.getElementById("analysis-sections-list");
    if (sectionsList && data.sections) {
      const colors = ["#00f0ff", "#00e676", "#ffb800", "#a855f7", "#ff3d71"];
      sectionsList.innerHTML = data.sections
        .map((sec, idx) => {
          const color = colors[idx % colors.length];
          return `
            <div style="
              background: var(--bg-secondary); border: 1px solid var(--border-subtle);
              border-top: 3px solid ${color}; border-radius: 4px; padding: 8px 12px;
              min-width: 110px; display: flex; flex-direction: column; gap: 2px;
            ">
              <b style="font-size: 11px; color: ${color};">${sec.name}</b>
              <span style="font-family: var(--font-mono); font-size: 10px; color: var(--text-primary);">${sec.start.toFixed(1)}s – ${sec.end.toFixed(1)}s</span>
              <span style="font-size: 9px; color: var(--text-muted);">${sec.duration.toFixed(1)}s duration</span>
            </div>
          `;
        })
        .join("");
    }
  }

  async addSectionMarkersToProject() {
    if (!this.currentAnalysis || !this.currentAnalysis.sections) return;
    const { project } = store.getState();
    if (!project) return;

    const colors = ["#00f0ff", "#00e676", "#ffb800", "#a855f7", "#ff3d71"];
    project.markers = project.markers || [];

    this.currentAnalysis.sections.forEach((sec, idx) => {
      const exists = project.markers.some((m) => Math.abs(m.time - sec.start) < 0.2);
      if (!exists) {
        project.markers.push({
          id: `mrk_${Math.random().toString(36).substr(2, 8)}`,
          name: sec.name,
          time: sec.start,
          color: colors[idx % colors.length],
        });
      }
    });

    await projectManager.saveCurrentProject();
    bus.emit("project:loaded", project);
    const btn = document.getElementById("btn-add-markers");
    if (btn) btn.textContent = "Markers Added ✓";
  }
}

export const musicAnalysisPanel = new MusicAnalysisPanel();
