/**
 * Local AI Assistant Panel & Proposal Card Controller
 * Natural language DAW command parsing, structured proposal execution, and undo stack integration.
 */

import { api } from "../api/client.js";
import { bus } from "../core/event-bus.js";
import { store } from "../state/store.js";
import { commandManager } from "../commands/manager.js";
import {
  TrackVolumeCommand,
  TrackMuteCommand,
  TrackSoloCommand,
} from "../commands/track-commands.js";
import { SplitClipCommand } from "../commands/clip-commands.js";
import { audioEngine } from "../audio/engine.js";
import { spatialEngine } from "../audio/spatial.js";
import { transport } from "../audio/transport.js";
import { stemModalUI } from "./stems-modal.js";

export class AIPanel {
  constructor() {
    this.container = null;
    this.currentPlan = null;
    this.isProcessing = false;
  }

  init() {
    this.container = document.getElementById("panel-ai");
    if (!this.container) return;

    this.renderLayout();
    this.bindEvents();

    bus.on("project:loaded", () => {
      this.loadSuggestions();
    });
  }

  renderLayout() {
    this.container.innerHTML = `
      <div style="max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; height: 100%; gap: 10px; padding: 4px;">
        <!-- Top: Header & Quick Suggestion Chips -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 13px; font-weight: 600; color: var(--accent-cyan);">🤖 Local AI DAW Assistant</span>
            <span style="font-size: 9px; padding: 2px 6px; border-radius: 3px; background: rgba(0, 240, 255, 0.15); color: var(--accent-cyan); font-weight: 600;">100% OFFLINE</span>
          </div>
          <div style="font-size: 10px; color: var(--text-muted);">
            Type mixing instructions or click quick suggestions below
          </div>
        </div>

        <!-- Quick Suggestion Chips -->
        <div id="ai-suggestion-chips" style="display: flex; gap: 6px; flex-wrap: wrap; min-height: 26px;">
          <span style="font-size: 10px; color: var(--text-muted); align-self: center;">Suggestions:</span>
        </div>

        <!-- Middle: Feed / Proposal Display Area -->
        <div id="ai-feed-container" style="flex: 1; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; min-height: 180px;">
          <div id="ai-welcome-msg" style="color: var(--text-secondary); font-size: var(--font-size-xs); line-height: 1.6;">
            👋 Welcome to <b>MaxAudio Local AI Assistant</b>.<br>
            I can control track volume, mute/solo, panning, add audio insert effects (Reverb, Overdrive, Saturation), adjust tempo, and trigger 8D spatial audio.<br>
            <i style="color: var(--text-muted);">Example: "Lower drums by 3dB and add reverb to vocals"</i>
          </div>
          <div id="ai-proposals-list" style="display: flex; flex-direction: column; gap: 10px;"></div>
        </div>

        <!-- Bottom: Input & Submit Controls -->
        <div style="display: flex; gap: 8px; align-items: center;">
          <input
            type="text"
            id="ai-prompt-input"
            placeholder="Type DAW instruction (e.g. 'Lower drums by 4 dB and add Reverb to vocals')..."
            style="flex: 1; padding: 9px 14px; border-radius: 5px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-subtle); font-size: 12px;"
          />
          <button id="ai-submit-btn" class="btn btn-primary" style="padding: 8px 18px; font-weight: 600;">
            ✨ Generate Plan
          </button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const input = document.getElementById("ai-prompt-input");
    const submitBtn = document.getElementById("ai-submit-btn");

    if (submitBtn) {
      submitBtn.onclick = () => this.handlePromptSubmit();
    }

    if (input) {
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.handlePromptSubmit();
        }
      };
    }
  }

  async loadSuggestions() {
    const { project } = store.getState();
    if (!project || !project.id) return;

    try {
      const data = await api.request(`/api/projects/${project.id}/ai/suggestions`);
      const container = document.getElementById("ai-suggestion-chips");
      if (!container || !data.suggestions) return;

      container.innerHTML = `<span style="font-size: 10px; color: var(--text-muted); align-self: center;">Suggestions:</span>`;

      data.suggestions.forEach((item) => {
        const chip = document.createElement("button");
        chip.className = "btn";
        chip.style.padding = "2px 8px";
        chip.style.fontSize = "10px";
        chip.style.borderRadius = "12px";
        chip.style.borderColor = "rgba(0, 240, 255, 0.3)";
        chip.textContent = `💡 ${item.title}`;
        chip.title = item.prompt;
        chip.onclick = () => {
          const input = document.getElementById("ai-prompt-input");
          if (input) {
            input.value = item.prompt;
            this.handlePromptSubmit();
          }
        };
        container.appendChild(chip);
      });
    } catch (e) {
      console.warn("[AIPanel] Could not load suggestions:", e);
    }
  }

  async handlePromptSubmit() {
    const input = document.getElementById("ai-prompt-input");
    if (!input || !input.value.trim() || this.isProcessing) return;

    const promptText = input.value.trim();
    const { project } = store.getState();
    if (!project || !project.id) {
      alert("Please create or open a project first.");
      return;
    }

    this.isProcessing = true;
    const submitBtn = document.getElementById("ai-submit-btn");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Analyzing...";
    }

    // Hide welcome message
    const welcome = document.getElementById("ai-welcome-msg");
    if (welcome) welcome.style.display = "none";

    try {
      const plan = await api.request(`/api/projects/${project.id}/ai/plan`, {
        method: "POST",
        body: JSON.stringify({ prompt: promptText }),
      });

      this.renderProposalCard(plan);
      input.value = "";
    } catch (err) {
      console.error("[AIPanel] Failed to generate plan:", err);
      this.renderErrorCard(promptText, err.message || "Failed to communicate with local AI assistant.");
    } finally {
      this.isProcessing = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "✨ Generate Plan";
      }
    }
  }

  renderProposalCard(plan) {
    const list = document.getElementById("ai-proposals-list");
    if (!list) return;

    const card = document.createElement("div");
    card.style.background = "#131922";
    card.style.border = "1px solid var(--accent-cyan)";
    card.style.borderRadius = "6px";
    card.style.padding = "12px 16px";
    card.style.boxShadow = "0 0 12px rgba(0, 240, 255, 0.12)";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "10px";

    const hasOps = plan.operations && plan.operations.length > 0;

    let opsHtml = "";
    if (hasOps) {
      opsHtml = plan.operations
        .map((op) => {
          let badgeColor = "var(--accent-cyan)";
          if (op.op.includes("mute") || op.op.includes("solo")) badgeColor = "var(--accent-amber)";
          if (op.op.includes("effect") || op.op.includes("spatial")) badgeColor = "var(--accent-magenta)";

          const diffHtml = op.current_value && op.target_value
            ? `<span style="color: var(--text-muted);">${op.current_value}</span> → <b style="color: var(--text-primary);">${op.target_value}</b>`
            : "";

          return `
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 4px; font-size: 11px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 9px; font-weight: bold; padding: 2px 5px; border-radius: 3px; background: rgba(255,255,255,0.1); color: ${badgeColor}; font-family: var(--font-mono);">
                  ${op.op.toUpperCase()}
                </span>
                <span style="color: #f0f6fc;">${op.description}</span>
              </div>
              <div style="font-family: var(--font-mono); font-size: 10px;">
                ${diffHtml}
              </div>
            </div>
          `;
        })
        .join("");
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-size: 10px; color: var(--accent-cyan); font-weight: 600; text-transform: uppercase;">
            User Prompt: "${plan.prompt}"
          </div>
          <div style="font-size: 12px; color: var(--text-primary); font-weight: 500; margin-top: 3px;">
            ${plan.summary}
          </div>
        </div>
        <span style="font-size: 9px; padding: 2px 6px; border-radius: 3px; background: rgba(0, 240, 255, 0.15); color: var(--accent-cyan); font-family: var(--font-mono);">
          ${Math.round(plan.confidence * 100)}% Match
        </span>
      </div>

      ${hasOps ? `<div style="display: flex; flex-direction: column; gap: 6px;">${opsHtml}</div>` : ""}

      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
        <button class="btn btn-ai-cancel" style="padding: 4px 12px; font-size: 11px;">✕ Dismiss</button>
        ${hasOps ? `<button class="btn btn-primary btn-ai-apply" style="padding: 4px 16px; font-size: 11px; font-weight: 600;">⚡ Apply Proposal</button>` : ""}
      </div>
    `;

    // Hook buttons
    const cancelBtn = card.querySelector(".btn-ai-cancel");
    if (cancelBtn) {
      cancelBtn.onclick = () => card.remove();
    }

    const applyBtn = card.querySelector(".btn-ai-apply");
    if (applyBtn) {
      applyBtn.onclick = async () => {
        await this.executePlan(plan, card);
      };
    }

    list.appendChild(card);
    card.scrollIntoView({ behavior: "smooth" });
  }

