import { randomUUID } from 'crypto';

import WebSocket from 'ws';

import { config } from '../config.js';
import { logger } from '../logger.js';
import { AgentBridgeEventRecord } from '../types.js';
import {
  buildDeviceAuthPayload,
  loadDeviceToken,
  loadOrCreateDeviceIdentity,
  publicKeyRawBase64UrlFromPem,
  signDevicePayload,
  storeDeviceToken,
} from './openclaw-device-auth.js';
import { AgentRuntimeAdapter } from './runtime-adapter.js';

const ALLOWED_OPENCLAW_CLIENT_IDS = new Set([
  'webchat-ui',
  'openclaw-control-ui',
  'webchat',
  'cli',
  'gateway-client',
  'openclaw-macos',
  'openclaw-ios',
  'openclaw-android',
  'node-host',
  'test',
  'fingerprint',
  'openclaw-probe',
]);

type GatewayResponse = {
  type?: string;
  id?: string;
  ok?: boolean;
  payload?: Record<string, unknown>;
  error?: { message?: string };
  event?: string;
  meta?: Record<string, unknown>;
};

export class OpenclawDispatcher implements AgentRuntimeAdapter {
  readonly runtimeName = 'openclaw' as const;
  private readonly deviceIdentity = loadOrCreateDeviceIdentity();

  isEnabled(): boolean {
    return (
      config.AGENT_RUNTIME === 'openclaw' &&
      Boolean(config.OPENCLAW_GATEWAY_URL && config.OPENCLAW_GATEWAY_TOKEN)
    );
  }

  async dispatch(event: AgentBridgeEventRecord): Promise<void> {
    if (!this.isEnabled()) {
      throw new Error('OpenClaw dispatcher is not configured');
    }

    const ws = await this.openSocket(config.OPENCLAW_GATEWAY_URL as string);
    try {
      await this.connect(ws);
      await this.sendAgentRun(ws, event);
    } finally {
      ws.close();
    }
  }

