/**
 * AI Mix Assistant & Intelligent Acoustic Analysis Panel.
 *
 * Provides:
 * - Real-time acoustic mix health scoring (0-100)
 * - Frequency masking collision detector (Kick vs Bass, Vocals vs Guitars)
 * - Stereo phase cancellation & mono-compatibility warning
 * - Dynamic headroom & crest factor metrics
 * - 1-Click non-destructive corrective fixes
 */

import { api } from "../api/client.js";
import { bus } from "../core/event-bus.js";
import { store } from "../state/store.js";
import { projectManager } from "../state/project.js";

export class MixAssistantPanelUI {
  constructor() {
    this.modalEl = null;
    this.isOpen = false;
    this.isAnalyzing = false;
    this.currentReport = null;
  }

  init() {
    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    const modal = document.createElement("div");
    modal.id = "mix-assistant-modal";
    modal.className = "modal-backdrop";
    modal.style.display = "none";

    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 720px; width: 94%; background: var(--bg-tertiary, #12151c); border: 1px solid var(--border-subtle, #232a3b); border-radius: 10px; box-shadow: 0 24px 70px rgba(0,0,0,0.9); overflow: hidden; display: flex; flex-direction: column;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border-subtle, #232a3b); background: var(--bg-secondary, #171b26);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 18px;">🎛️</span>
            <b style="font-size: 14px; color: var(--text-primary, #fff); letter-spacing: 0.5px;">AI Mix Assistant & Acoustic Advisor</b>
            <span class="badge" style="background: var(--accent-cyan, #00f0ff); color: #000; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">LOCAL DSP</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="btn-mix-reanalyze" class="btn" style="padding: 4px 10px; font-size: 11px; background: rgba(0,240,255,0.1); border: 1px solid var(--accent-cyan, #00f0ff); color: var(--accent-cyan, #00f0ff); border-radius: 4px; cursor: pointer;">
              🔄 Re-Analyze Mix
            </button>
            <button id="btn-mix-close" class="btn" style="padding: 2px 8px; font-size: 12px; background: transparent; border: none; color: var(--text-secondary, #8e99ac); cursor: pointer;">✕</button>
          </div>
        </div>

        <!-- Body -->
        <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px; max-height: 75vh; overflow-y: auto;">
          <!-- Mix Score & Health Overview -->
          <div id="mix-health-overview" style="background: var(--bg-secondary, #171b26); border: 1px solid var(--border-subtle, #232a3b); border-radius: 8px; padding: 16px; display: flex; align-items: center; gap: 20px;">
            <div id="mix-score-circle" style="width: 76px; height: 76px; border-radius: 50%; border: 4px solid var(--accent-cyan, #00f0ff); display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 0 16px rgba(0,240,255,0.2);">
              <span id="mix-score-value" style="font-size: 24px; font-weight: 800; color: #fff; line-height: 1;">--</span>
              <span style="font-size: 9px; color: var(--text-muted, #55627a); text-transform: uppercase;">Score</span>
            </div>
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span id="mix-rating-badge" class="badge" style="background: rgba(0,240,255,0.2); color: var(--accent-cyan, #00f0ff); font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 4px;">Analyzing...</span>
                <span id="mix-tracks-count" style="font-size: 11px; color: var(--text-muted, #55627a);">0 active tracks</span>
              </div>
              <p id="mix-summary-text" style="font-size: 12px; color: var(--text-secondary, #8e99ac); margin: 6px 0 0 0; line-height: 1.4;">
                Analyzing multi-track frequency masking, stereo phase correlation, and dynamic headroom...
              </p>
            </div>
          </div>

          <!-- Key Metrics Badges -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
            <div style="background: var(--bg-secondary, #171b26); border: 1px solid var(--border-subtle, #232a3b); border-radius: 6px; padding: 10px; text-align: center;">
              <div style="font-size: 9px; color: var(--text-muted, #55627a); text-transform: uppercase;">Headroom</div>
              <div id="metric-headroom" style="font-size: 14px; font-weight: 700; color: #fff; margin-top: 2px;">-- dB</div>
            </div>
            <div style="background: var(--bg-secondary, #171b26); border: 1px solid var(--border-subtle, #232a3b); border-radius: 6px; padding: 10px; text-align: center;">
              <div style="font-size: 9px; color: var(--text-muted, #55627a); text-transform: uppercase;">Crest Factor</div>
              <div id="metric-crest" style="font-size: 14px; font-weight: 700; color: #fff; margin-top: 2px;">-- dB</div>
            </div>
            <div style="background: var(--bg-secondary, #171b26); border: 1px solid var(--border-subtle, #232a3b); border-radius: 6px; padding: 10px; text-align: center;">
              <div style="font-size: 9px; color: var(--text-muted, #55627a); text-transform: uppercase;">Phase Correlation</div>
              <div id="metric-phase" style="font-size: 14px; font-weight: 700; color: #fff; margin-top: 2px;">--</div>
            </div>
            <div style="background: var(--bg-secondary, #171b26); border: 1px solid var(--border-subtle, #232a3b); border-radius: 6px; padding: 10px; text-align: center;">
              <div style="font-size: 9px; color: var(--text-muted, #55627a); text-transform: uppercase;">Peak Level</div>
              <div id="metric-peak" style="font-size: 14px; font-weight: 700; color: #fff; margin-top: 2px;">-- dBFS</div>
            </div>
          </div>

          <!-- Advice Cards Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
            <span style="font-size: 11px; color: var(--text-secondary, #8e99ac); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">
              Actionable Mix Recommendations
            </span>
            <span id="mix-cards-count" style="font-size: 11px; color: var(--text-muted, #55627a);">0 issues flagged</span>
          </div>

          <!-- Advice Cards Deck -->
          <div id="mix-advice-deck" style="display: flex; flex-direction: column; gap: 10px;">
            <div style="padding: 30px; text-align: center; color: var(--text-muted, #55627a); font-size: 12px;">
              Click 'Re-Analyze Mix' to inspect active session tracks.
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;
  }

  bindEvents() {
    const btnClose = this.modalEl.querySelector("#btn-master-close") || this.modalEl.querySelector("#btn-mix-close");
    if (btnClose) {
      btnClose.addEventListener("click", () => this.close());
    }

    const btnReanalyze = this.modalEl.querySelector("#btn-mix-reanalyze");
    if (btnReanalyze) {
      btnReanalyze.addEventListener("click", () => this.analyze());
    }

    this.modalEl.addEventListener("click", (e) => {
      if (e.target === this.modalEl) this.close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) this.close();
    });

    // Header launch button
    const btnHeader = document.getElementById("btn-mix-assistant");
    if (btnHeader) {
      btnHeader.addEventListener("click", () => this.open());
    }
  }

