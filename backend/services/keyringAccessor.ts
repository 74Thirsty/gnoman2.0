import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let keyringLib: typeof import('keyring') | undefined;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  keyringLib = require('keyring');
} catch (error) {
  console.warn('Keyring module unavailable. Falling back to volatile in-memory store.', error);
}

type KeyringApi = {
  load(): KeyringApi;
  save(): KeyringApi;
  storeEncrypted(key: string, value: string): KeyringApi;
  retrieveEncrypted(key: string): string | null;
  retrieve(key: string): string | null;
  db?: Record<string, unknown>;
};

type BackendFlavor = 'keyring' | 'memory';

const DEFAULT_SERVICE = 'aes';
const BASE_DIR = process.env.GNOMAN_KEYRING_DIR ?? path.join(process.cwd(), '.gnoman', 'keyrings');

function ensureDirectory() {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
  }
}

function deriveKey(service: string) {
  return crypto.createHash('sha256').update(`gnoman:${service}`).digest('hex');
}

function flattenKeys(db: unknown, prefix = ''): string[] {
  if (typeof db !== 'object' || db === null) {
    return prefix ? [prefix.slice(1)] : [];
  }
  const entries = db as Record<string, unknown>;
  const keys: string[] = [];
  for (const [key, value] of Object.entries(entries)) {
    const nextPrefix = `${prefix}${prefix ? '.' : ''}${key}`;
    if (typeof value === 'object' && value !== null) {
      keys.push(...flattenKeys(value, nextPrefix));
    } else {
      keys.push(nextPrefix);
    }
  }
  return keys;
}

function maskSecret(value: string | null) {
  if (!value) {
    return null;
  }
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

class KeyringAccessor {
  private activeService: string;

  private instances = new Map<string, KeyringApi>();

  private fallbackStore = new Map<string, Map<string, string>>();

  private backendFlavor: BackendFlavor;

  constructor(defaultService = DEFAULT_SERVICE) {
    this.activeService = defaultService;
    this.backendFlavor = keyringLib ? 'keyring' : 'memory';
    if (keyringLib) {
      ensureDirectory();
      void this.ensureInstance(defaultService);
    }
  }

  private getDatabasePath(service: string) {
    return path.join(BASE_DIR, `${service}.json`);
  }

  private ensureInstance(service: string) {
    if (!keyringLib) {
      return undefined;
    }
    const normalized = service.trim();
    const cached = this.instances.get(normalized);
    if (cached) {
      try {
        cached.load();
      } catch (error) {
        console.warn(`Failed to reload keyring database for service ${normalized}.`, error);
      }
      return cached;
    }
    ensureDirectory();
    const databasePath = this.getDatabasePath(normalized);
    const encryptionKey = deriveKey(normalized);
    const instance = keyringLib.instance(encryptionKey, databasePath) as KeyringApi;
    try {
      instance.load();
    } catch (error) {
      const maybeErrno = error as NodeJS.ErrnoException;
      if (maybeErrno.code === 'ENOENT') {
        try {
          fs.writeFileSync(databasePath, '{}', 'utf-8');
        } catch (writeError) {
          console.error(`Unable to initialize keyring database for service ${normalized}.`, writeError);
          return undefined;
        }
      } else {
        console.error(`Unable to load keyring database for service ${normalized}.`, error);
        return undefined;
      }
    }
    this.instances.set(normalized, instance);
    return instance;
  }

  private ensureFallback(service: string) {
    const normalized = service.trim();
    let store = this.fallbackStore.get(normalized);
    if (!store) {
      store = new Map<string, string>();
      this.fallbackStore.set(normalized, store);
    }
    return store;
  }

  private ensureService(service?: string) {
    const normalized = service?.trim() || this.activeService;
    if (!normalized) {
      throw new Error('Keyring service name cannot be empty.');
    }
    return normalized;
  }

  getActiveService() {
    return this.activeService;
  }

  getBackendFlavor() {
    return this.backendFlavor;
  }

  async switchService(service: string) {
    const normalized = this.ensureService(service);
    if (keyringLib) {
      void this.ensureInstance(normalized);
    }
    this.activeService = normalized;
    return {
      service: this.activeService,
      backend: this.backendFlavor
    };
  }

  async setSecret(key: string, value: string, service?: string) {
    const normalizedService = this.ensureService(service);
    if (!key) {
      throw new Error('Key name is required.');
    }
    if (!keyringLib) {
      this.ensureFallback(normalizedService).set(key, value);
      return;
    }
    const instance = this.ensureInstance(normalizedService);
    if (!instance) {
      this.ensureFallback(normalizedService).set(key, value);
      this.backendFlavor = 'memory';
      return;
    }
    instance.storeEncrypted(key, value).save();
  }

  async getSecret(key: string, service?: string) {
    const normalizedService = this.ensureService(service);
    if (!key) {
      throw new Error('Key name is required.');
    }
    if (!keyringLib) {
      return this.ensureFallback(normalizedService).get(key) ?? null;
    }
    const instance = this.ensureInstance(normalizedService);
    if (!instance) {
      return this.ensureFallback(normalizedService).get(key) ?? null;
    }
    instance.load();
    return instance.retrieveEncrypted(key);
  }

  async removeSecret(key: string, service?: string) {
    const normalizedService = this.ensureService(service);
    if (!key) {
      throw new Error('Key name is required.');
    }
    if (!keyringLib) {
      this.ensureFallback(normalizedService).delete(key);
      return;
    }
    const instance = this.ensureInstance(normalizedService);
    if (!instance) {
      this.ensureFallback(normalizedService).delete(key);
      return;
    }
    instance.load();
    const db = instance.db ?? {};
    const segments = key.split('.');
    let cursor: Record<string, unknown> | undefined = db;
    for (let idx = 0; idx < segments.length - 1; idx += 1) {
      const part = segments[idx];
      const next = cursor?.[part];
      if (typeof next !== 'object' || next === null) {
        cursor = undefined;
        break;
      }
      cursor = next as Record<string, unknown>;
    }
    if (cursor) {
      delete cursor[segments[segments.length - 1]];
      instance.save();
    }
  }

  async listSecrets(service?: string) {
    const normalizedService = this.ensureService(service);
    if (!keyringLib) {
      const store = this.ensureFallback(normalizedService);
      return {
        service: normalizedService,
        backend: this.backendFlavor,
        secrets: Array.from(store.keys()).map((key) => ({
          key,
          maskedValue: maskSecret(store.get(key) ?? null)
        }))
      };
    }
    const instance = this.ensureInstance(normalizedService);
    if (!instance) {
      const fallback = this.ensureFallback(normalizedService);
      return {
        service: normalizedService,
        backend: this.backendFlavor,
        secrets: Array.from(fallback.keys()).map((key) => ({
          key,
          maskedValue: maskSecret(fallback.get(key) ?? null)
        }))
      };
    }
    instance.load();
    const db = instance.db ?? {};
    const keys = flattenKeys(db);
    return {
      service: normalizedService,
      backend: this.backendFlavor,
      secrets: keys.map((key) => ({
        key,
        maskedValue: maskSecret(instance.retrieveEncrypted(key))
      }))
    };
  }
}

const keyringAccessor = new KeyringAccessor();

export default keyringAccessor;
export { KeyringAccessor };
