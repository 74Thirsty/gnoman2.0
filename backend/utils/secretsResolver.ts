import fs from 'fs';
import path from 'path';
import { FileBackend } from '../../src/core/backends/fileBackend';
import { SystemBackend } from '../../src/core/backends/systemBackend';
import { runtimeTelemetry, type SecretsTelemetryEntry } from '../services/runtimeTelemetryService';

type SourceName = 'env' | 'project-env' | 'encrypted-file' | 'keyring' | 'missing';

type ResolveOpts = { required?: boolean; failClosed?: boolean };

const projectEnvPath = path.join(process.cwd(), '.env');

const parseDotEnv = (raw: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
    result[key] = value;
  }
  return result;
};

const redact = (value?: string | null) => {
  if (!value) return '****';
  if (value.length <= 4) return '****';
  return `****${value.slice(-4)}`;
};

class SecretsResolver {
  private projectEnv: Record<string, string> = {};

  private encryptedFileSecrets: Record<string, string> = {};

  private keyringSecrets: Record<string, string> = {};

  private initialized = false;

  private diagnostics = new Map<string, SecretsTelemetryEntry>();

  private async loadProjectEnv() {
    if (!fs.existsSync(projectEnvPath)) return;
    this.projectEnv = parseDotEnv(fs.readFileSync(projectEnvPath, 'utf8'));
  }

  private async loadEncryptedFile() {
    try {
      const backend = new FileBackend();
      await backend.initialize();
      this.encryptedFileSecrets = await backend.list();
    } catch (error) {
      console.warn('Encrypted local secrets file unavailable.', error);
    }
  }

  private hasGuiSession() {
    return Boolean(process.env.DISPLAY && process.env.DBUS_SESSION_BUS_ADDRESS);
  }

  private async loadSystemKeyring() {
    if (!this.hasGuiSession()) {
      return;
    }
    try {
      const backend = new SystemBackend();
      await backend.initialize();
      this.keyringSecrets = await backend.list();
    } catch (error) {
      console.warn('OS keyring unavailable.', error);
    }
  }

  async initialize() {
    if (this.initialized) return;
    await this.loadProjectEnv();
    await this.loadEncryptedFile();
    await this.loadSystemKeyring();
    this.initialized = true;
  }

  private setDiagnostic(key: string, source: SourceName, required: boolean, value?: string | null) {
    const entry: SecretsTelemetryEntry = {
      key,
      required,
      present: Boolean(value && value.trim()),
      source,
      redacted: redact(value)
    };
    this.diagnostics.set(key, entry);
    runtimeTelemetry.setSecretsStatus(Array.from(this.diagnostics.values()));
  }

  async resolve(key: string, opts: ResolveOpts = {}): Promise<string | null> {
    await this.initialize();
    const required = Boolean(opts.required);
    const envValue = process.env[key]?.trim();
    if (envValue) {
      this.setDiagnostic(key, 'env', required, envValue);
      return envValue;
    }

    const projectValue = this.projectEnv[key]?.trim();
    if (projectValue) {
      this.setDiagnostic(key, 'project-env', required, projectValue);
      return projectValue;
    }

    const fileValue = this.encryptedFileSecrets[key]?.trim();
    if (fileValue) {
      this.setDiagnostic(key, 'encrypted-file', required, fileValue);
      return fileValue;
    }

    const keyringValue = this.keyringSecrets[key]?.trim();
    if (keyringValue) {
      this.setDiagnostic(key, 'keyring', required, keyringValue);
      return keyringValue;
    }

    const checked = ['env', 'project-env', 'encrypted-file', this.hasGuiSession() ? 'keyring' : 'keyring-skipped'];
    const payload = { event: 'MISSING_SECRET', key, checked };
    console.error(JSON.stringify(payload));
    this.setDiagnostic(key, 'missing', required, null);

    if (required && opts.failClosed !== false) {
      throw new Error(`Missing required secret: ${key}`);
    }

    return null;
  }

  getDiagnostics() {
    return Array.from(this.diagnostics.values());
  }

  logBootSummary(requiredKeys: string[] = []) {
    const summary = requiredKeys.map((key) => {
      const existing = this.diagnostics.get(key);
      return existing ?? { key, required: true, present: false, source: 'missing', redacted: '****' };
    });
    console.info(
      JSON.stringify({ event: 'SECRETS_BOOT_STATUS', secrets: summary.map((entry) => ({ ...entry, value: entry.present ? entry.redacted : '****' })) })
    );
  }
}

export const secretsResolver = new SecretsResolver();
