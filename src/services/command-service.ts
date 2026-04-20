import { randomUUID } from 'crypto';

import { logger } from '../logger.js';
import { DeviceCommandInput, PublishCommandInput } from '../types.js';
import { MqttService } from './mqtt-service.js';
import { PostgresService } from './postgres.js';

export class CommandService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly mqtt: MqttService,
  ) {}

  async createCommandRecord(
    input: PublishCommandInput,
    status: DeviceCommandInput['status'],
  ): Promise<string> {
    const commandId = randomUUID();
    const record: DeviceCommandInput = {
      commandId,
      deviceId: input.deviceId,
      tenant: input.tenant,
      site: input.site,
      commandName: input.commandName,
      payload: input.payload,
      requestedBy: input.requestedBy,
      requestedAt: new Date().toISOString(),
      status,
    };

    await this.postgres.upsertDevice({
      deviceId: input.deviceId,
      tenant: input.tenant,
      site: input.site,
      status: 'unknown',
    });
    await this.postgres.upsertCommand(record);

    return commandId;
  }

  async dispatchCommand(commandId: string): Promise<void> {
    const command = await this.postgres.getCommand(commandId);
    if (!command) {
      throw new Error(`Invalid request: command \`${commandId}\` not found`);
    }

    const mqttSettings = await this.postgres.getMqttSettings();
    const topic = mqttSettings.commandTopicTemplate
      .replace('{tenant}', command.tenant)
      .replace('{site}', command.site)
      .replace('{deviceId}', command.deviceId);

    await this.postgres.upsertCommand({
      commandId: command.commandId,
      deviceId: command.deviceId,
      tenant: command.tenant,
      site: command.site,
      commandName: command.commandName,
      payload: command.payload,
      requestedBy: command.requestedBy,
      requestedAt: command.requestedAt,
      status: 'pending',
    });

    await this.mqtt.publish(topic, {
      protocolVersion: '1.0',
      messageId: randomUUID(),
      commandId,
      commandName: command.commandName,
      tenant: command.tenant,
      site: command.site,
      deviceId: command.deviceId,
      requestedBy: command.requestedBy,
      timeoutMs: 10000,
      requiresAck: true,
      payload: command.payload,
      ts: command.requestedAt,
    });

    logger.info({ commandId, topic, deviceId: command.deviceId }, 'Command published');
  }

  async publishSafeCommand(input: PublishCommandInput): Promise<string> {
    const commandId = await this.createCommandRecord(input, 'pending');
    await this.dispatchCommand(commandId);
    return commandId;
  }
}
