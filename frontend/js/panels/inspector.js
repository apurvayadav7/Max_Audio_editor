/**
 * Clip Inspector Panel UI — Fine-grained parameter inspection and non-destructive clip editing.
 */

import { bus } from "../core/event-bus.js";
import { store } from "../state/store.js";
import { commandManager } from "../commands/manager.js";
import { audioEngine } from "../audio/engine.js";
import {
  SplitClipCommand,
  DuplicateClipCommand,
  DeleteClipCommand,
  ClipGainCommand,
  ClipFadeCommand,
  ClipRenameCommand,
} from "../commands/clip-commands.js";

export class ClipInspectorPanel {
  constructor() {
    this.container = null;
    this.selectedClip = null;
    this.selectedTrack = null;
  }

  init() {
    this.container = document.getElementById("panel-inspector");
    if (!this.container) return;

    this.renderEmpty();
    this.bindEvents();
  }

  bindEvents() {
    bus.on("clip:selected", (clip) => {
      this.selectedClip = clip;
      const { project } = store.getState();
      if (project && clip) {
        this.selectedTrack = project.tracks.find((t) => t.id === clip.track_id) || null;
      }
      this.render();
    });

    bus.on("clip:deselected", () => {
      this.selectedClip = null;
      this.selectedTrack = null;
      this.renderEmpty();
    });

    bus.on("project:loaded", (project) => {
      if (this.selectedClip) {
        // Refresh selected clip from project
        let found = null;
        for (const t of project.tracks) {
          const c = t.clips.find((item) => item.id === this.selectedClip.id);
          if (c) {
            found = c;
            this.selectedTrack = t;
            break;
          }
        }
        this.selectedClip = found;
        if (found) {
          this.render();
        } else {
          this.renderEmpty();
        }
      }
    });
  }

  renderEmpty() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: var(--text-muted); font-size: var(--font-size-sm); text-align: center; padding: 20px;">
        <div>
          <div style="font-size: 24px; margin-bottom: 8px;">🔍</div>
          <div>No clip selected.</div>
          <div style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-top: 4px;">
            Click any audio clip on the timeline or hit <b>S</b> to split at playhead.
          </div>
        </div>
      </div>
    `;
  }

  render() {
    if (!this.container || !this.selectedClip) {
      this.renderEmpty();
      return;
    }

    const clip = this.selectedClip;
    const track = this.selectedTrack;

    this.container.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%; max-width: 900px; margin: 0 auto; gap: 12px;">
        <!-- Header Strip -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge" style="background: ${track ? track.color : "var(--accent-cyan)"}; color: #000; font-weight: 700;">CLIP</span>
            <input type="text" id="inspector-clip-name" value="${clip.name || "Audio Clip"}" style="font-weight: 600; font-size: var(--font-size-sm); background: transparent; border: 1px solid transparent; color: var(--text-primary); padding: 2px 6px; border-radius: 4px;" title="Click to rename">
            <span style="font-size: var(--font-size-xs); color: var(--text-secondary);">on <b>${track ? track.name : "Track"}</b></span>
          </div>

          <!-- Quick Action Buttons -->
          <div style="display: flex; gap: 6px;">
            <button id="inspector-btn-split" class="btn" style="padding: 4px 10px; font-size: 11px;" title="Split at current playhead (S)">✂ Split at Playhead</button>
            <button id="inspector-btn-dup" class="btn" style="padding: 4px 10px; font-size: 11px;" title="Duplicate (Ctrl+D)">⧉ Duplicate</button>
            <button id="inspector-btn-del" class="btn btn-danger" style="padding: 4px 10px; font-size: 11px;" title="Delete (Del)">🗑 Delete</button>
          </div>
        </div>

        <!-- Parameters Grid -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: var(--bg-secondary); padding: 12px; border-radius: 6px; border: 1px solid var(--border-subtle);">
          <div>
            <label style="font-size: 10px; color: var(--text-secondary); display: block; margin-bottom: 2px;">START TIME</label>
            <div style="font-family: var(--font-mono); font-size: 13px; color: var(--accent-cyan); font-weight: 600;">${clip.start_time.toFixed(3)}s</div>
          </div>

          <div>
            <label style="font-size: 10px; color: var(--text-secondary); display: block; margin-bottom: 2px;">DURATION</label>
            <div style="font-family: var(--font-mono); font-size: 13px; color: var(--accent-green); font-weight: 600;">${clip.duration.toFixed(3)}s</div>
          </div>

          <div>
            <label style="font-size: 10px; color: var(--text-secondary); display: block; margin-bottom: 2px;">MEDIA OFFSET</label>
            <div style="font-family: var(--font-mono); font-size: 13px; color: var(--text-primary);">${(clip.source_offset || 0).toFixed(3)}s</div>
          </div>

          <div>
            <label style="font-size: 10px; color: var(--text-secondary); display: block; margin-bottom: 2px;">END TIME</label>
            <div style="font-family: var(--font-mono); font-size: 13px; color: var(--text-primary);">${(clip.start_time + clip.duration).toFixed(3)}s</div>
          </div>
        </div>

        <!-- Edit Sliders -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; align-items: center;">
          <!-- Clip Gain -->
          <div style="background: var(--bg-secondary); padding: 10px; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px;">
              <span style="color: var(--text-secondary);">CLIP GAIN</span>
              <b id="inspector-gain-label" style="color: var(--accent-amber);">${(clip.gain || 0).toFixed(1)} dB</b>
            </div>
            <input type="range" id="inspector-gain-slider" min="-24" max="12" step="0.5" value="${clip.gain || 0}" style="width: 100%;">
          </div>

          <!-- Fade In -->
          <div style="background: var(--bg-secondary); padding: 10px; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px;">
              <span style="color: var(--text-secondary);">FADE IN</span>
              <span style="font-family: var(--font-mono); font-size: 11px;">${(clip.fade_in || 0).toFixed(2)}s</span>
            </div>
            <input type="number" id="inspector-fadein-input" min="0" max="${clip.duration.toFixed(2)}" step="0.05" value="${clip.fade_in || 0}" style="width: 100%; padding: 4px; border-radius: 4px;">
          </div>

          <!-- Fade Out -->
          <div style="background: var(--bg-secondary); padding: 10px; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px;">
              <span style="color: var(--text-secondary);">FADE OUT</span>
              <span style="font-family: var(--font-mono); font-size: 11px;">${(clip.fade_out || 0).toFixed(2)}s</span>
            </div>
            <input type="number" id="inspector-fadeout-input" min="0" max="${clip.duration.toFixed(2)}" step="0.05" value="${clip.fade_out || 0}" style="width: 100%; padding: 4px; border-radius: 4px;">
          </div>
        </div>
      </div>
    `;

