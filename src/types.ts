export type DeviceMessageType =
  | 'telemetry'
  | 'state'
  | 'event'
  | 'command_ack'
  | 'lifecycle'
  | 'capabilities';

export interface DeviceTopicContext {
  tenant: string;
  site: string;
  deviceId: string;
  category: string;
}

export interface DeviceTelemetryPayload {
  protocolVersion?: string;
  messageId?: string;
  ts?: string;
  tenant?: string;
  site?: string;
  deviceId?: string;
  traceId?: string;
  metrics: Record<string, number | string | boolean | null>;
  state?: Record<string, unknown>;
  quality?: string;
}

/** One logical telemetry sample after merging Influx fields (value / value_bool / value_text / quality). */
export interface DeviceTelemetryHistoryPoint {
  time: string;
  metric: string;
  value: number | boolean | string | null;
  quality?: string | null;
}

export interface DeviceTelemetryHistoryResult {
  deviceId: string;
  tenant: string;
  site: string;
  start: string;
  end: string;
  limit: number;
  items: DeviceTelemetryHistoryPoint[];
}

export interface DeviceStatePayload {
  protocolVersion?: string;
  messageId?: string;
  ts?: string;
  tenant?: string;
  site?: string;
  deviceId?: string;
  status: string;
  summary?: string;
  online?: boolean;
  attributes?: Record<string, unknown>;
}

export interface DeviceEventPayload {
  protocolVersion?: string;
  messageId?: string;
  ts?: string;
  tenant?: string;
  site?: string;
  deviceId?: string;
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  eventType?: string;
  data?: Record<string, unknown>;
}

export interface DeviceCommandAckPayload {
  protocolVersion?: string;
  messageId?: string;
  ts?: string;
  tenant?: string;
  site?: string;
  deviceId?: string;
  commandId: string;
  status:
    | 'accepted'
    | 'rejected'
    | 'busy'
    | 'unsupported'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'timeout'
    | 'cancelled';
  detail?: string;
  errorCode?: string;
  result?: Record<string, unknown>;
}

export interface DeviceLifecyclePayload {
  protocolVersion?: string;
  messageId?: string;
  ts?: string;
  tenant?: string;
  site?: string;
  deviceId?: string;
  name?: string;
  productType?: string;
  firmwareVersion?: string;
  hardwareVersion?: string;
  manufacturer?: string;
  capabilityVersion?: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  ip?: string;
  reason?: string;
}

export interface DeviceCapabilityReportPayload {
  protocolVersion?: string;
  messageId?: string;
  ts?: string;
  tenant?: string;
  site?: string;
  deviceId?: string;
  capabilities: Array<{
    capability: string;
    displayName?: string;
    properties?: string[];
  }>;
  actions?: Array<{
    actionName: string;
    commandName: string;
    payloadTemplate?: Record<string, unknown>;
    argsSchema?: Record<string, unknown>;
    requiresConfirmation?: boolean;
  }>;
}

export interface ParsedDeviceMessage {
  type: DeviceMessageType;
  topic: string;
  context: DeviceTopicContext;
  receivedAt: string;
  payload:
    | DeviceTelemetryPayload
    | DeviceStatePayload
    | DeviceEventPayload
    | DeviceCommandAckPayload
    | DeviceLifecyclePayload
    | DeviceCapabilityReportPayload;
}

export interface DeviceRecord {
  deviceId: string;
  tenant: string;
  site: string;
  name: string;
  productType: string;
  firmwareVersion: string | null;
  lastSeenAt: string | null;
  status: string;
  metadata: Record<string, unknown>;
}

export interface ServerSettingsRecord {
  serviceName: string;
  uiTitle: string;
  defaultTenant: string;
  defaultSite: string;
  adminDisplayName: string;
  apiTokenHint: string | null;
  updatedAt: string;
}

export interface ServerApiAccessRecord {
  enabled: boolean;
}

export interface ServerSettingsInput {
  serviceName?: string;
  uiTitle?: string;
  defaultTenant?: string;
  defaultSite?: string;
  adminDisplayName?: string;
  apiToken?: string | null;
}

export interface MqttSettingsRecord {
  brokerUrl: string;
  clientId: string;
  username: string | null;
  passwordConfigured: boolean;
  topicFilter: string;
  commandTopicTemplate: string;
  keepaliveSeconds: number;
  tlsEnabled: boolean;
  enabled: boolean;
  updatedAt: string;
}

