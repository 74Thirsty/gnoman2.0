import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { holdService } from './transactionHoldService';

export interface SafeDelegate {
  address: string;
  label: string;
  since: string;
}

interface SafeState {
  address: string;
  rpcUrl: string;
  owners: string[];
  threshold: number;
  modules: string[];
  delegates: SafeDelegate[];
  network?: string;
  transactions: Map<string, SafeTransaction>;
}

export interface SafeTransaction {
  hash: string;
  payload: unknown;
  approvals: string[];
  createdAt: string;
  meta?: Record<string, unknown>;
  executed: boolean;
}

const safeStore = new Map<string, SafeState>();

interface PersistedSafeState extends Omit<SafeState, 'transactions'> {
  transactions: SafeTransaction[];
}

interface PersistedPayload {
  version: number;
  safes: PersistedSafeState[];
}

const storageDir = path.join(process.cwd(), '.gnoman');
const safesPath = path.join(storageDir, 'safes.json');

const deriveDelegateAddress = (address: string, salt: string) => {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(`${address.toLowerCase()}:${salt}`));
  return ethers.getAddress(`0x${hash.slice(-40)}`);
};

const createDelegates = (address: string): SafeDelegate[] => {
  const now = Date.now();
  return [
    {
      address: deriveDelegateAddress(address, 'ops'),
      label: 'Operations',
      since: new Date(now - 6 * 60 * 60 * 1000).toISOString()
    },
    {
      address: deriveDelegateAddress(address, 'security'),
      label: 'Security Council',
      since: new Date(now - 36 * 60 * 60 * 1000).toISOString()
    }
  ];
};

const ensureStorageDir = () => {
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
};

const loadSafes = () => {
  try {
    ensureStorageDir();
    if (!fs.existsSync(safesPath)) {
      return;
    }
    const raw = fs.readFileSync(safesPath, 'utf-8');
    if (!raw.trim()) {
      return;
    }
    const payload = JSON.parse(raw) as Partial<PersistedPayload> | PersistedSafeState[];
    const safes = Array.isArray(payload) ? payload : payload?.safes;
    if (!Array.isArray(safes)) {
      return;
    }
    safeStore.clear();
    for (const safe of safes) {
      const transactions = new Map(
        (safe.transactions ?? []).map((tx) => [tx.hash, { ...tx } satisfies SafeTransaction])
      );
      safeStore.set(safe.address.toLowerCase(), {
        address: safe.address,
        rpcUrl: safe.rpcUrl,
        owners: [...(safe.owners ?? [])],
        threshold: safe.threshold ?? 1,
        modules: [...(safe.modules ?? [])],
        delegates: safe.delegates ? safe.delegates.map((delegate) => ({ ...delegate })) : createDelegates(safe.address),
        network: safe.network,
        transactions
      });
    }
  } catch (error) {
    console.error('Failed to load safes from disk', error);
  }
};

const persistSafes = () => {
  try {
    ensureStorageDir();
    const payload: PersistedPayload = {
      version: 1,
      safes: Array.from(safeStore.values()).map((safe) => ({
        address: safe.address,
        rpcUrl: safe.rpcUrl,
        owners: [...safe.owners],
        threshold: safe.threshold,
        modules: [...safe.modules],
        delegates: safe.delegates.map((delegate) => ({ ...delegate })),
        network: safe.network,
        transactions: Array.from(safe.transactions.values()).map((tx) => ({ ...tx }))
      }))
    };
    fs.writeFileSync(safesPath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to persist safes', error);
  }
};

loadSafes();

const getOrCreateSafe = (address: string, rpcUrl: string): SafeState => {
  const key = address.toLowerCase();
  let safe = safeStore.get(key);
  if (!safe) {
    safe = {
      address,
      rpcUrl,
      owners: [],
      threshold: 1,
      modules: [],
      delegates: createDelegates(address),
      transactions: new Map()
    };
    safeStore.set(key, safe);
    persistSafes();
  }
  return safe;
};

export const connectToSafe = async (address: string, rpcUrl: string) => {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  const safe = getOrCreateSafe(address, rpcUrl);
  safe.network = network.name ?? `${network.chainId}`;
  persistSafes();
  return {
    address: safe.address,
    threshold: safe.threshold,
    owners: safe.owners,
    modules: safe.modules,
    rpcUrl: safe.rpcUrl,
    delegates: safe.delegates,
    network: safe.network
  };
};

export const getOwners = async (address: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  return safe.owners;
};

export const addOwner = async (address: string, owner: string, threshold: number) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  if (!safe.owners.includes(owner)) {
    safe.owners.push(owner);
  }
  safe.threshold = threshold;
  persistSafes();
  return { owners: safe.owners, threshold: safe.threshold };
};

export const removeOwner = async (address: string, owner: string, threshold: number) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  safe.owners = safe.owners.filter((existing) => existing.toLowerCase() !== owner.toLowerCase());
  safe.threshold = threshold;
  persistSafes();
  return { owners: safe.owners, threshold: safe.threshold };
};

export const changeThreshold = async (address: string, threshold: number) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  safe.threshold = threshold;
  persistSafes();
  return { threshold: safe.threshold };
};

export const enableModule = async (address: string, moduleAddress: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  if (!safe.modules.includes(moduleAddress)) {
    safe.modules.push(moduleAddress);
  }
  persistSafes();
  return { modules: safe.modules };
};

export const disableModule = async (address: string, moduleAddress: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  safe.modules = safe.modules.filter((module) => module.toLowerCase() !== moduleAddress.toLowerCase());
  persistSafes();
  return { modules: safe.modules };
};

export const proposeTransaction = async (
  address: string,
  tx: unknown,
  meta?: Record<string, unknown>
) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(tx)));
  const proposal: SafeTransaction = {
    hash,
    payload: tx,
    approvals: [],
    createdAt: new Date().toISOString(),
    executed: false,
    meta
  };
  safe.transactions.set(hash, proposal);
  await holdService.createHold(hash, safe.address);
  persistSafes();
  return proposal;
};

export const executeTransaction = async (address: string, txHash: string, _password?: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  const tx = safe.transactions.get(txHash);
  if (!tx) {
    throw new Error('Transaction not found');
  }
  tx.executed = true;
  persistSafes();
  return { hash: tx.hash, executed: true };
};

export const getSafeDetails = async (address: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  const [policy, summary, effective] = await Promise.all([
    Promise.resolve(holdService.getHoldState(address)),
    Promise.resolve(holdService.summarize(address)),
    holdService.getEffectivePolicy(address)
  ]);
  return {
    address: safe.address,
    threshold: safe.threshold,
    owners: safe.owners,
    delegates: safe.delegates,
    modules: safe.modules,
    rpcUrl: safe.rpcUrl,
    network: safe.network,
    holdPolicy: policy,
    holdSummary: summary,
    effectiveHold: effective
  };
};
