import fs from 'fs';
import os from 'os';
import path from 'path';
import { KeyringManager } from '../src/core/keyringManager';
import { MemoryBackend } from '../src/core/backends/memoryBackend';
import type { KeyringBackend } from '../src/core/backends/types';
import {
  deleteKeyringSecret,
  getKeyringUiSummary,
  revealKeyringSecret,
  storeKeyringSecret,
  switchKeyringBackend
} from '../backend/services/keyringUiService';

class StubBackend implements KeyringBackend {
  constructor(private readonly state: Record<string, string>) {}

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

describe('keyringUiService', () => {
  const createTempPath = (fileName: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnoman-keyring-ui-service-'));
    return path.join(dir, fileName);
  };

  const buildManager = () =>
    new KeyringManager({
      backendFactories: {
        system: () => new StubBackend({ API_TOKEN: 'secret-token', RPC_URL: 'https://rpc.local' }),
        file: () => new StubBackend({ FILE_ONLY: 'alpha' }),
        memory: () => new MemoryBackend()
      },
      auditLogPath: createTempPath('audit.log')
    });

  it('maps backend state into masked UI fields', async () => {
    const manager = buildManager();

    await manager.switchBackend('system');
    const summary = await getKeyringUiSummary(manager);

    expect(summary.backend).toBe('system');
    expect(summary.service).toBe('system');
    expect(summary.displayName).toContain('Keyring');
    expect(summary.secrets).toEqual([
      { alias: 'API_TOKEN', maskedValue: 'se•••en' },
      { alias: 'RPC_URL', maskedValue: 'ht•••al' }
    ]);
  });

  it('switches backend before store/reveal/delete when a service override is provided', async () => {
    const manager = buildManager();

    await manager.switchBackend('system');
    expect(manager.currentBackend()).toBe('system');

    const stored = await storeKeyringSecret({ alias: 'FILE_ONLY', secret: 'bravo', service: 'file' }, manager);
    expect(manager.currentBackend()).toBe('file');
    expect(stored.secrets).toEqual([{ alias: 'FILE_ONLY', maskedValue: 'br•••vo' }]);

    await switchKeyringBackend('system', manager);
    expect(await revealKeyringSecret({ alias: 'API_TOKEN', service: 'system' }, manager)).toBe('secret-token');

    const afterDelete = await deleteKeyringSecret({ alias: 'FILE_ONLY', service: 'file' }, manager);
    expect(afterDelete.backend).toBe('file');
    expect(afterDelete.secrets).toEqual([]);
  });
});
