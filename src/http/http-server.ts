import http, { IncomingMessage, Server, ServerResponse } from 'http';

import { AgentBridgeService } from '../bridge/agent-bridge-service.js';
import { config } from '../config.js';
import { JobService } from '../jobs/job-service.js';
import { McpToolService } from '../mcp/tool-service.js';
import { CommandPolicyService } from '../policy/command-policy-service.js';
import { ControlPlaneService } from '../services/control-plane-service.js';
import { renderControlPlaneUi } from './control-plane-ui.js';
import {
  parseLimit,
  parseUrl,
  readBearerToken,
  readJsonBody,
  sendError,
  sendJson,
  sendText,
} from './http-utils.js';

interface HttpServerDeps {
  host: string;
  port: number;
  controlPlane: ControlPlaneService;
  mcpToolService: McpToolService;
  agentBridge: AgentBridgeService;
  jobService: JobService;
  commandPolicy: CommandPolicyService;
}

interface CommandRequestBody {
  tenant: string;
  site: string;
  deviceId: string;
  commandName: string;
  payload?: Record<string, unknown>;
  requestedBy?: string;
}

interface ReviewCommandBody {
  reviewedBy: string;
  reason?: string;
}

interface UpdateServerSettingsBody {
  serviceName?: string;
  uiTitle?: string;
  defaultTenant?: string;
  defaultSite?: string;
  adminDisplayName?: string;
  apiToken?: string | null;
}

interface UpdateMqttSettingsBody {
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

interface UpsertCapabilityBody {
  displayName?: string;
  config?: Record<string, unknown>;
}

interface UpsertActionBody {
  actionName?: string;
  capability?: string | null;
  commandName?: string;
  payloadTemplate?: Record<string, unknown>;
  argsSchema?: Record<string, unknown>;
  requiresConfirmation?: boolean;
}

interface ExecuteActionBody {
  requestedBy?: string;
  args?: Record<string, unknown>;
  confirmed?: boolean;
}

interface CreateDeviceBody {
  deviceId?: string;
  tenant?: string;
  site?: string;
  name?: string;
  productType?: string;
  metadata?: Record<string, unknown>;
}

export class HttpServer {
  private server: Server | null = null;

  constructor(private readonly deps: HttpServerDeps) {}

