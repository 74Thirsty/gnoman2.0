import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';
import { KeyringManager } from '../../src/core/keyringManager';
import type { KeyringBackendName } from '../../src/core/backends/types';
import { walletRepository } from './walletStore';

const execFile = promisify(execFileCallback);

export type DiagnosticStatus = 'ok' | 'warn' | 'error';

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: DiagnosticStatus;
  detail?: string;
  suggestion?: string;
  metadata?: Record<string, unknown>;
}

export interface DiagnosticSummary {
  total: number;
  ok: number;
  warn: number;
  error: number;
}

export interface DiagnosticReport {
  generatedAt: string;
  environment: {
    platform: NodeJS.Platform;
    arch: NodeJS.Architecture;
    cwd: string;
    nodeVersion: string;
    recommendedNodeVersion: string;
  };
  summary: DiagnosticSummary;
  checks: DiagnosticCheck[];
}

export interface DiagnosticOptions {
  autoFix?: boolean;
  skipGpg?: boolean;
}

type PathCheckDefinition = {
  id: string;
  label: string;
  target: string;
  type: 'directory' | 'file';
  optional?: boolean;
  autoCreate?: boolean;
  dirMode?: number;
  fileMode?: number;
  suggestion?: string;
};

const MINIMUM_NODE_VERSION = '18.17.0';

const PATH_CHECKS: PathCheckDefinition[] = [
  {
    id: 'logs-dir',
    label: 'Logs directory (./logs)',
    target: path.join(process.cwd(), 'logs'),
    type: 'directory',
    autoCreate: true,
    dirMode: 0o700
  },
  {
    id: 'sandbox-logs',
    label: 'Sandbox logs (modules/sandbox/logs)',
    target: path.join(process.cwd(), 'modules', 'sandbox', 'logs'),
    type: 'directory',
    autoCreate: true,
    dirMode: 0o700,
    suggestion: 'Re-run npm install to restore the sandbox logs directory if it was removed.'
  },
  {
    id: 'wallet-storage',
    label: 'Wallet storage directory (.gnoman)',
    target: path.join(process.cwd(), '.gnoman'),
    type: 'directory',
    autoCreate: true,
    dirMode: 0o700
  },
  {
    id: 'wallet-db',
    label: 'Wallet database (.gnoman/wallets.db)',
    target: path.join(process.cwd(), '.gnoman', 'wallets.db'),
    type: 'file',
    optional: true,
    suggestion: 'Trigger any wallet operation to recreate the encrypted database if needed.'
  },
  {
    id: 'license-directory',
    label: 'Offline license directory (.safevault)',
    target: path.join(process.cwd(), '.safevault'),
    type: 'directory',
    autoCreate: true,
    dirMode: 0o700,
    optional: true
  },
  {
    id: 'license-token',
    label: 'Offline license token (.safevault/license.env)',
    target: path.join(process.cwd(), '.safevault', 'license.env'),
    type: 'file',
    optional: true,
    suggestion: 'Use the Settings panel or CLI to validate and store a license token.'
  },
  {
    id: 'keyring-file',
    label: 'File keyring payload (~/.gnoman/secrets.enc)',
    target: path.join(os.homedir(), '.gnoman', 'secrets.enc'),
    type: 'file',
    optional: true,
    suggestion: 'Create at least one secret with the file backend to persist the encrypted payload.'
  }
];

const versionToTuple = (value: string) =>
  value
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10));

const isVersionAtLeast = (current: string, minimum: string) => {
  const currentParts = versionToTuple(current);
  const minimumParts = versionToTuple(minimum);
  const length = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < length; index += 1) {
    const currentValue = currentParts[index] ?? 0;
    const minimumValue = minimumParts[index] ?? 0;
    if (currentValue > minimumValue) {
      return true;
    }
    if (currentValue < minimumValue) {
      return false;
    }
  }
  return true;
};

const toMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const evaluatePath = async (definition: PathCheckDefinition, autoFix: boolean): Promise<DiagnosticCheck> => {
  const metadata = { path: definition.target, kind: definition.type } as Record<string, unknown>;
  try {
    const stats = await fs.stat(definition.target);
    const isExpectedType = definition.type === 'directory' ? stats.isDirectory() : stats.isFile();
    if (!isExpectedType) {
      return {
        id: definition.id,
        label: definition.label,
        status: 'error',
        detail: `Expected ${definition.type} but found a different filesystem entry at ${definition.target}.`,
        suggestion: definition.suggestion,
        metadata
      };
    }
    return {
      id: definition.id,
      label: definition.label,
      status: 'ok',
      detail: `Located ${definition.type} at ${definition.target}.`,
      metadata
    };
  } catch (error) {
    if (autoFix && definition.autoCreate) {
      try {
        if (definition.type === 'directory') {
          await fs.mkdir(definition.target, { recursive: true, mode: definition.dirMode ?? 0o700 });
        } else {
          await fs.mkdir(path.dirname(definition.target), { recursive: true, mode: definition.dirMode ?? 0o700 });
          await fs.writeFile(definition.target, '', { mode: definition.fileMode ?? 0o600 });
        }
        return {
          id: definition.id,
          label: definition.label,
          status: 'ok',
          detail: `Created missing ${definition.type} at ${definition.target}.`,
          metadata
        };
      } catch (fixError) {
        return {
          id: definition.id,
          label: definition.label,
          status: 'error',
          detail: `Unable to create ${definition.type} at ${definition.target}: ${toMessage(fixError)}.`,
          suggestion: definition.suggestion,
          metadata
        };
      }
    }
    return {
      id: definition.id,
      label: definition.label,
      status: definition.optional ? 'warn' : 'error',
      detail: `Missing ${definition.type} at ${definition.target}.`,
      suggestion: definition.suggestion,
      metadata
    };
  }
};

