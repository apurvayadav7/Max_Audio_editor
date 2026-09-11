/**
 * Real-time WebSocket Client for Job Telemetry and Progress Streaming
 */

import { bus } from "../core/event-bus.js";

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.reconnectTimer = null;
    this.isConnected = false;
  }

  connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host || "127.0.0.1:8000";
    const wsUrl = `${protocol}//${host}/ws/jobs`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log("%c[WebSocket] Connected to /ws/jobs", "color: #00e676; font-weight: bold;");
        bus.emit("ws:connected");
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { event: eventType, data } = message;

          if (eventType === "job_progress") {
            bus.emit("job:progress", data);
          } else if (eventType === "job_started") {
            bus.emit("job:started", data);
          } else if (eventType === "job_completed") {
            bus.emit("job:completed", data);
          } else if (eventType === "job_failed") {
            bus.emit("job:failed", data);
          } else if (eventType === "job_cancelled") {
            bus.emit("job:cancelled", data);
          }
          bus.emit("job:event", message);
        } catch (e) {
          console.warn("[WebSocket] Failed to parse message:", e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        bus.emit("ws:disconnected");
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn("[WebSocket] Connection error:", err);
      };
    } catch (err) {
      console.error("[WebSocket] Could not initialize connection:", err);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      console.log("[WebSocket] Reconnecting...");
      this.connect();
    }, 3000);
  }
}

export const wsClient = new WebSocketClient();
