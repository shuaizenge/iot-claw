/**
 * MQTT 设备模拟测试脚本
 *
 * 模拟 IoT 设备连接 MQTT 服务器，发送遥测数据、状态、事件，
 * 并订阅并响应下发的命令请求。用于端到端测试 IoT Claw 的 MQTT 通道。
 */
import mqtt, { MqttClient } from 'mqtt';

/** 命令行参数选项 */
interface CliOptions {
  url: string;
  tenant: string;
  site: string;
  deviceId: string;
  username?: string;
  password?: string;
  /** 遥测消息发送条数 */
  count: number;
  /** 遥测消息发送间隔（毫秒） */
  intervalMs: number;
  /** 命令监听时长（毫秒），0 表示不额外等待 */
  listenCommandMs: number;
}

/** 解析命令行参数，支持环境变量与 `--key value` 形式覆盖 */
function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    url: process.env.MQTT_URL || 'mqtt://127.0.0.1:1883',
    tenant: process.env.TEST_TENANT || 'demo-tenant',
    site: process.env.TEST_SITE || 'site-a',
    deviceId: process.env.TEST_DEVICE_ID || 'device-001',
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    count: Number(process.env.TEST_MESSAGE_COUNT || 5),
    intervalMs: Number(process.env.TEST_INTERVAL_MS || 1200),
    listenCommandMs: Number(process.env.TEST_LISTEN_COMMAND_MS || 15000),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      case '--url':
        options.url = next;
        i += 1;
        break;
      case '--tenant':
        options.tenant = next;
        i += 1;
        break;
      case '--site':
        options.site = next;
        i += 1;
        break;
      case '--device':
        options.deviceId = next;
        i += 1;
        break;
      case '--username':
        options.username = next;
        i += 1;
        break;
      case '--password':
        options.password = next;
        i += 1;
        break;
      case '--count':
        options.count = Number(next);
        i += 1;
        break;
      case '--interval-ms':
        options.intervalMs = Number(next);
        i += 1;
        break;
      case '--listen-command-ms':
        options.listenCommandMs = Number(next);
        i += 1;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  if (!Number.isFinite(options.count) || options.count <= 0) {
    throw new Error('`count` must be a positive number');
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error('`interval-ms` must be a positive number');
  }
  if (
    !Number.isFinite(options.listenCommandMs) ||
    options.listenCommandMs < 0
  ) {
    throw new Error('`listen-command-ms` must be zero or a positive number');
  }

  return options;
}

/** 打印命令行使用帮助 */
function printHelp(): void {
  console.log(`Usage: npm run test:mqtt-connect -- [options]

Options:
  --url <mqtt-url>               MQTT server URL
  --tenant <tenant>              Tenant name
  --site <site>                  Site name
  --device <device-id>           Device ID
  --username <username>          MQTT username
  --password <password>          MQTT password
  --count <number>               Number of telemetry messages to send
  --interval-ms <ms>             Interval between telemetry messages
  --listen-command-ms <ms>       How long to keep listening for command requests
  -h, --help                     Show this help

Example:
  npm run test:mqtt-connect -- --tenant demo --site factory-a --device sensor-01
`);
}

/** 根据租户、站点、设备 ID 生成 MQTT 主题前缀 */
function topicBase(options: CliOptions): string {
  return `iot/${options.tenant}/${options.site}/${options.deviceId}`;
}

/** 等待 MQTT 客户端连接成功 */
async function waitForConnect(client: MqttClient): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    client.once('connect', () => resolve());
    client.once('error', reject);
  });
}