  async start(): Promise<void> {
    if (this.server) return;

    this.server = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.listen(this.deps.port, this.deps.host, () => resolve());
      this.server?.once('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const method = req.method || 'GET';
    const url = parseUrl(req);

    try {
      if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        sendText(res, 200, 'text/html; charset=utf-8', renderControlPlaneUi('home'));
        return;
      }

      if (method === 'GET' && url.pathname === '/devices') {
        sendText(res, 200, 'text/html; charset=utf-8', renderControlPlaneUi('devices'));
        return;
      }

      if (method === 'GET' && url.pathname === '/settings') {
        sendText(res, 200, 'text/html; charset=utf-8', renderControlPlaneUi('settings'));
        return;
      }

      if (method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { status: 'ok', version: '0.0.5' });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/control-plane/status') {
        const bridgeEvents = await this.deps.agentBridge.listEvents();
        const jobs = await this.deps.jobService.listDefinitions();
        sendJson(res, 200, {
          version: '0.0.5',
          layers: {
            httpApi: 'active',
            agentRuntime: config.AGENT_RUNTIME,
            mcpTools: this.deps.mcpToolService.listTools().length,
            agentBridgeEvents: bridgeEvents.length,
            jobs: jobs.length,
            commandPolicy: this.deps.commandPolicy.getPolicySummary(),
          },
        });
        return;
      }

      if (url.pathname.startsWith('/api/plugin/')) {
        await this.authorizePluginRequest(req);

        if (method === 'GET' && url.pathname === '/api/plugin/access') {
          sendJson(res, 200, await this.deps.controlPlane.getServerApiAccess());
          return;
        }

        if (method === 'GET' && url.pathname === '/api/plugin/devices') {
          const devices = await this.deps.controlPlane.listDevices({
            tenant: url.searchParams.get('tenant') || undefined,
            site: url.searchParams.get('site') || undefined,
            query: url.searchParams.get('query') || undefined,
            limit: parseLimit(url.searchParams.get('limit')),
          });
          sendJson(res, 200, { items: devices });
          return;
        }

        if (method === 'GET' && url.pathname === '/api/plugin/device-alerts') {
          const alerts = await this.deps.controlPlane.listDeviceAlerts({
            tenant: url.searchParams.get('tenant') || undefined,
            site: url.searchParams.get('site') || undefined,
            deviceId: url.searchParams.get('deviceId') || undefined,
            limit: parseLimit(url.searchParams.get('limit')),
          });
          sendJson(res, 200, { items: alerts });
          return;
        }

        const pluginActionsMatch = url.pathname.match(
          /^\/api\/plugin\/devices\/([^/]+)\/actions(?:\/([^/]+)(?:\/execute)?)?$/,
        );
        if (pluginActionsMatch) {
          const deviceId = decodeURIComponent(pluginActionsMatch[1]);
          const actionName = pluginActionsMatch[2]
            ? decodeURIComponent(pluginActionsMatch[2])
            : undefined;
          const isExecute = url.pathname.endsWith('/execute');

          if (method === 'GET' && !actionName && !isExecute) {
            const items = await this.deps.controlPlane.listDeviceActions(deviceId);
            sendJson(res, 200, { items });
            return;
          }

          if (method === 'POST' && actionName && isExecute) {
            const body = (await readJsonBody(req)) as ExecuteActionBody;
            const result = await this.deps.controlPlane.executeDeviceAction({
              deviceId,
              actionName,
              requestedBy: this.asOptionalTrimmedString(body.requestedBy) || 'openclaw-plugin',
              args: this.asObject(body.args, 'args'),
              confirmed: body.confirmed === true,
            });
            sendJson(res, 202, result);
            return;
          }
        }

        const pluginTelemetryHistoryMatch = url.pathname.match(
          /^\/api\/plugin\/devices\/([^/]+)\/telemetry\/history$/,
        );
        if (method === 'GET' && pluginTelemetryHistoryMatch) {
          const deviceId = decodeURIComponent(pluginTelemetryHistoryMatch[1]);
          const result = await this.deps.controlPlane.getDeviceTelemetryHistory(deviceId, {
            start: url.searchParams.get('start') || undefined,
            end: url.searchParams.get('end') || undefined,
            limit: parseLimit(url.searchParams.get('limit')),
          });
          sendJson(res, 200, result);
          return;
        }

        const pluginCapabilitiesMatch = url.pathname.match(
          /^\/api\/plugin\/devices\/([^/]+)\/capabilities$/,
        );
        if (method === 'GET' && pluginCapabilitiesMatch) {
          const deviceId = decodeURIComponent(pluginCapabilitiesMatch[1]);
          const items = await this.deps.controlPlane.listDeviceCapabilities(deviceId);
          sendJson(res, 200, { items });
          return;
        }

        const pluginDeviceStateMatch = url.pathname.match(/^\/api\/plugin\/device-states\/([^/]+)$/);
        if (method === 'GET' && pluginDeviceStateMatch) {
          const deviceId = decodeURIComponent(pluginDeviceStateMatch[1]);
          const state = await this.deps.controlPlane.getDeviceState(deviceId);
          if (!state) {
            sendJson(res, 404, { error: 'Device state not found' });
            return;
          }
          sendJson(res, 200, state);
          return;
        }

        const pluginDeviceMatch = url.pathname.match(/^\/api\/plugin\/devices\/([^/]+)$/);
        if (method === 'GET' && pluginDeviceMatch) {
          const deviceId = decodeURIComponent(pluginDeviceMatch[1]);
          const device = await this.deps.controlPlane.getDevice(deviceId);
          if (!device) {
            sendJson(res, 404, { error: 'Device not found' });
            return;
          }
          sendJson(res, 200, device);
          return;
        }

        const pluginCommandMatch = url.pathname.match(/^\/api\/plugin\/commands\/([^/]+)$/);
        if (method === 'GET' && pluginCommandMatch) {
          const commandId = decodeURIComponent(pluginCommandMatch[1]);
          const command = await this.deps.controlPlane.getCommand(commandId);
          if (!command) {
            sendJson(res, 404, { error: 'Command not found' });
            return;
          }
          sendJson(res, 200, command);
          return;
        }

        sendJson(res, 404, { error: 'Not found' });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/dashboard/summary') {
        const [summary, bridgeEvents, jobs] = await Promise.all([
          this.deps.controlPlane.getDashboardSummary(),
          this.deps.agentBridge.listEvents(),
          this.deps.jobService.listDefinitions(),
        ]);
        sendJson(res, 200, {
          ...summary,
          mcpTools: this.deps.mcpToolService.listTools().length,
          agentBridgeEvents: bridgeEvents.length,
          jobs: jobs.length,
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/settings/server') {
        sendJson(res, 200, await this.deps.controlPlane.getServerSettings());
        return;
      }

      if (method === 'PUT' && url.pathname === '/api/settings/server') {
        const body = (await readJsonBody(req)) as UpdateServerSettingsBody;
        sendJson(
          res,
          200,
          await this.deps.controlPlane.updateServerSettings(
            this.validateServerSettingsBody(body),
          ),
        );
        return;
      }

      if (method === 'GET' && url.pathname === '/api/settings/mqtt') {
        sendJson(res, 200, await this.deps.controlPlane.getMqttSettings());
        return;
      }

      if (method === 'PUT' && url.pathname === '/api/settings/mqtt') {
        const body = (await readJsonBody(req)) as UpdateMqttSettingsBody;
        sendJson(
          res,
          200,
          await this.deps.controlPlane.updateMqttSettings(this.validateMqttSettingsBody(body)),
        );
        return;
      }

      if (method === 'GET' && url.pathname === '/api/capabilities/search') {
        const capability = url.searchParams.get('capability') || undefined;
        const items = await this.deps.controlPlane.listDeviceCapabilities(undefined, capability);
        sendJson(res, 200, { items });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/devices') {
        const devices = await this.deps.controlPlane.listDevices({
          tenant: url.searchParams.get('tenant') || undefined,
          site: url.searchParams.get('site') || undefined,
          query: url.searchParams.get('query') || undefined,
          limit: parseLimit(url.searchParams.get('limit')),
        });
        sendJson(res, 200, { items: devices });
        return;
      }

      if (method === 'POST' && url.pathname === '/api/devices') {
        const body = (await readJsonBody(req)) as CreateDeviceBody;
        sendJson(res, 201, await this.deps.controlPlane.createDevice(this.validateCreateDeviceBody(body)));
        return;
      }

      const deviceOnlyPath = url.pathname.match(/^\/api\/devices\/([^/]+)$/);
      if (deviceOnlyPath && method === 'DELETE') {
        const deviceId = decodeURIComponent(deviceOnlyPath[1]);
        const deleted = await this.deps.controlPlane.deleteDevice(deviceId);
        if (!deleted) {
          sendJson(res, 404, { error: 'Device not found' });
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      const capabilitiesMatch = url.pathname.match(/^\/api\/devices\/([^/]+)\/capabilities(?:\/([^/]+))?$/);
      if (capabilitiesMatch) {
        const deviceId = decodeURIComponent(capabilitiesMatch[1]);
        const capability = capabilitiesMatch[2] ? decodeURIComponent(capabilitiesMatch[2]) : undefined;

        if (method === 'GET' && !capability) {
          const items = await this.deps.controlPlane.listDeviceCapabilities(deviceId);
          sendJson(res, 200, { items });
          return;
        }

        if (method === 'PUT' && capability) {
          const body = (await readJsonBody(req)) as UpsertCapabilityBody;
          const items = await this.deps.controlPlane.saveDeviceCapability({
            deviceId,
            capability,
            displayName: body.displayName,
            config: this.asObject(body.config, 'config'),
          });
          sendJson(res, 200, { items });
          return;
        }
      }

      const actionsMatch = url.pathname.match(/^\/api\/devices\/([^/]+)\/actions(?:\/([^/]+)(?:\/execute)?)?$/);
      if (actionsMatch) {
        const deviceId = decodeURIComponent(actionsMatch[1]);
        const actionName = actionsMatch[2] ? decodeURIComponent(actionsMatch[2]) : undefined;
        const isExecute = url.pathname.endsWith('/execute');

        if (method === 'GET' && !actionName && !isExecute) {
          const items = await this.deps.controlPlane.listDeviceActions(deviceId);
          sendJson(res, 200, { items });
          return;
        }

        if (method === 'POST' && !actionName && !isExecute) {
          const body = (await readJsonBody(req)) as UpsertActionBody;
          const action = await this.deps.controlPlane.saveDeviceAction({
            deviceId,
            actionName: this.asRequiredTrimmedString(body.actionName, 'actionName'),
            capability: this.asOptionalTrimmedString(body.capability),
            commandName: this.asRequiredTrimmedString(body.commandName, 'commandName'),
            payloadTemplate: this.asObject(body.payloadTemplate, 'payloadTemplate'),
            argsSchema: this.asObject(body.argsSchema, 'argsSchema'),
            requiresConfirmation: body.requiresConfirmation === true,
          });
          sendJson(res, 201, action);
          return;
        }

        if (method === 'POST' && actionName && isExecute) {
          const body = (await readJsonBody(req)) as ExecuteActionBody;
          const result = await this.deps.controlPlane.executeDeviceAction({
            deviceId,
            actionName,
            requestedBy: this.asOptionalTrimmedString(body.requestedBy) || 'web-ui',
            args: this.asObject(body.args, 'args'),
            confirmed: body.confirmed === true,
          });
          sendJson(res, 202, result);
          return;
        }
      }

      // Must be before the generic GET /api/devices/:id handler, which uses pathname.replace and would
      // treat ".../telemetry/history" as part of the device id.
      const telemetryHistoryMatch = url.pathname.match(
        /^\/api\/devices\/([^/]+)\/telemetry\/history$/,
      );
      if (method === 'GET' && telemetryHistoryMatch) {
        const deviceId = decodeURIComponent(telemetryHistoryMatch[1]);
        try {
          const result = await this.deps.controlPlane.getDeviceTelemetryHistory(deviceId, {
            start: url.searchParams.get('start') || undefined,
            end: url.searchParams.get('end') || undefined,
            limit: parseLimit(url.searchParams.get('limit')),
          });
          sendJson(res, 200, result);
        } catch (error) {
          const msg = error instanceof Error ? error.message : '';
          if (msg.includes('device not found')) {
            sendJson(res, 404, { error: 'Device not found' });
            return;
          }
          if (msg.includes('InfluxDB telemetry query is not available')) {
            sendJson(res, 503, { error: 'InfluxDB telemetry query is not available' });
            return;
          }
          sendError(res, error);
        }
        return;
      }

      if (method === 'GET' && url.pathname.startsWith('/api/devices/')) {
        const deviceId = decodeURIComponent(url.pathname.replace('/api/devices/', ''));
        const device = await this.deps.controlPlane.getDevice(deviceId);
        if (!device) {
          sendJson(res, 404, { error: 'Device not found' });
          return;
        }
        sendJson(res, 200, device);
        return;
      }

      if (method === 'GET' && url.pathname === '/api/device-states') {
        const states = await this.deps.controlPlane.listDeviceStates({
          tenant: url.searchParams.get('tenant') || undefined,
          site: url.searchParams.get('site') || undefined,
          deviceId: url.searchParams.get('deviceId') || undefined,
          limit: parseLimit(url.searchParams.get('limit')),
        });
        sendJson(res, 200, { items: states });
        return;
      }

      if (method === 'GET' && url.pathname.startsWith('/api/device-states/')) {
        const deviceId = decodeURIComponent(
          url.pathname.replace('/api/device-states/', ''),
        );
        const state = await this.deps.controlPlane.getDeviceState(deviceId);
        if (!state) {
          sendJson(res, 404, { error: 'Device state not found' });
          return;
        }
        sendJson(res, 200, state);
        return;
      }

      if (method === 'GET' && url.pathname === '/api/device-alerts') {
        const alerts = await this.deps.controlPlane.listDeviceAlerts({
          tenant: url.searchParams.get('tenant') || undefined,
          site: url.searchParams.get('site') || undefined,
          deviceId: url.searchParams.get('deviceId') || undefined,
          limit: parseLimit(url.searchParams.get('limit')),
        });
        sendJson(res, 200, { items: alerts });
        return;
      }

      if (method === 'GET' && url.pathname.startsWith('/api/commands/')) {
        const suffix = url.pathname.replace('/api/commands/', '');
        if (suffix.endsWith('/approval')) {
          const commandId = decodeURIComponent(suffix.replace('/approval', ''));
          const approval = await this.deps.controlPlane.getCommandApproval(commandId);
          if (!approval) {
            sendJson(res, 404, { error: 'Command approval not found' });
            return;
          }
          sendJson(res, 200, approval);
          return;
        }

        if (suffix.endsWith('/audits')) {
          const commandId = decodeURIComponent(suffix.replace('/audits', ''));
          const audits = await this.deps.controlPlane.listCommandAudits(commandId);
          sendJson(res, 200, { items: audits });
          return;
        }

        const commandId = decodeURIComponent(suffix);
        const command = await this.deps.controlPlane.getCommand(commandId);
        if (!command) {
          sendJson(res, 404, { error: 'Command not found' });
          return;
        }
        sendJson(res, 200, command);
        return;
      }

      if (method === 'POST' && url.pathname === '/api/commands') {
        const body = (await readJsonBody(req)) as CommandRequestBody;
        this.validateCommandBody(body);
        const result = await this.deps.controlPlane.submitCommand({
          tenant: body.tenant,
          site: body.site,
          deviceId: body.deviceId,
          commandName: body.commandName,
          payload: body.payload || {},
          requestedBy: body.requestedBy || 'http-api',
        });
        sendJson(res, 201, result);
        return;
      }

      if (method === 'POST' && url.pathname.startsWith('/api/commands/')) {
        const suffix = url.pathname.replace('/api/commands/', '');

        if (suffix.endsWith('/approve')) {
          const commandId = decodeURIComponent(suffix.replace('/approve', ''));
          const body = (await readJsonBody(req)) as ReviewCommandBody;
          const result = await this.deps.controlPlane.approveCommand(
            commandId,
            this.validateReviewBody(body),
            body.reason,
          );
          sendJson(res, 200, result);
          return;
        }

        if (suffix.endsWith('/reject')) {
          const commandId = decodeURIComponent(suffix.replace('/reject', ''));
          const body = (await readJsonBody(req)) as ReviewCommandBody;
          const result = await this.deps.controlPlane.rejectCommand(
            commandId,
            this.validateReviewBody(body),
            body.reason,
          );
          sendJson(res, 200, result);
          return;
        }

        sendJson(res, 404, { error: 'Not found' });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/mcp/tools') {
        sendJson(res, 200, { items: this.deps.mcpToolService.listTools() });
        return;
      }

      if (method === 'POST' && url.pathname === '/api/mcp/execute') {
        const body = (await readJsonBody(req)) as { name?: string; input?: Record<string, unknown> };
        if (!body?.name) {
          throw new Error('Invalid request: `name` is required');
        }
        const result = await this.deps.mcpToolService.execute(body.name, body.input || {});
        sendJson(res, 200, { tool: body.name, result });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/agent-bridge/events') {
        sendJson(res, 200, { items: await this.deps.agentBridge.listEvents() });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/jobs') {
        sendJson(res, 200, { items: await this.deps.jobService.listDefinitions() });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/job-runs') {
        const jobId = url.searchParams.get('jobId') || undefined;
        sendJson(res, 200, { items: await this.deps.jobService.listRuns(jobId) });
        return;
      }

      if (method === 'POST' && url.pathname.startsWith('/api/jobs/')) {
        const suffix = url.pathname.replace('/api/jobs/', '');
        if (!suffix.endsWith('/trigger')) {
          sendJson(res, 404, { error: 'Not found' });
          return;
        }

        const jobId = decodeURIComponent(suffix.replace('/trigger', ''));
        const job = await this.deps.jobService.trigger(jobId);
        sendJson(res, 202, { job });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/policies/commands') {
        sendJson(res, 200, this.deps.commandPolicy.getPolicySummary());
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      sendError(res, error);
    }
  }

  private validateCommandBody(body: CommandRequestBody): void {
    if (!body || typeof body !== 'object') {
      throw new Error('Invalid request: body must be a JSON object');
    }
    if (!body.tenant) throw new Error('Invalid request: `tenant` is required');
    if (!body.site) throw new Error('Invalid request: `site` is required');
    if (!body.deviceId) {
      throw new Error('Invalid request: `deviceId` is required');
    }
    if (!body.commandName) {
      throw new Error('Invalid request: `commandName` is required');
    }
  }

  private validateReviewBody(body: ReviewCommandBody): string {
    if (!body || typeof body !== 'object' || !body.reviewedBy?.trim()) {
      throw new Error('Invalid request: `reviewedBy` is required');
    }
    return body.reviewedBy.trim();
  }

  private validateServerSettingsBody(body: UpdateServerSettingsBody) {
    if (!body || typeof body !== 'object') {
      throw new Error('Invalid request: body must be a JSON object');
    }

    return {
      serviceName: this.asOptionalTrimmedString(body.serviceName),
      uiTitle: this.asOptionalTrimmedString(body.uiTitle),
      defaultTenant: this.asOptionalTrimmedString(body.defaultTenant),
      defaultSite: this.asOptionalTrimmedString(body.defaultSite),
      adminDisplayName: this.asOptionalTrimmedString(body.adminDisplayName),
      apiToken:
        body.apiToken === undefined ? undefined : body.apiToken === null ? null : String(body.apiToken),
    };
  }

  private validateMqttSettingsBody(body: UpdateMqttSettingsBody) {
    if (!body || typeof body !== 'object') {
      throw new Error('Invalid request: body must be a JSON object');
    }

    return {
      brokerUrl: this.asOptionalTrimmedString(body.brokerUrl),
      clientId: this.asOptionalTrimmedString(body.clientId),
      username:
        body.username === undefined ? undefined : this.asOptionalTrimmedString(body.username) || null,
      password:
        body.password === undefined ? undefined : this.asOptionalTrimmedString(body.password) || null,
      topicFilter: this.asOptionalTrimmedString(body.topicFilter),
      commandTopicTemplate: this.asOptionalTrimmedString(body.commandTopicTemplate),
      keepaliveSeconds:
        body.keepaliveSeconds === undefined
          ? undefined
          : this.asPositiveNumber(body.keepaliveSeconds, 'keepaliveSeconds'),
      tlsEnabled: body.tlsEnabled === undefined ? undefined : Boolean(body.tlsEnabled),
      enabled: body.enabled === undefined ? undefined : Boolean(body.enabled),
    };
  }

  private validateCreateDeviceBody(body: CreateDeviceBody) {
    if (!body || typeof body !== 'object') {
      throw new Error('Invalid request: body must be a JSON object');
    }

    return {
      deviceId: this.asRequiredTrimmedString(body.deviceId, 'deviceId'),
      tenant: this.asRequiredTrimmedString(body.tenant, 'tenant'),
      site: this.asRequiredTrimmedString(body.site, 'site'),
      name: this.asOptionalTrimmedString(body.name),
      productType: this.asOptionalTrimmedString(body.productType),
      metadata: this.asObject(body.metadata, 'metadata'),
    };
  }

  private async authorizePluginRequest(req: IncomingMessage): Promise<void> {
    const configuredToken = await this.deps.controlPlane.getServerApiToken();
    if (!configuredToken) {
      return;
    }

    const bearerToken = readBearerToken(req);
    if (!bearerToken || bearerToken !== configuredToken) {
      throw new Error('Unauthorized: valid Bearer token is required for plugin API');
    }
  }

  private asRequiredTrimmedString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Invalid request: \`${field}\` is required`);
    }
    return value.trim();
  }

  private asOptionalTrimmedString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private asPositiveNumber(value: unknown, field: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`Invalid request: \`${field}\` must be a positive number`);
    }
    return parsed;
  }

  private asObject(value: unknown, field: string): Record<string, unknown> {
    if (value === undefined || value === null || value === '') {
      return {};
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Invalid request: \`${field}\` must be an object`);
    }

    return value as Record<string, unknown>;
  }
}
