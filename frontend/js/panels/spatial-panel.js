/**
 * 8D Binaural Spatial Audio Panel & Radar Visualizer
 */

import { spatialEngine } from "../audio/spatial.js";
import { bus } from "../core/event-bus.js";

export class SpatialPanel {
  constructor() {
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.animId = null;
  }

  init() {
    this.container = document.getElementById("panel-spatial");
    if (!this.container) return;

    this.renderLayout();
    this.bindEvents();
    this.startRadarAnimation();
  }

  renderLayout() {
    this.container.innerHTML = `
      <div style="max-width: 860px; margin: 0 auto; display: flex; gap: 24px; align-items: center; justify-content: center; height: 100%; flex-wrap: wrap; padding: 8px;">
        <!-- Left: 3D Orbital Radar Visualizer -->
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <div style="position: relative; width: 170px; height: 170px; background: #0b0e14; border: 1px solid var(--border-subtle); border-radius: 50%; box-shadow: 0 0 16px rgba(0, 240, 255, 0.08); display: flex; align-items: center; justify-content: center;">
            <canvas id="spatial-radar-canvas" width="170" height="170" style="border-radius: 50%;"></canvas>
            <!-- Center Listener Head Badge -->
            <div style="position: absolute; width: 34px; height: 34px; background: #161d28; border: 1.5px solid var(--accent-cyan); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 0 8px rgba(0, 240, 255, 0.4); pointer-events: none;">
              🎧
            </div>
          </div>
          <div id="spatial-angle-readout" style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-cyan); text-align: center;">
            Orbit Angle: 0° [FRONT]
          </div>
        </div>

        <!-- Right: Parameters & Trajectory Controls -->
        <div style="display: flex; flex-direction: column; gap: 12px; min-width: 320px; background: var(--bg-secondary); padding: 14px 18px; border-radius: 8px; border: 1px solid var(--border-subtle);">
          <!-- Enable Toggle -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 10px;">
            <div>
              <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                <span>8D Binaural Audio</span>
                <span id="spatial-status-badge" style="font-size: 9px; padding: 2px 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.1); color: var(--text-muted);">BYPASSED</span>
              </div>
              <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
                HRTF acoustic head-shadow + 360° dynamic orbital panning
              </div>
            </div>
            <button id="btn-spatial-toggle" class="btn" style="padding: 6px 14px; font-weight: 600; font-size: 11px; border-color: var(--accent-cyan); color: var(--accent-cyan);">
              Enable 8D
            </button>
          </div>

          <!-- Trajectory Select -->
          <div>
            <label style="font-size: 10px; color: var(--text-secondary); font-weight: 600; display: block; margin-bottom: 6px;">ORBITAL TRAJECTORY</label>
            <div style="display: flex; gap: 6px;">
              <button class="btn spatial-traj-btn active" data-traj="circular" style="flex: 1; padding: 4px 6px; font-size: 10px;">○ Circular</button>
              <button class="btn spatial-traj-btn" data-traj="figure8" style="flex: 1; padding: 4px 6px; font-size: 10px;">∞ Figure-8</button>
              <button class="btn spatial-traj-btn" data-traj="pendulum" style="flex: 1; padding: 4px 6px; font-size: 10px;">↔ Pendulum</button>
            </div>
          </div>

          <!-- Sliders: Speed & Depth -->
          <div style="display: flex; gap: 14px;">
            <div style="flex: 1;">
              <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 4px;">
                <span style="color: var(--text-secondary); font-weight: 600;">SPEED (PERIOD)</span>
                <span id="label-spatial-speed" style="font-family: var(--font-mono); color: var(--accent-amber);">7.5s</span>
              </div>
              <input type="range" id="slider-spatial-speed" min="2" max="20" step="0.5" value="7.5" style="width: 100%;">
            </div>

            <div style="flex: 1;">
              <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 4px;">
                <span style="color: var(--text-secondary); font-weight: 600;">WIDTH / DEPTH</span>
                <span id="label-spatial-depth" style="font-family: var(--font-mono); color: var(--accent-cyan);">95%</span>
              </div>
              <input type="range" id="slider-spatial-depth" min="20" max="100" step="1" value="95" style="width: 100%;">
            </div>
          </div>
        </div>
      </div>
    `;

    this.canvas = document.getElementById("spatial-radar-canvas");
    if (this.canvas) {
      this.ctx = this.canvas.getContext("2d");
    }
  }

