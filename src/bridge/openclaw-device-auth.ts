import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

type DeviceIdentity = {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
};

type DeviceTokenEntry = {
  token: string;
  role: string;
  scopes: string[];
  updatedAtMs: number;
};

type DeviceAuthStore = {
  version: 1;
  deviceId: string;
  tokens: Record<string, DeviceTokenEntry>;
};

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem);
  const spki = key.export({ type: 'spki', format: 'der' }) as Buffer;
  if (
    spki.length === SPKI_PREFIX.length + 32 &&
    spki.subarray(0, SPKI_PREFIX.length).equals(SPKI_PREFIX)
  ) {
    return spki.subarray(SPKI_PREFIX.length);
  }
  return spki;
}

function fingerprintPublicKey(publicKeyPem: string): string {
  return crypto.createHash('sha256').update(derivePublicKeyRaw(publicKeyPem)).digest('hex');
}

function stateRoot(): string {
  return path.join(process.cwd(), 'data', 'openclaw');
}

function identityPath(): string {
  return path.join(stateRoot(), 'identity', 'device.json');
}

function authStorePath(): string {
  return path.join(stateRoot(), 'identity', 'device-auth.json');
}

export function loadOrCreateDeviceIdentity(): DeviceIdentity {
  const filePath = identityPath();

  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DeviceIdentity & {
        version?: number;
      };
      if (parsed?.deviceId && parsed.publicKeyPem && parsed.privateKeyPem) {
        return {
          deviceId: parsed.deviceId,
          publicKeyPem: parsed.publicKeyPem,
          privateKeyPem: parsed.privateKeyPem,
        };
      }
    }
  } catch {
    // regenerate on malformed state
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const identity: DeviceIdentity = {
    deviceId: fingerprintPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  };

  ensureDir(filePath);
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ version: 1, ...identity, createdAtMs: Date.now() }, null, 2)}\n`,
    { mode: 0o600 },
  );
  return identity;
}

export function publicKeyRawBase64UrlFromPem(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

export function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), key));
}

export function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce: string;
  platform?: string | null;
  deviceFamily?: string | null;
}): string {
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token ?? '',
    params.nonce,
    params.platform?.trim().toLowerCase() || '',
    params.deviceFamily?.trim().toLowerCase() || '',
  ].join('|');
}

export function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce: string;
}): string {
  return [
    'v2',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token ?? '',
    params.nonce,
  ].join('|');
}

export function loadDeviceToken(deviceId: string, role: string): DeviceTokenEntry | null {
  const filePath = authStorePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DeviceAuthStore;
    if (parsed?.version !== 1 || parsed.deviceId !== deviceId) return null;
    return parsed.tokens?.[role] ?? null;
  } catch {
    return null;
  }
}

export function storeDeviceToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
}): void {
  const filePath = authStorePath();
  let current: DeviceAuthStore = {
    version: 1,
    deviceId: params.deviceId,
    tokens: {},
  };

  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DeviceAuthStore;
      if (parsed?.version === 1 && parsed.deviceId === params.deviceId && parsed.tokens) {
        current = parsed;
      }
    }
  } catch {
    // overwrite malformed state
  }

  current.tokens[params.role] = {
    token: params.token,
    role: params.role,
    scopes: params.scopes ?? [],
    updatedAtMs: Date.now(),
  };

  ensureDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
}
