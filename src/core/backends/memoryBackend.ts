import { KeyringBackend } from './types';

export class MemoryBackend implements KeyringBackend {
  private store = new Map<string, string>();

  async initialize(): Promise<void> {
    this.store = new Map<string, string>();
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(): Promise<Record<string, string>> {
    return Object.fromEntries(this.store.entries());
  }
}

export default MemoryBackend;
