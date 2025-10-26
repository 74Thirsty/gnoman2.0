import { Worker } from 'worker_threads';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { setSecureSetting } from './secureSettingsService';

type VanityWorkerMessage =
  | { type: 'progress'; attempts: number; elapsedMs: number }
  | {
      type: 'result';
      address: string;
      mnemonic?: string;
      derivationPath?: string;
      attempts: number;
      elapsedMs: number;
    }
  | {
      type: 'complete';
      attempts: number;
      elapsedMs: number;
      cancelled: boolean;
      success: boolean;
    };

export interface VanityJobOptions {
  prefix?: string;
  suffix?: string;
  regex?: string;
  derivationPath?: string;
  maxAttempts?: number;
  label?: string;
  progressInterval?: number;
}

export interface VanityJobSummary {
  id: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  attempts: number;
  startedAt: string;
  completedAt?: string;
  address?: string;
  etaMs?: number;
  attemptRate?: number;
  targetAttempts?: number;
  label?: string;
  pattern: Pick<VanityJobOptions, 'prefix' | 'suffix' | 'regex' | 'derivationPath'>;
  message?: string;
  mnemonicAlias?: string;
  updatedAt?: string;
}

interface VanityJob extends VanityJobSummary {
  worker?: Worker;
}

const jobStore = new Map<string, VanityJob>();

const storageDir = path.join(process.cwd(), '.gnoman');
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}
const jobStorePath = path.join(storageDir, 'vanity-jobs.json');

const resolveWorkerPath = () => {
  const compiled = path.join(__dirname, '..', 'workers', 'vanityWorker.js');
  if (fs.existsSync(compiled)) {
    return { path: compiled, execArgv: [] as string[] };
  }
  const source = path.join(__dirname, '..', 'workers', 'vanityWorker.ts');
  if (fs.existsSync(source)) {
    try {
      const register = require.resolve('ts-node/register');
      return { path: source, execArgv: ['-r', register] };
    } catch (error) {
      console.warn(
        'ts-node/register not found; run `npm run build:backend` to compile vanity workers before starting searches.'
      );
    }
  }
  return { path: compiled, execArgv: [] as string[] };
};

let lastPersistAt = 0;

const persistJobs = (force = false) => {
  const now = Date.now();
  const payload = Array.from(jobStore.values()).map(({ worker: _worker, ...summary }) => summary);
  if (!force && now - lastPersistAt < 1500) {
    return;
  }
  lastPersistAt = now;
  fs.promises.writeFile(jobStorePath, JSON.stringify(payload, null, 2)).catch((error) => {
    console.warn('Failed to persist vanity job state', error);
  });
};

const loadPersistedJobs = () => {
  if (!fs.existsSync(jobStorePath)) {
    return;
  }
  try {
    const raw = fs.readFileSync(jobStorePath, 'utf8');
    const entries = JSON.parse(raw) as VanityJobSummary[];
    for (const entry of entries) {
      const restored: VanityJob = {
        ...entry,
        updatedAt: entry.updatedAt ?? entry.completedAt ?? entry.startedAt
      };
      if (restored.status === 'running') {
        restored.status = 'failed';
        restored.message = 'Job interrupted by restart';
        restored.completedAt = new Date().toISOString();
      }
      jobStore.set(restored.id, restored);
    }
  } catch (error) {
    console.warn('Unable to restore vanity jobs', error);
  }
};

loadPersistedJobs();

