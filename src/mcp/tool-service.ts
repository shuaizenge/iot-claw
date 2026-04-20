import { ControlPlaneService } from '../services/control-plane-service.js';
import { MCP_TOOL_DEFINITIONS } from './tool-registry.js';

export class McpToolService {
  constructor(private readonly controlPlane: ControlPlaneService) {}

  listTools() {
    return MCP_TOOL_DEFINITIONS;
  }

  async execute(name: string, input: Record<string, unknown>) {
    switch (name) {
      case 'list_devices':
        return this.controlPlane.listDevices({
          tenant: asOptionalString(input.tenant),
          site: asOptionalString(input.site),
          limit: asOptionalNumber(input.limit),
        });
      case 'get_device_state': {
        const deviceId = asRequiredString(input.deviceId, 'deviceId');
        return this.controlPlane.getDeviceState(deviceId);
      }
      case 'list_device_alerts':
        return this.controlPlane.listDeviceAlerts({
          tenant: asOptionalString(input.tenant),
          site: asOptionalString(input.site),
          deviceId: asOptionalString(input.deviceId),
          limit: asOptionalNumber(input.limit),
        });
      case 'publish_safe_command':
        return this.controlPlane.submitCommand({
          tenant: asRequiredString(input.tenant, 'tenant'),
          site: asRequiredString(input.site, 'site'),
          deviceId: asRequiredString(input.deviceId, 'deviceId'),
          commandName: asRequiredString(input.commandName, 'commandName'),
          payload: asObject(input.payload),
          requestedBy: asOptionalString(input.requestedBy) || 'mcp-tool',
        });
      case 'get_command_status': {
        const commandId = asRequiredString(input.commandId, 'commandId');
        return this.controlPlane.getCommand(commandId);
      }
      default:
        throw new Error(`Invalid request: unknown MCP tool \`${name}\``);
    }
  }
}

function asRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid request: ${field} is required`);
  }
  return value.trim();
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Invalid request: numeric value must be a positive number');
  }
  return parsed;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid request: payload must be an object');
  }
  return value as Record<string, unknown>;
}
