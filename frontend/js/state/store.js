/**
 * MaxAudioEditor Central State Store — Reactive state management with change listeners.
 */

import { bus } from "../core/event-bus.js";

class Store {
  constructor(initialState = {}) {
    this.state = initialState;
    this.listeners = new Map();
  }

  getState() {
    return this.state;
  }

  get(key) {
    return this.state[key];
  }

  setState(updates) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...updates };

    Object.keys(updates).forEach((key) => {
      if (this.listeners.has(key)) {
        this.listeners.get(key).forEach((cb) => {
          try {
            cb(this.state[key], prevState[key]);
          } catch (e) {
            console.error(`[Store] Error in listener for '${key}':`, e);
          }
        });
      }
    });

    bus.emit("state:changed", { state: this.state, updates });
  }

  subscribe(sliceKey, callback) {
    if (!this.listeners.has(sliceKey)) {
      this.listeners.set(sliceKey, new Set());
    }
    this.listeners.get(sliceKey).add(callback);
    return () => this.listeners.get(sliceKey).delete(callback);
  }
}

export const store = new Store({
  project: null,
  isDirty: false,
  activeTool: "select",
  selectedClipIds: [],
  selectedTrackId: null,
  transport: {
    state: "stopped", // 'stopped' | 'playing' | 'paused'
    currentTime: 0.0,
    isLooping: false,
    loopStart: 0.0,
    loopEnd: 16.0,
  },
  zoom: 100, // pixels per second
  scrollLeft: 0,
});
