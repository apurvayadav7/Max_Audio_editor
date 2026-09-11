/**
 * History Panel UI — Visual Action Stack and Time-Travel Stepper
 */

import { commandManager } from "../commands/manager.js";
import { bus } from "../core/event-bus.js";

export class HistoryPanel {
  constructor() {
    this.container = null;
    this.listEl = null;
    this.undoBtn = null;
    this.redoBtn = null;
  }

  init() {
    this.container = document.getElementById("panel-history");
    if (!this.container) return;

    this.renderSkeleton();
    this.bindEvents();
    this.updateUI();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%; max-width: 900px; margin: 0 auto; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 600; color: var(--text-primary); font-size: var(--font-size-sm);">Edit History</span>
            <span id="history-count-badge" class="badge" style="background: var(--bg-secondary);">0 Actions</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="history-undo-btn" class="btn" style="padding: 4px 10px; font-size: 11px;" disabled>↶ Undo</button>
            <button id="history-redo-btn" class="btn" style="padding: 4px 10px; font-size: 11px;" disabled>↷ Redo</button>
          </div>
        </div>

        <div id="history-items-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding-right: 4px;">
          <div style="color: var(--text-muted); font-size: var(--font-size-xs); text-align: center; padding: 20px;">
            No actions recorded yet. Edit clips on the timeline to populate history.
          </div>
        </div>
      </div>
    `;

    this.listEl = document.getElementById("history-items-list");
    this.undoBtn = document.getElementById("history-undo-btn");
    this.redoBtn = document.getElementById("history-redo-btn");

    if (this.undoBtn) {
      this.undoBtn.onclick = () => commandManager.undo();
    }
    if (this.redoBtn) {
      this.redoBtn.onclick = () => commandManager.redo();
    }
  }

  bindEvents() {
    bus.on("command:stack-changed", () => this.updateUI());
  }

  updateUI() {
    if (!this.listEl) return;

    const stackInfo = commandManager.getStackInfo();
    const countBadge = document.getElementById("history-count-badge");
    if (countBadge) {
      countBadge.textContent = `${stackInfo.undoCount} Applied / ${stackInfo.redoCount} Undone`;
    }

    if (this.undoBtn) this.undoBtn.disabled = !stackInfo.canUndo;
    if (this.redoBtn) this.redoBtn.disabled = !stackInfo.canRedo;

    // Also update header/toolbar undo/redo buttons if present
    const topUndo = document.getElementById("btn-undo");
    const topRedo = document.getElementById("btn-redo");
    if (topUndo) topUndo.disabled = !stackInfo.canUndo;
    if (topRedo) topRedo.disabled = !stackInfo.canRedo;

    const history = stackInfo.history;
    if (!history || history.length === 0) {
      this.listEl.innerHTML = `
        <div style="color: var(--text-muted); font-size: var(--font-size-xs); text-align: center; padding: 20px;">
          No actions recorded yet. Edit, move, or split clips to see non-destructive history.
        </div>
      `;
      return;
    }

    this.listEl.innerHTML = history
      .map((item) => {
        const isApplied = item.type === "applied";
        const isCurrent = item.index === stackInfo.currentIndex;
        const timeStr = item.timestamp
          ? new Date(item.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
          : "";

        return `
          <div class="history-item" data-index="${item.index}" style="
            display: flex; justify-content: space-between; align-items: center;
            padding: 6px 10px; border-radius: 4px; cursor: pointer;
            background: ${isCurrent ? "rgba(0, 240, 255, 0.12)" : isApplied ? "var(--bg-secondary)" : "rgba(255, 255, 255, 0.02)"};
            border-left: 3px solid ${isCurrent ? "var(--accent-cyan)" : isApplied ? "var(--accent-green)" : "var(--border-subtle)"};
            color: ${isApplied ? "var(--text-primary)" : "var(--text-muted)"};
            font-size: var(--font-size-xs);
            opacity: ${isApplied ? "1" : "0.55"};
            transition: all 0.15s ease;
          ">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>${isApplied ? "✓" : "○"}</span>
              <b style="font-weight: ${isCurrent ? "700" : "500"};">${item.description}</b>
              ${isCurrent ? '<span class="badge" style="background: var(--accent-cyan); color: #000; font-size: 9px; padding: 1px 4px;">CURRENT</span>' : ""}
            </div>
            <span style="font-family: var(--font-mono); color: var(--text-secondary); font-size: 10px;">${timeStr}</span>
          </div>
        `;
      })
      .join("");

    // Wire click to jumpTo
    this.listEl.querySelectorAll(".history-item").forEach((el) => {
      el.onclick = () => {
        const idx = parseInt(el.getAttribute("data-index"), 10);
        commandManager.jumpTo(idx);
      };
    });
  }
}

export const historyPanel = new HistoryPanel();
