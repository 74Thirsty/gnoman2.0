import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DEFAULT_SERVICE = 'aes';
const BASE_DIR = process.env.GNOMAN_KEYRING_DIR ?? path.join(process.cwd(), '.gnoman', 'keyrings');
const KEY_DERIVATION_SALT = process.env.GNOMAN_KEYRING_SALT ?? 'gnoman-keyring-salt';
const KEY_DERIVATION_ITERATIONS = 120_000;
const KEYRING_VERSION = 1;

type BackendFlavor = 'file' | 'memory';

type PersistedSecret = {
  iv: string;
  authTag: string;
  ciphertext: string;
};

type PersistedServicePayload = {
  version: number;
  entries: Record<string, PersistedSecret>;
};

const maskValue = (value: string | null) => {
  if (!value) {
    return null;
  }
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

const ensureDirectory = () => {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true, mode: 0o700 });
  }
};

const deriveKey = (service: string) =>
  crypto.pbkdf2Sync(service, KEY_DERIVATION_SALT, KEY_DERIVATION_ITERATIONS, 32, 'sha512');

const encryptValue = (value: string, service: string): PersistedSecret => {
  const iv = crypto.randomBytes(12);
  const key = deriveKey(service);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: ciphertext.toString('hex')
  };
};

const decryptValue = (secret: PersistedSecret, service: string) => {
  try {
    const key = deriveKey(service);
    const iv = Buffer.from(secret.iv, 'hex');
    const authTag = Buffer.from(secret.authTag, 'hex');
    const ciphertext = Buffer.from(secret.ciphertext, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.warn('Unable to decrypt keyring secret. Entry will be ignored.', error);
    return null;
  }
};

class KeyringAccessor {
  private activeService: string = DEFAULT_SERVICE;

  private preferredBackend: BackendFlavor = 'file';

  private effectiveBackend: BackendFlavor = 'file';

  private readonly stores = new Map<string, Map<string, string>>();

  constructor() {
    try {
      ensureDirectory();
      this.ensureServiceStore(this.activeService);
    } catch (error) {
      console.warn('Failed to initialize keyring storage. Falling back to memory backend.', error);
      this.preferredBackend = 'memory';
      this.effectiveBackend = 'memory';
    }
  }

  private normalizeService(service?: string) {
    const candidate = typeof service === 'string' ? service.trim() : '';
    if (candidate) {
      return candidate;
    }
    return this.activeService || DEFAULT_SERVICE;
  }

  private getDatabasePath(service: string) {
    return path.join(BASE_DIR, `${service}.json`);
  }

  private loadFromDisk(service: string) {
    ensureDirectory();
    const filePath = this.getDatabasePath(service);
    if (!fs.existsSync(filePath)) {
      const emptyPayload: PersistedServicePayload = { version: KEYRING_VERSION, entries: {} };
      fs.writeFileSync(filePath, JSON.stringify(emptyPayload, null, 2), {
        encoding: 'utf8',
        mode: 0o600
      });
      return new Map<string, string>();
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedServicePayload;
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Invalid keyring payload');
      }
      const entries = parsed.entries ?? {};
      const store = new Map<string, string>();
      for (const [key, payload] of Object.entries(entries)) {
        if (
          !payload ||
          typeof payload !== 'object' ||
          typeof payload.iv !== 'string' ||
          typeof payload.authTag !== 'string' ||
          typeof payload.ciphertext !== 'string'
        ) {
          continue;
        }
        const value = decryptValue(payload, service);
        if (value !== null) {
          store.set(key, value);
        }
      }
      return store;
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Unable to load keyring database: ${error.message}`
          : 'Unable to load keyring database.'
      );
    }
  }

  private persistToDisk(service: string, store: Map<string, string>) {
    if (this.preferredBackend !== 'file') {
      return;
    }
    try {
      ensureDirectory();
      const payload: PersistedServicePayload = { version: KEYRING_VERSION, entries: {} };
      for (const [key, value] of store.entries()) {
        payload.entries[key] = encryptValue(value, service);
      }
      const filePath = this.getDatabasePath(service);
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), {
        encoding: 'utf8',
        mode: 0o600
      });
      fs.chmodSync(filePath, 0o600);
      this.effectiveBackend = 'file';
    } catch (error) {
      console.warn(`Unable to persist keyring service '${service}'. Falling back to memory backend.`, error);
      this.preferredBackend = 'memory';
      this.effectiveBackend = 'memory';
    }
  }

  private ensureServiceStore(service: string) {
    const normalized = service.trim();
    let store = this.stores.get(normalized);
    if (store) {
      return store;
    }
    if (this.preferredBackend === 'file') {
      try {
        store = this.loadFromDisk(normalized);
        this.effectiveBackend = 'file';
      } catch (error) {
        console.warn(
          error instanceof Error ? error.message : 'Failed to load keyring service from disk. Using memory store.'
        );
        this.preferredBackend = 'memory';
        this.effectiveBackend = 'memory';
        store = new Map<string, string>();
      }
    } else {
      store = new Map<string, string>();
    }
    this.stores.set(normalized, store);
    return store;
  }

  currentBackend() {
    return this.effectiveBackend;
  }

  availableBackends(): BackendFlavor[] {
    return ['file', 'memory'];
  }

  getActiveService() {
    return this.activeService;
  }

  async listSecrets(service?: string) {
    const normalized = this.normalizeService(service);
    const store = this.ensureServiceStore(normalized);
    const secrets = Array.from(store.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ key, maskedValue: maskValue(value) }));
    return {
      service: normalized,
      backend: this.currentBackend(),
      secrets
    };
  }

  async setSecret(key: string, value: string, service?: string) {
    const normalized = this.normalizeService(service);
    const store = this.ensureServiceStore(normalized);
    store.set(key, value);
    this.persistToDisk(normalized, store);
    return normalized;
  }

  async getSecret(key: string, service?: string) {
    const normalized = this.normalizeService(service);
    const store = this.ensureServiceStore(normalized);
    return { service: normalized, value: store.get(key) ?? null };
  }

  async removeSecret(key: string, service?: string) {
    const normalized = this.normalizeService(service);
    const store = this.ensureServiceStore(normalized);
    const removed = store.delete(key);
    if (removed) {
      this.persistToDisk(normalized, store);
    }
    return { service: normalized, removed };
  }

  async switchService(service: string) {
    const normalized = this.normalizeService(service);
    if (!normalized) {
      throw new Error('service is required');
    }
    this.ensureServiceStore(normalized);
    this.activeService = normalized;
    return { service: normalized, backend: this.currentBackend() };
  }

  async switchBackend(backend: BackendFlavor) {
    if (backend === 'file') {
      this.preferredBackend = 'file';
      try {
        for (const [service, store] of this.stores.entries()) {
          this.persistToDisk(service, store);
        }
        // reload active store to ensure consistency
        const reloaded = this.loadFromDisk(this.activeService);
        this.stores.set(this.activeService, reloaded);
        this.effectiveBackend = 'file';
      } catch (error) {
        this.preferredBackend = 'memory';
        this.effectiveBackend = 'memory';
        throw new Error(
          error instanceof Error
            ? `Unable to activate file backend: ${error.message}`
            : 'Unable to activate file backend.'
        );
      }
    } else {
      this.preferredBackend = 'memory';
      this.effectiveBackend = 'memory';
    }
    return { backend: this.currentBackend(), service: this.activeService };
  }

  async status() {
    return {
      service: this.activeService,
      backend: this.currentBackend(),
      available: this.availableBackends()
    };
  }

  async set(key: string, value: string) {
    await this.setSecret(key, value, this.activeService);
  }

  async get(key: string) {
    const result = await this.getSecret(key, this.activeService);
    return result.value;
  }

  async delete(key: string) {
    await this.removeSecret(key, this.activeService);
  }
}

const keyringAccessor = new KeyringAccessor();

export default keyringAccessor;
