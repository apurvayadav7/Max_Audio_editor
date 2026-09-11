/**
 * Project Modal Dialogs (New Project & Open Project)
 */

import { projectManager } from "../state/project.js";

class ProjectModalUI {
  init() {
    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    const modalHTML = `
      <div id="project-modal" class="modal-overlay">
        <div class="modal-card">
          <div class="modal-header">
            <span id="modal-title">New Audio Project</span>
            <button id="modal-close-btn" style="font-size: 18px; color: var(--text-muted);">&times;</button>
          </div>
          <div class="modal-body" id="modal-body-content">
            <!-- Dynamic Content -->
          </div>
          <div class="modal-footer" id="modal-footer-content">
            <!-- Dynamic Actions -->
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.modal = document.getElementById("project-modal");
    this.title = document.getElementById("modal-title");
    this.body = document.getElementById("modal-body-content");
    this.footer = document.getElementById("modal-footer-content");

    document.getElementById("modal-close-btn").addEventListener("click", () => this.close());
    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) this.close();
    });
  }

  bindEvents() {
    const newBtn = document.getElementById("btn-new-project");
    if (newBtn) {
      newBtn.addEventListener("click", () => this.showNewProjectModal());
    }

    const openBtn = document.getElementById("btn-open-project");
    if (openBtn) {
      openBtn.addEventListener("click", () => this.showOpenProjectModal());
    }

    const saveBtn = document.getElementById("btn-save-project");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => projectManager.saveCurrentProject());
    }
  }

  showNewProjectModal() {
    this.title.textContent = "Create New Audio Project";
    this.body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div>
          <label style="font-size: var(--font-size-xs); color: var(--text-secondary); display: block; margin-bottom: 6px;">PROJECT NAME</label>
          <input type="text" id="modal-input-name" value="My New Track" style="width: 100%; padding: 8px 12px; border-radius: 4px;">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label style="font-size: var(--font-size-xs); color: var(--text-secondary); display: block; margin-bottom: 6px;">SAMPLE RATE</label>
            <select id="modal-select-sr" style="width: 100%; padding: 8px; border-radius: 4px;">
              <option value="44100">44.1 kHz (Music standard)</option>
              <option value="48000" selected>48.0 kHz (Pro studio / Film)</option>
              <option value="96000">96.0 kHz (Hi-res audio)</option>
            </select>
          </div>
          <div>
            <label style="font-size: var(--font-size-xs); color: var(--text-secondary); display: block; margin-bottom: 6px;">INITIAL TEMPO (BPM)</label>
            <input type="number" id="modal-input-tempo" value="120.0" min="40" max="280" step="0.5" style="width: 100%; padding: 8px; border-radius: 4px;">
          </div>
        </div>
      </div>
    `;

    this.footer.innerHTML = `
      <button id="modal-btn-cancel" class="btn">Cancel</button>
      <button id="modal-btn-confirm" class="btn btn-accent">Create Project</button>
    `;

    document.getElementById("modal-btn-cancel").onclick = () => this.close();
    document.getElementById("modal-btn-confirm").onclick = async () => {
      const name = document.getElementById("modal-input-name").value.trim() || "Untitled Project";
      const sr = parseInt(document.getElementById("modal-select-sr").value, 10);
      const tempo = parseFloat(document.getElementById("modal-input-tempo").value) || 120.0;

      await projectManager.createNewProject(name, sr, tempo);
      this.close();
    };

    this.open();
  }

  async showOpenProjectModal() {
    this.title.textContent = "Open Recent Project";
    this.body.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Loading projects...</div>`;
    this.footer.innerHTML = `<button id="modal-btn-cancel" class="btn">Close</button>`;
    document.getElementById("modal-btn-cancel").onclick = () => this.close();
    this.open();

    try {
      const projects = await projectManager.listRecentProjects();
      if (!projects || projects.length === 0) {
        this.body.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); padding: 20px;">
            No existing projects found in workspace. Create a new one!
          </div>
        `;
        return;
      }

      this.body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto;">
          ${projects
            .map(
              (p) => `
            <div class="project-item" data-id="${p.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: 6px; cursor: pointer; transition: var(--transition-fast);">
              <div>
                <div style="font-weight: 600; color: var(--text-primary);">${p.name}</div>
                <div style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-top: 2px;">
                  ${p.tempo} BPM • ${p.sample_rate / 1000} kHz • ${p.track_count} tracks
                </div>
              </div>
              <button class="btn btn-primary" style="padding: 4px 10px; font-size: var(--font-size-xs);">Open</button>
            </div>
          `
            )
            .join("")}
        </div>
      `;

      this.body.querySelectorAll(".project-item").forEach((el) => {
        el.addEventListener("click", async () => {
          const id = el.getAttribute("data-id");
          await projectManager.loadProject(id);
          this.close();
        });
      });
    } catch (err) {
      this.body.innerHTML = `<div style="color: var(--accent-red); padding: 12px;">Failed to load projects: ${err.message}</div>`;
    }
  }

  open() {
    this.modal.classList.add("open");
  }

  close() {
    this.modal.classList.remove("open");
  }
}

export const projectModalUI = new ProjectModalUI();