export const startVanityJob = (options: VanityJobOptions) => {
  const id = cryptoRandomId();
  const { path: workerEntry, execArgv } = resolveWorkerPath();
  const job: VanityJob = {
    id,
    status: 'running',
    attempts: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attemptRate: 0,
    targetAttempts: calculateTargetAttempts(options),
    label: options.label,
    pattern: {
      prefix: options.prefix,
      suffix: options.suffix,
      regex: options.regex,
      derivationPath: options.derivationPath ?? "m/44'/60'/0'/0/0"
    }
  };
  const worker = new Worker(workerEntry, {
    workerData: {
      prefix: options.prefix,
      suffix: options.suffix,
      regex: options.regex,
      derivationPath: options.derivationPath ?? "m/44'/60'/0'/0/0",
      maxAttempts: options.maxAttempts ?? 0,
      progressInterval: options.progressInterval ?? 5000
    },
    execArgv
  });
  job.worker = worker;
  jobStore.set(id, job);
  persistJobs(true);

  worker.on('message', async (message: VanityWorkerMessage) => {
    if (message.type === 'progress') {
      job.attempts = message.attempts;
      job.attemptRate = calculateAttemptRate(message.attempts, message.elapsedMs);
      job.etaMs = estimateEta(message.attempts, message.elapsedMs, job.targetAttempts);
      job.updatedAt = new Date().toISOString();
      return;
    }
    if (message.type === 'result') {
      job.status = 'completed';
      job.attempts = message.attempts;
      job.completedAt = new Date().toISOString();
      job.address = message.address;
      job.etaMs = 0;
      job.mnemonicAlias = `VANITY_${id}`;
      job.attemptRate = calculateAttemptRate(message.attempts, message.elapsedMs);
      job.updatedAt = new Date().toISOString();
      await setSecureSetting(job.mnemonicAlias, {
        mnemonic: message.mnemonic,
        derivationPath: message.derivationPath,
        address: message.address
      }).catch((error) => {
        job.message = `Unable to persist mnemonic: ${error instanceof Error ? error.message : String(error)}`;
      });
      worker.terminate().catch(() => undefined);
      persistJobs(true);
      return;
    }
    if (message.type === 'complete') {
      job.status = message.cancelled ? 'cancelled' : 'failed';
      job.message = message.cancelled ? 'Job cancelled' : 'Exceeded attempt budget';
      job.attempts = message.attempts;
      job.completedAt = new Date().toISOString();
      job.attemptRate = calculateAttemptRate(message.attempts, message.elapsedMs);
      job.updatedAt = new Date().toISOString();
      worker.terminate().catch(() => undefined);
      persistJobs(true);
    }
  });

  worker.on('error', (error) => {
    job.status = 'failed';
    job.message = error.message;
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();
    worker.terminate().catch(() => undefined);
    persistJobs(true);
  });

  worker.on('exit', (code) => {
    if (job.status === 'running' && code !== 0) {
      job.status = 'failed';
      job.message = `Worker exited with code ${code}`;
      job.completedAt = new Date().toISOString();
    }
    delete job.worker;
    job.updatedAt = new Date().toISOString();
    persistJobs(true);
  });

  return job;
};

export const getVanityJob = (id: string) => {
  const job = jobStore.get(id);
  if (!job) {
    return undefined;
  }
  return serializeJob(job);
};

export const cancelVanityJob = (id: string) => {
  const job = jobStore.get(id);
  if (!job) {
    return undefined;
  }
  if (job.worker) {
    job.worker.postMessage({ type: 'cancel' });
    job.status = 'cancelled';
    job.completedAt = new Date().toISOString();
    job.message = 'Cancellation requested';
    job.updatedAt = new Date().toISOString();
  }
  persistJobs(true);
  return getVanityJob(id);
};

export const listVanityJobs = () => {
  return Array.from(jobStore.values())
    .map((job) => serializeJob(job))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
};

function serializeJob(job: VanityJob): VanityJobSummary {
  const { worker: _worker, ...summary } = job;
  return summary;
}

function calculateAttemptRate(attempts: number, elapsedMs: number) {
  if (attempts <= 0 || elapsedMs <= 0) {
    return undefined;
  }
  const attemptsPerSecond = (attempts / elapsedMs) * 1000;
  if (!Number.isFinite(attemptsPerSecond) || attemptsPerSecond <= 0) {
    return undefined;
  }
  return attemptsPerSecond;
}

function estimateEta(attempts: number, elapsedMs: number, targetAttempts?: number) {
  const attemptRate = calculateAttemptRate(attempts, elapsedMs);
  if (!attemptRate) {
    return undefined;
  }
  if (!targetAttempts || targetAttempts <= attempts) {
    return 0;
  }
  const remaining = targetAttempts - attempts;
  return Math.round((remaining / attemptRate) * 1000);
}

function calculateTargetAttempts(options: VanityJobOptions) {
  if (options.regex) {
    return undefined;
  }
  const prefixLength = options.prefix?.replace(/^0x/i, '').length ?? 0;
  const suffixLength = options.suffix?.replace(/^0x/i, '').length ?? 0;
  const nibbleCount = prefixLength + suffixLength;
  if (nibbleCount <= 0) {
    return undefined;
  }
  return Math.pow(16, nibbleCount);
}

function cryptoRandomId() {
  return crypto.randomBytes(16).toString('hex');
}