  bindEvents() {
    const toggleBtn = document.getElementById("btn-spatial-toggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        spatialEngine.setEnabled(!spatialEngine.enabled);
        this.updateUI();
      });
    }

    const trajBtns = document.querySelectorAll(".spatial-traj-btn");
    trajBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        trajBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        spatialEngine.setTrajectory(btn.dataset.traj);
      });
    });

    const speedSlider = document.getElementById("slider-spatial-speed");
    const speedLabel = document.getElementById("label-spatial-speed");
    if (speedSlider) {
      speedSlider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        spatialEngine.setSpeed(val);
        if (speedLabel) speedLabel.textContent = `${val.toFixed(1)}s`;
      });
    }

    const depthSlider = document.getElementById("slider-spatial-depth");
    const depthLabel = document.getElementById("label-spatial-depth");
    if (depthSlider) {
      depthSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        spatialEngine.setDepth(val / 100);
        if (depthLabel) depthLabel.textContent = `${val}%`;
      });
    }

    bus.on("spatial:changed", () => this.updateUI());
  }

  updateUI() {
    const toggleBtn = document.getElementById("btn-spatial-toggle");
    const statusBadge = document.getElementById("spatial-status-badge");
    const headerBtn = document.getElementById("btn-toggle-8d");

    if (spatialEngine.enabled) {
      if (toggleBtn) {
        toggleBtn.textContent = "Bypass 8D";
        toggleBtn.style.background = "rgba(255, 0, 128, 0.2)";
        toggleBtn.style.borderColor = "var(--accent-magenta)";
        toggleBtn.style.color = "var(--accent-magenta)";
      }
      if (statusBadge) {
        statusBadge.textContent = "ACTIVE";
        statusBadge.style.background = "rgba(0, 240, 255, 0.2)";
        statusBadge.style.color = "var(--accent-cyan)";
      }
      if (headerBtn) {
        headerBtn.style.background = "rgba(255, 0, 128, 0.25)";
        headerBtn.style.boxShadow = "0 0 10px rgba(255, 0, 128, 0.5)";
      }
    } else {
      if (toggleBtn) {
        toggleBtn.textContent = "Enable 8D";
        toggleBtn.style.background = "transparent";
        toggleBtn.style.borderColor = "var(--accent-cyan)";
        toggleBtn.style.color = "var(--accent-cyan)";
      }
      if (statusBadge) {
        statusBadge.textContent = "BYPASSED";
        statusBadge.style.background = "rgba(255, 255, 255, 0.1)";
        statusBadge.style.color = "var(--text-muted)";
      }
      if (headerBtn) {
        headerBtn.style.background = "transparent";
        headerBtn.style.boxShadow = "none";
      }
    }
  }

  startRadarAnimation() {
    const draw = () => {
      if (this.ctx && this.canvas) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const r = w * 0.42;

        ctx.clearRect(0, 0, w, h);

        // Radar background grid circles
        ctx.strokeStyle = "rgba(0, 240, 255, 0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshairs
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx, cy + r);
        ctx.moveTo(cx - r, cy);
        ctx.lineTo(cx + r, cy);
        ctx.stroke();

        // Labels: FRONT, BACK, L, R
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.textAlign = "center";
        ctx.fillText("FRONT", cx, cy - r + 10);
        ctx.fillText("REAR", cx, cy + r - 4);
        ctx.fillText("L", cx - r + 8, cy + 3);
        ctx.fillText("R", cx + r - 8, cy + 3);

        // Sound source position
        const pos = spatialEngine.currentPosition;
        // In radar coords: x is horizontal (cx + pos.x * r), y is vertical (cy - pos.y * r)
        const sx = cx + pos.x * r;
        const sy = cy - pos.y * r;

        // Trajectory preview path
        ctx.strokeStyle = "rgba(0, 240, 255, 0.25)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        if (spatialEngine.trajectory === "circular") {
          ctx.arc(cx, cy, r * spatialEngine.depth, 0, Math.PI * 2);
        } else if (spatialEngine.trajectory === "figure8") {
          for (let a = 0; a <= Math.PI * 2; a += 0.05) {
            const px = cx + Math.sin(a) * spatialEngine.depth * r;
            const py = cy - Math.sin(2 * a) * 0.7 * r;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
        } else {
          ctx.moveTo(cx - r * spatialEngine.depth, cy - 0.5 * r);
          ctx.lineTo(cx + r * spatialEngine.depth, cy - 0.5 * r);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Orbiting Sound Dot
        ctx.save();
        ctx.fillStyle = spatialEngine.enabled ? "#ff007f" : "#00f0ff";
        ctx.shadowColor = spatialEngine.enabled ? "rgba(255, 0, 128, 0.85)" : "rgba(0, 240, 255, 0.5)";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Connecting ray from head to sound source
        ctx.strokeStyle = spatialEngine.enabled ? "rgba(255, 0, 128, 0.3)" : "rgba(0, 240, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(sx, sy);
        ctx.stroke();

        // Readout text update
        const readout = document.getElementById("spatial-angle-readout");
        if (readout && spatialEngine.enabled) {
          const deg = Math.round(((pos.angle % 360) + 360) % 360);
          const posDesc = pos.y < 0 ? "REAR" : "FRONT";
          const panDesc = pos.x < -0.1 ? `L ${Math.round(-pos.x * 100)}%` : pos.x > 0.1 ? `R ${Math.round(pos.x * 100)}%` : "CENTER";
          readout.textContent = `Orbit: ${deg}° [${panDesc} / ${posDesc}]`;
        }
      }

      this.animId = requestAnimationFrame(draw);
    };

    this.animId = requestAnimationFrame(draw);
  }
}

export const spatialPanel = new SpatialPanel();
