/**
 * IoT-Claw 协议 1.0 端到端模拟器（设备侧行为 + 控制面 HTTP 校验）。
 *
 * 职责概要：
 * - 连接 MQTT，按约定 Topic 发布注册、上线、能力、状态、遥测、事件等消息；
 * - 订阅下行 `command/req`，模拟设备 ACK / Result 流程；
 * - 通过 HTTP 轮询控制面 API，确认设备入库、状态、能力同步及指令闭环。
 *
 * 运行方式见 `printHelp()` 或 package.json 中的 `test:protocol-v1` 脚本。
 */
import { randomUUID } from 'crypto';

import mqtt, { MqttClient } from 'mqtt';

/** 命令行与环境变量解析后的运行配置 */
interface CliOptions {
  /** MQTT Broker 地址，如 mqtt://127.0.0.1:1883 */
  mqttUrl: string;
  /** 控制面 HTTP API 根地址，用于轮询设备/指令状态 */
  httpBaseUrl: string;
  /** 租户标识，参与 Topic 与 API 请求体 */
  tenant: string;
  /** 站点标识 */
  site: string;
  /** 设备唯一 ID，与 Topic 路径一致 */
  deviceId: string;
  /** MQTT 认证用户名（可选） */
  username?: string;
  /** MQTT 认证密码（可选） */
  password?: string;
  /** 遥测上报条数（循环次数） */
  telemetryCount: number;
  /** 相邻两次遥测之间的间隔（毫秒） */
  telemetryIntervalMs: number;
  /** 等待指令被设备处理、HTTP 状态变为终态的超时（毫秒） */
  commandTimeoutMs: number;
}

/**
 * 下行 command/req 的 JSON 载荷形状（与协议字段对齐，字段多为可选以兼容解析）。
 * 模拟器在收到消息后会校验 protocolVersion、commandId、commandName。
 */
interface CommandRequestPayload {
  protocolVersion?: string;
  messageId?: string;
  ts?: string;
  tenant?: string;
  site?: string;
  deviceId?: string;
  commandId?: string;
  commandName?: string;
  payload?: Record<string, unknown>;
}

/**
 * 解析 `process.argv` 与环境变量，合并为 `CliOptions`。
 * 优先级：命令行参数覆盖环境变量默认值。
 */
function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    mqttUrl: process.env.MQTT_URL || 'mqtt://127.0.0.1:1883',
    httpBaseUrl: process.env.HTTP_BASE_URL || 'http://127.0.0.1:8080',
    tenant: process.env.TEST_TENANT || 'demo-tenant',
    site: process.env.TEST_SITE || 'site-a',
    deviceId: process.env.TEST_DEVICE_ID || 'protocol-v1-001',
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    telemetryCount: Number(process.env.TEST_MESSAGE_COUNT || 3),
    telemetryIntervalMs: Number(process.env.TEST_INTERVAL_MS || 800),
    commandTimeoutMs: Number(process.env.TEST_COMMAND_TIMEOUT_MS || 12000),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      case '--mqtt-url':
        options.mqttUrl = next;
        index += 1;
        break;
      case '--http-base-url':
        options.httpBaseUrl = next;
        index += 1;
        break;
      case '--tenant':
        options.tenant = next;
        index += 1;
        break;
      case '--site':
        options.site = next;
        index += 1;
        break;
      case '--device':
        options.deviceId = next;
        index += 1;
        break;
      case '--username':
        options.username = next;
        index += 1;
        break;
      case '--password':
        options.password = next;
        index += 1;
        break;
      case '--telemetry-count':
        options.telemetryCount = Number(next);
        index += 1;
        break;
      case '--telemetry-interval-ms':
        options.telemetryIntervalMs = Number(next);
        index += 1;
        break;
      case '--command-timeout-ms':
        options.commandTimeoutMs = Number(next);
        index += 1;
        break;
      default:
        // 非选项参数（不以 - 开头）忽略；未知选项则抛错
        if (arg.startsWith('-')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  if (!Number.isFinite(options.telemetryCount) || options.telemetryCount <= 0) {
    throw new Error('`telemetry-count` must be a positive number');
  }
  if (
    !Number.isFinite(options.telemetryIntervalMs) ||
    options.telemetryIntervalMs <= 0
  ) {
    throw new Error('`telemetry-interval-ms` must be a positive number');
  }
  if (!Number.isFinite(options.commandTimeoutMs) || options.commandTimeoutMs <= 0) {
    throw new Error('`command-timeout-ms` must be a positive number');
  }

  return options;
}

