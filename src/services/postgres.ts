import { Pool } from 'pg';

import {
  AgentBridgeEventRecord,
  DeviceAlertRecord,
  DeviceAlertInput,
  CommandApprovalRecord,
  CommandAuditRecord,
  DeviceActionInput,
  DeviceActionRecord,
  DeviceCapabilityInput,
  DeviceCapabilityRecord,
  DeviceCommandRecord,
  DeviceCommandInput,
  DeviceRecord,
  JobDefinitionRecord,
  JobRunRecord,
  MqttSettingsInput,
  ServerApiAccessRecord,
  MqttSettingsRecord,
  ServerSettingsInput,
  ServerSettingsRecord,
  DeviceStateRecord,
  DeviceStateUpdateInput,
  DeviceUpsertInput,
} from '../types.js';

/**
 * PostgreSQL 持久化：设备主数据、状态、命令、告警、审批与审计、Agent Bridge 事件、
 * 定时任务及控制面（HTTP/MQTT）配置。
 */
export class PostgresService {
  private readonly pool: Pool;

  /** @param connectionString PostgreSQL 连接 URI（与 pg.Pool 一致）。 */
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  /** 探测数据库连通性（获取连接后立即释放）。 */
  async connect(): Promise<void> {
    const client = await this.pool.connect();
    client.release();
  }

