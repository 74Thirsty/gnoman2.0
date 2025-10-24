import crypto from 'crypto';

let keytar: typeof import('keytar') | undefined;

try {
  // Lazy load keytar to allow optional usage during development environments where native modules are unavailable.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  keytar = require('keytar');
} catch (error) {
  console.warn('Keytar is not available. Falling back to in-memory keyring store.', error);
}

interface MemoryEntry {
  alias: string;
  secret: string;
}

const memoryStore: MemoryEntry[] = [];

export class KeyringManager {
  private readonly serviceName = 'SafeVault';

  async addEntry(alias: string, secret: string) {
    if (keytar) {
      await keytar.setPassword(this.serviceName, alias, secret);
      return;
    }
    const existingIndex = memoryStore.findIndex((entry) => entry.alias === alias);
    if (existingIndex >= 0) {
      memoryStore[existingIndex] = { alias, secret };
    } else {
      memoryStore.push({ alias, secret });
    }
  }

  async getEntry(alias: string) {
    if (keytar) {
      return keytar.getPassword(this.serviceName, alias);
    }
    return memoryStore.find((entry) => entry.alias === alias)?.secret ?? null;
  }

  async deleteEntry(alias: string) {
    if (keytar) {
      await keytar.deletePassword(this.serviceName, alias);
      return;
    }
    const index = memoryStore.findIndex((entry) => entry.alias === alias);
    if (index >= 0) {
      memoryStore.splice(index, 1);
    }
  }

  async listEntries() {
    if (keytar) {
      const credentials = await keytar.findCredentials(this.serviceName);
      return credentials.map((credential) => ({ alias: credential.account }));
    }
    return memoryStore.map((entry) => ({ alias: entry.alias }));
  }

  generateEphemeralSecret(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }
}