  open() {
    this.isOpen = true;
    this.modalEl.style.display = "flex";
    this.analyze();
  }

  close() {
    this.isOpen = false;
    this.modalEl.style.display = "none";
  }

  async analyze() {
    const proj = store.get("project");
    if (!proj || !proj.id) {
      this.renderError("No active project loaded. Open a project to analyze the mix.");
      return;
    }

    this.isAnalyzing = true;
    const btnReanalyze = this.modalEl.querySelector("#btn-mix-reanalyze");
    if (btnReanalyze) {
      btnReanalyze.disabled = true;
      btnReanalyze.innerText = "⏳ Analyzing...";
    }

    const deck = this.modalEl.querySelector("#mix-advice-deck");
    deck.innerHTML = `
      <div style="padding: 40px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px;">
        <div style="width: 24px; height: 24px; border: 3px solid var(--accent-cyan, #00f0ff); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <span style="font-size: 12px; color: var(--text-secondary, #8e99ac);">Running FFT Cross-Spectral Overlap & Phase Analysis...</span>
      </div>
    `;

    try {
      const res = await fetch(`/api/projects/${proj.id}/mix/analyze`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Analysis failed" }));
        throw new Error(err.detail || "Analysis failed");
      }

      const report = await res.json();
      this.currentReport = report;
      this.renderReport(report);
    } catch (err) {
      console.error("Mix analysis failed:", err);
      this.renderError(err.message || "Mix analysis error");
    } finally {
      this.isAnalyzing = false;
      if (btnReanalyze) {
        btnReanalyze.disabled = false;
        btnReanalyze.innerText = "🔄 Re-Analyze Mix";
      }
    }
  }

