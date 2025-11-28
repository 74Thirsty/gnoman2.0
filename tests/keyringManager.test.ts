import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { KeyringManager } from '../src/core/keyringManager';
import { MemoryBackend } from '../src/core/backends/memoryBackend';
import { FileBackend } from '../src/core/backends/fileBackend';
import { BackendUnavailableError, KeyringBackend } from '../src/core/backends/types';

class StubBackend implements KeyringBackend {
  constructor(private state: Record<string, string>) {}

  async initialize(): Promise<void> {
    // no-op
  }

  async get(key: string): Promise<string | null> {
    return this.state[key] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.state[key] = value;
  }

  async delete(key: string): Promise<void> {
    delete this.state[key];
  }

  async list(): Promise<Record<string, string>> {
    return { ...this.state };
  }
}

describe('KeyringManager', () => {
  const createTempPath = (fileName: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnoman-keyring-test-'));
    return path.join(dir, fileName);
  };

  it('switchBackend reloads secrets from the requested backend', async () => {
    const manager = new KeyringManager({
      backendFactories: {
        system: () => new StubBackend({ RPC_URL: 'https://system' }),
        file: () => new StubBackend({ FILE_ONLY: 'present' }),
        memory: () => new MemoryBackend()
      },
      auditLogPath: createTempPath('audit.log')
    });

    await manager.switchBackend('system');
    expect(await manager.get('RPC_URL')).toBe('https://system');

    await manager.switchBackend('file');
    const snapshot = await manager.list();
    expect(snapshot).toEqual({ FILE_ONLY: 'present' });
    expect(await manager.get('FILE_ONLY')).toBe('present');
  });

  it('round-trips secrets between persistent backends', async () => {
    const filePath = createTempPath('secrets.enc');
    const manager = new KeyringManager({
      backendFactories: {
        system: () => new FileBackend(filePath),
        file: () => new FileBackend(filePath),
        memory: () => new MemoryBackend()
      },
      auditLogPath: createTempPath('audit.log')
    });

    await manager.switchBackend('system');
    await manager.set('API_TOKEN', 'system-token');
    expect(await manager.get('API_TOKEN')).toBe('system-token');

    await manager.switchBackend('file');
    expect(await manager.get('API_TOKEN')).toBe('system-token');

    await manager.set('API_TOKEN', 'file-token');
    expect(await manager.get('API_TOKEN')).toBe('file-token');

    await manager.switchBackend('system');
    expect(await manager.get('API_TOKEN')).toBe('file-token');
  });

  it('encrypts secrets on disk for the file backend', async () => {
    const filePath = createTempPath('secrets.enc');
    const manager = new KeyringManager({
      backendFactories: {
        system: () => new FileBackend(filePath),
        file: () => new FileBackend(filePath),
        memory: () => new MemoryBackend()
      },
      auditLogPath: createTempPath('audit.log')
    });

    await manager.switchBackend('file');
    await manager.set('PRIVATE_KEY', 'super-secret-value');

    const raw = await fsPromises.readFile(filePath, 'utf8');
    expect(raw).not.toContain('super-secret-value');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('falls back when the system backend is unavailable', async () => {
    class FailingBackend implements KeyringBackend {
      async initialize(): Promise<void> {
        throw new BackendUnavailableError('Unavailable', 'system');
      }
      async get(): Promise<string | null> {
        throw new Error('unreachable');
      }
      async set(): Promise<void> {
        throw new Error('unreachable');
      }
      async delete(): Promise<void> {
        throw new Error('unreachable');
      }
      async list(): Promise<Record<string, string>> {
        throw new Error('unreachable');
      }
    }

    const manager = new KeyringManager({
      backendFactories: {
        system: () => new FailingBackend(),
        file: () => new MemoryBackend(),
        memory: () => new MemoryBackend()
      },
      auditLogPath: createTempPath('audit.log')
    });

    const secrets = await manager.list();
    expect(secrets).toEqual({});
    expect(['file', 'memory']).toContain(manager.currentBackend());
  });
});
