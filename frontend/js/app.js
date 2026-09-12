/**
 * MaxAudioEditor — Application Bootstrapper & Main Controller
 */

import { bus } from "./core/event-bus.js";
import { api } from "./api/client.js";
import { store } from "./state/store.js";
import { projectManager } from "./state/project.js";
import { projectModalUI } from "./panels/project-modal.js";
import { transport } from "./audio/transport.js";
import { audioEngine } from "./audio/engine.js";
import { timelineController } from "./timeline/timeline.js";
import { commandManager } from "./commands/manager.js";
import { historyPanel } from "./panels/history.js";
import { clipInspectorPanel } from "./panels/inspector.js";
import { effectsPanel } from "./panels/effects.js";
import { jobsPanel } from "./panels/jobs.js";
import { musicAnalysisPanel } from "./panels/analysis.js";
import { stemModalUI } from "./panels/stems-modal.js";
import { generationModalUI } from "./panels/generation-modal.js";
import { wsClient } from "./api/websocket-client.js";
import { automationEngine } from "./timeline/automation.js";
import { exportPanel } from "./panels/export.js";
import { spectrogramRenderer } from "./canvas/spectrogram.js";
import { spatialEngine } from "./audio/spatial.js";
import { spatialPanel } from "./panels/spatial-panel.js";
import { aiPanel } from "./panels/ai.js";
import {
  TrackMuteCommand,
  TrackSoloCommand,
  TrackVolumeCommand,
} from "./commands/track-commands.js";

class MaxAudioApp {
  constructor() {
    this.audioContext = null;
    this.isAudioUnlocked = false;
  }

  async init() {
    console.log("%c[MaxAudioEditor] Booting Local DAW...", "color: #00f0ff; font-weight: bold; font-size: 14px;");
    projectManager.init();
    projectModalUI.init();
    transport.init();
    timelineController.init();
    historyPanel.init();
    clipInspectorPanel.init();
    effectsPanel.init();
    jobsPanel.init();
    musicAnalysisPanel.init();
    stemModalUI.init();
    generationModalUI.init();
    exportPanel.init();
    spatialPanel.init();
    aiPanel.init();
    automationEngine.init();
    wsClient.connect();
    this.bindUIEvents();
    this.setupTabNavigation();
    this.setupDrawerResizer();
    this.setupProjectEvents();
    await this.pollSystemHealth();
  }

  setupProjectEvents() {
    bus.on("project:loaded", (project) => {
      console.log("[App] Updating UI for project:", project.name);
      const brandBadge = document.querySelector(".brand-badge");
      if (brandBadge) {
        brandBadge.textContent = `MAX AUDIO • ${project.name}`;
      }

      const tempoInput = document.getElementById("input-tempo");
      if (tempoInput && project.tempo) {
        tempoInput.value = project.tempo;
      }

      // Initialize persistent audio nodes for tracks and apply effective gains
      if (project.tracks) {
        project.tracks.forEach((t) => audioEngine.getOrCreateTrackNode(t.id, t));
        audioEngine.updateAllTracksEffectiveGains(project.tracks);
      }

      this.renderTrackHeaders(project);
    });

    // Automatically switch to Inspector tab when clip is selected
    bus.on("clip:selected", () => {
      const inspectorTab = document.querySelector('.drawer-tab[data-target="panel-inspector"]');
      if (inspectorTab && !inspectorTab.classList.contains("active")) {
        inspectorTab.click();
      }
    });
  }