/** 打印 CLI 用法并退出（由 --help 触发） */
function printHelp(): void {
  console.log(`Usage: npm run test:protocol-v1 -- [options]

Options:
  --mqtt-url <url>               MQTT broker URL
  --http-base-url <url>          HTTP API base URL
  --tenant <tenant>              Tenant name
  --site <site>                  Site name
  --device <device-id>           Device ID
  --username <username>          MQTT username
  --password <password>          MQTT password
  --telemetry-count <number>     Number of telemetry reports
  --telemetry-interval-ms <ms>   Interval between telemetry reports
  --command-timeout-ms <ms>      Command round-trip timeout
`);
}

/**
 * 协议规定的设备 Topic 根路径：
 * iot/{tenant}/{site}/{deviceId}
 */
function topicBase(options: CliOptions): string {
  return `iot/${options.tenant}/${options.site}/${options.deviceId}`;
}

/**
 * 构造各条 MQTT 消息共用的信封字段（协议版本、消息 ID、时间戳、租户上下文、链路 trace）。
 */
function buildEnvelope(options: CliOptions) {
  return {
    protocolVersion: '1.0',
    messageId: randomUUID(),
    ts: new Date().toISOString(),
    tenant: options.tenant,
    site: options.site,
    deviceId: options.deviceId,
    traceId: randomUUID(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 等待 MQTT 客户端首次 `connect` 或 `error`（二选一）。
 * 用于在 subscribe/publish 之前确保链路已建立。
 */
async function waitForConnect(client: MqttClient): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    client.once('connect', () => resolve());
    client.once('error', reject);
  });
}

