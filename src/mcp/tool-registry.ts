import { McpToolDefinitionRecord } from '../types.js';

export const MCP_TOOL_DEFINITIONS: McpToolDefinitionRecord[] = [
  {
    name: 'list_devices',
    description: 'List registered devices with tenant/site filters.',
    inputSchema: { tenant: 'string?', site: 'string?', limit: 'number?' },
  },
  {
    name: 'get_device_state',
    description: 'Get the latest state for a single device.',
    inputSchema: { deviceId: 'string' },
  },
  {
    name: 'list_device_alerts',
    description: 'List alerts with tenant/site/device filters.',
    inputSchema: {
      tenant: 'string?',
      site: 'string?',
      deviceId: 'string?',
      limit: 'number?',
    },
  },
  {
    name: 'publish_safe_command',
    description: 'Publish a safe-write device command through policy checks.',
    inputSchema: {
      tenant: 'string',
      site: 'string',
      deviceId: 'string',
      commandName: 'string',
      payload: 'object?',
      requestedBy: 'string?',
    },
  },
  {
    name: 'get_command_status',
    description: 'Get execution status for a command.',
    inputSchema: { commandId: 'string' },
  },
];
