import crypto from 'crypto';

let keytar: typeof import('keytar') | undefined;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  keytar = require('keytar');
} catch (error) {
  console.warn('Keytar unavailable, secure settings will use in-memory fallback.', error);
}

const SERVICE_NAME = 'aes';
const memoryStore = new Map<string, string>();

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decode<T>(encoded: string | null, fallback: T): T {
  if (!encoded) {
    return fallback;
  }
  try {
    const raw = Buffer.from(encoded, 'base64url').toString('utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn('Unable to decode secure setting payload. Resetting to fallback.', error);
    return fallback;
  }
}

export async function setSecureSetting<T>(key: string, value: T) {
  const encoded = encode(value);
  if (keytar) {
    await keytar.setPassword(SERVICE_NAME, key, encoded);
    return;
  }
  memoryStore.set(`${SERVICE_NAME}:${key}`, encoded);
}

export async function getSecureSetting<T>(key: string, fallback: T) {
  const encoded = keytar
    ? await keytar.getPassword(SERVICE_NAME, key)
    : memoryStore.get(`${SERVICE_NAME}:${key}`) ?? null;
  return decode(encoded, fallback);
}

export async function deleteSecureSetting(key: string) {
  if (keytar) {
    await keytar.deletePassword(SERVICE_NAME, key);
    return;
  }
  memoryStore.delete(`${SERVICE_NAME}:${key}`);
}

export function generateSecureKey(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}
