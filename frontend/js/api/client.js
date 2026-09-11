/**
 * MaxAudioEditor API Client — Wrapper for REST requests to local FastAPI backend.
 */
class ApiClient {
  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const defaultHeaders = {};

    if (!(options.body instanceof FormData)) {
      defaultHeaders["Content-Type"] = "application/json";
    }

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {}),
      },
    };

    if (config.body && typeof config.body === "object" && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      if (!response.ok) {
        let errorDetail = response.statusText;
        try {
          const errData = await response.json();
          errorDetail = errData.detail || JSON.stringify(errData);
        } catch (_) {}
        throw new Error(`HTTP ${response.status}: ${errorDetail}`);
      }
      return await response.json();
    } catch (err) {
      console.error(`[API] Request failed for ${endpoint}:`, err);
      throw err;
    }
  }

  // System endpoints
  getHealth() {
    return this.request("/api/health");
  }

  getSystemInfo() {
    return this.request("/api/system/info");
  }

  getGPUInfo() {
    return this.request("/api/system/gpu");
  }
}

export const api = new ApiClient();