    this.bindInspectorActions();
  }

  bindInspectorActions() {
    const clip = this.selectedClip;
    const track = this.selectedTrack;
    if (!clip || !track) return;

    // Rename
    const nameInput = document.getElementById("inspector-clip-name");
    if (nameInput) {
      nameInput.onchange = (e) => {
        const newName = e.target.value.trim();
        if (newName && newName !== clip.name) {
          commandManager.execute(new ClipRenameCommand(track.id, clip.id, clip.name, newName));
        }
      };
    }

    // Gain
    const gainSlider = document.getElementById("inspector-gain-slider");
    const gainLabel = document.getElementById("inspector-gain-label");
    if (gainSlider && gainLabel) {
      let initialGain = clip.gain || 0;
      gainSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        gainLabel.textContent = `${val > 0 ? "+" : ""}${val.toFixed(1)} dB`;
        clip.gain = val;
        // Instantaneous real-time clip gain change in Web Audio
        audioEngine.setClipGain(clip.id, val);
      };
      gainSlider.onchange = (e) => {
        const newGain = parseFloat(e.target.value);
        commandManager.execute(new ClipGainCommand(track.id, clip.id, initialGain, newGain));
        initialGain = newGain;
      };
    }

    // Fade In
    const fadeInInput = document.getElementById("inspector-fadein-input");
    if (fadeInInput) {
      fadeInInput.onchange = (e) => {
        const val = Math.max(0, parseFloat(e.target.value) || 0);
        commandManager.execute(new ClipFadeCommand(track.id, clip.id, "fade_in", clip.fade_in || 0, val));
      };
    }

    // Fade Out
    const fadeOutInput = document.getElementById("inspector-fadeout-input");
    if (fadeOutInput) {
      fadeOutInput.onchange = (e) => {
        const val = Math.max(0, parseFloat(e.target.value) || 0);
        commandManager.execute(new ClipFadeCommand(track.id, clip.id, "fade_out", clip.fade_out || 0, val));
      };
    }

    // Split Button
    const splitBtn = document.getElementById("inspector-btn-split");
    if (splitBtn) {
      splitBtn.onclick = () => {
        const { transport } = store.getState();
        const splitTime = transport ? transport.currentTime : 0;
        bus.emit("clip:request-split", { trackId: track.id, clipId: clip.id, splitTime });
      };
    }

    // Duplicate Button
    const dupBtn = document.getElementById("inspector-btn-dup");
    if (dupBtn) {
      dupBtn.onclick = () => {
        commandManager.execute(new DuplicateClipCommand(track.id, clip.id));
      };
    }

    // Delete Button
    const delBtn = document.getElementById("inspector-btn-del");
    if (delBtn) {
      delBtn.onclick = () => {
        commandManager.execute(new DeleteClipCommand(track.id, clip.id));
      };
    }
  }
}

export const clipInspectorPanel = new ClipInspectorPanel();