/** 订阅指定主题，QoS 1 */
async function subscribe(client: MqttClient, topic: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    client.subscribe(topic, { qos: 1 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** 向指定主题发布 JSON 载荷，QoS 1 */
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

/** 异步延时 */
async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const base = topicBase(options);

  // 创建 MQTT 客户端
  const client = mqtt.connect(options.url, {
    clientId: `iot-claw-test-${options.deviceId}-${Date.now()}`,
    username: options.username,
    password: options.password,
  });

  // 监听重连与错误
  client.on('reconnect', () => {
    console.log('[mqtt-test] reconnecting...');
  });
  client.on('error', (err) => {
    console.error('[mqtt-test] mqtt error:', err);
  });

  await waitForConnect(client);
  console.log(`[mqtt-test] connected to ${options.url}`);

  // 订阅命令请求主题，准备接收云端下发的指令
  const commandReqTopic = `${base}/command/req`;
  const commandAckTopic = `${base}/command/ack`;
  await subscribe(client, commandReqTopic);
  console.log(`[mqtt-test] subscribed to ${commandReqTopic}`);

  // 处理收到的命令请求：解析 JSON 并回复 ack 到 command/ack 主题
  client.on('message', (topic, buffer) => {
    if (topic !== commandReqTopic) return;

    try {
      const payload = JSON.parse(buffer.toString('utf-8')) as {
        commandId?: string;
        commandName?: string;
        payload?: Record<string, unknown>;
      };

      console.log('[mqtt-test] received command request:', payload);

      if (!payload.commandId) return;

      // 模拟执行完成，向 command/ack 发送确认
      void publish(client, commandAckTopic, {
        ts: new Date().toISOString(),
        deviceId: options.deviceId,
        commandId: payload.commandId,
        status: 'succeeded',
        detail: `Simulated device executed ${payload.commandName || 'command'}`,
        result: {
          echoedPayload: payload.payload || {},
          simulated: true,
        },
      }).then(() => {
        console.log(`[mqtt-test] sent command ack to ${commandAckTopic}`);
      });
    } catch (err) {
      console.error('[mqtt-test] failed to parse command request:', err);
    }
  });

  // 上报设备在线状态
  await publish(client, `${base}/state`, {
    ts: new Date().toISOString(),
    deviceId: options.deviceId,
    status: 'online',
    online: true,
    summary: 'Simulated device connected',
    attributes: {
      firmwareVersion: '0.0.1-test',
      mode: 'simulation',
    },
  });
  console.log(`[mqtt-test] sent state message to ${base}/state`);

  // 按间隔发送若干条遥测数据
  for (let index = 0; index < options.count; index += 1) {
    await publish(client, `${base}/telemetry`, {
      ts: new Date().toISOString(),
      deviceId: options.deviceId,
      traceId: `trace-${Date.now()}-${index}`,
      quality: 'good',
      metrics: {
        temperature: 22 + index,
        humidity: 45 + index,
        battery: 96 - index,
        running: true,
      },
      state: {
        workload: `cycle-${index + 1}`,
      },
    });
    console.log(
      `[mqtt-test] sent telemetry ${index + 1}/${options.count} to ${base}/telemetry`,
    );
    if (index < options.count - 1) {
      await sleep(options.intervalMs);
    }
  }

  // 发送一条模拟告警事件
  await publish(client, `${base}/event`, {
    ts: new Date().toISOString(),
    deviceId: options.deviceId,
    level: 'warning',
    title: 'Simulated high temperature',
    message: 'Simulation generated warning event for end-to-end testing',
    eventType: 'temperature_warning',
    data: {
      threshold: 25,
      observed: 26,
    },
  });
  console.log(`[mqtt-test] sent event message to ${base}/event`);

  // 若配置了监听时长，则继续等待命令请求
  if (options.listenCommandMs > 0) {
    console.log(
      `[mqtt-test] waiting ${options.listenCommandMs}ms for command requests...`,
    );
    await sleep(options.listenCommandMs);
  }

  // 优雅断开 MQTT 连接
  await new Promise<void>((resolve, reject) => {
    client.end(false, {}, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log('[mqtt-test] completed');
}

main().catch((err) => {
  console.error('[mqtt-test] failed:', err);
  process.exit(1);
});
