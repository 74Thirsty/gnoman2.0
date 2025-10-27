import crypto from 'crypto';
import keyringAccessor from './keyringAccessor';

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
  await keyringAccessor.setSecret(key, encoded);
}

export async function getSecureSetting<T>(key: string, fallback: T) {
  const encoded = await keyringAccessor.getSecret(key);
  return decode(encoded, fallback);
}

export async function deleteSecureSetting(key: string) {
  await keyringAccessor.removeSecret(key);
}

export function generateSecureKey(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

export function getActiveKeyringService() {
  return {
    service: keyringAccessor.getActiveService(),
    backend: keyringAccessor.getBackendFlavor()
  };
}
