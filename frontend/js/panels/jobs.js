/**
 * Jobs Panel UI — Real-time progress bar, stage telemetry, and task cancellation.
 */

import { api } from "../api/client.js";
import { bus } from "../core/event-bus.js";

export class JobsPanel {
  constructor() {
    this.container = null;
    this.jobsMap = new Map();
  }

  init() {
    this.container = document.getElementById("panel-jobs");
    if (!this.container) return;

    this.renderSkeleton();
    this.bindEvents();
    this.refreshJobs();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%; max-width: 900px; margin: 0 auto; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 600; color: var(--text-primary); font-size: var(--font-size-sm);">Active Background Jobs</span>
            <span id="jobs-count-badge" class="badge" style="background: var(--bg-secondary);">0 Tasks</span>
          </div>
          <button id="jobs-refresh-btn" class="btn" style="padding: 4px 10px; font-size: 11px;">↻ Refresh</button>
        </div>

        <div id="jobs-items-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px;">
          <div style="color: var(--text-muted); font-size: var(--font-size-xs); text-align: center; padding: 20px;">
            No background tasks currently active.
          </div>
        </div>
      </div>
    `;

    const refreshBtn = document.getElementById("jobs-refresh-btn");
    if (refreshBtn) refreshBtn.onclick = () => this.refreshJobs();
  }

  bindEvents() {
    bus.on("job:started", (job) => {
      this.jobsMap.set(job.id, job);
      this.render();
    });

    bus.on("job:progress", (data) => {
      const job = this.jobsMap.get(data.id);
      if (job) {
        job.progress = data.progress;
        job.stage = data.stage;
        job.status = data.status;
        this.render();
      }
    });

    bus.on("job:completed", (job) => {
      this.jobsMap.set(job.id, job);
      this.render();
    });

    bus.on("job:failed", (job) => {
      this.jobsMap.set(job.id, job);
      this.render();
    });

    bus.on("job:cancelled", (job) => {
      this.jobsMap.set(job.id, job);
      this.render();
    });
  }

  async refreshJobs() {
    try {
      const list = await api.request("/api/jobs");
      this.jobsMap.clear();
      list.forEach((j) => this.jobsMap.set(j.id, j));
      this.render();
    } catch (e) {
      console.warn("[JobsPanel] Failed to fetch jobs:", e);
    }
  }

  render() {
    const listEl = document.getElementById("jobs-items-list");
    const countBadge = document.getElementById("jobs-count-badge");
    if (!listEl) return;

    const jobs = Array.from(this.jobsMap.values());
    if (countBadge) {
      const running = jobs.filter((j) => j.status === "running").length;
      countBadge.textContent = `${running} Running / ${jobs.length} Total`;
      countBadge.style.color = running > 0 ? "var(--accent-cyan)" : "inherit";
    }

    if (jobs.length === 0) {
      listEl.innerHTML = `
        <div style="color: var(--text-muted); font-size: var(--font-size-xs); text-align: center; padding: 20px;">
          No background tasks currently active.
        </div>
      `;
      return;
    }

    listEl.innerHTML = jobs
      .map((job) => {
        const isRunning = job.status === "running";
        const isCompleted = job.status === "completed";
        const isFailed = job.status === "failed";
        const isCancelled = job.status === "cancelled";

        const badgeColor = isRunning
          ? "var(--accent-cyan)"
          : isCompleted
          ? "var(--accent-green)"
          : isFailed
          ? "var(--accent-red)"
          : "var(--text-muted)";

        return `
          <div class="job-card" data-job-id="${job.id}" style="
            background: var(--bg-secondary); border: 1px solid var(--border-subtle);
            border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 6px;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="badge" style="background: ${badgeColor}; color: #000; font-weight: 700; font-size: 10px;">${job.status.toUpperCase()}</span>
                <b style="font-size: var(--font-size-xs); color: var(--text-primary);">${job.title}</b>
                ${job.requires_gpu ? '<span class="badge badge-gpu" style="font-size: 9px; padding: 1px 4px;">GPU ACCELERATED</span>' : ""}
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-family: var(--font-mono); font-size: 11px; color: var(--accent-cyan); font-weight: 600;">${(job.progress || 0).toFixed(0)}%</span>
                ${isRunning ? `<button class="btn btn-danger btn-cancel-job" data-id="${job.id}" style="padding: 2px 6px; font-size: 10px;">Cancel</button>` : ""}
              </div>
            </div>

            <!-- Progress Bar -->
            <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 3px; overflow: hidden;">
              <div style="
                width: ${job.progress || 0}%; height: 100%;
                background: linear-gradient(90deg, #00f0ff, #00e676);
                transition: width 0.2s ease;
              "></div>
            </div>

            <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-secondary);">
              <span>Stage: <i>${job.stage || "In progress"}</i></span>
              ${job.error ? `<span style="color: var(--accent-red); font-weight: 600;">Error: ${job.error}</span>` : ""}
            </div>
          </div>
        `;
      })
      .join("");

    listEl.querySelectorAll(".btn-cancel-job").forEach((btn) => {
      btn.onclick = async () => {
        const jid = btn.getAttribute("data-id");
        try {
          await api.request(`/api/jobs/${jid}/cancel`, { method: "POST" });
          btn.disabled = true;
          btn.textContent = "Cancelling...";
        } catch (e) {
          console.error("Cancel failed:", e);
        }
      };
    });
  }
}

export const jobsPanel = new JobsPanel();
