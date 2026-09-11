/**
 * Master Export & Stem Bounce UI Panel
 */

import { bus } from "../core/event-bus.js";
import { store } from "../state/store.js";
import { api } from "../api/client.js";

export class ExportPanel {
  constructor() {
    this.container = null;
    this.btnExport = null;
    this.isRendering = false;
  }

  init() {
    this.container = document.getElementById("panel-export");
    this.btnExport = document.getElementById("btn-start-export");
    if (!this.container || !this.btnExport) return;

    this.bindEvents();
  }

  bindEvents() {
    this.btnExport.addEventListener("click", () => this.handleExport());
  }

  async handleExport() {
    if (this.isRendering) return;

    const { project } = store.getState();
    if (!project || !project.id) {
      alert("Please create or load a project before exporting.");
      return;
    }

    const formatSelect = document.getElementById("export-format");
    const rateSelect = document.getElementById("export-sample-rate");
    const modeSelect = document.getElementById("export-mode");

    const rawFormat = formatSelect ? formatSelect.value : "wav24";
    let format = "wav";
    let bitDepth = 24;

    if (rawFormat === "wav24") {
      format = "wav";
      bitDepth = 24;
    } else if (rawFormat === "wav16") {
      format = "wav";
      bitDepth = 16;
    } else if (rawFormat === "wav32") {
      format = "wav";
      bitDepth = 32;
    } else if (rawFormat === "flac") {
      format = "flac";
      bitDepth = 24;
    } else if (rawFormat === "mp3") {
      format = "mp3";
      bitDepth = 24;
    }

    const sampleRate = rateSelect ? parseInt(rateSelect.value, 10) : 44100;
    const mode = modeSelect ? modeSelect.value : "master";

    this.isRendering = true;
    const originalText = this.btnExport.textContent;
    this.btnExport.textContent = "⏳ Rendering Offline Mix...";
    this.btnExport.disabled = true;

    const statusEl = document.getElementById("export-status-container");
    if (statusEl) {
      statusEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; color: var(--accent-cyan);">
          <span class="status-indicator" style="animation: pulse 1s infinite;"></span>
          <span>Sample-accurate timeline bounce in progress (${format.toUpperCase()}, ${sampleRate} Hz)...</span>
        </div>
      `;
    }

    try {
      const response = await api.request(`/api/projects/${project.id}/export`, {
        method: "POST",
        body: JSON.stringify({
          format: format,
          sample_rate: sampleRate,
          bit_depth: bitDepth,
          mode: mode,
        }),
      });

      console.log("[Export] Render result:", response);

      if (response && response.status === "success" && response.data && response.data.files) {
        const files = response.data.files;
        if (statusEl) {
          statusEl.innerHTML = `
            <div style="color: var(--accent-green); font-weight: 600; margin-bottom: 8px;">
              ✓ Export complete! (${files.length} file${files.length > 1 ? "s" : ""} rendered)
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${files
                .map(
                  (f) => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-tertiary); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-subtle);">
                  <div>
                    <b style="color: var(--text-primary);">${f.name}</b>
                    <span style="font-size: 11px; color: var(--text-secondary); margin-left: 8px;">${f.filename} • ${(f.file_size / (1024 * 1024)).toFixed(2)} MB • ${f.duration.toFixed(1)}s</span>
                  </div>
                  <a href="${f.download_url}" download="${f.filename}" class="btn btn-primary" style="padding: 4px 10px; font-size: 11px;">
                    ⬇ Download
                  </a>
                </div>
              `
                )
                .join("")}
            </div>
          `;
        }

        // Automatically trigger download for first file if single master mix
        if (files.length === 1 && files[0].download_url) {
          const downloadAnchor = document.createElement("a");
          downloadAnchor.href = files[0].download_url;
          downloadAnchor.download = files[0].filename;
          document.body.appendChild(downloadAnchor);
          downloadAnchor.click();
          downloadAnchor.remove();
        }
      }
    } catch (err) {
      console.error("[Export] Render failed:", err);
      if (statusEl) {
        statusEl.innerHTML = `
          <div style="color: var(--accent-red); font-weight: 600;">
            ✕ Export failed: ${err.message || "Unknown error during render"}
          </div>
        `;
      }
    } finally {
      this.isRendering = false;
      this.btnExport.textContent = originalText;
      this.btnExport.disabled = false;
    }
  }
}

export const exportPanel = new ExportPanel();