const evaluateKeyringBackend = async (backend: KeyringBackendName): Promise<DiagnosticCheck> => {
  const manager = new KeyringManager();
  try {
    await manager.switchBackend(backend);
    const active = manager.currentBackend();
    const metadata = { requested: backend, active } as Record<string, unknown>;
    if (active === backend) {
      return {
        id: `keyring-${backend}`,
        label: `Keyring backend: ${backend}`,
        status: 'ok',
        detail: `Backend '${backend}' is operational.`,
        metadata
      };
    }
    return {
      id: `keyring-${backend}`,
      label: `Keyring backend: ${backend}`,
      status: 'warn',
      detail: `Requested backend '${backend}' fell back to '${active}'.`,
      suggestion:
        backend === 'system'
          ? 'Ensure the keytar dependency is installed and the OS keyring is available to enable the system backend.'
          : undefined,
      metadata
    };
  } catch (error) {
    return {
      id: `keyring-${backend}`,
      label: `Keyring backend: ${backend}`,
      status: 'error',
      detail: toMessage(error),
      suggestion:
        backend === 'system'
          ? 'Ensure the keytar dependency is installed and the OS keyring is available to enable the system backend.'
          : 'Investigate filesystem permissions and environment variables for the keyring backend.',
      metadata: { requested: backend }
    };
  }
};

const checkNodeVersion = (): DiagnosticCheck => {
  const nodeVersion = process.version;
  const meetsRequirement = isVersionAtLeast(nodeVersion, MINIMUM_NODE_VERSION);
  return {
    id: 'node-version',
    label: 'Node.js runtime',
    status: meetsRequirement ? 'ok' : 'warn',
    detail: `Detected ${nodeVersion}. Minimum recommended version is ${MINIMUM_NODE_VERSION}.`,
    suggestion: meetsRequirement ? undefined : 'Upgrade Node.js to the recommended version or newer.',
    metadata: {
      current: nodeVersion,
      minimum: MINIMUM_NODE_VERSION
    }
  };
};

const checkGpgAvailability = async (): Promise<DiagnosticCheck> => {
  try {
    const { stdout } = await execFile('gpg', ['--version'], { timeout: 3000 });
    const headline = stdout.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim();
    return {
      id: 'gpg',
      label: 'GnuPG availability',
      status: 'ok',
      detail: headline ?? 'gpg --version succeeded.',
      metadata: {
        version: headline
      }
    };
  } catch (error) {
    const message = toMessage(error);
    return {
      id: 'gpg',
      label: 'GnuPG availability',
      status: 'warn',
      detail: `Unable to execute gpg --version: ${message}.`,
      suggestion: 'Install GnuPG to enable encrypted keyring exports.',
      metadata: {
        error: message
      }
    };
  }
};

const computeSummary = (checks: DiagnosticCheck[]): DiagnosticSummary =>
  checks.reduce<DiagnosticSummary>(
    (accumulator, check) => {
      accumulator.total += 1;
      accumulator[check.status] += 1;
      return accumulator;
    },
    { total: 0, ok: 0, warn: 0, error: 0 }
  );

export const runSystemDiagnostics = async (options: DiagnosticOptions = {}): Promise<DiagnosticReport> => {
  const checks: DiagnosticCheck[] = [];

  checks.push(checkNodeVersion());

  if (!options.skipGpg) {
    checks.push(await checkGpgAvailability());
  }

  const walletInventory = walletRepository.list();
  checks.push({
    id: 'wallet-inventory',
    label: 'Wallet inventory',
    status: 'ok',
    detail:
      walletInventory.length === 0
        ? 'No wallets stored in the encrypted database.'
        : `${walletInventory.length} wallet(s) stored in the encrypted database.`,
    metadata: {
      count: walletInventory.length
    }
  });

  for (const definition of PATH_CHECKS) {
    checks.push(await evaluatePath(definition, Boolean(options.autoFix)));
  }

  for (const backend of ['system', 'file', 'memory'] as KeyringBackendName[]) {
    checks.push(await evaluateKeyringBackend(backend));
  }

  const summary = computeSummary(checks);

  return {
    generatedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      nodeVersion: process.version,
      recommendedNodeVersion: MINIMUM_NODE_VERSION
    },
    summary,
    checks
  };
};

export default runSystemDiagnostics;
