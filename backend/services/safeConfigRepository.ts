import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface PersistedSafeDelegate {
  address: string;
  label: string;
  since: string;
}

export interface PersistedSafeTransaction {
  hash: string;
  payload: unknown;
  approvals: string[];
  createdAt: string;
  meta?: Record<string, unknown>;
  executed: boolean;
}

export interface PersistedSafeState {
  address: string;
  rpcUrl: string;
  owners: string[];
  threshold: number;
  modules: string[];
  delegates: PersistedSafeDelegate[];
  fallbackHandler?: string;
  guard?: string;
  network?: string;
  safeVersion?: string;
  mastercopyAddress?: string;
  transactions: PersistedSafeTransaction[];
}

export interface PersistedSafePayload {
  version: number;
  safes: PersistedSafeState[];
}

const DEFAULTS: PersistedSafePayload = { version: 1, safes: [] };

const envPath = process.env.SAFE_CONFIG_PATH?.trim();
const resolvedPath = path.resolve(envPath || path.join(process.cwd(), '.gnoman', 'safes.json'));

const redactedConfigPath = resolvedPath;

function checksum(content: string) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function safeStat(filePath: string) {
  try {
    const stat = fs.statSync(filePath);
    return { exists: true, size: stat.size, mtime: stat.mtime.toISOString() };
  } catch (error) {
    return { exists: false, size: 0, mtime: null as string | null, error: error instanceof Error ? error.message : String(error) };
  }
}

export class SafeConfigRepository {
  readonly configPath = resolvedPath;

  constructor() {
    const stat = safeStat(this.configPath);
    console.info(
      JSON.stringify({
        event: 'TRACE enter fn=SafeConfigRepository.constructor',
        SAFE_CONFIG_PATH: redactedConfigPath,
        fileExists: stat.exists,
        size: stat.size,
        mtime: stat.mtime
      })
    );
    console.info(JSON.stringify({ event: 'TRACE exit fn=SafeConfigRepository.constructor ok=true' }));
  }

  load(): PersistedSafePayload {
    console.info(JSON.stringify({ event: 'TRACE enter fn=SafeConfigRepository.load' }));
    try {
      const stat = safeStat(this.configPath);
      console.info(
        JSON.stringify({
          event: 'SAFE_CONFIG_STATUS',
          SAFE_CONFIG_PATH: redactedConfigPath,
          fileExists: stat.exists,
          size: stat.size,
          mtime: stat.mtime
        })
      );
      if (!stat.exists) {
        console.error(JSON.stringify({ event: 'CONFIG_EARLY_RETURN', fn: 'SafeConfigRepository.load', reason: 'missing_file', path: redactedConfigPath }));
        console.info(JSON.stringify({ event: 'TRACE exit fn=SafeConfigRepository.load ok=true' }));
        return { ...DEFAULTS };
      }

      const raw = fs.readFileSync(this.configPath, 'utf8');
      if (!raw.trim()) {
        console.error(JSON.stringify({ event: 'CONFIG_EARLY_RETURN', fn: 'SafeConfigRepository.load', reason: 'empty_file', path: redactedConfigPath }));
        console.info(JSON.stringify({ event: 'TRACE exit fn=SafeConfigRepository.load ok=true' }));
        return { ...DEFAULTS };
      }

      const parsed = JSON.parse(raw) as Partial<PersistedSafePayload> | PersistedSafeState[];
      const safes = Array.isArray(parsed) ? parsed : parsed.safes;
      if (!Array.isArray(safes)) {
        console.error(JSON.stringify({ event: 'CONFIG_EARLY_RETURN', fn: 'SafeConfigRepository.load', reason: 'schema_invalid', path: redactedConfigPath }));
        console.info(JSON.stringify({ event: 'TRACE exit fn=SafeConfigRepository.load ok=true' }));
        return { ...DEFAULTS };
      }
      const finalPayload: PersistedSafePayload = {
        version: typeof (parsed as PersistedSafePayload).version === 'number' ? (parsed as PersistedSafePayload).version : 1,
        safes
      };
      console.info(
        JSON.stringify({
          event: 'SAFE_EFFECTIVE_CONFIG',
          path: redactedConfigPath,
          safeCount: finalPayload.safes.length,
          safes: finalPayload.safes.map((safe) => ({
            address: safe.address,
            rpcUrlHash: checksum(safe.rpcUrl ?? '').slice(0, 12),
            owners: safe.owners?.length ?? 0,
            threshold: safe.threshold,
            modules: safe.modules?.length ?? 0
          }))
        })
      );
      console.info(JSON.stringify({ event: 'TRACE exit fn=SafeConfigRepository.load ok=true' }));
      return finalPayload;
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'TRACE exit fn=SafeConfigRepository.load ok=false',
          reason: error instanceof Error ? error.message : String(error),
          callsite: 'SafeConfigRepository.load'
        })
      );
      throw error;
    }
  }

  save(payload: PersistedSafePayload) {
    console.info(JSON.stringify({ event: 'TRACE enter fn=SafeConfigRepository.save', safes: payload.safes.length }));
    const dir = path.dirname(this.configPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.configPath}.tmp`;
    const content = JSON.stringify(payload, null, 2);
    const expectedChecksum = checksum(content);
    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeFileSync(fd, content, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, this.configPath);

    const readBack = fs.readFileSync(this.configPath, 'utf8');
    const readChecksum = checksum(readBack);
    if (readChecksum !== expectedChecksum) {
      console.error(JSON.stringify({ event: 'SAFE_CONFIG_PERSIST_FAIL', reason: 'checksum_mismatch', expectedChecksum, readChecksum }));
      throw new Error('Persisted safe config checksum mismatch after readback validation');
    }

    console.info(
      JSON.stringify({
        event: 'SAFE_CONFIG_PERSIST_OK',
        path: this.configPath,
        bytesWritten: Buffer.byteLength(content, 'utf8'),
        checksum: expectedChecksum,
        host: os.hostname()
      })
    );
    console.info(JSON.stringify({ event: 'TRACE exit fn=SafeConfigRepository.save ok=true' }));
  }
}

export const safeConfigRepository = new SafeConfigRepository();
