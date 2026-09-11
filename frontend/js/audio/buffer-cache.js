/**
 * In-Memory LRU AudioBuffer Cache for Instant Web Audio Playback
 */

import { audioEngine } from "./engine.js";

class BufferCache {
  constructor(maxItems = 30) {
    this.cache = new Map();
    this.maxItems = maxItems;
  }

  async getBuffer(projectId, mediaId) {
    const key = `${projectId}:${mediaId}`;
    if (this.cache.has(key)) {
      // Refresh LRU
      const buf = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, buf);
      return buf;
    }

    const ctx = audioEngine.ensureContext();
    const streamUrl = `/api/projects/${projectId}/media/${mediaId}/stream`;

    console.log(`[BufferCache] Fetching & decoding audio: ${streamUrl}`);
    const res = await fetch(streamUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch audio stream: HTTP ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    // Evict oldest if exceeding limit
    if (this.cache.size >= this.maxItems) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, audioBuffer);
    return audioBuffer;
  }

  clear() {
    this.cache.clear();
  }
}

export const bufferCache = new BufferCache();
