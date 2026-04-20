import { AgentBridgeService } from '../bridge/agent-bridge-service.js';
import { logger } from '../logger.js';
import {
  DeviceAlertRecord,
  DeviceCapabilityReportPayload,
  DeviceCommandAckPayload,
  DeviceEventPayload,
  DeviceLifecyclePayload,
  DeviceStatePayload,
  DeviceTelemetryPayload,
  ParsedDeviceMessage,
} from '../types.js';
import { InfluxService } from './influx-service.js';
import { PostgresService } from './postgres.js';

export class DeviceEventService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
    private readonly agentBridge?: AgentBridgeService,
  ) {}

  async handle(message: ParsedDeviceMessage): Promise<void> {
    const { context, receivedAt } = message;

    await this.postgres.upsertDevice({
      deviceId: context.deviceId,
      tenant: context.tenant,
      site: context.site,
      lastSeenAt: receivedAt,
      status: message.type === 'event' ? 'warning' : 'online',
    });

    switch (message.type) {
      case 'telemetry':
        await this.handleTelemetry(context.deviceId, context.tenant, context.site, message.payload as DeviceTelemetryPayload, receivedAt, message.context);
        break;
      case 'state':
        await this.handleState(context.deviceId, context.tenant, context.site, message.payload as DeviceStatePayload, receivedAt);
        break;
      case 'event':
        await this.handleEvent(context.deviceId, context.tenant, context.site, message.payload as DeviceEventPayload, receivedAt);
        break;
      case 'command_ack':
        await this.handleCommandAck(message.payload as DeviceCommandAckPayload);
        break;
      case 'lifecycle':
        await this.handleLifecycle(
          context.deviceId,
          context.tenant,
          context.site,
          message.payload as DeviceLifecyclePayload,
          receivedAt,
          context.category,
        );
        break;
      case 'capabilities':
        await this.handleCapabilities(
          context.deviceId,
          message.payload as DeviceCapabilityReportPayload,
        );
        break;
    }
  }

  private async handleTelemetry(
    deviceId: string,
    tenant: string,
    site: string,
    payload: DeviceTelemetryPayload,
    receivedAt: string,
    context: ParsedDeviceMessage['context'],
  ): Promise<void> {
    await this.influx.writeTelemetry(context, payload, receivedAt);
    await this.postgres.updateDeviceState({
      deviceId,
      tenant,
      site,
      status: 'online',
      online: true,
      summary: 'Telemetry received',
      attributes: payload.state || {},
      updatedAt: payload.ts || receivedAt,
    });

    logger.info(
      {
        deviceId,
        tenant,
        site,
        metricCount: Object.keys(payload.metrics || {}).length,
      },
      'Telemetry ingested',
    );
  }

  private async handleState(
    deviceId: string,
    tenant: string,
    site: string,
    payload: DeviceStatePayload,
    receivedAt: string,
  ): Promise<void> {
    await this.postgres.updateDeviceState({
      deviceId,
      tenant,
      site,
      status: payload.status,
      online: payload.online,
      summary: payload.summary,
      attributes: payload.attributes || {},
      updatedAt: payload.ts || receivedAt,
    });

    logger.info(
      { deviceId, tenant, site, status: payload.status, online: payload.online },
      'Device state ingested',
    );
  }

  private async handleEvent(
    deviceId: string,
    tenant: string,
    site: string,
    payload: DeviceEventPayload,
    receivedAt: string,
  ): Promise<void> {
    await this.postgres.createAlert({
      deviceId,
      tenant,
      site,
      level: payload.level,
      title: payload.title,
      message: payload.message,
      eventType: payload.eventType,
      eventAt: payload.ts || receivedAt,
      payload: payload.data,
    });

    if (this.agentBridge && payload.level !== 'info') {
      const alert: DeviceAlertRecord = {
        id: 0,
        deviceId,
        tenant,
        site,
        level: payload.level,
        title: payload.title,
        message: payload.message,
        eventType: payload.eventType || null,
        status: 'open',
        payload: payload.data || {},
        eventAt: payload.ts || receivedAt,
        createdAt: new Date().toISOString(),
      };
      const bridgeEvent = await this.agentBridge.publishAlert(alert);
      logger.info(
        { bridgeEventId: bridgeEvent.id, deviceId, tenant, site, title: payload.title },
        'Alert dispatched to agent bridge',
      );
    }

    logger.warn(
      { deviceId, tenant, site, level: payload.level, title: payload.title },
      'Device event converted to alert',
    );
  }

  private async handleCommandAck(payload: DeviceCommandAckPayload): Promise<void> {
    await this.postgres.updateCommandResult(payload.commandId, payload.status, {
      detail: payload.detail || null,
      errorCode: payload.errorCode || null,
      result: payload.result || {},
      ts: payload.ts || new Date().toISOString(),
    });

    logger.info(
      { commandId: payload.commandId, deviceId: payload.deviceId, status: payload.status },
      'Command ack ingested',
    );
  }

  private async handleLifecycle(
    deviceId: string,
    tenant: string,
    site: string,
    payload: DeviceLifecyclePayload,
    receivedAt: string,
    category: string,
  ): Promise<void> {
    if (category === 'lifecycle/register') {
      await this.postgres.upsertDevice({
        deviceId,
        tenant,
        site,
        name: payload.name || deviceId,
        productType: payload.productType || 'unknown',
        firmwareVersion: payload.firmwareVersion || null,
        lastSeenAt: payload.ts || receivedAt,
        status: 'registered',
        metadata: {
          hardwareVersion: payload.hardwareVersion || null,
          manufacturer: payload.manufacturer || null,
          capabilityVersion: payload.capabilityVersion || null,
          ...payload.metadata,
        },
      });
      logger.info({ deviceId, tenant, site }, 'Device lifecycle register ingested');
      return;
    }

    const online = category === 'lifecycle/online';
    await this.postgres.updateDeviceState({
      deviceId,
      tenant,
      site,
      status: online ? 'online' : 'offline',
      online,
      summary: payload.reason || (online ? 'Device online' : 'Device offline'),
      attributes: {
        sessionId: payload.sessionId || null,
        ip: payload.ip || null,
        reason: payload.reason || null,
      },
      updatedAt: payload.ts || receivedAt,
    });

    logger.info({ deviceId, tenant, site, category }, 'Device lifecycle ingested');
  }

  private async handleCapabilities(
    deviceId: string,
    payload: DeviceCapabilityReportPayload,
  ): Promise<void> {
    for (const capability of payload.capabilities || []) {
      await this.postgres.upsertDeviceCapability({
        deviceId,
        capability: capability.capability,
        displayName: capability.displayName || capability.capability,
        config: {
          properties: capability.properties || [],
        },
      });
    }

    for (const action of payload.actions || []) {
      await this.postgres.upsertDeviceAction({
        deviceId,
        actionName: action.actionName,
        commandName: action.commandName,
        payloadTemplate: action.payloadTemplate,
        argsSchema: action.argsSchema,
        requiresConfirmation: action.requiresConfirmation,
      });
    }

    logger.info(
      {
        deviceId,
        capabilityCount: payload.capabilities?.length || 0,
        actionCount: payload.actions?.length || 0,
      },
      'Device capabilities ingested',
    );
  }
}
