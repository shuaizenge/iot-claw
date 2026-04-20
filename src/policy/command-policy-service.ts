import { config } from '../config.js';
import { CommandLevel, PublishCommandInput } from '../types.js';

export class CommandPolicyService {
  private readonly safeWriteCommands = new Set(
    config.SAFE_WRITE_COMMANDS.split(',').map((item) => item.trim()).filter(Boolean),
  );

  private readonly dangerousWriteCommands = new Set(
    config.DANGEROUS_WRITE_COMMANDS.split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

  classifyCommand(commandName: string): CommandLevel {
    if (this.dangerousWriteCommands.has(commandName)) return 'dangerous-write';
    if (this.safeWriteCommands.has(commandName)) return 'safe-write';
    return 'read';
  }

  getPolicySummary(): {
    safeWriteCommands: string[];
    dangerousWriteCommands: string[];
  } {
    return {
      safeWriteCommands: Array.from(this.safeWriteCommands).sort(),
      dangerousWriteCommands: Array.from(this.dangerousWriteCommands).sort(),
    };
  }

  validateRequest(input: PublishCommandInput): CommandLevel {
    if (!input.requestedBy.trim()) {
      throw new Error('Invalid request: `requestedBy` is required');
    }

    if (!input.commandName.trim()) {
      throw new Error('Invalid request: `commandName` is required');
    }

    return this.classifyCommand(input.commandName);
  }

  requiresApproval(level: CommandLevel): boolean {
    return level === 'dangerous-write';
  }
}
