import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ErrnoException } from 'node:fs';

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
@@ -83,51 +84,51 @@ class KeyringAccessor {
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
      const maybeErrno = error as ErrnoException;
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
