import { InfluxDB, Point, QueryApi, WriteApi } from '@influxdata/influxdb-client';

import {
  DeviceTelemetryHistoryPoint,
  DeviceTelemetryHistoryResult,
  DeviceTopicContext,
  DeviceTelemetryPayload,
} from '../types.js';

function escapeFluxStr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Flux time literal (RFC3339, no sub-second) for range(). */
function fluxTimeLiteral(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export class InfluxService {
  private readonly writeApi: WriteApi;
  private readonly queryApi: QueryApi;
  private readonly bucket: string;

  constructor(url: string, token: string, org: string, bucket: string) {
    const client = new InfluxDB({ url, token });
    this.writeApi = client.getWriteApi(org, bucket, 'ms');
    this.queryApi = client.getQueryApi(org);
    this.bucket = bucket;
  }

  async writeTelemetry(
    context: DeviceTopicContext,
    payload: DeviceTelemetryPayload,
    receivedAt: string,
  ): Promise<void> {
    const timestamp = new Date(payload.ts || receivedAt);

    for (const [metric, value] of Object.entries(payload.metrics)) {
      const point = new Point('device_telemetry')
        .tag('tenant', context.tenant)
        .tag('site', context.site)
        .tag('device_id', context.deviceId)
        .tag('metric', metric)
        .timestamp(timestamp);

      if (typeof value === 'number') {
        point.floatField('value', value);
      } else if (typeof value === 'boolean') {
        point.booleanField('value_bool', value);
      } else if (value !== null && value !== undefined) {
        point.stringField('value_text', String(value));
      } else {
        continue;
      }

      if (payload.quality) point.stringField('quality', payload.quality);
      this.writeApi.writePoint(point);
    }

    await this.writeApi.flush();
  }

  /**
   * Reads historical device_telemetry points written by writeTelemetry, scoped by tenant/site/device_id tags.
   */
  async queryDeviceTelemetryHistory(input: {
    tenant: string;
    site: string;
    deviceId: string;
    start: Date;
    end: Date;
    limit: number;
  }): Promise<DeviceTelemetryHistoryResult> {
    const { tenant, site, deviceId, start, end, limit } = input;
    const cap = Math.min(Math.max(1, limit), 5000);
    const flux = [
      `from(bucket: "${escapeFluxStr(this.bucket)}")`,
      `  |> range(start: ${fluxTimeLiteral(start)}, stop: ${fluxTimeLiteral(end)})`,
      `  |> filter(fn: (r) => r["_measurement"] == "device_telemetry")`,
      `  |> filter(fn: (r) => r["device_id"] == "${escapeFluxStr(deviceId)}")`,
      `  |> filter(fn: (r) => r["tenant"] == "${escapeFluxStr(tenant)}")`,
      `  |> filter(fn: (r) => r["site"] == "${escapeFluxStr(site)}")`,
      `  |> sort(columns: ["_time"], desc: true)`,
      `  |> limit(n: ${cap * 6})`,
    ].join('\n');

    const rows = await this.queryApi.collectRows(flux);
    const merged = mergeTelemetryRows(rows as Record<string, unknown>[]);
    merged.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
    const items = merged.slice(0, cap);

    return {
      deviceId,
      tenant,
      site,
      start: start.toISOString(),
      end: end.toISOString(),
      limit: cap,
      items,
    };
  }

  async close(): Promise<void> {
    await this.writeApi.close();
  }
}

function formatInfluxTime(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return String(value ?? '');
}

function mergeTelemetryRows(rows: Record<string, unknown>[]): DeviceTelemetryHistoryPoint[] {
  const groups = new Map<string, DeviceTelemetryHistoryPoint & { _hasValue?: boolean }>();

  for (const row of rows) {
    const timeRaw = row._time;
    const metric = typeof row.metric === 'string' ? row.metric : '';
    const field = typeof row._field === 'string' ? row._field : '';
    const t = formatInfluxTime(timeRaw);
    const key = `${t}\0${metric}`;

    let g = groups.get(key);
    if (!g) {
      g = { time: t, metric, value: null };
      groups.set(key, g);
    }

    const v = row._value;
    if (field === 'value' && typeof v === 'number') {
      g.value = v;
      g._hasValue = true;
    } else if (field === 'value_bool' && typeof v === 'boolean') {
      g.value = v;
      g._hasValue = true;
    } else if (field === 'value_text') {
      g.value = v === null || v === undefined ? null : String(v);
      g._hasValue = true;
    } else if (field === 'quality' && (typeof v === 'string' || v === null)) {
      g.quality = v;
    }
  }

  return Array.from(groups.values())
    .filter((p) => p._hasValue)
    .map(({ _hasValue: _h, ...rest }) => rest);
}
