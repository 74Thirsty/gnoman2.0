import keyringManager, { KeyringManager } from '../../src/core/keyringManager';

class KeyringServiceManager {
  private activeService = 'GNOMAN';
  private readonly backend = keyringManager;

  getActiveService(): string {
    return this.activeService;
  }

  setActiveService(service: string): void {
    this.activeService = service;
  }

  getCurrentBackend(): string {
    return this.backend.currentBackend();
  }

  async switchBackend(backend: Parameters<typeof keyringManager.switchBackend>[0]): Promise<void> {
    await this.backend.switchBackend(backend);
  }

  private wrapKey(key: string): string {
    return `${this.activeService}:${key}`;
  }

  private unwrapKey(wrappedKey: string): { service: string; key: string } | null {
    const colonIndex = wrappedKey.indexOf(':');
    if (colonIndex === -1) return null;
    return {
      service: wrappedKey.slice(0, colonIndex),
      key: wrappedKey.slice(colonIndex + 1)
    };
  }

  async get(key: string, service?: string): Promise<string | null> {
    const targetService = service ?? this.activeService;
    const wrappedKey = `${targetService}:${key}`;
    return this.backend.get(wrappedKey);
  }

  async set(key: string, value: string, service?: string): Promise<void> {
    const targetService = service ?? this.activeService;
    const wrappedKey = `${targetService}:${key}`;
    await this.backend.set(wrappedKey, value);
  }

  async delete(key: string, service?: string): Promise<void> {
    const targetService = service ?? this.activeService;
    const wrappedKey = `${targetService}:${key}`;
    await this.backend.delete(wrappedKey);
  }

  async list(service?: string): Promise<Record<string, string>> {
    const targetService = service ?? this.activeService;
    const allSecrets = await this.backend.list();
    const prefix = `${targetService}:`;
    const filtered: Record<string, string> = {};

    for (const [wrappedKey, value] of Object.entries(allSecrets)) {
      if (wrappedKey.startsWith(prefix)) {
        const unwrappedKey = wrappedKey.slice(prefix.length);
        filtered[unwrappedKey] = value;
      }
    }

    return filtered;
  }

  async listAllServices(): Promise<string[]> {
    const allSecrets = await this.backend.list();
    const services = new Set<string>();

    for (const wrappedKey of Object.keys(allSecrets)) {
      const unwrapped = this.unwrapKey(wrappedKey);
      if (unwrapped) {
        services.add(unwrapped.service);
      }
    }

    return Array.from(services).sort();
  }
}

const keyringServiceManager = new KeyringServiceManager();

export default keyringServiceManager;
export { KeyringManager, KeyringServiceManager };
