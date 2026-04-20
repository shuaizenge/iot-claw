import { IncomingMessage, ServerResponse } from 'http';

export function parseUrl(req: IncomingMessage): URL {
  return new URL(req.url || '/', 'http://localhost');
}

export function readBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim();
  return token ? token : null;
}

export function parseLimit(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Invalid request: `limit` must be a positive number');
  }
  return value;
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid request: body must be valid JSON');
  }
}

export function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload, null, 2));
}

export function sendText(
  res: ServerResponse,
  statusCode: number,
  contentType: string,
  payload: string,
): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', contentType);
  res.end(payload);
}

export function sendError(res: ServerResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const statusCode =
    message.startsWith('Unauthorized:')
      ? 401
      : message.startsWith('Invalid request:')
        ? 400
        : 500;
  sendJson(res, statusCode, { error: message });
}
