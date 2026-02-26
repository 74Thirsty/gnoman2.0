import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type PersistedSafeSettings = {
  enabled?: boolean;
  address?: string;
  txSubmissionMode?: 'safe-tx-service' | 'onchain-exec';
  rpcUrl?: string;
};

export type PersistedSafeTransaction = {
  hash: string;
  payload: unknown;
  approvals: string[];
  createdAt: string;
  meta?: Record<string, unknown>;
  executed: boolean;
};

export type PersistedSafe = {
  address: string;
  rpcUrl: string;
  owners: string[];
  threshold: number;
  modules: string[];
  delegates: Array<{ address: string; label: string; since: string }>;
  fallbackHandler?: string;
  guard?: string;
  network?: string;
  transactions: PersistedSafeTransaction[];
};

type SafeConfigPayload = {
  version: number;
  settings?: PersistedSafeSettings;
  safes: PersistedSafe[];
};

export type EffectiveSafeConfig = {
  enabled: boolean;
  address: string;
  txSubmissionMode: 'safe-tx-service' | 'onchain-exec';
  rpcUrl: string;
  configPath: string;
};

const checksum = (content: string) => crypto.createHash('sha256').update(content).digest('hex');
const statSafe = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    return { exists: false, size: 0, mtimeMs: 0 };
  }
  const stat = fs.statSync(filePath);
  return { exists: true, size: stat.size, mtimeMs: stat.mtimeMs };
};

const redactUrl = (value?: string) => {
  if (!value) return '';
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
};

export class SafeConfigRepository {
  private readonly configPath: string;

  private runtimeOverrides: Partial<EffectiveSafeConfig> = {};

  constructor() {
    const configuredPath = process.env.SAFE_CONFIG_PATH?.trim();
    const resolved = configuredPath
      ? path.resolve(configuredPath)
      : path.resolve(process.cwd(), '.gnoman', 'safes.json');
    this.configPath = resolved;

    const stat = statSafe(this.configPath);
    console.info(
      JSON.stringify({
        event: 'SAFE_CONFIG_PATH_RESOLVED',
        path: this.configPath,
        exists: stat.exists,
        size: stat.size,
        lastModified: stat.mtimeMs ? new Date(stat.mtimeMs).toISOString() : null
      })
    );
  }

  getPath() {
    return this.configPath;
  }

  setRuntimeOverrides(overrides: Partial<EffectiveSafeConfig>) {
    this.runtimeOverrides = { ...this.runtimeOverrides, ...overrides };
    console.info(JSON.stringify({ event: 'SAFE_CONFIG_RUNTIME_OVERRIDES', keys: Object.keys(overrides) }));
  }

  load(): SafeConfigPayload {
    console.debug(JSON.stringify({ event: 'TRACE', phase: 'enter', fn: 'SafeConfigRepository.load', path: this.configPath }));
    const stat = statSafe(this.configPath);
    if (!stat.exists) {
      const defaults = { version: 1, safes: [] } satisfies SafeConfigPayload;
      this.logEffectiveConfig(defaults.settings);
      console.debug(JSON.stringify({ event: 'TRACE', phase: 'exit', fn: 'SafeConfigRepository.load', ok: true, reason: 'file-not-found' }));
      return defaults;
    }

    const raw = fs.readFileSync(this.configPath, 'utf8');
    if (!raw.trim()) {
      console.error(JSON.stringify({ event: 'SAFE_CONFIG_LOAD_EMPTY_FILE', path: this.configPath, reason: 'blank-content' }));
      const defaults = { version: 1, safes: [] } satisfies SafeConfigPayload;
      this.logEffectiveConfig(defaults.settings);
      console.debug(JSON.stringify({ event: 'TRACE', phase: 'exit', fn: 'SafeConfigRepository.load', ok: true, reason: 'blank-content' }));
      return defaults;
    }

    const parsed = JSON.parse(raw) as Partial<SafeConfigPayload> | PersistedSafe[];
    const payload: SafeConfigPayload = Array.isArray(parsed)
      ? { version: 1, safes: parsed }
      : { version: Number(parsed.version ?? 1), settings: parsed.settings ?? {}, safes: Array.isArray(parsed.safes) ? parsed.safes : [] };

    if (!Array.isArray(payload.safes)) {
      throw new Error(`SAFE_CONFIG_SCHEMA_INVALID: safes must be array path=${this.configPath}`);
    }

    this.logEffectiveConfig(payload.settings);
    console.debug(JSON.stringify({ event: 'TRACE', phase: 'exit', fn: 'SafeConfigRepository.load', ok: true, safeCount: payload.safes.length }));
    return payload;
  }