  renderErrorCard(prompt, errorMsg) {
    const list = document.getElementById("ai-proposals-list");
    if (!list) return;

    const card = document.createElement("div");
    card.style.background = "#201216";
    card.style.border = "1px solid #ff4466";
    card.style.borderRadius = "6px";
    card.style.padding = "10px 14px";
    card.innerHTML = `
      <div style="color: #ff4466; font-size: 11px; font-weight: 600;">Could not parse command</div>
      <div style="color: var(--text-secondary); font-size: 11px; margin-top: 2px;">${errorMsg}</div>
    `;
    list.appendChild(card);
  }

  async executePlan(plan, cardElement) {
    const { project } = store.getState();
    if (!project || !project.tracks) return;

    try {
      for (const op of plan.operations) {
        if (op.op === "set_volume" && op.track_id) {
          const track = project.tracks.find((t) => t.id === op.track_id);
          if (track) {
            const oldVol = track.volume;
            const newVol = op.params.volume;
            await commandManager.execute(new TrackVolumeCommand(track.id, oldVol, newVol));
          }
        } else if ((op.op === "mute_track" || op.op === "unmute_track") && op.track_id) {
          await commandManager.execute(new TrackMuteCommand(op.track_id, op.params.is_muted));
        } else if ((op.op === "solo_track" || op.op === "unsolo_track") && op.track_id) {
          await commandManager.execute(new TrackSoloCommand(op.track_id, op.params.is_soloed));
        } else if (op.op === "set_pan" && op.track_id) {
          const track = project.tracks.find((t) => t.id === op.track_id);
          if (track) {
            track.pan = op.params.pan;
            audioEngine.setTrackPan(track.id, track.pan);
            bus.emit("track:updated", track);
          }
        } else if (op.op === "set_tempo") {
          transport.setBpm(op.params.tempo);
          project.tempo = op.params.tempo;
          const tempoInput = document.getElementById("input-tempo");
          if (tempoInput) tempoInput.value = project.tempo;
          bus.emit("project:updated", project);
        } else if (op.op === "add_effect" && op.track_id) {
          const track = project.tracks.find((t) => t.id === op.track_id);
          if (track) {
            track.effects = track.effects || [];
            track.effects.push({
              id: `fx_${Date.now()}`,
              type: op.params.type,
              is_bypassed: false,
              order: track.effects.length,
              params: op.params.params || {},
            });
            audioEngine.rebuildTrackGraph(track.id);
            bus.emit("track:updated", track);
          }
        } else if (op.op === "apply_spatial") {
          spatialEngine.setTrajectory(op.params.trajectory || "figure8");
          spatialEngine.setSpeed(op.params.speed || 7.5);
          spatialEngine.setDepth(op.params.depth || 0.95);
          spatialEngine.setEnabled(true);
        } else if (op.op === "separate_stems") {
          stemModalUI.open();
        } else if (op.op === "split_clip" && op.track_id && op.clip_id) {
          await commandManager.execute(
            new SplitClipCommand(op.track_id, op.clip_id, op.params.split_time)
          );
        }
      }

      // Update card UI to show applied status
      if (cardElement) {
        cardElement.style.borderColor = "var(--accent-green)";
        cardElement.style.boxShadow = "0 0 10px rgba(0, 255, 128, 0.2)";
        const actionsDiv = cardElement.querySelector(".btn-ai-apply")?.parentElement;
        if (actionsDiv) {
          actionsDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--accent-green); font-weight: 600;">
              <span>✓ Changes Applied</span>
              <span style="font-size: 10px; color: var(--text-muted); font-weight: normal;">(Press Ctrl+Z anytime to undo)</span>
            </div>
          `;
        }
      }
    } catch (e) {
      console.error("[AIPanel] Error executing AI plan:", e);
      alert(`Error applying AI changes: ${e.message}`);
    }
  }
}

export const aiPanel = new AIPanel();
