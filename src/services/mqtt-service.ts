import mqtt, { IClientOptions, MqttClient } from 'mqtt';

import { logger } from '../logger.js';
import {
  DeviceCapabilityReportPayload,
  DeviceCommandAckPayload,
  DeviceEventPayload,
  DeviceLifecyclePayload,
  DeviceStatePayload,
  DeviceTelemetryPayload,
  MqttRuntimeStatus,
  ParsedDeviceMessage,
} from '../types.js';

type MessageHandler = (message: ParsedDeviceMessage) => Promise<void>;

interface MqttServiceConfig {
  url: string;
  options: IClientOptions;
  topicFilter: string;
  enabled?: boolean;
}

export class MqttService {
  private client: MqttClient | null = null;
  private url: string;
  private options: IClientOptions;
  private topicFilter: string;
  private enabled: boolean;
  private runtime: MqttRuntimeStatus;

  constructor(
    url: string,
    options: IClientOptions,
    topicFilter: string,
    private readonly onMessage: MessageHandler,
  ) {
    this.url = url;
    this.options = options;
    this.topicFilter = topicFilter;
    this.enabled = true;
    this.runtime = {
      url,
      topicFilter,
      enabled: true,
      state: 'stopped',
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastError: null,
    };
  }

  async start(): Promise<void> {
    if (this.client) return;

    if (!this.enabled) {
      this.runtime = {
        ...this.runtime,
        enabled: false,
        state: 'stopped',
        lastError: null,
      };
      return;
    }

    this.runtime = {
      ...this.runtime,
      url: this.url,
      topicFilter: this.topicFilter,
      enabled: this.enabled,
      state: 'connecting',
      lastError: null,
    };

    this.client = mqtt.connect(this.url, this.options);
    this.bindClient(this.client);

    await new Promise<void>((resolve, reject) => {
      const handleConnect = () => {
        cleanup();
        resolve();
      };
      const handleError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        this.client?.off('connect', handleConnect);
        this.client?.off('error', handleError);
      };

      this.client?.on('connect', handleConnect);
      this.client?.on('error', handleError);
    });
  }

  async applySettings(config: MqttServiceConfig): Promise<void> {
    const wasRunning = Boolean(this.client);
    if (wasRunning) {
      await this.stop();
    }

    this.url = config.url;
    this.options = config.options;
    this.topicFilter = config.topicFilter;
    this.enabled = config.enabled !== false;
    this.runtime = {
      ...this.runtime,
      url: this.url,
      topicFilter: this.topicFilter,
      enabled: this.enabled,
      lastError: null,
    };

    if (this.enabled) {
      await this.start();
    }
  }

  getRuntimeStatus(): MqttRuntimeStatus {
    return { ...this.runtime };
  }

  private bindClient(client: MqttClient): void {
    client.on('connect', () => {
      this.runtime = {
        ...this.runtime,
        state: 'connected',
        lastConnectedAt: new Date().toISOString(),
        lastError: null,
      };
      logger.info({ url: this.url, topicFilter: this.topicFilter }, 'MQTT connected');
      client.subscribe(this.topicFilter, (err) => {
        if (err) {
          this.runtime = {
            ...this.runtime,
            state: 'error',
            lastError: err.message,
          };
          logger.error({ err }, 'MQTT subscribe failed');
        }
      });
    });

    client.on('reconnect', () => {
      this.runtime = {
        ...this.runtime,
        state: 'reconnecting',
      };
      logger.warn('MQTT reconnecting');
    });

    client.on('close', () => {
      this.runtime = {
        ...this.runtime,
        state: this.enabled ? 'stopped' : 'stopped',
        lastDisconnectedAt: new Date().toISOString(),
      };
    });

    client.on('error', (err) => {
      this.runtime = {
        ...this.runtime,
        state: 'error',
        lastError: err.message,
      };
      logger.error({ err }, 'MQTT error');
    });

    client.on('message', (topic, payloadBuffer) => {
      void this.handleRawMessage(topic, payloadBuffer.toString('utf-8'));
    });
  }

  async stop(): Promise<void> {
    if (!this.client) return;
    const client = this.client;
    this.client = null;
    await new Promise<void>((resolve, reject) => {
      client.end(false, {}, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.runtime = {
      ...this.runtime,
      state: 'stopped',
      lastDisconnectedAt: new Date().toISOString(),
    };
  }

  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.client) throw new Error('MQTT client not started');

    await new Promise<void>((resolve, reject) => {
      this.client?.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async handleRawMessage(topic: string, rawPayload: string): Promise<void> {
    try {
      const parsed = this.parseMessage(topic, rawPayload);
      await this.onMessage(parsed);
    } catch (err) {
      logger.error({ err, topic, rawPayload }, 'Failed to process MQTT message');
    }
  }

  private parseMessage(topic: string, rawPayload: string): ParsedDeviceMessage {
    const parts = topic.split('/');
    if (parts.length < 5 || parts[0] !== 'iot') {
      throw new Error(`Unsupported topic: ${topic}`);
    }

    const [, tenant, site, deviceId, category, ...rest] = parts;
    const receivedAt = new Date().toISOString();
    const payload = JSON.parse(rawPayload) as Record<string, unknown>;

    if (category === 'telemetry' && rest[0] === 'report') {
      return {
        type: 'telemetry',
        topic,
        context: { tenant, site, deviceId, category: 'telemetry/report' },
        receivedAt,
        payload: payload as unknown as DeviceTelemetryPayload,
      };
    }

    if (category === 'telemetry' && rest.length === 0) {
      return {
        type: 'telemetry',
        topic,
        context: { tenant, site, deviceId, category },
        receivedAt,
        payload: payload as unknown as DeviceTelemetryPayload,
      };
    }

    if (category === 'state' && rest[0] === 'report') {
      return {
        type: 'state',
        topic,
        context: { tenant, site, deviceId, category: 'state/report' },
        receivedAt,
        payload: payload as unknown as DeviceStatePayload,
      };
    }

    if (category === 'state' && rest.length === 0) {
      return {
        type: 'state',
        topic,
        context: { tenant, site, deviceId, category },
        receivedAt,
        payload: payload as unknown as DeviceStatePayload,
      };
    }

    if (category === 'event' && rest[0] === 'report') {
      return {
        type: 'event',
        topic,
        context: { tenant, site, deviceId, category: 'event/report' },
        receivedAt,
        payload: payload as unknown as DeviceEventPayload,
      };
    }

    if (category === 'event' && rest.length === 0) {
      return {
        type: 'event',
        topic,
        context: { tenant, site, deviceId, category },
        receivedAt,
        payload: payload as unknown as DeviceEventPayload,
      };
    }

    if (category === 'lifecycle' && ['register', 'online', 'offline'].includes(rest[0] || '')) {
      return {
        type: 'lifecycle',
        topic,
        context: { tenant, site, deviceId, category: `lifecycle/${rest[0]}` },
        receivedAt,
        payload: payload as unknown as DeviceLifecyclePayload,
      };
    }

    if (category === 'capabilities' && rest[0] === 'report') {
      return {
        type: 'capabilities',
        topic,
        context: { tenant, site, deviceId, category: 'capabilities/report' },
        receivedAt,
        payload: payload as unknown as DeviceCapabilityReportPayload,
      };
    }

    if (category === 'command' && rest[0] === 'ack') {
      return {
        type: 'command_ack',
        topic,
        context: { tenant, site, deviceId, category: 'command/ack' },
        receivedAt,
        payload: payload as unknown as DeviceCommandAckPayload,
      };
    }

    if (category === 'command' && rest[0] === 'result') {
      return {
        type: 'command_ack',
        topic,
        context: { tenant, site, deviceId, category: 'command/result' },
        receivedAt,
        payload: payload as unknown as DeviceCommandAckPayload,
      };
    }

    throw new Error(`Unsupported topic category: ${category}`);
  }
}