  /** 关闭连接池，进程退出前调用。 */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * 初始化 DDL：创建设备、状态、命令、告警、审批、审计、Bridge、任务、设置等表及索引。
   * 使用 IF NOT EXISTS，可安全重复执行。
   */
  async initSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        tenant TEXT NOT NULL,
        site TEXT NOT NULL,
        name TEXT NOT NULL,
        product_type TEXT NOT NULL,
        firmware_version TEXT,
        last_seen_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'unknown',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS device_state (
        device_id TEXT PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE,
        tenant TEXT NOT NULL,
        site TEXT NOT NULL,
        status TEXT NOT NULL,
        online BOOLEAN,
        summary TEXT,
        attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS device_commands (
        command_id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
        tenant TEXT NOT NULL,
        site TEXT NOT NULL,
        command_name TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        requested_by TEXT NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL,
        response JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS device_alerts (
        id BIGSERIAL PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
        tenant TEXT NOT NULL,
        site TEXT NOT NULL,
        level TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        event_type TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        event_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS command_approvals (
        id BIGSERIAL PRIMARY KEY,
        command_id TEXT NOT NULL REFERENCES device_commands(command_id) ON DELETE CASCADE,
        command_level TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        reviewed_by TEXT,
        reason TEXT,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS command_audits (
        id BIGSERIAL PRIMARY KEY,
        command_id TEXT REFERENCES device_commands(command_id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        detail JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS agent_bridge_events (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        level TEXT NOT NULL,
        tenant TEXT NOT NULL,
        site TEXT NOT NULL,
        device_id TEXT,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        dispatched_at TIMESTAMPTZ,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE TABLE IF NOT EXISTS job_definitions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        schedule TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        kind TEXT NOT NULL,
        next_run_at TIMESTAMPTZ,
        last_run_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS job_runs (
        id BIGSERIAL PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES job_definitions(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        finished_at TIMESTAMPTZ,
        output JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE TABLE IF NOT EXISTS server_settings (
        id TEXT PRIMARY KEY,
        service_name TEXT NOT NULL,
        ui_title TEXT NOT NULL,
        default_tenant TEXT NOT NULL,
        default_site TEXT NOT NULL,
        admin_display_name TEXT NOT NULL,
        api_token TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS mqtt_settings (
        id TEXT PRIMARY KEY,
        broker_url TEXT NOT NULL,
        client_id TEXT NOT NULL,
        username TEXT,
        password TEXT,
        topic_filter TEXT NOT NULL,
        command_topic_template TEXT NOT NULL,
        keepalive_seconds INTEGER NOT NULL DEFAULT 60,
        tls_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS device_capabilities (
        device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
        capability TEXT NOT NULL,
        display_name TEXT NOT NULL,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (device_id, capability)
      );

      CREATE TABLE IF NOT EXISTS device_actions (
        device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
        action_name TEXT NOT NULL,
        capability TEXT,
        command_name TEXT NOT NULL,
        payload_template JSONB NOT NULL DEFAULT '{}'::jsonb,
        args_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
        requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (device_id, action_name)
      );

      ALTER TABLE device_actions
      ADD COLUMN IF NOT EXISTS args_schema JSONB NOT NULL DEFAULT '{}'::jsonb;

      CREATE INDEX IF NOT EXISTS idx_devices_tenant_site ON devices(tenant, site);
      CREATE INDEX IF NOT EXISTS idx_device_alerts_device_event_at ON device_alerts(device_id, event_at DESC);
      CREATE INDEX IF NOT EXISTS idx_device_commands_device_requested_at ON device_commands(device_id, requested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_command_approvals_command_id ON command_approvals(command_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_command_audits_command_id ON command_audits(command_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bridge_events_status_created_at ON agent_bridge_events(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_job_definitions_next_run_at ON job_definitions(enabled, next_run_at);
      CREATE INDEX IF NOT EXISTS idx_job_runs_job_started_at ON job_runs(job_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_device_capabilities_capability ON device_capabilities(capability, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_device_actions_capability ON device_actions(capability, updated_at DESC);
    `);
  }

  /**
   * 控制面首次引导：写入 id 为 default 的 server_settings 与 mqtt_settings；
   * 若已存在则 ON CONFLICT DO NOTHING，不覆盖用户数据。
   */
  async bootstrapControlPlaneDefaults(input: {
    serviceName: string;
    defaultTenant: string;
    defaultSite: string;
    mqtt: {
      brokerUrl: string;
      clientId: string;
      username?: string;
      password?: string;
      topicFilter: string;
      commandTopicTemplate: string;
      keepaliveSeconds?: number;
      tlsEnabled?: boolean;
      enabled?: boolean;
    };
  }): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO server_settings (
          id, service_name, ui_title, default_tenant, default_site, admin_display_name, api_token, updated_at
        )
        VALUES ('default', $1, $2, $3, $4, 'admin', NULL, NOW())
        ON CONFLICT (id) DO NOTHING
      `,
      [input.serviceName, `${input.serviceName} Control Plane`, input.defaultTenant, input.defaultSite],
    );

    await this.pool.query(
      `
        INSERT INTO mqtt_settings (
          id, broker_url, client_id, username, password, topic_filter,
          command_topic_template, keepalive_seconds, tls_enabled, enabled, updated_at
        )
        VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (id) DO NOTHING
      `,
      [
        input.mqtt.brokerUrl,
        input.mqtt.clientId,
        input.mqtt.username || null,
        input.mqtt.password || null,
        input.mqtt.topicFilter,
        input.mqtt.commandTopicTemplate,
        input.mqtt.keepaliveSeconds ?? 60,
        input.mqtt.tlsEnabled ?? false,
        input.mqtt.enabled ?? true,
      ],
    );
  }

  /** 插入或按 device_id 合并更新设备主数据（含元数据 JSON）。 */
  async upsertDevice(input: DeviceUpsertInput): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO devices (
          device_id, tenant, site, name, product_type, firmware_version,
          last_seen_at, status, metadata, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
        ON CONFLICT (device_id) DO UPDATE SET
          tenant = EXCLUDED.tenant,
          site = EXCLUDED.site,
          name = EXCLUDED.name,
          product_type = EXCLUDED.product_type,
          firmware_version = EXCLUDED.firmware_version,
          last_seen_at = COALESCE(EXCLUDED.last_seen_at, devices.last_seen_at),
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `,
      [
        input.deviceId,
        input.tenant,
        input.site,
        input.name || input.deviceId,
        input.productType || 'unknown',
        input.firmwareVersion || null,
        input.lastSeenAt || null,
        input.status || 'unknown',
        JSON.stringify(input.metadata || {}),
      ],
    );
  }

  /** 写入/更新 device_state 快照，并同步 devices 表的 status 与 last_seen_at。 */
  async updateDeviceState(input: DeviceStateUpdateInput): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO device_state (
          device_id, tenant, site, status, online, summary, attributes, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        ON CONFLICT (device_id) DO UPDATE SET
          tenant = EXCLUDED.tenant,
          site = EXCLUDED.site,
          status = EXCLUDED.status,
          online = EXCLUDED.online,
          summary = EXCLUDED.summary,
          attributes = EXCLUDED.attributes,
          updated_at = EXCLUDED.updated_at
      `,
      [
        input.deviceId,
        input.tenant,
        input.site,
        input.status,
        input.online ?? null,
        input.summary || null,
        JSON.stringify(input.attributes || {}),
        input.updatedAt,
      ],
    );

    await this.pool.query(
      `UPDATE devices SET status = $2, last_seen_at = $3, updated_at = NOW() WHERE device_id = $1`,
      [input.deviceId, input.status, input.updatedAt],
    );
  }

  /** 新增一条设备告警记录。 */
  async createAlert(input: DeviceAlertInput): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO device_alerts (
          device_id, tenant, site, level, title, message, event_type, payload, event_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
      `,
      [
        input.deviceId,
        input.tenant,
        input.site,
        input.level,
        input.title,
        input.message,
        input.eventType || null,
        JSON.stringify(input.payload || {}),
        input.eventAt,
      ],
    );
  }

  /** 插入或更新命令行；同一 command_id 冲突时更新 status 与 payload。 */
  async upsertCommand(input: DeviceCommandInput): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO device_commands (
          command_id, device_id, tenant, site, command_name, payload,
          requested_by, requested_at, status, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, NOW())
        ON CONFLICT (command_id) DO UPDATE SET
          status = EXCLUDED.status,
          payload = EXCLUDED.payload,
          updated_at = NOW()
      `,
      [
        input.commandId,
        input.deviceId,
        input.tenant,
        input.site,
        input.commandName,
        JSON.stringify(input.payload),
        input.requestedBy,
        input.requestedAt,
        input.status,
      ],
    );
  }

  /** 更新命令执行结果（status、response JSON）。 */
  async updateCommandResult(
    commandId: string,
    status: string,
    response: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE device_commands SET status = $2, response = $3::jsonb, updated_at = NOW() WHERE command_id = $1`,
      [commandId, status, JSON.stringify(response)],
    );
  }

  /** 分页列出设备；支持 tenant、site、device_id/name 模糊 query。 */
  async listDevices(filters?: {
    tenant?: string;
    site?: string;
    query?: string;
    limit?: number;
  }): Promise<DeviceRecord[]> {
    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (filters?.tenant) {
      values.push(filters.tenant);
      conditions.push(`tenant = $${values.length}`);
    }
    if (filters?.site) {
      values.push(filters.site);
      conditions.push(`site = $${values.length}`);
    }
    if (filters?.query) {
      values.push(`%${filters.query.toLowerCase()}%`);
      conditions.push(`(LOWER(device_id) LIKE $${values.length} OR LOWER(name) LIKE $${values.length})`);
    }

    const limit = filters?.limit ?? 100;
    values.push(limit);

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.pool.query(
      `
        SELECT
          device_id,
          tenant,
          site,
          name,
          product_type,
          firmware_version,
          last_seen_at,
          status,
          metadata
        FROM devices
        ${whereClause}
        ORDER BY updated_at DESC
        LIMIT $${values.length}
      `,
      values,
    );

    return result.rows.map((row) => ({
      deviceId: row.device_id,
      tenant: row.tenant,
      site: row.site,
      name: row.name,
      productType: row.product_type,
      firmwareVersion: row.firmware_version,
      lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
      status: row.status,
      metadata: row.metadata ?? {},
    }));
  }

  /** 按 device_id 查询单台设备主数据。 */
  async getDevice(deviceId: string): Promise<DeviceRecord | null> {
    const result = await this.pool.query(
      `
        SELECT
          device_id,
          tenant,
          site,
          name,
          product_type,
          firmware_version,
          last_seen_at,
          status,
          metadata
        FROM devices
        WHERE device_id = $1
      `,
      [deviceId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      deviceId: row.device_id,
      tenant: row.tenant,
      site: row.site,
      name: row.name,
      productType: row.product_type,
      firmwareVersion: row.firmware_version,
      lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
      status: row.status,
      metadata: row.metadata ?? {},
    };
  }

  /** 删除设备（外键级联删除关联行）。返回是否实际删除了一行。 */
  async deleteDevice(deviceId: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM devices WHERE device_id = $1`, [deviceId]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  /** 汇总设备总数、status=online 数量及全局最近 last_seen_at。 */
  async getDeviceSummary(): Promise<{
    total: number;
    online: number;
    lastSeenAt: string | null;
  }> {
    const result = await this.pool.query(
      `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'online')::int AS online,
          MAX(last_seen_at) AS last_seen_at
        FROM devices
      `,
    );

    const row = result.rows[0];
    return {
      total: Number(row?.total ?? 0),
      online: Number(row?.online ?? 0),
      lastSeenAt: row?.last_seen_at ? row.last_seen_at.toISOString() : null,
    };
  }

  /** 读取默认控制面配置；api_token 对外仅返回掩码（见 maskSecret）。 */
  async getServerSettings(): Promise<ServerSettingsRecord> {
    const result = await this.pool.query(
      `
        SELECT service_name, ui_title, default_tenant, default_site, admin_display_name, api_token, updated_at
        FROM server_settings
        WHERE id = 'default'
      `,
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Server settings are not initialized');
    }

    return {
      serviceName: row.service_name,
      uiTitle: row.ui_title,
      defaultTenant: row.default_tenant,
      defaultSite: row.default_site,
      adminDisplayName: row.admin_display_name,
      apiTokenHint: row.api_token ? maskSecret(row.api_token) : null,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async getServerApiToken(): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT api_token FROM server_settings WHERE id = 'default'`,
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Server settings are not initialized');
    }
    return typeof row.api_token === 'string' && row.api_token.trim() ? row.api_token.trim() : null;
  }

  async getServerApiAccess(): Promise<ServerApiAccessRecord> {
    const token = await this.getServerApiToken();
    return { enabled: Boolean(token) };
  }

  /** 更新控制面配置；apiToken 为 null 或空串表示清空令牌。 */
  async updateServerSettings(input: ServerSettingsInput): Promise<ServerSettingsRecord> {
    const current = await this.pool.query(
      `SELECT service_name, ui_title, default_tenant, default_site, admin_display_name, api_token FROM server_settings WHERE id = 'default'`,
    );
    const row = current.rows[0];
    if (!row) {
      throw new Error('Server settings are not initialized');
    }

    const nextApiToken =
      input.apiToken === undefined ? row.api_token : input.apiToken === null || input.apiToken === '' ? null : input.apiToken;

    await this.pool.query(
      `
        UPDATE server_settings
        SET service_name = $1,
            ui_title = $2,
            default_tenant = $3,
            default_site = $4,
            admin_display_name = $5,
            api_token = $6,
            updated_at = NOW()
        WHERE id = 'default'
      `,
      [
        input.serviceName?.trim() || row.service_name,
        input.uiTitle?.trim() || row.ui_title,
        input.defaultTenant?.trim() || row.default_tenant,
        input.defaultSite?.trim() || row.default_site,
        input.adminDisplayName?.trim() || row.admin_display_name,
        nextApiToken,
      ],
    );

    return this.getServerSettings();
  }

  /** 读取 MQTT 配置供管理接口展示；密码仅返回是否已配置。 */
  async getMqttSettings(): Promise<MqttSettingsRecord> {
    const result = await this.pool.query(
      `
        SELECT broker_url, client_id, username, password, topic_filter, command_topic_template,
               keepalive_seconds, tls_enabled, enabled, updated_at
        FROM mqtt_settings
        WHERE id = 'default'
      `,
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('MQTT settings are not initialized');
    }

    return {
      brokerUrl: row.broker_url,
      clientId: row.client_id,
      username: row.username,
      passwordConfigured: Boolean(row.password),
      topicFilter: row.topic_filter,
      commandTopicTemplate: row.command_topic_template,
      keepaliveSeconds: Number(row.keepalive_seconds),
      tlsEnabled: row.tls_enabled,
      enabled: row.enabled,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /** 读取 MQTT 完整连接参数（含明文密码），仅供 MqttService 等运行时连接使用。 */
  async getMqttRuntimeSettings(): Promise<{
    brokerUrl: string;
    clientId: string;
    username: string | null;
    password: string | null;
    topicFilter: string;
    commandTopicTemplate: string;
    keepaliveSeconds: number;
    tlsEnabled: boolean;
    enabled: boolean;
  }> {
    const result = await this.pool.query(
      `
        SELECT broker_url, client_id, username, password, topic_filter, command_topic_template,
               keepalive_seconds, tls_enabled, enabled
        FROM mqtt_settings
        WHERE id = 'default'
      `,
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('MQTT settings are not initialized');
    }

    return {
      brokerUrl: row.broker_url,
      clientId: row.client_id,
      username: row.username,
      password: row.password,
      topicFilter: row.topic_filter,
      commandTopicTemplate: row.command_topic_template,
      keepaliveSeconds: Number(row.keepalive_seconds),
      tlsEnabled: row.tls_enabled,
      enabled: row.enabled,
    };
  }

  /** 更新 MQTT 配置；password 为 null 或空串表示清空已存密码。 */
  async updateMqttSettings(input: MqttSettingsInput): Promise<MqttSettingsRecord> {
    const current = await this.pool.query(
      `
        SELECT broker_url, client_id, username, password, topic_filter, command_topic_template,
               keepalive_seconds, tls_enabled, enabled
        FROM mqtt_settings
        WHERE id = 'default'
      `,
    );
    const row = current.rows[0];
    if (!row) {
      throw new Error('MQTT settings are not initialized');
    }

    const nextPassword =
      input.password === undefined ? row.password : input.password === null || input.password === '' ? null : input.password;

    await this.pool.query(
      `
        UPDATE mqtt_settings
        SET broker_url = $1,
            client_id = $2,
            username = $3,
            password = $4,
            topic_filter = $5,
            command_topic_template = $6,
            keepalive_seconds = $7,
            tls_enabled = $8,
            enabled = $9,
            updated_at = NOW()
        WHERE id = 'default'
      `,
      [
        input.brokerUrl?.trim() || row.broker_url,
        input.clientId?.trim() || row.client_id,
        input.username === undefined ? row.username : input.username?.trim() || null,
        nextPassword,
        input.topicFilter?.trim() || row.topic_filter,
        input.commandTopicTemplate?.trim() || row.command_topic_template,
        input.keepaliveSeconds ?? Number(row.keepalive_seconds),
        input.tlsEnabled ?? row.tls_enabled,
        input.enabled ?? row.enabled,
      ],
    );

    return this.getMqttSettings();
  }

  /** 插入或更新设备能力（capability）及展示名、配置 JSON。 */
  async upsertDeviceCapability(input: DeviceCapabilityInput): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO device_capabilities (device_id, capability, display_name, config, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, NOW())
        ON CONFLICT (device_id, capability) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          config = EXCLUDED.config,
          updated_at = NOW()
      `,
      [
        input.deviceId,
        input.capability,
        input.displayName || input.capability,
        JSON.stringify(input.config || {}),
      ],
    );
  }

  /** 列出设备能力；可按 deviceId、capability 筛选。 */
  async listDeviceCapabilities(deviceId?: string, capability?: string): Promise<DeviceCapabilityRecord[]> {
    const conditions: string[] = [];
    const values: Array<string> = [];

    if (deviceId) {
      values.push(deviceId);
      conditions.push(`device_id = $${values.length}`);
    }
    if (capability) {
      values.push(capability);
      conditions.push(`capability = $${values.length}`);
    }

    const result = await this.pool.query(
      `
        SELECT device_id, capability, display_name, config, updated_at
        FROM device_capabilities
        ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY updated_at DESC, device_id ASC, capability ASC
      `,
      values,
    );

    return result.rows.map((row) => ({
      deviceId: row.device_id,
      capability: row.capability,
      displayName: row.display_name,
      config: row.config ?? {},
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  /** 插入或更新设备动作（映射到 command_name 与 payload 模板）。 */
  async upsertDeviceAction(input: DeviceActionInput): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO device_actions (
          device_id, action_name, capability, command_name, payload_template, args_schema, requires_confirmation, updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, NOW())
        ON CONFLICT (device_id, action_name) DO UPDATE SET
          capability = EXCLUDED.capability,
          command_name = EXCLUDED.command_name,
          payload_template = EXCLUDED.payload_template,
          args_schema = EXCLUDED.args_schema,
          requires_confirmation = EXCLUDED.requires_confirmation,
          updated_at = NOW()
      `,
      [
        input.deviceId,
        input.actionName,
        input.capability || null,
        input.commandName || input.actionName,
        JSON.stringify(input.payloadTemplate || {}),
        JSON.stringify(input.argsSchema || {}),
        input.requiresConfirmation ?? false,
      ],
    );
  }

  /** 列出某设备下全部动作，按 action_name 排序。 */
  async listDeviceActions(deviceId: string): Promise<DeviceActionRecord[]> {
    const result = await this.pool.query(
      `
        SELECT device_id, action_name, capability, command_name, payload_template, args_schema, requires_confirmation, updated_at
        FROM device_actions
        WHERE device_id = $1
        ORDER BY action_name ASC
      `,
      [deviceId],
    );

    return result.rows.map((row) => ({
      deviceId: row.device_id,
      actionName: row.action_name,
      capability: row.capability,
      commandName: row.command_name,
      payloadTemplate: row.payload_template ?? {},
      argsSchema: row.args_schema ?? {},
      requiresConfirmation: row.requires_confirmation,
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  /** 按 device_id + action_name 查询单条动作定义。 */
  async getDeviceAction(deviceId: string, actionName: string): Promise<DeviceActionRecord | null> {
    const result = await this.pool.query(
      `
        SELECT device_id, action_name, capability, command_name, payload_template, args_schema, requires_confirmation, updated_at
        FROM device_actions
        WHERE device_id = $1 AND action_name = $2
      `,
      [deviceId, actionName],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      deviceId: row.device_id,
      actionName: row.action_name,
      capability: row.capability,
      commandName: row.command_name,
      payloadTemplate: row.payload_template ?? {},
      argsSchema: row.args_schema ?? {},
      requiresConfirmation: row.requires_confirmation,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /** 分页列出 device_state；支持 tenant、site、deviceId 过滤。 */
  async listDeviceStates(filters?: {
    tenant?: string;
    site?: string;
    deviceId?: string;
    limit?: number;
  }): Promise<DeviceStateRecord[]> {
    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (filters?.tenant) {
      values.push(filters.tenant);
      conditions.push(`tenant = $${values.length}`);
    }
    if (filters?.site) {
      values.push(filters.site);
      conditions.push(`site = $${values.length}`);
    }
    if (filters?.deviceId) {
      values.push(filters.deviceId);
      conditions.push(`device_id = $${values.length}`);
    }

    const limit = filters?.limit ?? 100;
    values.push(limit);

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.pool.query(
      `
        SELECT device_id, tenant, site, status, online, summary, attributes, updated_at
        FROM device_state
        ${whereClause}
        ORDER BY updated_at DESC
        LIMIT $${values.length}
      `,
      values,
    );

    return result.rows.map((row) => ({
      deviceId: row.device_id,
      tenant: row.tenant,
      site: row.site,
      status: row.status,
      online: row.online,
      summary: row.summary,
      attributes: row.attributes ?? {},
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  /** 分页列出告警，按 event_at 倒序。 */
  async listDeviceAlerts(filters?: {
    tenant?: string;
    site?: string;
    deviceId?: string;
    limit?: number;
  }): Promise<DeviceAlertRecord[]> {
    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (filters?.tenant) {
      values.push(filters.tenant);
      conditions.push(`tenant = $${values.length}`);
    }
    if (filters?.site) {
      values.push(filters.site);
      conditions.push(`site = $${values.length}`);
    }
    if (filters?.deviceId) {
      values.push(filters.deviceId);
      conditions.push(`device_id = $${values.length}`);
    }

    const limit = filters?.limit ?? 100;
    values.push(limit);

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.pool.query(
      `
        SELECT id, device_id, tenant, site, level, title, message, event_type, status, payload, event_at, created_at
        FROM device_alerts
        ${whereClause}
        ORDER BY event_at DESC
        LIMIT $${values.length}
      `,
      values,
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      deviceId: row.device_id,
      tenant: row.tenant,
      site: row.site,
      level: row.level,
      title: row.title,
      message: row.message,
      eventType: row.event_type,
      status: row.status,
      payload: row.payload ?? {},
      eventAt: row.event_at.toISOString(),
      createdAt: row.created_at.toISOString(),
    }));
  }

  /** 按 command_id 查询命令详情（含 payload、response）。 */
  async getCommand(commandId: string): Promise<DeviceCommandRecord | null> {
    const result = await this.pool.query(
      `
        SELECT command_id, device_id, tenant, site, command_name, payload, requested_by, requested_at, status, response, updated_at
        FROM device_commands
        WHERE command_id = $1
      `,
      [commandId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      commandId: row.command_id,
      deviceId: row.device_id,
      tenant: row.tenant,
      site: row.site,
      commandName: row.command_name,
      payload: row.payload ?? {},
      requestedBy: row.requested_by,
      requestedAt: row.requested_at.toISOString(),
      status: row.status,
      response: row.response ?? null,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /** 新增命令审批流水（可与策略层 pending/approved/rejected 配合）。 */
  async createCommandApproval(input: {
    commandId: string;
    commandLevel: 'read' | 'safe-write' | 'dangerous-write';
    status: 'pending' | 'approved' | 'rejected';
    requestedBy: string;
    reviewedBy?: string | null;
    reason?: string | null;
    reviewedAt?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO command_approvals (
          command_id, command_level, status, requested_by, reviewed_by, reason, reviewed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        input.commandId,
        input.commandLevel,
        input.status,
        input.requestedBy,
        input.reviewedBy || null,
        input.reason || null,
        input.reviewedAt || null,
      ],
    );
  }

  /** 取某命令最新一条审批记录（按 created_at 倒序取一条）。 */
  async getLatestCommandApproval(commandId: string): Promise<CommandApprovalRecord | null> {
    const result = await this.pool.query(
      `
        SELECT id, command_id, command_level, status, requested_by, reviewed_by, reason, reviewed_at, created_at
        FROM command_approvals
        WHERE command_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [commandId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: Number(row.id),
      commandId: row.command_id,
      commandLevel: row.command_level,
      status: row.status,
      requestedBy: row.requested_by,
      reviewedBy: row.reviewed_by,
      reason: row.reason,
      reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
    };
  }

  /** 写入命令审计日志（command_id 可为空，用于无关联命令的审计）。 */
  async createCommandAudit(input: {
    commandId?: string | null;
    action: string;
    actor: string;
    detail?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO command_audits (command_id, action, actor, detail)
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [input.commandId || null, input.action, input.actor, JSON.stringify(input.detail || {})],
    );
  }

  /** 列出某命令关联的全部审计记录，按时间倒序。 */
  async listCommandAudits(commandId: string): Promise<CommandAuditRecord[]> {
    const result = await this.pool.query(
      `
        SELECT id, command_id, action, actor, detail, created_at
        FROM command_audits
        WHERE command_id = $1
        ORDER BY created_at DESC
      `,
      [commandId],
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      commandId: row.command_id,
      action: row.action,
      actor: row.actor,
      detail: row.detail ?? {},
      createdAt: row.created_at.toISOString(),
    }));
  }

  /** 持久化待派发的 Agent Bridge 事件（OpenClaw / NanoClaw 等）。 */
  async createAgentBridgeEvent(event: AgentBridgeEventRecord): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO agent_bridge_events (
          id, source, level, tenant, site, device_id, title, summary, status, created_at, payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      `,
      [
        event.id,
        event.source,
        event.level,
        event.tenant,
        event.site,
        event.deviceId || null,
        event.title,
        event.summary,
        event.status,
        event.createdAt,
        JSON.stringify(event.payload || {}),
      ],
    );
  }

  /** 将事件标记为已派发，并记录 dispatched_at。 */
  async markAgentBridgeEventDispatched(id: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE agent_bridge_events
        SET status = 'dispatched', dispatched_at = NOW()
        WHERE id = $1
      `,
      [id],
    );
  }

  /** 列出 Bridge 事件；可选按 status 过滤，按 created_at 倒序。 */
  async listAgentBridgeEvents(status?: string): Promise<AgentBridgeEventRecord[]> {
    const result = await this.pool.query(
      `
        SELECT id, source, level, tenant, site, device_id, title, summary, status, created_at, payload
        FROM agent_bridge_events
        ${status ? 'WHERE status = $1' : ''}
        ORDER BY created_at DESC
      `,
      status ? [status] : [],
    );

    return result.rows.map((row) => ({
      id: row.id,
      source: row.source,
      level: row.level,
      tenant: row.tenant,
      site: row.site,
      deviceId: row.device_id || undefined,
      title: row.title,
      summary: row.summary,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      payload: row.payload ?? {},
    }));
  }

  /** 插入或更新定时任务定义（cron 表达式、启用状态、下次/上次运行时间等）。 */
  async upsertJobDefinition(job: JobDefinitionRecord): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO job_definitions (
          id, name, description, schedule, enabled, kind, next_run_at, last_run_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          schedule = EXCLUDED.schedule,
          enabled = EXCLUDED.enabled,
          kind = EXCLUDED.kind,
          next_run_at = EXCLUDED.next_run_at,
          last_run_at = EXCLUDED.last_run_at,
          updated_at = NOW()
      `,
      [
        job.id,
        job.name,
        job.description,
        job.schedule,
        job.enabled,
        job.kind,
        job.nextRunAt || null,
        job.lastRunAt || null,
      ],
    );
  }

  /** 列出全部任务定义，按 id 升序。 */
  async listJobDefinitions(): Promise<JobDefinitionRecord[]> {
    const result = await this.pool.query(
      `
        SELECT id, name, description, schedule, enabled, kind, next_run_at, last_run_at, created_at, updated_at
        FROM job_definitions
        ORDER BY id ASC
      `,
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      schedule: row.schedule,
      enabled: row.enabled,
      kind: row.kind,
      nextRunAt: row.next_run_at ? row.next_run_at.toISOString() : null,
      lastRunAt: row.last_run_at ? row.last_run_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  /** 创建一条运行中的 job_runs 记录，返回数据库生成的自增 id。 */
  async createJobRun(jobId: string, startedAt: string): Promise<number> {
    const result = await this.pool.query(
      `
        INSERT INTO job_runs (job_id, status, started_at)
        VALUES ($1, 'running', $2)
        RETURNING id
      `,
      [jobId, startedAt],
    );
    return Number(result.rows[0].id);
  }

  /** 结束单次任务运行：写入最终 status、finished_at 与 output JSON。 */
  async finishJobRun(
    runId: number,
    status: 'success' | 'failed',
    output: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE job_runs
        SET status = $2, finished_at = NOW(), output = $3::jsonb
        WHERE id = $1
      `,
      [runId, status, JSON.stringify(output)],
    );
  }

  /** 更新任务定义的 next_run_at / last_run_at（调度器推进用）。 */
  async updateJobSchedule(jobId: string, nextRunAt: string | null, lastRunAt: string | null): Promise<void> {
    await this.pool.query(
      `
        UPDATE job_definitions
        SET next_run_at = $2, last_run_at = $3, updated_at = NOW()
        WHERE id = $1
      `,
      [jobId, nextRunAt, lastRunAt],
    );
  }

  /** 列出任务运行历史；传入 jobId 时仅查该任务，按 started_at 倒序。 */
  async listJobRuns(jobId?: string): Promise<JobRunRecord[]> {
    const result = await this.pool.query(
      `
        SELECT id, job_id, status, started_at, finished_at, output
        FROM job_runs
        ${jobId ? 'WHERE job_id = $1' : ''}
        ORDER BY started_at DESC
      `,
      jobId ? [jobId] : [],
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      jobId: row.job_id,
      status: row.status,
      startedAt: row.started_at.toISOString(),
      finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
      output: row.output ?? {},
    }));
  }
}

/** 将密钥首尾保留少量字符，中间打星，用于 API 响应中的 token 提示展示。 */
function maskSecret(secret: string): string {
  if (secret.length <= 4) {
    return '*'.repeat(secret.length);
  }
  return `${secret.slice(0, 2)}***${secret.slice(-2)}`;
}
