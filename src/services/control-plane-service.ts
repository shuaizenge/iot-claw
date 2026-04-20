import { CommandPolicyService } from '../policy/command-policy-service.js';
import {
  DashboardSummaryRecord,
  CommandApprovalRecord,
  DeviceActionInput,
  ServerApiAccessRecord,
  DeviceCapabilityInput,
  DeviceTelemetryHistoryResult,
  ManualDeviceRegistrationInput,
  MqttSettingsInput,
  MqttRuntimeStatus,
  PublishCommandInput,
  ServerSettingsInput,
} from '../types.js';
import { CommandService } from './command-service.js';
import { InfluxService } from './influx-service.js';
import { PostgresService } from './postgres.js';

export class ControlPlaneService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly commandService: CommandService,
    private readonly commandPolicy: CommandPolicyService,
    private readonly deps?: {
      getMqttRuntimeStatus?: () => MqttRuntimeStatus;
      applyMqttSettings?: (input: {
        brokerUrl: string;
        clientId: string;
        username: string | null;
        password: string | null;
        topicFilter: string;
        keepaliveSeconds: number;
        enabled: boolean;
      }) => Promise<void>;
      getAgentRuntimeName?: () => string;
      influx?: InfluxService;
    },
  ) {}

  async listDevices(filters?: {
    tenant?: string;
    site?: string;
    query?: string;
    limit?: number;
  }) {
    return this.postgres.listDevices(filters);
  }

  async getDevice(deviceId: string) {
    return this.postgres.getDevice(deviceId);
  }

  async deleteDevice(deviceId: string): Promise<boolean> {
    return this.postgres.deleteDevice(deviceId);
  }

  async createDevice(input: ManualDeviceRegistrationInput) {
    const exists = await this.postgres.getDevice(input.deviceId);
    if (exists) {
      throw new Error('Invalid request: device already exists');
    }

    await this.postgres.upsertDevice({
      deviceId: input.deviceId,
      tenant: input.tenant,
      site: input.site,
      name: input.name,
      productType: input.productType,
      lastSeenAt: null,
      status: 'registered',
      metadata: {
        source: 'manual',
        ...(input.metadata || {}),
      },
    });

    return this.postgres.getDevice(input.deviceId);
  }

  async getServerSettings() {
    return this.postgres.getServerSettings();
  }

  async getServerApiAccess(): Promise<ServerApiAccessRecord> {
    return this.postgres.getServerApiAccess();
  }

  async getServerApiToken(): Promise<string | null> {
    return this.postgres.getServerApiToken();
  }

  async updateServerSettings(input: ServerSettingsInput) {
    return this.postgres.updateServerSettings(input);
  }

  async getMqttSettings() {
    return this.postgres.getMqttSettings();
  }

  async updateMqttSettings(input: MqttSettingsInput) {
    const nextSettings = await this.postgres.updateMqttSettings(input);
    if (this.deps?.applyMqttSettings) {
      const runtimeSettings = await this.postgres.getMqttRuntimeSettings();
      await this.deps.applyMqttSettings({
        brokerUrl: runtimeSettings.brokerUrl,
        clientId: runtimeSettings.clientId,
        username: runtimeSettings.username,
        password: runtimeSettings.password,
        topicFilter: runtimeSettings.topicFilter,
        keepaliveSeconds: runtimeSettings.keepaliveSeconds,
        enabled: runtimeSettings.enabled,
      });
    }
    return nextSettings;
  }

  async getDashboardSummary(): Promise<DashboardSummaryRecord> {
    const [server, deviceSummary] = await Promise.all([
      this.postgres.getServerSettings(),
      this.postgres.getDeviceSummary(),
    ]);

    return {
      serviceName: server.serviceName,
      uiTitle: server.uiTitle,
      httpApi: 'active',
      agentRuntime: this.deps?.getAgentRuntimeName?.() ?? 'unknown',
      mqtt:
        this.deps?.getMqttRuntimeStatus?.() ?? {
          url: '',
          topicFilter: '',
          enabled: false,
          state: 'stopped',
          lastConnectedAt: null,
          lastDisconnectedAt: null,
          lastError: null,
        },
      devices: deviceSummary,
      jobs: 0,
      mcpTools: 0,
      agentBridgeEvents: 0,
      commandPolicy: this.commandPolicy.getPolicySummary() as Record<string, unknown>,
    };
  }

  async listDeviceCapabilities(deviceId?: string, capability?: string) {
    return this.postgres.listDeviceCapabilities(deviceId, capability);
  }

  async saveDeviceCapability(input: DeviceCapabilityInput) {
    const device = await this.postgres.getDevice(input.deviceId);
    if (!device) {
      throw new Error('Invalid request: device not found');
    }

    await this.postgres.upsertDeviceCapability(input);
    return this.postgres.listDeviceCapabilities(input.deviceId);
  }

  async listDeviceActions(deviceId: string) {
    const device = await this.postgres.getDevice(deviceId);
    if (!device) {
      throw new Error('Invalid request: device not found');
    }

    return this.postgres.listDeviceActions(deviceId);
  }

  async saveDeviceAction(input: DeviceActionInput) {
    const device = await this.postgres.getDevice(input.deviceId);
    if (!device) {
      throw new Error('Invalid request: device not found');
    }

    await this.postgres.upsertDeviceAction(input);
    return this.postgres.getDeviceAction(input.deviceId, input.actionName);
  }

  async executeDeviceAction(input: {
    deviceId: string;
    actionName: string;
    args?: Record<string, unknown>;
    requestedBy?: string;
    confirmed?: boolean;
  }) {
    const device = await this.postgres.getDevice(input.deviceId);
    if (!device) {
      throw new Error('Invalid request: device not found');
    }

    const action = await this.postgres.getDeviceAction(input.deviceId, input.actionName);
    if (!action) {
      throw new Error('Invalid request: device action not found');
    }

    if (action.requiresConfirmation && input.confirmed !== true) {
      throw new Error('Invalid request: action requires confirmation');
    }

    let payload = renderActionPayload(action.payloadTemplate, {
      args: input.args || {},
      deviceId: device.deviceId,
      tenant: device.tenant,
      site: device.site,
    });
    // Device-reported actions from capabilities/report only store commandName; template is {}.
    // When the template is empty, pass through args as the MQTT command payload.
    const template = action.payloadTemplate ?? {};
    if (Object.keys(template).length === 0 && input.args && Object.keys(input.args).length > 0) {
      payload = { ...input.args };
    }

    const result = await this.submitCommand({
      tenant: device.tenant,
      site: device.site,
      deviceId: device.deviceId,
      commandName: action.commandName,
      payload,
      requestedBy: input.requestedBy || 'control-plane-action',
    });

    return {
      device,
      action,
      args: input.args || {},
      command: result.command,
      approval: result.approval,
      requiresApproval: result.requiresApproval,
      level: result.level,
    };
  }

  async listDeviceStates(filters?: {
    tenant?: string;
    site?: string;
    deviceId?: string;
    limit?: number;
  }) {
    return this.postgres.listDeviceStates(filters);
  }

  async getDeviceState(deviceId: string) {
    const states = await this.postgres.listDeviceStates({ deviceId, limit: 1 });
    return states[0] || null;
  }

  async getDeviceTelemetryHistory(
    deviceId: string,
    input: { start?: string | null; end?: string | null; limit?: number },
  ): Promise<DeviceTelemetryHistoryResult> {
    const device = await this.getDevice(deviceId);
    if (!device) {
      throw new Error('Invalid request: device not found');
    }
    const influx = this.deps?.influx;
    if (!influx) {
      throw new Error('Invalid request: InfluxDB telemetry query is not available');
    }

    const end = input.end ? new Date(input.end) : new Date();
    const start = input.start
      ? new Date(input.start)
      : new Date(end.getTime() - 24 * 60 * 60 * 1000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new Error('Invalid request: start and end must be valid ISO8601 timestamps');
    }
    if (start.getTime() >= end.getTime()) {
      throw new Error('Invalid request: start must be before end');
    }
    const maxRangeMs = 90 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > maxRangeMs) {
      throw new Error('Invalid request: time range cannot exceed 90 days');
    }

    const limit = input.limit ?? 500;
    return influx.queryDeviceTelemetryHistory({
      tenant: device.tenant,
      site: device.site,
      deviceId: device.deviceId,
      start,
      end,
      limit,
    });
  }

  async listDeviceAlerts(filters?: {
    tenant?: string;
    site?: string;
    deviceId?: string;
    limit?: number;
  }) {
    return this.postgres.listDeviceAlerts(filters);
  }

  async submitCommand(input: PublishCommandInput) {
    const level = this.commandPolicy.validateRequest(input);
    const requiresApproval = this.commandPolicy.requiresApproval(level);
    const commandId = await this.commandService.createCommandRecord(
      input,
      requiresApproval ? 'approval_pending' : 'pending',
    );

    await this.postgres.createCommandAudit({
      commandId,
      action: 'command_submitted',
      actor: input.requestedBy,
      detail: { level, commandName: input.commandName },
    });

    if (requiresApproval) {
      await this.postgres.createCommandApproval({
        commandId,
        commandLevel: level,
        status: 'pending',
        requestedBy: input.requestedBy,
      });
      await this.postgres.createCommandAudit({
        commandId,
        action: 'approval_requested',
        actor: input.requestedBy,
        detail: { level },
      });
    } else {
      await this.commandService.dispatchCommand(commandId);
      await this.postgres.createCommandAudit({
        commandId,
        action: 'command_dispatched',
        actor: input.requestedBy,
        detail: { level },
      });
    }

    return {
      command: await this.postgres.getCommand(commandId),
      approval: await this.postgres.getLatestCommandApproval(commandId),
      requiresApproval,
      level,
    };
  }

  async approveCommand(commandId: string, reviewedBy: string, reason?: string | null) {
    const command = await this.postgres.getCommand(commandId);
    if (!command) {
      throw new Error('Invalid request: command not found');
    }

    const approval = await this.postgres.getLatestCommandApproval(commandId);
    if (!approval || approval.status !== 'pending') {
      throw new Error('Invalid request: no pending approval for this command');
    }

    await this.postgres.createCommandApproval({
      commandId,
      commandLevel: approval.commandLevel,
      status: 'approved',
      requestedBy: approval.requestedBy,
      reviewedBy,
      reason,
      reviewedAt: new Date().toISOString(),
    });

    await this.postgres.createCommandAudit({
      commandId,
      action: 'approval_approved',
      actor: reviewedBy,
      detail: { reason: reason || null },
    });

    await this.commandService.dispatchCommand(commandId);
    await this.postgres.createCommandAudit({
      commandId,
      action: 'command_dispatched',
      actor: reviewedBy,
      detail: { via: 'approval' },
    });

    return {
      command: await this.postgres.getCommand(commandId),
      approval: await this.postgres.getLatestCommandApproval(commandId),
    };
  }

  async rejectCommand(commandId: string, reviewedBy: string, reason?: string | null) {
    const approval = await this.postgres.getLatestCommandApproval(commandId);
    if (!approval || approval.status !== 'pending') {
      throw new Error('Invalid request: no pending approval for this command');
    }

    await this.postgres.createCommandApproval({
      commandId,
      commandLevel: approval.commandLevel,
      status: 'rejected',
      requestedBy: approval.requestedBy,
      reviewedBy,
      reason,
      reviewedAt: new Date().toISOString(),
    });

    const command = await this.postgres.getCommand(commandId);
    if (command) {
      await this.postgres.upsertCommand({
        commandId: command.commandId,
        deviceId: command.deviceId,
        tenant: command.tenant,
        site: command.site,
        commandName: command.commandName,
        payload: command.payload,
        requestedBy: command.requestedBy,
        requestedAt: command.requestedAt,
        status: 'rejected',
      });
    }

    await this.postgres.createCommandAudit({
      commandId,
      action: 'approval_rejected',
      actor: reviewedBy,
      detail: { reason: reason || null },
    });

    return {
      command: await this.postgres.getCommand(commandId),
      approval: await this.postgres.getLatestCommandApproval(commandId),
    };
  }

  async getCommand(commandId: string) {
    return this.postgres.getCommand(commandId);
  }

  async getCommandApproval(commandId: string): Promise<CommandApprovalRecord | null> {
    return this.postgres.getLatestCommandApproval(commandId);
  }

  async listCommandAudits(commandId: string) {
    return this.postgres.listCommandAudits(commandId);
  }

  getPolicySummary() {
    return this.commandPolicy.getPolicySummary();
  }
}