export interface MqttSettingsInput {
  brokerUrl?: string;
  clientId?: string;
  username?: string | null;
  password?: string | null;
  topicFilter?: string;
  commandTopicTemplate?: string;
  keepaliveSeconds?: number;
  tlsEnabled?: boolean;
  enabled?: boolean;
}

export interface MqttRuntimeStatus {
  url: string;
  topicFilter: string;
  enabled: boolean;
  state: 'stopped' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastError: string | null;
}

export interface DashboardSummaryRecord {
  serviceName: string;
  uiTitle: string;
  httpApi: 'active';
  agentRuntime: string;
  mqtt: MqttRuntimeStatus;
  devices: {
    total: number;
    online: number;
    lastSeenAt: string | null;
  };
  jobs: number;
  mcpTools: number;
  agentBridgeEvents: number;
  commandPolicy: Record<string, unknown>;
}

export interface DeviceCapabilityRecord {
  deviceId: string;
  capability: string;
  displayName: string;
  config: Record<string, unknown>;
  updatedAt: string;
}

export interface DeviceCapabilityInput {
  deviceId: string;
  capability: string;
  displayName?: string;
  config?: Record<string, unknown>;
}

export interface DeviceActionRecord {
  deviceId: string;
  actionName: string;
  capability: string | null;
  commandName: string;
  payloadTemplate: Record<string, unknown>;
  argsSchema: Record<string, unknown>;
  requiresConfirmation: boolean;
  updatedAt: string;
}

export interface DeviceActionInput {
  deviceId: string;
  actionName: string;
  capability?: string | null;
  commandName?: string;
  payloadTemplate?: Record<string, unknown>;
  argsSchema?: Record<string, unknown>;
  requiresConfirmation?: boolean;
}

export interface ManualDeviceRegistrationInput {
  deviceId: string;
  tenant: string;
  site: string;
  name?: string;
  productType?: string;
  metadata?: Record<string, unknown>;
}

export interface DeviceUpsertInput {
  deviceId: string;
  tenant: string;
  site: string;
  name?: string;
  productType?: string;
  firmwareVersion?: string | null;
  lastSeenAt?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface DeviceStateUpdateInput {
  deviceId: string;
  tenant: string;
  site: string;
  status: string;
  summary?: string;
  online?: boolean;
  attributes?: Record<string, unknown>;
  updatedAt: string;
}

export interface DeviceAlertInput {
  deviceId: string;
  tenant: string;
  site: string;
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  eventType?: string;
  eventAt: string;
  payload?: Record<string, unknown>;
}

export interface DeviceCommandInput {
  commandId: string;
  deviceId: string;
  tenant: string;
  site: string;
  commandName: string;
  payload: Record<string, unknown>;
  requestedBy: string;
  requestedAt: string;
  status:
    | 'approval_pending'
    | 'pending'
    | 'accepted'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'rejected';
}

export interface DeviceStateRecord {
  deviceId: string;
  tenant: string;
  site: string;
  status: string;
  online: boolean | null;
  summary: string | null;
  attributes: Record<string, unknown>;
  updatedAt: string;
}

export interface DeviceAlertRecord {
  id: number;
  deviceId: string;
  tenant: string;
  site: string;
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  eventType: string | null;
  status: string;
  payload: Record<string, unknown>;
  eventAt: string;
  createdAt: string;
}

export interface DeviceCommandRecord {
  commandId: string;
  deviceId: string;
  tenant: string;
  site: string;
  commandName: string;
  payload: Record<string, unknown>;
  requestedBy: string;
  requestedAt: string;
  status: string;
  response: Record<string, unknown> | null;
  updatedAt: string;
}

export interface PublishCommandInput {
  tenant: string;
  site: string;
  deviceId: string;
  commandName: string;
  payload: Record<string, unknown>;
  requestedBy: string;
}

export type CommandLevel = 'read' | 'safe-write' | 'dangerous-write';

export interface CommandApprovalRecord {
  id: number;
  commandId: string;
  commandLevel: CommandLevel;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  reviewedBy: string | null;
  reason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface CommandAuditRecord {
  id: number;
  commandId: string | null;
  action: string;
  actor: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface AgentBridgeEventRecord {
  id: string;
  source: 'alert' | 'job';
  level: 'info' | 'warning' | 'critical';
  tenant: string;
  site: string;
  deviceId?: string;
  title: string;
  summary: string;
  status: 'pending' | 'dispatched' | 'completed';
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface JobDefinitionRecord {
  id: string;
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
  kind: 'report' | 'inspection' | 'alert-summary';
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface JobRunRecord {
  id: number;
  jobId: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  output: Record<string, unknown>;
}

export interface McpToolDefinitionRecord {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
