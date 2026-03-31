import fs from 'fs';
import path from 'path';
import { FileBackend } from '../core/backends/fileBackend';
import keyringAccessor from '../../backend/services/keyringAccessor';
import { runtimeObservability, type SecretAuditRecord } from './runtimeObservability';

export type SecretSource = 'env' | 'dotenv' | 'file' | 'keyring' | 'missing';

const bootEnvKeys = new Set(Object.keys(process.env));
let dotenvLoaded = false;
let fileBackend: FileBackend | null = null;
let fileSecrets = new Map<string, string>();

const GUI_KEYRING_ALLOWED = Boolean(process.env.DISPLAY && process.env.DBUS_SESSION_BUS_ADDRESS);

const redact = (value: string | undefined) => {
  if (!value) {
    return 'MISSING';
  }
  const trimmed = value.trim();
  if (trimmed.length <= 4) {
    return '****';
  }
  return `****${trimmed.slice(-4)}`;
};

const loadDotenvFile = () => {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
};

const ensureDotenvLoaded = () => {
  if (dotenvLoaded) {
    return;
  }
  loadDotenvFile();
  dotenvLoaded = true;
};

const ensureFileSecretsLoaded = async () => {
  if (fileBackend) {
    return;
  }
  const filePath = process.env.GNOMAN_KEYRING_FILE ?? path.join(process.cwd(), '.gnoman', 'secrets.enc');
  fileBackend = new FileBackend(filePath);
  try {
    await fileBackend.initialize();
    const listed = await fileBackend.list();
    fileSecrets = new Map(Object.entries(listed));
  } catch (error) {
    console.error(JSON.stringify({ event: 'FILE_SECRET_BACKEND_ERROR', message: String(error) }));
  }
};

const detectEnvSource = (key: string): SecretSource | null => {
  const value = process.env[key];
  if (!value?.trim()) {
    return null;
  }
  return bootEnvKeys.has(key) ? 'env' : 'dotenv';
};

export const resolveSecret = async (key: string, required = false) => {
  ensureDotenvLoaded();
  await ensureFileSecretsLoaded();
  const checkedSources = ['env', 'dotenv', 'file'];

  const envSource = detectEnvSource(key);
  if (envSource) {
    return { value: process.env[key]!.trim(), source: envSource, checkedSources };
  }

  const fileValue = fileSecrets.get(key)?.trim();
  if (fileValue) {
    return { value: fileValue, source: 'file' as const, checkedSources };
  }

  if (GUI_KEYRING_ALLOWED) {
    checkedSources.push('keyring');
    try {
      const keyringValue = await keyringAccessor.get(key);
      if (keyringValue?.trim()) {
        return { value: keyringValue.trim(), source: 'keyring' as const, checkedSources };
      }
    } catch (error) {
      console.warn(`Unable to resolve ${key} from keyring`, error);
    }
  }

  const missing = { event: 'MISSING_SECRET', key, checkedSources };
  console.error(JSON.stringify(missing));
  if (required) {
    throw new Error(`${key} is required for this run mode.`);
  }
  return { value: undefined, source: 'missing' as const, checkedSources };
};

export const auditSecretsAtBoot = async (keys: Array<{ key: string; required: boolean }>) => {
  ensureDotenvLoaded();
  await ensureFileSecretsLoaded();
  const records: SecretAuditRecord[] = [];
  for (const { key, required } of keys) {
    const resolved = await resolveSecret(key, false);
    records.push({
      key,
      required,
      present: Boolean(resolved.value),
      source: resolved.source,
      redacted: redact(resolved.value),
      checkedSources: resolved.checkedSources
    });
  }
  runtimeObservability.setSecretAudit(records);
  console.info(
    JSON.stringify({
      event: 'SECRETS_AUDIT',
      secrets: records.map((r) => ({
        key: r.key,
        required: r.required,
        present: r.present,
        source: r.source,
        value: r.redacted
      }))
    })
  );
};