function renderActionPayload(
  value: Record<string, unknown>,
  context: { args: Record<string, unknown>; deviceId: string; tenant: string; site: string },
): Record<string, unknown> {
  return resolveTemplateValue(value, context) as Record<string, unknown>;
}

function resolveTemplateValue(
  value: unknown,
  context: { args: Record<string, unknown>; deviceId: string; tenant: string; site: string },
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValue(item, context));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, resolveTemplateValue(entryValue, context)]),
    );
  }

  if (typeof value !== 'string') {
    return value;
  }

  const exactMatch = value.match(/^\{\{\s*([^}]+)\s*\}\}$/);
  if (exactMatch) {
    return resolveTemplateToken(exactMatch[1], context);
  }

  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_full, token: string) => {
    const resolved = resolveTemplateToken(token, context);
    return resolved === undefined || resolved === null ? '' : String(resolved);
  });
}

function resolveTemplateToken(
  token: string,
  context: { args: Record<string, unknown>; deviceId: string; tenant: string; site: string },
): unknown {
  const normalized = token.trim();
  if (normalized === 'deviceId') return context.deviceId;
  if (normalized === 'tenant') return context.tenant;
  if (normalized === 'site') return context.site;
  if (!normalized.startsWith('args.')) return undefined;
  return normalized
    .slice(5)
    .split('.')
    .reduce<unknown>((current, key) => {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }
      return (current as Record<string, unknown>)[key];
    }, context.args);
}
