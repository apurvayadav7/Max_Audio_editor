/**
 * Clip Inspector Panel UI — Fine-grained parameter inspection and non-destructive clip editing.
 */

import { bus } from "../core/event-bus.js";
import { api } from "../api/client.js";
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

        <!-- Audio-to-MIDI Transcription Section -->
        <div style="background: var(--bg-secondary); padding: 12px; border-radius: 6px; border: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px;">🎹</span>
              <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary);">AUDIO-TO-MIDI TRANSCRIPTION</span>
              <span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #a855f7; font-size: 9px; font-weight: 700;">TYPE 0 .MID</span>
            </div>
            <div style="display: flex; gap: 6px;">
              <button id="inspector-btn-transcribe" class="btn btn-primary" style="padding: 4px 12px; font-size: 11px; font-weight: 600; background: #a855f7; border: none; color: #fff;">⚡ Transcribe Notes</button>
              <button id="inspector-btn-dl-midi" class="btn" style="padding: 4px 10px; font-size: 11px; display: none; background: #00e676; color: #000; font-weight: 700;">⬇ Download .MID</button>
            </div>
          </div>
          <div id="inspector-midi-status" style="font-size: 10px; color: var(--text-muted);">
            Extract polyphonic and melodic note events, onset times, and pitch contours to standard MIDI.
          </div>
          <div id="inspector-piano-roll-container" style="display: none; height: 64px; background: #0e1117; border-radius: 4px; overflow: hidden; border: 1px solid var(--border-subtle); position: relative;">
            <canvas id="inspector-piano-roll-canvas" width="860" height="64" style="width: 100%; height: 100%; display: block;"></canvas>
          </div>
        </div>

        <!-- Audio Insight & Education Module -->
        <div style="background: var(--bg-secondary); padding: 12px; border-radius: 6px; border: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px;">🎙️</span>
              <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary);">ACOUSTIC INSIGHT & EDUCATION</span>
              <span class="badge" style="background: rgba(0, 240, 255, 0.15); color: var(--accent-cyan); font-size: 9px; font-weight: 700;">AI ADVISOR</span>
            </div>
            <button id="inspector-btn-explain" class="btn" style="padding: 4px 12px; font-size: 11px; font-weight: 600; background: rgba(0,240,255,0.12); border: 1px solid var(--accent-cyan); color: var(--accent-cyan);">
              ⚡ Explain Stem Audio
            </button>
          </div>
          <div id="inspector-explain-status" style="font-size: 10px; color: var(--text-muted);">
            Analyze harmonic weight, dynamic punch, and spatial character in plain musical terms.
          </div>
          <div id="inspector-insight-details" style="display: none; flex-direction: column; gap: 6px; background: #0e1117; padding: 10px; border-radius: 4px; border: 1px solid var(--border-subtle); font-size: 11px;">
            <div id="insight-summary" style="color: #fff; line-height: 1.4; font-weight: 500;"></div>
            <div style="display: flex; gap: 14px; margin-top: 4px; font-size: 10px; color: var(--text-secondary);">
              <span>Dominant Freq: <b id="insight-dom-freq" style="color: var(--accent-cyan);">--</b></span>
              <span>Crest Factor: <b id="insight-crest" style="color: var(--accent-amber);">--</b></span>
              <span>Stereo Corr: <b id="insight-corr" style="color: #00e676);">--</b></span>
            </div>
            <!-- Frequency Energy Bar -->
            <div style="margin-top: 6px;">
              <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); margin-bottom: 2px;">
                <span>Sub-Bass: <b id="energy-sub">--%</b></span>
                <span>Midrange: <b id="energy-mid">--%</b></span>
                <span>Highs/Air: <b id="energy-high">--%</b></span>
              </div>
              <div style="display: flex; height: 5px; border-radius: 3px; overflow: hidden; background: #222;">
                <div id="bar-sub" style="width: 33%; background: #ff007f;"></div>
                <div id="bar-mid" style="width: 33%; background: #00f0ff;"></div>
                <div id="bar-high" style="width: 34%; background: #00e676;"></div>
              </div>
            </div>
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

    // Transcribe to MIDI Button
    const transcribeBtn = document.getElementById("inspector-btn-transcribe");
    const dlMidiBtn = document.getElementById("inspector-btn-dl-midi");
    const statusText = document.getElementById("inspector-midi-status");
    const pianoRollContainer = document.getElementById("inspector-piano-roll-container");
    const pianoRollCanvas = document.getElementById("inspector-piano-roll-canvas");

    if (transcribeBtn) {
      transcribeBtn.onclick = async () => {
        const { project } = store.getState();
        if (!project || !clip) return;

        transcribeBtn.disabled = true;
        transcribeBtn.textContent = "Transcribing Notes...";
        if (statusText) statusText.textContent = "Extracting harmonic pitch events & onsets via DSP...";

        try {
          const res = await api.request(`/api/projects/${project.id}/transcribe`, {
            method: "POST",
            body: { clip_id: clip.id },
          });

          console.log("[Inspector] Transcribe result:", res);
          if (statusText) {
            statusText.innerHTML = `✅ <b>${res.notes_count} note events</b> extracted. Standard Type 0 MIDI generated.`;
          }

          if (dlMidiBtn && res.midi_download_url) {
            dlMidiBtn.style.display = "inline-block";
            dlMidiBtn.onclick = () => {
              const a = document.createElement("a");
              a.href = res.midi_download_url;
              a.download = `${clip.name || "transcription"}.mid`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            };
          }

          if (pianoRollContainer && pianoRollCanvas && res.notes && res.notes.length > 0) {
            pianoRollContainer.style.display = "block";
            this.drawPianoRoll(pianoRollCanvas, res.notes, clip.duration);
          }
        } catch (err) {
          console.error("[Inspector] Transcription failed:", err);
          if (statusText) statusText.textContent = `❌ Transcription failed: ${err.message}`;
        } finally {
          transcribeBtn.disabled = false;
          transcribeBtn.textContent = "⚡ Transcribe Notes";
        }
      };
    }

    // Explain Stem Audio Button
    const explainBtn = document.getElementById("inspector-btn-explain");
    const explainStatus = document.getElementById("inspector-explain-status");
    const insightDetails = document.getElementById("inspector-insight-details");
    const insightSummary = document.getElementById("insight-summary");
    const domFreqLabel = document.getElementById("insight-dom-freq");
    const crestLabel = document.getElementById("insight-crest");
    const corrLabel = document.getElementById("insight-corr");
    const subLabel = document.getElementById("energy-sub");
    const midLabel = document.getElementById("energy-mid");
    const highLabel = document.getElementById("energy-high");
    const barSub = document.getElementById("bar-sub");
    const barMid = document.getElementById("bar-mid");
    const barHigh = document.getElementById("bar-high");

    if (explainBtn) {
      explainBtn.onclick = async () => {
        const { project } = store.getState();
        if (!project || !track) return;

        explainBtn.disabled = true;
        explainBtn.textContent = "Analyzing Stem...";
        if (explainStatus) explainStatus.textContent = "Computing spectral centroid, crest factor, and stereo coherence...";

        try {
          const res = await api.request(`/api/projects/${project.id}/mix/explain/${track.id}`);
          if (explainStatus) {
            explainStatus.textContent = `Acoustic analysis complete for '${res.track_name}'.`;
          }
          if (insightDetails) {
            insightDetails.style.display = "flex";
            if (insightSummary) insightSummary.textContent = res.summary_text;
            if (domFreqLabel) domFreqLabel.textContent = `${res.dominant_frequency_hz} Hz`;
            if (crestLabel) crestLabel.textContent = `${res.crest_factor_db} dB`;
            if (corrLabel) corrLabel.textContent = `${res.stereo_correlation > 0 ? "+" : ""}${res.stereo_correlation}`;
            if (subLabel) subLabel.textContent = `${res.energy_sub_pct}%`;
            if (midLabel) midLabel.textContent = `${res.energy_mid_pct}%`;
            if (highLabel) highLabel.textContent = `${res.energy_high_pct}%`;

            if (barSub) barSub.style.width = `${Math.max(2, res.energy_sub_pct)}%`;
            if (barMid) barMid.style.width = `${Math.max(2, res.energy_mid_pct)}%`;
            if (barHigh) barHigh.style.width = `${Math.max(2, res.energy_high_pct)}%`;
          }
        } catch (err) {
          console.error("[Inspector] Explain audio error:", err);
          if (explainStatus) explainStatus.textContent = `❌ Explanation failed: ${err.message}`;
        } finally {
          explainBtn.disabled = false;
          explainBtn.textContent = "⚡ Explain Stem Audio";
        }
      };
    }
  }

  drawPianoRoll(canvas, notes, totalDuration) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Background grid
    ctx.fillStyle = "#0e1117";
    ctx.fillRect(0, 0, width, height);

    // Subtle horizontal pitch lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let y = 0; y < height; y += 12) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!notes || notes.length === 0) return;

    // Pitch range
    const pitches = notes.map((n) => n.pitch);
    const minP = Math.min(...pitches) - 1;
    const maxP = Math.max(...pitches) + 1;
    const pitchRange = Math.max(8, maxP - minP);

    const dur = Math.max(0.1, totalDuration);

    // Draw note rectangles
    notes.forEach((note) => {
      const x = (note.start_time / dur) * width;
      const w = Math.max(3, (note.duration / dur) * width);
      const normP = (note.pitch - minP) / pitchRange;
      const y = (1.0 - normP) * (height - 10) + 2;
      const h = Math.max(4, height / pitchRange - 1);

      // Note body
      const grad = ctx.createLinearGradient(x, y, x + w, y);
      grad.addColorStop(0, "#a855f7");
      grad.addColorStop(1, "#00f0ff");
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);

      // Pitch label if note width is enough
      if (w > 22 && h > 8) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "8px monospace";
        ctx.fillText(note.note_name || "", x + 2, y + h - 1);
      }
    });
  }
}

export const clipInspectorPanel = new ClipInspectorPanel();
