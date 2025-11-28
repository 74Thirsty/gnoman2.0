import { BackendUnavailableError, KeyringBackend } from './types';

export class SystemBackend implements KeyringBackend {
  private readonly serviceName: string;

  private keytarModule?: Promise<typeof import('keytar')>;

  constructor(serviceName = process.env.GNOMAN_KEYRING_SERVICE ?? 'gnoman') {
    this.serviceName = serviceName;
  }

  private loadKeytar() {
    if (!this.keytarModule) {
      this.keytarModule = import('keytar').catch((error) => {
        throw new BackendUnavailableError(
          `System keyring unavailable: ${(error as Error)?.message ?? String(error)}`,
          'system'
        );
      });
    }
    return this.keytarModule;
  }

  private async withKeytar<T>(handler: (keytar: typeof import('keytar')) => Promise<T>) {
    const keytar = await this.loadKeytar();
    try {
      return await handler(keytar);
    } catch (error) {
      throw new BackendUnavailableError(
        `System keyring operation failed: ${(error as Error)?.message ?? String(error)}`,
        'system'
      );
    }
  }

  async initialize(): Promise<void> {
    await this.withKeytar(async (keytar) => {
      await keytar.findCredentials(this.serviceName);
    });
  }

  async get(key: string): Promise<string | null> {
    return this.withKeytar((keytar) => keytar.getPassword(this.serviceName, key));
  }

  async set(key: string, value: string): Promise<void> {
    await this.withKeytar((keytar) => keytar.setPassword(this.serviceName, key, value));
  }

  async delete(key: string): Promise<void> {
    await this.withKeytar((keytar) => keytar.deletePassword(this.serviceName, key));
  }

  async list(): Promise<Record<string, string>> {
    return this.withKeytar(async (keytar) => {
      const credentials = await keytar.findCredentials(this.serviceName);
      const result: Record<string, string> = {};
      for (const credential of credentials) {
        result[credential.account] = credential.password;
      }
      return result;
    });
  }
}

export default SystemBackend;
