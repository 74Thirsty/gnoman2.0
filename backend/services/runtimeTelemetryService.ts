import fs from 'fs';
import path from 'path';

export type SecretsTelemetryEntry = {
  key: string;
  required: boolean;
  present: boolean;
  source: string;
  redacted: string;
};

export type AbiResolveEvent = {
  chainId: number;
  address: string;
  contractName: string;
  source: string;
  cached: boolean;
  functionsCount: number;
  verified: boolean;
  fetchedAt: string;
};

export type SafeExecutionTrace = {
  safeAddress: string;
  moduleAddress?: string;
  outerTxTo?: string;
  innerSafe: { to?: string; value?: string; data?: string; operation?: number };
  finalTargetAddress?: string;
  methodSignature?: string;
  txHash?: string;
  noBroadcastReason?: string;
  createdAt: string;
};

export type RobinhoodRequestEvent = {
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  createdAt: string;
};

export type RobinhoodOrderEvent = {
  action: 'created' | 'canceled' | 'filled' | 'status';
  id: string;
  state?: string;
  createdAt: string;
};

const MAX_EVENTS = 20;
const artifactDir = path.join(process.cwd(), '.gnoman', 'exec_package');
const artifactPath = path.join(artifactDir, 'runtime-debug.jsonl');

const ensureArtifactDir = () => {
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }
};

const pushLimited = <T>(list: T[], value: T) => {
  list.unshift(value);
  if (list.length > MAX_EVENTS) {
    list.length = MAX_EVENTS;
  }
};

class RuntimeTelemetryService {
  private secretsStatus: SecretsTelemetryEntry[] = [];

  private abiResolves: AbiResolveEvent[] = [];

  private safeTraces: SafeExecutionTrace[] = [];

  private robinhoodRequests: RobinhoodRequestEvent[] = [];

  private robinhoodOrders: RobinhoodOrderEvent[] = [];

  private robinhoodEnabled = false;

  private robinhoodAuthStatus: { ok: boolean; reason?: string } = { ok: false, reason: 'Not attempted' };

  private safeRuntime: { version?: string; mastercopyAddress?: string; moduleEnabled?: boolean } = {};

  private appendArtifact(kind: string, payload: unknown) {
    try {
      ensureArtifactDir();
      fs.appendFileSync(
        artifactPath,
        `${JSON.stringify({ kind, ts: new Date().toISOString(), payload })}\n`,
        'utf8'
      );
    } catch (error) {
      console.warn('Unable to append debug artifact', error);
    }
  }

  setSecretsStatus(entries: SecretsTelemetryEntry[]) {
    this.secretsStatus = entries;
    this.appendArtifact('SECRETS_STATUS', entries.map(({ key, required, present, source, redacted }) => ({ key, required, present, source, redacted })));
  }

  recordAbiResolve(event: AbiResolveEvent) {
    pushLimited(this.abiResolves, event);
    this.appendArtifact('ABI_RESOLVED', event);
  }

  recordSafeTrace(trace: SafeExecutionTrace) {
    pushLimited(this.safeTraces, trace);
    this.appendArtifact('SAFE_EXECUTION_TRACE', trace);
  }

  setSafeRuntime(data: { version?: string; mastercopyAddress?: string; moduleEnabled?: boolean }) {
    this.safeRuntime = { ...this.safeRuntime, ...data };
    this.appendArtifact('SAFE_RUNTIME', this.safeRuntime);
  }

  setRobinhoodEnabled(enabled: boolean) {
    this.robinhoodEnabled = enabled;
  }

  setRobinhoodAuthStatus(ok: boolean, reason?: string) {
    this.robinhoodAuthStatus = { ok, reason };
    this.appendArtifact('ROBINHOOD_AUTH', this.robinhoodAuthStatus);
  }

  recordRobinhoodRequest(event: RobinhoodRequestEvent) {
    pushLimited(this.robinhoodRequests, event);
    this.appendArtifact('ROBINHOOD_REQUEST', event);
  }

  recordRobinhoodOrder(event: RobinhoodOrderEvent) {
    pushLimited(this.robinhoodOrders, event);
    this.appendArtifact('ROBINHOOD_ORDER', event);
  }

  getSnapshot() {
    return {
      secrets: this.secretsStatus,
      abi: {
        lastResolves: this.abiResolves,
        cacheHits: this.abiResolves.filter((entry) => entry.cached).length,
        cacheMisses: this.abiResolves.filter((entry) => !entry.cached).length
      },
      safe: {
        ...this.safeRuntime,
        traces: this.safeTraces
      },
      robinhood: {
        enabled: this.robinhoodEnabled,
        auth: this.robinhoodAuthStatus,
        requests: this.robinhoodRequests,
        orders: this.robinhoodOrders
      }
    };
  }
}

export const runtimeTelemetry = new RuntimeTelemetryService();
