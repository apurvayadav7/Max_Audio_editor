/**
 * Project State Controller & Auto-Save Handler
 */

import { store } from "./store.js";
import { bus } from "../core/event-bus.js";
import { api } from "../api/client.js";

class ProjectManager {
  constructor() {
    this.autoSaveInterval = null;
  }

  init() {
    this.startAutoSave();
    bus.on("project:request-save", () => this.saveCurrentProject());
  }

  async createNewProject(name = "Untitled Project", sampleRate = 44100, tempo = 120.0) {
    try {
      const project = await api.request("/api/projects", {
        method: "POST",
        body: { name, sample_rate: sampleRate, tempo },
      });

      store.setState({
        project,
        isDirty: false,
      });

      bus.emit("project:loaded", project);
      console.log("[ProjectManager] Created project:", project.name, project.id);
      return project;
    } catch (err) {
      console.error("[ProjectManager] Failed to create project:", err);
      throw err;
    }
  }

  async loadProject(projectId) {
    try {
      const project = await api.request(`/api/projects/${projectId}`);
      store.setState({
        project,
        isDirty: false,
      });

      bus.emit("project:loaded", project);
      console.log("[ProjectManager] Loaded project:", project.name);
      return project;
    } catch (err) {
      console.error(`[ProjectManager] Failed to load project ${projectId}:`, err);
      throw err;
    }
  }

  async saveCurrentProject() {
    const { project, isDirty } = store.getState();
    if (!project) return;

    try {
      const updated = await api.request(`/api/projects/${project.id}`, {
        method: "PUT",
        body: project,
      });

      store.setState({
        project: updated,
        isDirty: false,
      });

      bus.emit("project:saved", updated);
      console.log("[ProjectManager] Saved project:", updated.id);
    } catch (err) {
      console.error("[ProjectManager] Failed to save project:", err);
    }
  }

  async listRecentProjects() {
    return await api.request("/api/projects");
  }

  startAutoSave(intervalMs = 60000) {
    if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);
    this.autoSaveInterval = setInterval(() => {
      const { isDirty, project } = store.getState();
      if (isDirty && project) {
        console.log("[ProjectManager] Auto-saving dirty project...");
        this.saveCurrentProject();
      }
    }, intervalMs);
  }
}

export const projectManager = new ProjectManager();
