import fs from 'fs/promises';
import path from 'path';
import { BackendUnavailableError, KeyringBackend, KeyringBackendName } from './backends/types';
import { FileBackend } from './backends/fileBackend';
import { SystemBackend } from './backends/systemBackend';
import { MemoryBackend } from './backends/memoryBackend';

export type KeyringManagerOptions = {
  auditLogPath?: string;
  backendFactories?: Partial<Record<KeyringBackendName, () => KeyringBackend>>;
};

type OperationName = 'get' | 'set' | 'delete' | 'list' | 'switch';

const FALLBACK_ORDER: KeyringBackendName[] = ['system', 'file', 'memory'];

const maskKey = (key?: string | null) => {
  if (!key) {
    return '...';
  }
  const sanitized = key.replace(/[^A-Za-z0-9]/g, '');
  if (!sanitized) {
    return '...';
  }
  const prefix = sanitized
    .slice(0, 3)
    .toUpperCase()
    .split('')
    .join('_');
  return `${prefix}${prefix ? '_' : ''}...`;
};

const defaultAuditLogPath = () => {
  const base = process.env.GNOMAN_AUDIT_DIR ?? path.join(process.cwd(), 'logs');
  return path.join(base, 'keyring_audit.log');
};

export class KeyringManager {
  private readonly factories: Record<KeyringBackendName, () => KeyringBackend>;

  private readonly auditLogPath: string;

  private activeBackendName?: KeyringBackendName;

  private activeBackend?: KeyringBackend;

  private cache = new Map<string, string>();

  constructor(options?: KeyringManagerOptions) {
    this.factories = {
      system: options?.backendFactories?.system ?? (() => new SystemBackend()),
      file: options?.backendFactories?.file ?? (() => new FileBackend()),
      memory: options?.backendFactories?.memory ?? (() => new MemoryBackend())
    } as Record<KeyringBackendName, () => KeyringBackend>;
    this.auditLogPath = options?.auditLogPath ?? defaultAuditLogPath();
  }

  currentBackend() {
    return this.activeBackendName ?? 'memory';
  }

  private async ensureAuditLogDirectory() {
    const directory = path.dirname(this.auditLogPath);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  }

  private async record(operation: OperationName, key?: string | null, backend = this.currentBackend()) {
    try {
      await this.ensureAuditLogDirectory();
      const timestamp = new Date().toISOString();
      const entry = `${timestamp}\t${backend}\t${operation}\t${maskKey(key)}\n`;
      await fs.appendFile(this.auditLogPath, entry, { encoding: 'utf8' });
    } catch (error) {
      console.warn('Unable to record keyring audit entry.', error);
    }
  }

  private async setActiveBackend(name: KeyringBackendName, backend: KeyringBackend) {
    this.activeBackendName = name;
    this.activeBackend = backend;
    this.cache = new Map();
    const state = await backend.list();
    this.cache = new Map(Object.entries(state));
  }

  private computeFallbackOrder(requested: KeyringBackendName) {
    const index = FALLBACK_ORDER.indexOf(requested);
    if (index === -1) {
      return [...FALLBACK_ORDER];
    }
    return FALLBACK_ORDER.slice(index);
  }

  private createBackend(name: KeyringBackendName) {
    const factory = this.factories[name];
    if (!factory) {
      throw new Error(`Unsupported keyring backend: ${name}`);
    }
    return factory();
  }

  async switchBackend(requested: KeyringBackendName): Promise<void> {
    const attempts = this.computeFallbackOrder(requested);
    for (const candidate of attempts) {
      const backend = this.createBackend(candidate);
      try {
        await backend.initialize();
        if (this.activeBackend?.shutdown) {
          await this.activeBackend.shutdown();
        }
        await this.setActiveBackend(candidate, backend);
        await this.record('switch', null, candidate);
        return;
      } catch (error) {
        if (error instanceof BackendUnavailableError) {
          console.warn(`Keyring backend '${candidate}' unavailable.`, error.message);
          continue;
        }
        throw error;
      }
    }
    throw new Error('No available keyring backend.');
  }

  private async ensureBackend(): Promise<KeyringBackend> {
    if (!this.activeBackend) {
      await this.switchBackend('system');
    }
    if (!this.activeBackend) {
      throw new Error('No available keyring backend.');
    }
    return this.activeBackend;
  }

  private nextFallback(current: KeyringBackendName) {
    const index = FALLBACK_ORDER.indexOf(current);
    if (index === -1 || index === FALLBACK_ORDER.length - 1) {
      return undefined;
    }
    return FALLBACK_ORDER[index + 1];
  }

  private async execute<T>(
    operation: (backend: KeyringBackend) => Promise<T>,
    name: OperationName,
    key?: string | null
  ): Promise<T> {
    const backend = await this.ensureBackend();
    try {
      const result = await operation(backend);
      await this.record(name, key);
      return result;
    } catch (error) {
      if (error instanceof BackendUnavailableError) {
        const fallback = this.nextFallback(this.currentBackend());
        if (!fallback) {
          throw new Error('All keyring backends are unavailable.');
        }
        console.warn(
          `Keyring backend '${this.currentBackend()}' failed (${error.message}). Falling back to '${fallback}'.`
        );
        await this.switchBackend(fallback);
        return this.execute(operation, name, key);
      }
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    const value = await this.execute(async (backend) => {
      const result = await backend.get(key);
      if (result === null) {
        this.cache.delete(key);
      } else {
        this.cache.set(key, result);
      }
      return result;
    }, 'get', key);
    return value;
  }

  async set(key: string, value: string): Promise<void> {
    await this.execute(async (backend) => {
      await backend.set(key, value);
      this.cache.set(key, value);
    }, 'set', key);
  }

  async delete(key: string): Promise<void> {
    await this.execute(async (backend) => {
      await backend.delete(key);
      this.cache.delete(key);
    }, 'delete', key);
  }

  async list(): Promise<Record<string, string>> {
    const state = await this.execute(async (backend) => {
      const snapshot = await backend.list();
      this.cache = new Map(Object.entries(snapshot));
      return snapshot;
    }, 'list', 'ALL');
    return state;
  }
}

export const keyringManager = new KeyringManager();

export default keyringManager;
