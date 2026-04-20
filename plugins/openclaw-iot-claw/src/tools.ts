import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { IotClawClient } from "./client.js";

const ListDevicesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    tenant: { type: "string", description: "Filter by tenant." },
    site: { type: "string", description: "Filter by site." },
    query: { type: "string", description: "Filter by device id, name, or metadata." },
    limit: { type: "number", description: "Maximum number of devices to return.", minimum: 1 },
  },
} as const;

const DeviceIdSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    deviceId: { type: "string", description: "Device identifier." },
  },
  required: ["deviceId"],
} as const;

const TelemetryHistorySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    deviceId: { type: "string", description: "Device identifier." },
    start: {
      type: "string",
      description: "Optional ISO8601 start timestamp. Defaults to 24 hours before end.",
    },
    end: {
      type: "string",
      description: "Optional ISO8601 end timestamp. Defaults to now.",
    },
    limit: {
      type: "number",
      description: "Maximum number of telemetry points to return.",
      minimum: 1,
    },
  },
  required: ["deviceId"],
} as const;

const ListAlertsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    deviceId: { type: "string", description: "Filter by device id." },
    tenant: { type: "string", description: "Filter by tenant." },
    site: { type: "string", description: "Filter by site." },
    limit: {
      type: "number",
      description: "Maximum number of alerts to return.",
      minimum: 1,
    },
  },
} as const;

const ExecuteActionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    deviceId: { type: "string", description: "Device identifier." },
    actionName: { type: "string", description: "Action name to execute." },
    args: {
      type: "object",
      additionalProperties: true,
      description: "Action arguments. Use this when the caller supports object parameters.",
    },
    payload: {
      type: "object",
      additionalProperties: true,
      description: "Alias of args for callers that prefer payload naming.",
    },
    argsJson: {
      type: "string",
      description: 'JSON object string for action arguments, for example {"progress":50}.',
    },
    payloadJson: {
      type: "string",
      description: 'Alias of argsJson for callers that prefer payload naming.',
    },
    requestedBy: { type: "string", description: "Audit actor label." },
    confirmed: { type: "boolean", description: "Set true for actions requiring confirmation." },
  },
  required: ["deviceId", "actionName"],
} as const;

const CommandSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    commandId: { type: "string", description: "Command identifier returned by iot-claw." },
  },
  required: ["commandId"],
} as const;

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function createIotClawTools(api: OpenClawPluginApi) {
  const client = new IotClawClient((api.pluginConfig || {}) as Record<string, unknown>);

  return [
    {
      name: "iot_list_devices",
      description: "List registered devices from the iot-claw control plane.",
      parameters: ListDevicesSchema,
      execute: async (_toolCallId: string, params: Record<string, unknown>) =>
        jsonResult(
          await client.listDevices({
            tenant: asOptionalString(params.tenant),
            site: asOptionalString(params.site),
            query: asOptionalString(params.query),
            limit: asOptionalNumber(params.limit),
          }),
        ),
    },
    {
      name: "iot_get_device",
      description: "Get one device record from iot-claw.",
      parameters: DeviceIdSchema,
      execute: async (_toolCallId: string, params: Record<string, unknown>) =>
        jsonResult(await client.getDevice(asRequiredString(params.deviceId, "deviceId"))),
    },
    {
      name: "iot_get_device_state",
      description: "Get the latest runtime state for one device.",
      parameters: DeviceIdSchema,
      execute: async (_toolCallId: string, params: Record<string, unknown>) =>
        jsonResult(await client.getDeviceState(asRequiredString(params.deviceId, "deviceId"))),
    },
    {
      name: "iot_list_device_capabilities",
      description: "List the capabilities and reported properties for one device.",
      parameters: DeviceIdSchema,
      execute: async (_toolCallId: string, params: Record<string, unknown>) =>
        jsonResult(await client.listDeviceCapabilities(asRequiredString(params.deviceId, "deviceId"))),
    },
    {
      name: "iot_get_device_telemetry_history",
      description: "Get historical telemetry points reported by one device.",
      parameters: TelemetryHistorySchema,
      execute: async (_toolCallId: string, params: Record<string, unknown>) =>
        jsonResult(
          await client.getDeviceTelemetryHistory(asRequiredString(params.deviceId, "deviceId"), {
            start: asOptionalString(params.start),
            end: asOptionalString(params.end),
            limit: asOptionalNumber(params.limit),
          }),
        ),
    },
    {
      name: "iot_list_device_alerts",
      description: "List device alerts from iot-claw.",
      parameters: ListAlertsSchema,
      execute: async (_toolCallId: string, params: Record<string, unknown>) =>
        jsonResult(
          await client.listDeviceAlerts({
            deviceId: asOptionalString(params.deviceId),
            tenant: asOptionalString(params.tenant),
            site: asOptionalString(params.site),
            limit: asOptionalNumber(params.limit),
          }),
        ),
    },
    {
      name: "iot_list_device_actions",
      description:
        "List available device actions for one device, including argsSchema and payloadTemplate when the device or platform reported them.",
      parameters: DeviceIdSchema,
      execute: async (_toolCallId: string, params: Record<string, unknown>) =>
        jsonResult(await client.listDeviceActions(asRequiredString(params.deviceId, "deviceId"))),
    },
    {
      name: "iot_execute_device_action",
      description:
        "Execute a device action through iot-claw policy and approval flow. Supports args, payload, argsJson, and payloadJson.",
      parameters: ExecuteActionSchema,
      execute: async (_toolCallId: string, params: Record<string, unknown>) =>
        jsonResult(
          await client.executeDeviceAction({
            deviceId: asRequiredString(params.deviceId, "deviceId"),
            actionName: asRequiredString(params.actionName, "actionName"),
            args: resolveActionArgs(params),
            requestedBy: asOptionalString(params.requestedBy),
            confirmed: params.confirmed === true,
          }),
        ),
    },
    {
      name: "iot_get_command_status",
      description: "Get the execution status of a command returned by iot-claw.",
      parameters: CommandSchema,
      execute: async (_toolCallId: string, params: Record<string, unknown>) =>
        jsonResult(await client.getCommandStatus(asRequiredString(params.commandId, "commandId"))),
    },
  ];
}

function asRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function resolveActionArgs(params: Record<string, unknown>): Record<string, unknown> | undefined {
  const directArgs = asRecord(params.args);
  if (directArgs) {
    return directArgs;
  }

  const directPayload = asRecord(params.payload);
  if (directPayload) {
    return directPayload;
  }

  const argsJson = asOptionalString(params.argsJson);
  if (argsJson) {
    return parseJsonObject(argsJson, "argsJson");
  }

  const payloadJson = asOptionalString(params.payloadJson);
  if (payloadJson) {
    return parseJsonObject(payloadJson, "payloadJson");
  }

  return undefined;
}

function parseJsonObject(value: string, field: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${field} must be valid JSON: ${detail}`);
  }

  const record = asRecord(parsed);
  if (!record) {
    throw new Error(`${field} must decode to a JSON object`);
  }

  return record;
}
