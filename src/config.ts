import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  SERVICE_NAME: z.string().default('iot-claw'),
  DEFAULT_TENANT: z.string().default('default'),
  DEFAULT_SITE: z.string().default('default'),
  HTTP_HOST: z.string().default('0.0.0.0'),
  HTTP_PORT: z.coerce.number().int().positive().default(8080),
  POSTGRES_URL: z.string().min(1),
  INFLUXDB_URL: z.string().url(),
  INFLUXDB_TOKEN: z.string().min(1),
  INFLUXDB_ORG: z.string().min(1),
  INFLUXDB_BUCKET: z.string().min(1),
  MQTT_URL: z.string().min(1),
  MQTT_CLIENT_ID: z.string().default('iot-claw-server'),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  MQTT_KEEPALIVE_SECONDS: z.coerce.number().int().positive().default(60),
  MQTT_TLS_ENABLED: z.coerce.boolean().default(false),
  MQTT_TOPIC_FILTER: z.string().default('iot/+/+/+/#'),
  MQTT_COMMAND_TOPIC_TEMPLATE: z
    .string()
    .default('iot/{tenant}/{site}/{deviceId}/command/req'),
  TELEMETRY_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  SAFE_WRITE_COMMANDS: z.string().default('restart,ping,sync_config,refresh_state'),
  DANGEROUS_WRITE_COMMANDS: z.string().default('factory_reset,firmware_upgrade,shutdown'),
  JOB_SCHEDULER_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  AGENT_BRIDGE_DISPATCH_INTERVAL_MS: z.coerce.number().int().positive().default(10000),
  AGENT_RUNTIME: z.enum(['disabled', 'openclaw']).default('openclaw'),
  OPENCLAW_GATEWAY_URL: z.string().optional(),
  OPENCLAW_GATEWAY_TOKEN: z.string().optional(),
  OPENCLAW_AGENT_ID: z.string().default('main'),
  OPENCLAW_SESSION_KEY: z.string().default('main'),
  OPENCLAW_CLIENT_ID: z.string().default('gateway-client'),
});

export type AppConfig = z.infer<typeof configSchema>;

export const config: AppConfig = configSchema.parse(process.env);
