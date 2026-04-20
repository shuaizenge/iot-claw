import { randomUUID } from 'crypto';

import { config } from '../config.js';
import { logger } from '../logger.js';
import { PostgresService } from '../services/postgres.js';
import { AgentBridgeEventRecord, DeviceAlertRecord, JobDefinitionRecord } from '../types.js';
import { AgentRuntimeAdapter } from './runtime-adapter.js';

export class AgentBridgeService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly postgres: PostgresService,
    private readonly dispatcher: AgentRuntimeAdapter,
  ) {}

  async start(): Promise<void> {
    await this.dispatchPendingEvents();
    this.timer = setInterval(() => {
      void this.dispatchPendingEvents();
    }, config.AGENT_BRIDGE_DISPATCH_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async publishAlert(alert: DeviceAlertRecord): Promise<AgentBridgeEventRecord> {
    const event: AgentBridgeEventRecord = {
      id: randomUUID(),
      source: 'alert',
      level: alert.level,
      tenant: alert.tenant,
      site: alert.site,
      deviceId: alert.deviceId,
      title: alert.title,
      summary: alert.message,
      status: 'pending',
      createdAt: new Date().toISOString(),
      payload: {
        alertId: alert.id,
        eventType: alert.eventType,
        payload: alert.payload,
      },
    };

    await this.postgres.createAgentBridgeEvent(event);
    return event;
  }

  async publishJob(job: JobDefinitionRecord): Promise<AgentBridgeEventRecord> {
    const event: AgentBridgeEventRecord = {
      id: randomUUID(),
      source: 'job',
      level: 'info',
      tenant: 'system',
      site: 'system',
      title: job.name,
      summary: job.description,
      status: 'pending',
      createdAt: new Date().toISOString(),
      payload: { jobId: job.id, schedule: job.schedule, kind: job.kind },
    };

    await this.postgres.createAgentBridgeEvent(event);
    return event;
  }

  async listEvents(): Promise<AgentBridgeEventRecord[]> {
    return this.postgres.listAgentBridgeEvents();
  }

  private async dispatchPendingEvents(): Promise<void> {
    if (!this.dispatcher.isEnabled()) return;

    const pendingEvents = await this.postgres.listAgentBridgeEvents('pending');
    for (const event of pendingEvents) {
      try {
        await this.dispatcher.dispatch(event);
        await this.postgres.markAgentBridgeEventDispatched(event.id);
        logger.info(
          {
            bridgeEventId: event.id,
            source: event.source,
            runtime: this.dispatcher.runtimeName,
          },
          'Dispatched event to agent runtime',
        );
      } catch (error) {
        logger.error(
          { err: error, bridgeEventId: event.id, runtime: this.dispatcher.runtimeName },
          'Failed to dispatch event to agent runtime',
        );
      }
    }
  }
}