  renderTrackHeaders(project) {
    const list = document.getElementById("track-headers-list");
    if (!list) return;

    if (!project.tracks || project.tracks.length === 0) {
      list.innerHTML = `
        <div style="padding: 12px; color: var(--text-muted); font-size: var(--font-size-xs); text-align: center;">
          No tracks loaded. Click <b>+ Import Audio</b> or drop audio files anywhere.
        </div>
      `;
      return;
    }

    list.innerHTML = project.tracks
      .map((track, idx) => {
        const lane = automationEngine.getTrackLane(track.id);
        const isAuto = lane ? lane.isExpanded : false;
        const activeParam = lane ? lane.activeParam : "volume";
        const headerHeight = isAuto ? 150 : 110;

        return `
      <div class="track-header" data-track-id="${track.id}" style="height: ${headerHeight}px; margin-bottom: 10px; background: var(--bg-tertiary); border-left: 4px solid ${track.color || "#00f0ff"}; padding: 8px; border-radius: 4px; display: flex; flex-direction: column; justify-content: space-between;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <b style="font-size: var(--font-size-sm); color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 120px;">${track.name}</b>
          <div style="display: flex; gap: 3px;">
            <button class="btn btn-mute" data-idx="${idx}" style="padding: 2px 5px; font-size: 10px; font-weight: bold; background: ${track.is_muted ? "var(--accent-red)" : "#21262d"}; border: 1px solid var(--border-subtle); border-radius: 2px;">M</button>
            <button class="btn btn-solo" data-idx="${idx}" style="padding: 2px 5px; font-size: 10px; font-weight: bold; background: ${track.is_soloed ? "var(--accent-amber)" : "#21262d"}; color: ${track.is_soloed ? "#000" : "inherit"}; border: 1px solid var(--border-subtle); border-radius: 2px;">S</button>
            <button class="btn btn-auto" data-track-id="${track.id}" style="padding: 2px 5px; font-size: 10px; font-weight: bold; background: ${isAuto ? "var(--accent-cyan)" : "#21262d"}; color: ${isAuto ? "#000" : "var(--text-secondary)"}; border: 1px solid var(--border-subtle); border-radius: 2px;" title="Toggle Automation Lane">A</button>
          </div>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">
            <span>VOL</span>
            <span class="vol-label">${(track.volume || 0) > 0 ? "+" : ""}${(track.volume || 0).toFixed(1)} dB</span>
          </div>
          <input type="range" min="-30" max="6" value="${track.volume || 0}" step="0.5" data-idx="${idx}" class="track-vol-slider" style="width: 100%;">
        </div>

        ${
          isAuto
            ? `
          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 4px; border-top: 1px dashed var(--border-subtle);">
            <span style="font-size: 9px; color: var(--accent-cyan); font-weight: 700;">AUTO</span>
            <select class="track-auto-param-select" data-track-id="${track.id}" style="font-size: 9px; padding: 1px 4px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-subtle); border-radius: 2px;">
              <option value="volume" ${activeParam === "volume" ? "selected" : ""}>Volume Curve</option>
              <option value="pan" ${activeParam === "pan" ? "selected" : ""}>Pan Curve</option>
            </select>
          </div>
        `
            : ""
        }
      </div>
    `;
      })
      .join("");

    // Wire AUTO toggle buttons
    list.querySelectorAll(".btn-auto").forEach((btn) => {
      btn.onclick = () => {
        const trackId = btn.getAttribute("data-track-id");
        automationEngine.toggleLaneExpanded(trackId);
        this.renderTrackHeaders(project);
        timelineController.handleResize();
      };
    });

    // Wire AUTO parameter selects
    list.querySelectorAll(".track-auto-param-select").forEach((select) => {
      select.onchange = (e) => {
        const trackId = select.getAttribute("data-track-id");
        automationEngine.setActiveParam(trackId, e.target.value);
        timelineController.render();
      };
    });

    // Wire Mute, Solo, Volume through commands & real-time audio engine
    list.querySelectorAll(".btn-mute").forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        const track = project.tracks[idx];
        const newMuteState = !track.is_muted;
        track.is_muted = newMuteState;
        btn.style.background = newMuteState ? "var(--accent-red)" : "#21262d";
        audioEngine.setTrackMute(track.id, newMuteState, project.tracks);
        commandManager.execute(new TrackMuteCommand(track.id, !newMuteState, newMuteState));
      };
    });

    list.querySelectorAll(".btn-solo").forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        const track = project.tracks[idx];
        const newSoloState = !track.is_soloed;
        track.is_soloed = newSoloState;
        btn.style.background = newSoloState ? "var(--accent-amber)" : "#21262d";
        btn.style.color = newSoloState ? "#000" : "inherit";
        audioEngine.setTrackSolo(track.id, newSoloState, project.tracks);
        commandManager.execute(new TrackSoloCommand(track.id, !newSoloState, newSoloState));
      };
    });

    list.querySelectorAll(".track-vol-slider").forEach((slider) => {
      const idx = parseInt(slider.getAttribute("data-idx"), 10);
      const track = project.tracks[idx];
      let initialVol = track.volume || 0;

      slider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        slider.parentElement.querySelector(".vol-label").textContent = `${val > 0 ? "+" : ""}${val.toFixed(1)} dB`;
        track.volume = val;
        // Real-time instantaneous volume change in Web Audio
        audioEngine.setTrackVolume(track.id, val, project.tracks);
      };

      slider.onchange = (e) => {
        const newVol = parseFloat(e.target.value);
        commandManager.execute(new TrackVolumeCommand(track.id, initialVol, newVol));
        initialVol = newVol;
      };
    });
  }

  bindUIEvents() {
    // Add Track button
    const addTrackBtn = document.getElementById("btn-add-track");
    if (addTrackBtn) {
      addTrackBtn.onclick = () => timelineController.addAudioTrack("Audio Track");
    }

    // Zoom buttons
    const zoomInBtn = document.getElementById("btn-zoom-in");
    const zoomOutBtn = document.getElementById("btn-zoom-out");
    if (zoomInBtn) zoomInBtn.onclick = () => timelineController.setZoom(timelineController.zoom * 1.25);
    if (zoomOutBtn) zoomOutBtn.onclick = () => timelineController.setZoom(timelineController.zoom * 0.8);

    // Master Volume slider
    const masterVolSlider = document.getElementById("slider-master-volume");
    const masterVolLabel = document.getElementById("label-master-volume");
    if (masterVolSlider && masterVolLabel) {
      masterVolSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        masterVolLabel.textContent = `${val > 0 ? "+" : ""}${val.toFixed(1)} dB`;
        audioEngine.setMasterVolume(val);
      };
    }

    // Toolbar Command Buttons
    const undoBtn = document.getElementById("btn-undo");
    const redoBtn = document.getElementById("btn-redo");
    const splitBtn = document.getElementById("btn-split");
    const dupBtn = document.getElementById("btn-duplicate");
    const delBtn = document.getElementById("btn-delete");

    if (undoBtn) undoBtn.onclick = () => commandManager.undo();
    if (redoBtn) redoBtn.onclick = () => commandManager.redo();
    if (splitBtn) splitBtn.onclick = () => timelineController.splitSelectedClipAtPlayhead();
    if (dupBtn) dupBtn.onclick = () => timelineController.duplicateSelectedClip();
    if (delBtn) delBtn.onclick = () => timelineController.deleteSelectedClip();

    // View Mode Buttons
    const btnViewWave = document.getElementById("btn-view-waveform");
    const btnViewSpec = document.getElementById("btn-view-spectrogram");
    const btnViewSplit = document.getElementById("btn-view-split");
    const selectPalette = document.getElementById("select-spectrogram-palette");
    const btnTogglePitch = document.getElementById("btn-toggle-pitch");
    const btnToggle8D = document.getElementById("btn-toggle-8d");

    const setViewModeUI = (mode) => {
      [btnViewWave, btnViewSpec, btnViewSplit].forEach((b) => b?.classList.remove("active"));
      if (mode === "waveform" && btnViewWave) btnViewWave.classList.add("active");
      if (mode === "spectrogram" && btnViewSpec) btnViewSpec.classList.add("active");
      if (mode === "split" && btnViewSplit) btnViewSplit.classList.add("active");

      if (selectPalette) {
        selectPalette.style.display = mode === "waveform" ? "none" : "inline-block";
      }
      spectrogramRenderer.setViewMode(mode);
    };

    if (btnViewWave) btnViewWave.onclick = () => setViewModeUI("waveform");
    if (btnViewSpec) btnViewSpec.onclick = () => setViewModeUI("spectrogram");
    if (btnViewSplit) btnViewSplit.onclick = () => setViewModeUI("split");

    if (selectPalette) {
      selectPalette.onchange = (e) => {
        spectrogramRenderer.setColormap(e.target.value);
      };
    }

    if (btnTogglePitch) {
      btnTogglePitch.onclick = () => {
        const enabled = spectrogramRenderer.togglePitch();
        if (enabled) {
          btnTogglePitch.classList.add("active");
          btnTogglePitch.style.borderColor = "var(--accent-magenta)";
          btnTogglePitch.style.color = "var(--accent-magenta)";
          btnTogglePitch.style.background = "rgba(255, 0, 128, 0.15)";
        } else {
          btnTogglePitch.classList.remove("active");
          btnTogglePitch.style.borderColor = "";
          btnTogglePitch.style.color = "";
          btnTogglePitch.style.background = "";
        }
      };
    }

    if (btnToggle8D) {
      btnToggle8D.onclick = () => {
        spatialEngine.setEnabled(!spatialEngine.enabled);
        // Switch to 8D Spatial tab in drawer
        const spatialTab = document.querySelector('.drawer-tab[data-target="panel-spatial"]');
        if (spatialTab && !spatialTab.classList.contains("active")) {
          spatialTab.click();
        }
      };
    }

    // Unlock Web Audio context on first user interaction
    const unlockAudio = () => {
      const ctx = audioEngine.ensureContext();
      if (ctx.state === "suspended") {
        ctx.resume().then(() => {
          this.isAudioUnlocked = true;
          this.updateAudioStatus();
        });
      } else {
        this.isAudioUnlocked = true;
        this.updateAudioStatus();
      }
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };

    window.addEventListener("click", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    // File import trigger
    const importBtn = document.getElementById("btn-import-audio");
    const fileInput = document.getElementById("hidden-file-input");
    if (importBtn && fileInput) {
      importBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (e) => this.handleFileSelection(e.target.files));
    }

    // Drag and drop import on workspace
    const workspace = document.getElementById("main-workspace");
    if (workspace) {
      workspace.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      });
      workspace.addEventListener("drop", (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleFileSelection(e.dataTransfer.files);
        }
      });
    }

    // Keyboard shortcuts (Space = Play/Pause)
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if (e.code === "Space") {
        e.preventDefault();
        bus.emit("transport:toggle-play");
      }
    });
  }

  setupTabNavigation() {
    const tabs = document.querySelectorAll(".drawer-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        const targetId = tab.getAttribute("data-target");
        const panels = document.querySelectorAll(".tab-panel");
        panels.forEach((p) => {
          if (p.id === targetId) {
            p.style.display = "block";
          } else {
            p.style.display = "none";
          }
        });

        // Auto-expand panel if it is currently collapsed
        const drawer = document.getElementById("bottom-drawer");
        if (drawer && drawer.getBoundingClientRect().height <= 45) {
          const defaultHeight = 380;
          const lastHeight = parseInt(localStorage.getItem("maxaudio_drawer_height"), 10) || defaultHeight;
          this.setDrawerHeight(lastHeight > 100 ? lastHeight : defaultHeight);
        }
      });
    });
  }

  setupDrawerResizer() {
    const resizer = document.getElementById("drawer-resizer");
    const drawer = document.getElementById("bottom-drawer");
    const btnCollapse = document.getElementById("btn-drawer-collapse");
    const btnExpand = document.getElementById("btn-drawer-expand");
    if (!resizer || !drawer) return;

    let isDragging = false;
    let startY = 0;
    let startHeight = 0;
    const minHeight = 32; // Tabs only (collapsed)
    const defaultHeight = 380;
    let lastExpandedHeight = parseInt(localStorage.getItem("maxaudio_drawer_height"), 10) || defaultHeight;

    // Restore saved height
    const savedHeight = parseInt(localStorage.getItem("maxaudio_drawer_height"), 10);
    if (savedHeight && savedHeight >= minHeight) {
      this.setDrawerHeight(savedHeight);
    } else {
      this.setDrawerHeight(defaultHeight);
    }

    const onMouseDown = (e) => {
      isDragging = true;
      startY = e.clientY;
      startHeight = drawer.getBoundingClientRect().height;
      resizer.classList.add("dragging");
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaY = startY - e.clientY; // Dragging UP increases bottom drawer height
      const maxHeight = window.innerHeight - 140; // Leave room for header + transport + timeline
      const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
      this.setDrawerHeight(newHeight);
      if (newHeight > 60) {
        lastExpandedHeight = newHeight;
      }
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      resizer.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      const currentHeight = drawer.getBoundingClientRect().height;
      if (currentHeight > minHeight) {
        localStorage.setItem("maxaudio_drawer_height", Math.round(currentHeight));
      }
    };

    resizer.addEventListener("mousedown", onMouseDown);

    // Double-click resizer to toggle collapse / restore
    resizer.addEventListener("dblclick", () => {
      const currentHeight = drawer.getBoundingClientRect().height;
      if (currentHeight <= 45) {
        this.setDrawerHeight(lastExpandedHeight > 100 ? lastExpandedHeight : defaultHeight);
      } else {
        lastExpandedHeight = currentHeight;
        this.setDrawerHeight(minHeight);
      }
    });

    // Collapse Button (▼)
    if (btnCollapse) {
      btnCollapse.addEventListener("click", () => {
        const currentHeight = drawer.getBoundingClientRect().height;
        if (currentHeight <= 45) {
          this.setDrawerHeight(lastExpandedHeight > 100 ? lastExpandedHeight : defaultHeight);
        } else {
          lastExpandedHeight = currentHeight;
          this.setDrawerHeight(minHeight);
        }
      });
    }

    // Expand / Maximize Button (▲)
    if (btnExpand) {
      btnExpand.addEventListener("click", () => {
        const currentHeight = drawer.getBoundingClientRect().height;
        const maxHeight = window.innerHeight - 150;
        const tallHeight = Math.min(520, maxHeight);
        if (currentHeight >= tallHeight - 20) {
          this.setDrawerHeight(defaultHeight);
        } else {
          lastExpandedHeight = currentHeight > minHeight ? currentHeight : defaultHeight;
          this.setDrawerHeight(tallHeight);
        }
      });
    }

    // Keyboard shortcut: Ctrl+B to toggle bottom panel
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        const currentHeight = drawer.getBoundingClientRect().height;
        if (currentHeight <= 45) {
          this.setDrawerHeight(lastExpandedHeight > 100 ? lastExpandedHeight : defaultHeight);
        } else {
          lastExpandedHeight = currentHeight;
          this.setDrawerHeight(minHeight);
        }
      }
    });
  }

  setDrawerHeight(heightPx) {
    const drawer = document.getElementById("bottom-drawer");
    if (!drawer) return;
    drawer.style.height = `${heightPx}px`;
    document.documentElement.style.setProperty("--bottom-panel-height", `${heightPx}px`);

    // Hide or show drawer-content if collapsed to tabs only
    const content = document.getElementById("drawer-content");
    if (content) {
      content.style.display = heightPx <= 35 ? "none" : "block";
    }

    // Notify timeline canvas and waveform renderers to adjust height
    window.dispatchEvent(new Event("resize"));
  }

  updateAudioStatus() {
    const statusText = document.getElementById("status-engine-text");
    const sampleRateBadge = document.getElementById("status-sample-rate");
    const ctx = audioEngine.ctx;

    if (ctx && statusText && sampleRateBadge) {
      statusText.textContent = `Audio Engine Active (${ctx.state})`;
      sampleRateBadge.textContent = `${(ctx.sampleRate / 1000).toFixed(1)} kHz`;
    }
  }

  async pollSystemHealth() {
    try {
      const health = await api.getHealth();
      console.log("[MaxAudioEditor] Backend healthy:", health);

      const gpu = await api.getGPUInfo();
      console.log("[MaxAudioEditor] GPU status:", gpu);

      const gpuBadge = document.getElementById("status-gpu-badge");
      if (gpuBadge) {
        if (gpu.cuda_available) {
          gpuBadge.textContent = `GPU: ${gpu.device_name} (${gpu.vram_free_mb}MB free)`;
          gpuBadge.style.borderColor = "var(--accent-cyan)";
          gpuBadge.style.color = "var(--accent-cyan)";
        } else {
          gpuBadge.textContent = "GPU: CPU Fallback Mode";
          gpuBadge.style.borderColor = "var(--accent-amber)";
          gpuBadge.style.color = "var(--accent-amber)";
        }
      }
    } catch (err) {
      console.warn("[MaxAudioEditor] Could not reach backend:", err);
      const gpuBadge = document.getElementById("status-gpu-badge");
      if (gpuBadge) {
        gpuBadge.textContent = "Backend Offline";
        gpuBadge.style.color = "var(--accent-red)";
      }
    }
  }

  async handleFileSelection(files) {
    if (!files || files.length === 0) return;
    let { project } = store.getState();
    if (!project) {
      console.log("[App] No active project, creating session for imported audio...");
      project = await projectManager.createNewProject("Imported Session", 44100, 120.0);
    }

    const file = files[0];
    console.log(`[App] Ingesting audio file '${file.name}' into project '${project.id}'...`);
    const statusText = document.getElementById("status-engine-text");
    if (statusText) statusText.textContent = `Uploading & decoding ${file.name}...`;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await api.request(`/api/projects/${project.id}/media?auto_track=true`, {
        method: "POST",
        body: formData,
      });
      console.log("[App] Ingestion complete:", res);
      if (statusText) statusText.textContent = `Loaded ${file.name} (${res.asset.duration.toFixed(1)}s)`;

      // Reload project state to render new tracks, clips, and waveforms
      await projectManager.loadProject(project.id);
    } catch (err) {
      console.error("[App] Audio upload failed:", err);
      if (statusText) statusText.textContent = "Audio import failed";
      alert(`Audio import error: ${err.message}`);
    }
  }
}

// Instantiate and start app on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const app = new MaxAudioApp();
  app.init();
  window.maxAudioApp = app;
});
