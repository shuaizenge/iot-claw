type PluginConfig = {
  baseUrl?: string;
  apiToken?: string;
  timeoutMs?: number;
  defaultTenant?: string;
  defaultSite?: string;
};

type RequestOptions = {
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

type TelemetryHistoryInput = {
  start?: string;
  end?: string;
  limit?: number;
};

export class IotClawClient {
  private readonly baseUrl: string;
  private readonly apiToken?: string;
  private readonly timeoutMs: number;
  private readonly defaultTenant?: string;
  private readonly defaultSite?: string;

  constructor(config: PluginConfig) {
    this.baseUrl = (config.baseUrl || "http://127.0.0.1:8080").replace(/\/$/, "");
    this.apiToken = config.apiToken?.trim() || undefined;
    this.timeoutMs = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : 10000;
    this.defaultTenant = config.defaultTenant?.trim() || undefined;
    this.defaultSite = config.defaultSite?.trim() || undefined;
  }

  getDefaults() {
    return {
      tenant: this.defaultTenant,
      site: this.defaultSite,
    };
  }

  async listDevices(input: {
    tenant?: string;
    site?: string;
    query?: string;
    limit?: number;
  }) {
    return this.request("/api/plugin/devices", {
      query: {
        tenant: input.tenant || this.defaultTenant,
        site: input.site || this.defaultSite,
        query: input.query,
        limit: input.limit,
      },
    });
  }

  async getDevice(deviceId: string) {
    return this.request(`/api/plugin/devices/${encodeURIComponent(deviceId)}`);
  }

  async getDeviceState(deviceId: string) {
    return this.request(`/api/plugin/device-states/${encodeURIComponent(deviceId)}`);
  }

  async getDeviceTelemetryHistory(deviceId: string, input: TelemetryHistoryInput = {}) {
    return this.request(`/api/plugin/devices/${encodeURIComponent(deviceId)}/telemetry/history`, {
      query: {
        start: input.start,
        end: input.end,
        limit: input.limit,
      },
    });
  }

  async listDeviceCapabilities(deviceId: string) {
    return this.request(`/api/plugin/devices/${encodeURIComponent(deviceId)}/capabilities`);
  }

  async listDeviceAlerts(input: {
    deviceId?: string;
    tenant?: string;
    site?: string;
    limit?: number;
  }) {
    return this.request("/api/plugin/device-alerts", {
      query: {
        deviceId: input.deviceId,
        tenant: input.tenant || this.defaultTenant,
        site: input.site || this.defaultSite,
        limit: input.limit,
      },
    });
  }

  async listDeviceActions(deviceId: string) {
    return this.request(`/api/plugin/devices/${encodeURIComponent(deviceId)}/actions`);
  }

  async executeDeviceAction(input: {
    deviceId: string;
    actionName: string;
    args?: Record<string, unknown>;
    requestedBy?: string;
    confirmed?: boolean;
  }) {
    return this.request(
      `/api/plugin/devices/${encodeURIComponent(input.deviceId)}/actions/${encodeURIComponent(input.actionName)}/execute`,
      {
        method: "POST",
        body: {
          args: input.args || {},
          requestedBy: input.requestedBy || "openclaw-plugin",
          confirmed: input.confirmed === true,
        },
      },
    );
  }

  async getCommandStatus(commandId: string) {
    return this.request(`/api/plugin/commands/${encodeURIComponent(commandId)}`);
  }

  private async request(path: string, options: RequestOptions = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : `iot-claw request failed with ${response.status}`,
        );
      }
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }
}
