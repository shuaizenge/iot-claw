import { AgentBridgeEventRecord } from '../types.js';

export interface AgentRuntimeAdapter {
  readonly runtimeName: 'disabled' | 'openclaw';
  isEnabled(): boolean;
  dispatch(event: AgentBridgeEventRecord): Promise<void>;
}

export class DisabledRuntimeAdapter implements AgentRuntimeAdapter {
  readonly runtimeName = 'disabled' as const;

  isEnabled(): boolean {
    return false;
  }

  async dispatch(): Promise<void> {
    throw new Error('Agent runtime is disabled');
  }
}
