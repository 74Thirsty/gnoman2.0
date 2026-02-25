import fs from 'fs';
import path from 'path';

export type SecretAuditRecord = {
  key: string;
  required: boolean;
  present: boolean;
  source: 'env' | 'dotenv' | 'file' | 'keyring' | 'missing';
  redacted: string;
  checkedSources: string[];
};

export type AbiResolveEvent = {
  chainId: number;
  address: string;
  contractName: string | null;
  source: string;
  cached: boolean;
  functionsCount: number;
  fetchedAt: string;
  cachePath: string;
  verified: boolean;
};

export type RobinhoodRequestEvent = {
  endpoint: string;
  statusCode: number;
  latencyMs: number;
  at: string;
};

export type RobinhoodOrderEvent = {
  action: 'created' | 'canceled' | 'filled';
  orderId: string;
  at: string;
};

const MAX_EVENTS = 20;
const debugPath = path.join(process.cwd(), '.gnoman', 'run-debug.jsonl');

const state = {
  secrets: [] as SecretAuditRecord[],
  abiResolves: [] as AbiResolveEvent[],
  robinhoodEnabled: false,
  robinhoodAuth: { ok: false, reason: 'Not attempted' },
  robinhoodRequests: [] as RobinhoodRequestEvent[],
  robinhoodOrders: [] as RobinhoodOrderEvent[],
  noBroadcastReason: null as Record<string, unknown> | null,
  safeExecutionTrace: null as Record<string, unknown> | null
};

const pushBounded = <T>(arr: T[], value: T) => {
  arr.unshift(value);
  if (arr.length > MAX_EVENTS) {
    arr.splice(MAX_EVENTS);
  }
};

const appendArtifact = (type: string, payload: unknown) => {
  fs.mkdirSync(path.dirname(debugPath), { recursive: true });
  fs.appendFileSync(debugPath, `${JSON.stringify({ type, at: new Date().toISOString(), payload })}\n`, 'utf8');
};

export const runtimeObservability = {
  setSecretAudit(records: SecretAuditRecord[]) {
    state.secrets = records;
    appendArtifact('SECRET_AUDIT', records);
  },
  pushAbiResolved(event: AbiResolveEvent) {
    pushBounded(state.abiResolves, event);
    appendArtifact('ABI_RESOLVED', event);
  },
  setRobinhoodEnabled(enabled: boolean) {
    state.robinhoodEnabled = enabled;
  },
  setRobinhoodAuth(ok: boolean, reason: string) {
    state.robinhoodAuth = { ok, reason };
    appendArtifact('ROBINHOOD_AUTH', state.robinhoodAuth);
  },
  pushRobinhoodRequest(event: RobinhoodRequestEvent) {
    pushBounded(state.robinhoodRequests, event);
    appendArtifact('ROBINHOOD_REQUEST', event);
  },
  pushRobinhoodOrder(event: RobinhoodOrderEvent) {
    pushBounded(state.robinhoodOrders, event);
    appendArtifact('ROBINHOOD_ORDER', event);
  },
  setNoBroadcastReason(reason: Record<string, unknown>) {
    state.noBroadcastReason = reason;
    appendArtifact('NO_BROADCAST_REASON', reason);
  },
  setSafeExecutionTrace(trace: Record<string, unknown>) {
    state.safeExecutionTrace = trace;
    appendArtifact('SAFE_EXECUTION_TRACE', trace);
  },
  snapshot() {
    return {
      secrets: state.secrets,
      abiResolves: state.abiResolves,
      robinhood: {
        enabled: state.robinhoodEnabled,
        auth: state.robinhoodAuth,
        requests: state.robinhoodRequests,
        orders: state.robinhoodOrders
      },
      noBroadcastReason: state.noBroadcastReason,
      safeExecutionTrace: state.safeExecutionTrace
    };
  }
};
