import { CronExpressionParser } from 'cron-parser';

import { AgentBridgeService } from '../bridge/agent-bridge-service.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { PostgresService } from '../services/postgres.js';
import { JobDefinitionRecord } from '../types.js';

const DEFAULT_JOBS: JobDefinitionRecord[] = [
  {
    id: 'daily-site-health-report',
    name: 'Daily Site Health Report',
    description: 'Generate a daily site-level health summary for agent review.',
    schedule: '0 8 * * *',
    enabled: true,
    kind: 'report',
  },
  {
    id: 'daily-offline-device-inspection',
    name: 'Daily Offline Device Inspection',
    description: 'Inspect devices that stayed offline longer than the threshold.',
    schedule: '0 9 * * *',
    enabled: true,
    kind: 'inspection',
  },
  {
    id: 'hourly-alert-summary',
    name: 'Hourly Alert Summary',
    description: 'Summarize open alerts and dispatch them to the agent bridge.',
    schedule: '0 * * * *',
    enabled: true,
    kind: 'alert-summary',
  },
];

export class JobService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly postgres: PostgresService,
    private readonly agentBridge: AgentBridgeService,
  ) {}

  async start(): Promise<void> {
    await this.seedDefinitions();
    await this.runDueJobs();
    this.timer = setInterval(() => {
      void this.runDueJobs();
    }, config.JOB_SCHEDULER_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async listDefinitions(): Promise<JobDefinitionRecord[]> {
    return this.postgres.listJobDefinitions();
  }

  async listRuns(jobId?: string) {
    return this.postgres.listJobRuns(jobId);
  }

  async trigger(jobId: string): Promise<JobDefinitionRecord> {
    const jobs = await this.postgres.listJobDefinitions();
    const job = jobs.find((item) => item.id === jobId);
    if (!job) {
      throw new Error(`Invalid request: unknown job \`${jobId}\``);
    }

    await this.executeJob(job);
    const refreshed = await this.postgres.listJobDefinitions();
    return refreshed.find((item) => item.id === jobId) || job;
  }

  private async seedDefinitions(): Promise<void> {
    const existing = await this.postgres.listJobDefinitions();
    const byId = new Map(existing.map((job) => [job.id, job]));

    for (const defaultJob of DEFAULT_JOBS) {
      const current = byId.get(defaultJob.id);
      const nextRunAt = current?.nextRunAt || this.computeNextRun(defaultJob.schedule);
      await this.postgres.upsertJobDefinition({
        ...defaultJob,
        nextRunAt,
        lastRunAt: current?.lastRunAt || null,
      });
    }
  }

  private async runDueJobs(): Promise<void> {
    const jobs = await this.postgres.listJobDefinitions();
    const now = Date.now();

    for (const job of jobs) {
      if (!job.enabled || !job.nextRunAt) continue;
      if (new Date(job.nextRunAt).getTime() > now) continue;
      await this.executeJob(job);
    }
  }

  private async executeJob(job: JobDefinitionRecord): Promise<void> {
    const startedAt = new Date().toISOString();
    const runId = await this.postgres.createJobRun(job.id, startedAt);

    try {
      const bridgeEvent = await this.agentBridge.publishJob(job);
      const nextRunAt = this.computeNextRun(job.schedule);

      await this.postgres.updateJobSchedule(job.id, nextRunAt, startedAt);
      await this.postgres.finishJobRun(runId, 'success', {
        bridgeEventId: bridgeEvent.id,
        triggeredAt: startedAt,
        nextRunAt,
      });

      logger.info({ jobId: job.id, runId, bridgeEventId: bridgeEvent.id }, 'Scheduled job executed');
    } catch (error) {
      await this.postgres.finishJobRun(runId, 'failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      logger.error({ err: error, jobId: job.id, runId }, 'Scheduled job failed');
    }
  }

  private computeNextRun(schedule: string): string {
    const interval = CronExpressionParser.parse(schedule);
    return interval.next().toISOString();
  }
}
