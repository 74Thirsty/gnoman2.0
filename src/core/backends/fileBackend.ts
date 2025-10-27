import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { BackendUnavailableError, KeyringBackend } from './types';

const DEFAULT_FILE = process.env.GNOMAN_KEYRING_FILE ?? path.join(os.homedir(), '.gnoman', 'secrets.enc');
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const HKDF_INFO = Buffer.from('gnoman-keyring-file', 'utf8');
const SALT_BYTES = 32;
const NONCE_BYTES = 12;

const serialize = (record: Record<string, string>) => JSON.stringify(record, null, 2);

const getPasswordMaterial = () => {
  if (process.env.GNOMAN_KEYRING_PASSWORD) {
    return process.env.GNOMAN_KEYRING_PASSWORD;
  }
  const userInfo = (() => {
    try {
      return os.userInfo().username;
    } catch {
      return 'unknown-user';
    }
  })();
  return `${os.hostname()}|${userInfo}`;
};

const maskFilesystemError = (error: unknown): BackendUnavailableError => {
  const detail = error instanceof Error ? error.message : String(error);
  return new BackendUnavailableError(`File keyring unavailable: ${detail}`, 'file');
};

type PersistedPayload = {
  version: 1;
  salt: string;
  nonce: string;
  authTag: string;
  data: string;
};

export class FileBackend implements KeyringBackend {
  private readonly filePath: string;

  private cache = new Map<string, string>();

  private salt?: Buffer;

  private initialized = false;

  constructor(filePath = DEFAULT_FILE) {
    this.filePath = filePath;
  }

  private async ensureDirectory() {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true, mode: DIR_MODE });
  }

  private deriveKey(salt: Buffer): Buffer {
    try {
      const derived = crypto.hkdfSync('sha256', Buffer.from(getPasswordMaterial()), salt, HKDF_INFO, 32);
      return Buffer.from(derived);
    } catch (error) {
      throw maskFilesystemError(error);
    }
  }

  private async loadFromDisk() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const payload = JSON.parse(raw) as PersistedPayload;
      const salt = Buffer.from(payload.salt, 'base64');
      const nonce = Buffer.from(payload.nonce, 'base64');
      const authTag = Buffer.from(payload.authTag, 'base64');
      const encrypted = Buffer.from(payload.data, 'base64');
      const key = this.deriveKey(salt);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      const record = JSON.parse(decrypted.toString('utf8')) as Record<string, string>;
      this.cache = new Map(Object.entries(record));
      this.salt = salt;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === 'ENOENT') {
        this.cache = new Map();
        this.salt = undefined;
        return;
      }
      throw maskFilesystemError(error);
    }
  }

  private async persist() {
    try {
      await this.ensureDirectory();
      const salt = this.salt ?? crypto.randomBytes(SALT_BYTES);
      this.salt = salt;
      const key = this.deriveKey(salt);
      const nonce = crypto.randomBytes(NONCE_BYTES);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
      const plaintext = Buffer.from(serialize(Object.fromEntries(this.cache.entries())), 'utf8');
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const payload: PersistedPayload = {
        version: 1,
        salt: salt.toString('base64'),
        nonce: nonce.toString('base64'),
        authTag: authTag.toString('base64'),
        data: encrypted.toString('base64')
      };
      await fs.writeFile(this.filePath, JSON.stringify(payload), { mode: FILE_MODE });
    } catch (error) {
      throw maskFilesystemError(error);
    }
  }

  async initialize(): Promise<void> {
    await this.loadFromDisk();
    this.initialized = true;
  }

  private async ensureReady() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async get(key: string): Promise<string | null> {
    await this.ensureReady();
    return this.cache.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureReady();
    this.cache.set(key, value);
    await this.persist();
  }

  async delete(key: string): Promise<void> {
    await this.ensureReady();
    this.cache.delete(key);
    await this.persist();
  }

  async list(): Promise<Record<string, string>> {
    await this.ensureReady();
    return Object.fromEntries(this.cache.entries());
  }
}

export default FileBackend;