/** 订阅指定 Topic，QoS 1，失败则 Promise reject */
async function subscribe(client: MqttClient, topic: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    client.subscribe(topic, { qos: 1 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** 发布 JSON 载荷到 Topic，QoS 1 */
async function publish(
  client: MqttClient,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** 优雅断开 MQTT（不强制丢弃队列，由 mqtt.js 默认行为配合） */
async function endClient(client: MqttClient): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    client.end(false, {}, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * 发起 HTTP 请求并解析 JSON；非 2xx 时抛出带状态码的 Error。
 * 自动设置 Content-Type: application/json，可与 init.headers 合并。
 */
async function httpJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
  }

  return (await response.json()) as T;
}

/**
 * 轮询式等待：周期性执行 `action()`，直到 `predicate` 为真或超时。
 * 用于控制面 eventual consistency：设备/状态可能晚于 MQTT 上报才可见。
 *
 * @param label - 超时错误信息中的描述
 * @param action - 每次轮询执行的异步操作（如 GET API）
 * @param predicate - 判断何时停止等待
 * @param timeoutMs - 最长等待时间
 * @param intervalMs - 两次尝试之间的间隔
 */
async function waitForCondition<T>(
  label: string,
  action: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 10000,
  intervalMs = 500,
): Promise<T> {
  const startedAt = Date.now();
  let lastValue: T | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await action();
    if (predicate(lastValue)) {
      return lastValue;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out while waiting for ${label}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const base = topicBase(options);

  // 指令相关 Topic：平台下发 req，设备回复 ack / result
  const commandReqTopic = `${base}/command/req`;
  const commandAckTopic = `${base}/command/ack`;
  const commandResultTopic = `${base}/command/result`;

  const client = mqtt.connect(options.mqttUrl, {
    // clientId 带时间戳，避免多次运行与 Broker 上旧会话冲突
    clientId: `iot-claw-protocol-v1-${options.deviceId}-${Date.now()}`,
    username: options.username,
    password: options.password,
  });

  /** 最近一次成功处理的 commandId，供与 HTTP 提交的指令对齐校验 */
  let handledCommandId: string | null = null;

  client.on('reconnect', () => {
    console.log('[protocol-v1-test] reconnecting...');
  });

  client.on('error', (error) => {
    console.error('[protocol-v1-test] mqtt error:', error);
  });

  await waitForConnect(client);
  console.log(`[protocol-v1-test] connected to ${options.mqttUrl}`);

  await subscribe(client, commandReqTopic);
  console.log(`[protocol-v1-test] subscribed to ${commandReqTopic}`);

  // 下行指令：异步处理，避免阻塞 message 回调；错误仅打日志不退出进程
  client.on('message', (topic, buffer) => {
    if (topic !== commandReqTopic) {
      return;
    }

    void (async () => {
      const payload = JSON.parse(buffer.toString('utf-8')) as CommandRequestPayload;

      if (payload.protocolVersion !== '1.0') {
        throw new Error('Command request did not include protocolVersion=1.0');
      }
      if (!payload.commandId || !payload.commandName) {
        throw new Error('Command request missing commandId or commandName');
      }

      handledCommandId = payload.commandId;
      console.log(
        `[protocol-v1-test] received command ${payload.commandName} (${payload.commandId})`,
      );

      // 先 ACK，表示设备已接受指令（平台可据此更新中间状态）
      await publish(client, commandAckTopic, {
        ...buildEnvelope(options),
        commandId: payload.commandId,
        status: 'accepted',
        detail: 'protocol 1.0 simulator accepted command',
      });

      // 短暂延迟，模拟执行耗时
      await sleep(300);

      // 再上报最终结果与业务 result 载荷
      await publish(client, commandResultTopic, {
        ...buildEnvelope(options),
        commandId: payload.commandId,
        status: 'succeeded',
        detail: 'protocol 1.0 simulator executed command',
        result: {
          simulated: true,
          echoedPayload: payload.payload || {},
        },
      });
    })().catch((error) => {
      console.error('[protocol-v1-test] failed to handle command:', error);
    });
  });

  // --- 生命周期与模型上报（顺序与真实设备类似：先注册再上线） ---

  await publish(client, `${base}/lifecycle/register`, {
    ...buildEnvelope(options),
    name: 'Protocol 1.0 Simulator',
    productType: 'simulator',
    firmwareVersion: '1.0.0-test',
    hardwareVersion: 'virtual',
    manufacturer: 'iot-claw',
    capabilityVersion: '1.0',
    metadata: {
      mode: 'protocol-test',
      runtime: 'nodejs',
    },
  });

  await publish(client, `${base}/lifecycle/online`, {
    ...buildEnvelope(options),
    sessionId: randomUUID(),
    ip: '127.0.0.1',
    reason: 'mqtt_connected',
  });

  await publish(client, `${base}/capabilities/report`, {
    ...buildEnvelope(options),
    capabilities: [
      {
        capability: 'switch',
        displayName: 'Main Relay',
        properties: ['power'],
      },
      {
        capability: 'environment',
        displayName: 'Environment',
        properties: ['temperature', 'humidity'],
      },
    ],
    actions: [
      {
        actionName: 'restart',
        commandName: 'restart',
      },
      {
        actionName: 'turn_on',
        commandName: 'set_power',
      },
    ],
  });

  await publish(client, `${base}/state/report`, {
    ...buildEnvelope(options),
    status: 'online',
    online: true,
    summary: 'Protocol 1.0 simulator is ready',
    attributes: {
      power: 'off',
      mode: 'simulation',
    },
  });

  // 遥测：多条间隔发送，metrics 随 index 变化便于观察时序
  for (let index = 0; index < options.telemetryCount; index += 1) {
    await publish(client, `${base}/telemetry/report`, {
      ...buildEnvelope(options),
      metrics: {
        temperature: 24 + index,
        humidity: 48 + index,
        battery: 98 - index,
      },
      state: {
        cycle: index + 1,
      },
      quality: 'good',
    });

    console.log(
      `[protocol-v1-test] sent telemetry ${index + 1}/${options.telemetryCount}`,
    );

    if (index < options.telemetryCount - 1) {
      await sleep(options.telemetryIntervalMs);
    }
  }

  await publish(client, `${base}/event/report`, {
    ...buildEnvelope(options),
    level: 'warning',
    title: 'Protocol 1.0 test event',
    message: 'Generated by simulator to verify event ingestion',
    eventType: 'protocol_test_event',
    data: {
      source: 'protocol-v1-simulator',
    },
  });

  console.log('[protocol-v1-test] published lifecycle, capability, state, telemetry, and event messages');

  // --- HTTP 侧：确认控制面已消化 MQTT 数据 ---

  const devices = await waitForCondition(
    'device registration',
    () =>
      httpJson<{ items: Array<{ deviceId: string }> }>(
        `${options.httpBaseUrl}/api/devices?query=${encodeURIComponent(options.deviceId)}`,
      ),
    (value) => value.items.some((item) => item.deviceId === options.deviceId),
  );
  console.log(`[protocol-v1-test] device visible in control plane (${devices.items.length} items)`);

  const state = await waitForCondition(
    'device state report',
    () =>
      httpJson<{ deviceId: string; status: string; online: boolean | null }>(
        `${options.httpBaseUrl}/api/device-states/${encodeURIComponent(options.deviceId)}`,
      ),
    (value) => value.status === 'online' && value.online === true,
  );
  console.log(`[protocol-v1-test] state verified: ${state.status}`);

  const capabilities = await waitForCondition(
    'capability sync',
    () =>
      httpJson<{ items: Array<{ capability: string }> }>(
        `${options.httpBaseUrl}/api/devices/${encodeURIComponent(options.deviceId)}/capabilities`,
      ),
    (value) => value.items.length >= 2,
  );
  console.log(
    `[protocol-v1-test] capabilities verified: ${capabilities.items.map((item) => item.capability).join(', ')}`,
  );

  // 通过 HTTP 下发 restart，期望经平台转发到 MQTT command/req，再由本模拟器 ACK/Result
  // API 返回结构：{ command: { commandId, ... }, approval, requiresApproval, level }
  const commandSubmission = await httpJson<{ command: { commandId: string } }>(
    `${options.httpBaseUrl}/api/commands`,
    {
      method: 'POST',
      body: JSON.stringify({
        tenant: options.tenant,
        site: options.site,
        deviceId: options.deviceId,
        commandName: 'restart',
        payload: {
          reason: 'protocol-v1-test',
        },
        requestedBy: 'protocol-v1-simulator',
      }),
    },
  );
  const submittedCommandId = commandSubmission.command.commandId;
  console.log(`[protocol-v1-test] submitted command ${submittedCommandId}`);

  await waitForCondition(
    'command receipt',
    async () => handledCommandId,
    (value) => value === submittedCommandId,
    options.commandTimeoutMs,
    250,
  );

  const command = await waitForCondition(
    'command completion',
    () =>
      httpJson<{
        commandId: string;
        status: string;
        response: Record<string, unknown> | null;
      }>(`${options.httpBaseUrl}/api/commands/${submittedCommandId}`),
    (value) => value.status === 'succeeded',
    options.commandTimeoutMs,
    500,
  );
  console.log(`[protocol-v1-test] command verified: ${command.status}`);

  await publish(client, `${base}/lifecycle/offline`, {
    ...buildEnvelope(options),
    reason: 'protocol_v1_test_completed',
  });

  await endClient(client);
  console.log('[protocol-v1-test] completed successfully');
}

main().catch((error) => {
  console.error('[protocol-v1-test] failed:', error);
  process.exit(1);
});
