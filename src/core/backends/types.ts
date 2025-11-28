export type KeyringBackendName = 'system' | 'file' | 'memory';

export interface KeyringBackend {
  initialize(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<Record<string, string>>;
  shutdown?(): Promise<void>;
}

export class BackendUnavailableError extends Error {
  constructor(message: string, public readonly backend: KeyringBackendName) {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}