  private async openSocket(url: string): Promise<WebSocket> {
    return await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(url);
      const cleanup = () => {
        ws.off('open', onOpen);
        ws.off('error', onError);
      };
      const onOpen = () => {
        cleanup();
        resolve(ws);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      ws.once('open', onOpen);
      ws.once('error', onError);
    });
  }

  private async connect(ws: WebSocket): Promise<void> {
    const challenge = await this.waitForMessage(
      ws,
      (message) => message.type === 'event' && message.event === 'connect.challenge',
      10000,
    );

    const nonce =
      typeof challenge.payload?.nonce === 'string' && challenge.payload.nonce.trim()
        ? challenge.payload.nonce.trim()
        : undefined;
    if (!nonce) {
      throw new Error('OpenClaw connect challenge missing nonce');
    }

    const requestedScopes = ['operator.read', 'operator.write'];
    const storedToken = loadDeviceToken(this.deviceIdentity.deviceId, 'operator');
    const signedAtMs = Date.now();
    const signatureToken = storedToken?.token || config.OPENCLAW_GATEWAY_TOKEN;
    const payload = buildDeviceAuthPayload({
      deviceId: this.deviceIdentity.deviceId,
      clientId: this.resolveClientId(),
      clientMode: 'backend',
      role: 'operator',
      scopes: requestedScopes,
      signedAtMs,
      token: signatureToken || null,
      nonce,
    });

    const id = randomUUID();

    ws.send(
      JSON.stringify({
        type: 'req',
        id,
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
            client: {
              id: this.resolveClientId(),
              version: 'iot-claw-0.0.5',
              platform: process.platform,
              mode: 'backend',
            },
          caps: [],
          commands: [],
          role: 'operator',
          scopes: requestedScopes,
          auth: {
            token: config.OPENCLAW_GATEWAY_TOKEN,
            deviceToken: storedToken?.token,
          },
          device: {
            id: this.deviceIdentity.deviceId,
            publicKey: publicKeyRawBase64UrlFromPem(this.deviceIdentity.publicKeyPem),
            signature: signDevicePayload(this.deviceIdentity.privateKeyPem, payload),
            signedAt: signedAtMs,
            nonce,
          },
        },
      }),
    );

    const response = await this.waitForMessage(
      ws,
      (message) => message.type === 'res' && message.id === id,
      10000,
    );

    if (!response.ok) {
      throw new Error(response.error?.message || 'OpenClaw connect failed');
    }

    const auth = response.payload?.auth as
      | { deviceToken?: unknown; role?: unknown; scopes?: unknown }
      | undefined;
    if (typeof auth?.deviceToken === 'string' && auth.deviceToken.trim()) {
      storeDeviceToken({
        deviceId: this.deviceIdentity.deviceId,
        role: typeof auth.role === 'string' && auth.role.trim() ? auth.role.trim() : 'operator',
        token: auth.deviceToken.trim(),
        scopes: Array.isArray(auth.scopes)
          ? auth.scopes.filter((item): item is string => typeof item === 'string')
          : [],
      });
      logger.info(
        {
          deviceId: this.deviceIdentity.deviceId,
          scopes: Array.isArray(auth.scopes) ? auth.scopes : [],
        },
        'Stored OpenClaw device token for bridge runtime',
      );
    }
  }

  private resolveClientId(): string {
    const configured = config.OPENCLAW_CLIENT_ID.trim().toLowerCase();
    if (ALLOWED_OPENCLAW_CLIENT_IDS.has(configured)) {
      return configured;
    }

    logger.warn(
      {
        configuredClientId: config.OPENCLAW_CLIENT_ID,
        fallbackClientId: 'gateway-client',
      },
      'Unsupported OpenClaw client id configured, falling back to gateway-client',
    );
    return 'gateway-client';
  }

  private async sendAgentRun(ws: WebSocket, event: AgentBridgeEventRecord): Promise<void> {
    const id = randomUUID();
    ws.send(
      JSON.stringify({
        type: 'req',
        id,
        method: 'agent',
        params: {
          message: this.renderPrompt(event),
          agentId: config.OPENCLAW_AGENT_ID,
          sessionKey: config.OPENCLAW_SESSION_KEY,
          idempotencyKey: `iot-claw-${event.id}`,
          timeout: 120000,
          label: `iot-claw:${event.source}`,
        },
      }),
    );

    const response = await this.waitForMessage(
      ws,
      (message) => message.type === 'res' && message.id === id,
      120000,
    );

    if (!response.ok) {
      throw new Error(response.error?.message || 'OpenClaw agent dispatch failed');
    }
  }

  private renderPrompt(event: AgentBridgeEventRecord): string {
    return [
      'You are receiving an iot-claw control-plane event from the host.',
      `Source: ${event.source}`,
      `Level: ${event.level}`,
      `Tenant: ${event.tenant}`,
      `Site: ${event.site}`,
      `Device: ${event.deviceId || 'N/A'}`,
      `Title: ${event.title}`,
      `Summary: ${event.summary}`,
      `Payload: ${JSON.stringify(event.payload)}`,
      'Analyze the event, decide whether follow-up action is needed, and produce a concise operations summary.',
    ].join('\n');
  }

  private async waitForMessage(
    ws: WebSocket,
    predicate: (message: GatewayResponse) => boolean,
    timeoutMs: number,
  ): Promise<GatewayResponse> {
    return await new Promise<GatewayResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for OpenClaw gateway response'));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        ws.off('message', onMessage);
        ws.off('error', onError);
        ws.off('close', onClose);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onClose = () => {
        cleanup();
        reject(new Error('OpenClaw gateway connection closed unexpectedly'));
      };

      const onMessage = (data: WebSocket.RawData) => {
        try {
          const text = typeof data === 'string' ? data : data.toString('utf-8');
          const message = JSON.parse(text) as GatewayResponse;
          if (!predicate(message)) return;
          cleanup();
          resolve(message);
        } catch (error) {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };

      ws.on('message', onMessage);
      ws.once('error', onError);
      ws.once('close', onClose);
    });
  }
}
