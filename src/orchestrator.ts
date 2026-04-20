import { AgentBridgeService } from './bridge/agent-bridge-service.js';
import { OpenclawDispatcher } from './bridge/openclaw-dispatcher.js';
import { DisabledRuntimeAdapter } from './bridge/runtime-adapter.js';
import { config } from './config.js';
import { HttpServer } from './http/http-server.js';
import { JobService } from './jobs/job-service.js';
import { logger } from './logger.js';
import { McpToolService } from './mcp/tool-service.js';
import { CommandPolicyService } from './policy/command-policy-service.js';
import { CommandService } from './services/command-service.js';
import { ControlPlaneService } from './services/control-plane-service.js';
import { DeviceEventService } from './services/device-event-service.js';
import { InfluxService } from './services/influx-service.js';
import { MqttService } from './services/mqtt-service.js';
import { PostgresService } from './services/postgres.js';

export class Orchestrator {
  private readonly postgres = new PostgresService(config.POSTGRES_URL);
  private readonly runtimeAdapter = this.createRuntimeAdapter();
  private readonly agentBridge = new AgentBridgeService(
    this.postgres,
    this.runtimeAdapter,
  );
  private readonly commandPolicy = new CommandPolicyService();
  private readonly influx = new InfluxService(
    config.INFLUXDB_URL,
    config.INFLUXDB_TOKEN,
    config.INFLUXDB_ORG,
    config.INFLUXDB_BUCKET,
  );
  private readonly deviceEvents = new DeviceEventService(
    this.postgres,
    this.influx,
    this.agentBridge,
  );
  private readonly mqtt = new MqttService(
    config.MQTT_URL,
    {
      clientId: config.MQTT_CLIENT_ID,
      username: config.MQTT_USERNAME,
      password: config.MQTT_PASSWORD,
      keepalive: config.MQTT_KEEPALIVE_SECONDS,
    },
    config.MQTT_TOPIC_FILTER,
    async (message) => this.deviceEvents.handle(message),
  );
  readonly commandService = new CommandService(this.postgres, this.mqtt);
  private readonly controlPlane = new ControlPlaneService(
    this.postgres,
    this.commandService,
    this.commandPolicy,
    {
      getMqttRuntimeStatus: () => this.mqtt.getRuntimeStatus(),
      applyMqttSettings: async (input) => {
        await this.mqtt.applySettings({
          url: input.brokerUrl,
          options: {
            clientId: input.clientId,
            username: input.username || undefined,
            password: input.password || undefined,
            keepalive: input.keepaliveSeconds,
          },
          topicFilter: input.topicFilter,
          enabled: input.enabled,
        });
      },
      getAgentRuntimeName: () => this.runtimeAdapter.runtimeName,
      influx: this.influx,
    },
  );
  private readonly mcpTools = new McpToolService(this.controlPlane);
  private readonly jobs = new JobService(this.postgres, this.agentBridge);
  private readonly httpServer = new HttpServer({
    host: config.HTTP_HOST,
    port: config.HTTP_PORT,
    controlPlane: this.controlPlane,
    mcpToolService: this.mcpTools,
    agentBridge: this.agentBridge,
    jobService: this.jobs,
    commandPolicy: this.commandPolicy,
  });

  async start(): Promise<void> {
    logger.info(
      { service: config.SERVICE_NAME, agentRuntime: this.runtimeAdapter.runtimeName },
      'Starting orchestrator',
    );
    await this.postgres.connect();
    await this.postgres.initSchema();
    await this.postgres.bootstrapControlPlaneDefaults({
      serviceName: config.SERVICE_NAME,
      defaultTenant: config.DEFAULT_TENANT,
      defaultSite: config.DEFAULT_SITE,
      mqtt: {
        brokerUrl: config.MQTT_URL,
        clientId: config.MQTT_CLIENT_ID,
        username: config.MQTT_USERNAME,
        password: config.MQTT_PASSWORD,
        topicFilter: config.MQTT_TOPIC_FILTER,
        commandTopicTemplate: config.MQTT_COMMAND_TOPIC_TEMPLATE,
        keepaliveSeconds: config.MQTT_KEEPALIVE_SECONDS,
        tlsEnabled: config.MQTT_TLS_ENABLED,
        enabled: true,
      },
    });
    const mqttSettings = await this.postgres.getMqttRuntimeSettings();
    await this.mqtt.applySettings({
      url: mqttSettings.brokerUrl,
      options: {
        clientId: mqttSettings.clientId,
        username: mqttSettings.username || undefined,
        password: mqttSettings.password || undefined,
        keepalive: mqttSettings.keepaliveSeconds,
      },
      topicFilter: mqttSettings.topicFilter,
      enabled: mqttSettings.enabled,
    });
    await this.mqtt.start();
    await this.agentBridge.start();
    await this.jobs.start();
    await this.httpServer.start();
    logger.info(
      {
        host: config.HTTP_HOST,
        port: config.HTTP_PORT,
        agentRuntime: this.runtimeAdapter.runtimeName,
      },
      'Orchestrator started',
    );
  }

  async stop(): Promise<void> {
    logger.info('Stopping orchestrator');
    await this.httpServer.stop();
    await this.jobs.stop();
    await this.agentBridge.stop();
    await this.mqtt.stop();
    await this.influx.close();
    await this.postgres.close();
    logger.info('Orchestrator stopped');
  }

  private createRuntimeAdapter() {
    switch (config.AGENT_RUNTIME) {
      case 'openclaw':
        return new OpenclawDispatcher();
      default:
        return new DisabledRuntimeAdapter();
    }
  }
}