  renderReport(report) {
    // Score & summary
    const scoreVal = this.modalEl.querySelector("#mix-score-value");
    const scoreCircle = this.modalEl.querySelector("#mix-score-circle");
    const ratingBadge = this.modalEl.querySelector("#mix-rating-badge");
    const summaryText = this.modalEl.querySelector("#mix-summary-text");
    const tracksCount = this.modalEl.querySelector("#mix-tracks-count");

    scoreVal.innerText = report.mix_score;
    tracksCount.innerText = `${report.active_tracks_analyzed} active tracks analyzed`;
    summaryText.innerText = report.summary;
    ratingBadge.innerText = report.rating;

    // Color theme
    let color = "#00f0ff"; // cyan
    if (report.mix_score >= 90) color = "#00ff88"; // green
    else if (report.mix_score >= 75) color = "#00f0ff"; // cyan
    else if (report.mix_score >= 55) color = "#ffaa00"; // yellow/orange
    else color = "#ff0055"; // red

    scoreCircle.style.borderColor = color;
    scoreCircle.style.boxShadow = `0 0 16px ${color}44`;
    ratingBadge.style.color = color;
    ratingBadge.style.background = `${color}22`;

    // Metrics
    this.modalEl.querySelector("#metric-headroom").innerText = `${report.master_headroom_db > 0 ? "+" : ""}${report.master_headroom_db} dB`;
    this.modalEl.querySelector("#metric-crest").innerText = `${report.master_crest_factor_db} dB`;
    this.modalEl.querySelector("#metric-phase").innerText = `${report.master_phase_correlation > 0 ? "+" : ""}${report.master_phase_correlation}`;
    this.modalEl.querySelector("#metric-peak").innerText = `${report.master_true_peak_dbfs > 0 ? "+" : ""}${report.master_true_peak_dbfs} dBFS`;

    // Advice cards deck
    const deck = this.modalEl.querySelector("#mix-advice-deck");
    const countLabel = this.modalEl.querySelector("#mix-cards-count");
    countLabel.innerText = `${report.advice_cards.length} issues flagged`;

    if (!report.advice_cards || report.advice_cards.length === 0) {
      deck.innerHTML = `
        <div style="background: rgba(0,255,136,0.06); border: 1px solid rgba(0,255,136,0.2); border-radius: 8px; padding: 24px; text-align: center;">
          <div style="font-size: 24px;">🎉</div>
          <b style="color: #00ff88; font-size: 13px; display: block; margin-top: 6px;">Optimal Mix Balance!</b>
          <p style="font-size: 11px; color: var(--text-secondary, #8e99ac); margin: 4px 0 0 0;">
            No significant frequency masking collisions, phase cancellations, or headroom bottlenecks detected.
          </p>
        </div>
      `;
      return;
    }

    deck.innerHTML = "";
    report.advice_cards.forEach((card) => {
      const cardEl = document.createElement("div");
      cardEl.className = "mix-advice-card";
      cardEl.style.cssText = `
        background: var(--bg-secondary, #171b26);
        border: 1px solid var(--border-subtle, #232a3b);
        border-radius: 8px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        transition: border-color 0.15s ease;
      `;

      let sevColor = "#00f0ff";
      if (card.severity === "critical") sevColor = "#ff0055";
      else if (card.severity === "warning") sevColor = "#ffaa00";

      let catBadge = card.category.toUpperCase().replace("_", " ");

      cardEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 3px; background: ${sevColor}22; color: ${sevColor}; border: 1px solid ${sevColor}44;">
              ${card.severity.toUpperCase()}
            </span>
            <span style="font-size: 9px; font-weight: 700; color: var(--text-muted, #55627a); letter-spacing: 0.5px;">
              ${catBadge}
            </span>
          </div>
          <b style="font-size: 12px; color: #fff;">${card.title}</b>
        </div>
        <p style="font-size: 11px; color: var(--text-secondary, #8e99ac); margin: 0; line-height: 1.4;">
          ${card.description}
        </p>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05);">
          <div style="font-size: 10px; color: var(--accent-cyan, #00f0ff); font-weight: 500;">
            💡 ${card.recommendation}
          </div>
          ${
            card.action
              ? `<button class="btn btn-apply-fix" data-card-id="${card.id}" style="padding: 4px 12px; font-size: 11px; font-weight: 700; background: rgba(0,240,255,0.15); border: 1px solid var(--accent-cyan, #00f0ff); color: var(--accent-cyan, #00f0ff); border-radius: 4px; cursor: pointer;">
                  ⚡ Apply Fix
                </button>`
              : ""
          }
        </div>
      `;

      // Apply fix click handler
      if (card.action) {
        const btnApply = cardEl.querySelector(".btn-apply-fix");
        btnApply.addEventListener("click", () => this.applyFix(card, btnApply));
      }

      deck.appendChild(cardEl);
    });
  }

  async applyFix(card, btn) {
    const proj = store.get("project");
    if (!proj || !proj.id) return;

    btn.disabled = true;
    btn.innerText = "Applying...";

    try {
      const res = await fetch(`/api/projects/${proj.id}/mix/apply-fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card_id: card.id,
          action_type: card.action.type,
          track_id: card.action.track_id,
          params: card.action.params,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to apply fix" }));
        throw new Error(err.detail || "Failed to apply fix");
      }

      const result = await res.json();
      btn.innerText = "✓ Applied";
      btn.style.background = "rgba(0,255,136,0.15)";
      btn.style.borderColor = "#00ff88";
      btn.style.color = "#00ff88";

      // Reload updated project state
      if (projectManager && projectManager.openProject) {
        await projectManager.openProject(proj.id);
      }
      bus.emit("toast:show", { message: `Fix applied: ${result.description}`, type: "success" });
    } catch (err) {
      console.error("Apply fix error:", err);
      btn.disabled = false;
      btn.innerText = "⚡ Apply Fix";
      bus.emit("toast:show", { message: `Error applying fix: ${err.message}`, type: "error" });
    }
  }

  renderError(msg) {
    const deck = this.modalEl.querySelector("#mix-advice-deck");
    deck.innerHTML = `
      <div style="background: rgba(255,0,85,0.08); border: 1px solid rgba(255,0,85,0.25); border-radius: 8px; padding: 20px; text-align: center; color: #ff0055; font-size: 12px;">
        ⚠️ ${msg}
      </div>
    `;
  }
}

export const mixAssistantPanelUI = new MixAssistantPanelUI();