  persist(payload: SafeConfigPayload) {
    console.debug(JSON.stringify({ event: 'TRACE', phase: 'enter', fn: 'SafeConfigRepository.persist', path: this.configPath }));
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const serialized = JSON.stringify(payload, null, 2);
    const tmpPath = `${this.configPath}.tmp`;
    fs.writeFileSync(tmpPath, serialized, 'utf8');
    const fd = fs.openSync(tmpPath, 'r');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmpPath, this.configPath);

    const reread = fs.readFileSync(this.configPath, 'utf8');
    const expected = checksum(serialized);
    const actual = checksum(reread);
    if (actual !== expected) {
      throw new Error(`SAFE_CONFIG_PERSIST_MISMATCH checksum expected=${expected} actual=${actual} path=${this.configPath}`);
    }
    const bytes = Buffer.byteLength(serialized, 'utf8');
    console.info(JSON.stringify({ event: 'SAFE_CONFIG_PERSIST_OK', path: this.configPath, bytesWritten: bytes, checksum: actual }));
    console.debug(JSON.stringify({ event: 'TRACE', phase: 'exit', fn: 'SafeConfigRepository.persist', ok: true }));
  }

  getEffectiveSafeConfig(settings?: PersistedSafeSettings): EffectiveSafeConfig {
    const defaults: EffectiveSafeConfig = {
      enabled: false,
      address: '',
      txSubmissionMode: 'safe-tx-service',
      rpcUrl: '',
      configPath: this.configPath
    };
    const persisted = {
      enabled: settings?.enabled,
      address: settings?.address,
      txSubmissionMode: settings?.txSubmissionMode,
      rpcUrl: settings?.rpcUrl
    };
    const envOverrides: Partial<EffectiveSafeConfig> = {
      enabled: process.env.SAFE_MODE_ENABLED === 'true' ? true : undefined,
      address: process.env.SAFE_ADDRESS?.trim() || undefined,
      txSubmissionMode: (process.env.SAFE_TX_SUBMISSION_MODE?.trim() as EffectiveSafeConfig['txSubmissionMode']) || undefined,
      rpcUrl: process.env.SAFE_RPC_URL?.trim() || undefined
    };

    const effective = { ...defaults, ...persisted, ...envOverrides, ...this.runtimeOverrides, configPath: this.configPath };
    console.info(JSON.stringify({ event: 'SAFE_CONFIG_MERGE', order: 'defaults<persisted_file<env_overrides<runtime_overrides', changedByStep: { persisted: Object.keys(persisted).filter((k) => (persisted as Record<string, unknown>)[k] !== undefined), env: Object.keys(envOverrides).filter((k) => (envOverrides as Record<string, unknown>)[k] !== undefined), runtime: Object.keys(this.runtimeOverrides) } }));
    return effective;
  }

  private logEffectiveConfig(settings?: PersistedSafeSettings) {
    const effective = this.getEffectiveSafeConfig(settings);
    console.info(
      JSON.stringify({
        event: 'SAFE_CONFIG_EFFECTIVE',
        config: {
          ...effective,
          rpcUrlHash: redactUrl(effective.rpcUrl),
          rpcUrl: effective.rpcUrl ? 'redacted' : ''
        }
      })
    );
  }
}

export const safeConfigRepository = new SafeConfigRepository();
