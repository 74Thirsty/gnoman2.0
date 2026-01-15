import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { holdService } from './transactionHoldService';
import keyringAccessor from './keyringAccessor';

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
const SAFE_MODULE_PAGE_SIZE = 50;
const SAFE_MODULE_SENTINEL = '0x0000000000000000000000000000000000000001';

const SAFE_ABI = [
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
  'function getModulesPaginated(address,uint256) view returns (address[] memory, address)'
];

const resolveRpcUrl = async (rpcUrl?: string) => {
  const trimmed = rpcUrl?.trim();
  if (trimmed) {
    return trimmed;
  }
  const envRpc =
    process.env.GNOMAN_RPC_URL ??
    process.env.SAFE_RPC_URL ??
    process.env.RPC_URL;
  if (envRpc && envRpc.trim()) {
    return envRpc.trim();
  }
  const keyringRpc =
    (await keyringAccessor.get('RPC_URL')) ??
    (await keyringAccessor.get('SAFE_RPC_URL')) ??
    (await keyringAccessor.get('GNOMAN_RPC_URL'));
  if (keyringRpc && keyringRpc.trim()) {
    return keyringRpc.trim();
  }
  throw new Error('RPC URL missing. Configure GNOMAN_RPC_URL or store RPC_URL in the keyring.');
};

const ensureStorageDir = () => {
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
};

const loadModules = async (contract: ethers.Contract) => {
  const modules: string[] = [];
  let next = SAFE_MODULE_SENTINEL;
  while (true) {
    const [page, nextModule] = (await contract.getModulesPaginated(
      next,
      SAFE_MODULE_PAGE_SIZE
    )) as [string[], string];
    if (!page.length) {
      break;
    }
    modules.push(...page);
    if (nextModule.toLowerCase() === SAFE_MODULE_SENTINEL.toLowerCase()) {
      break;
    }
    next = nextModule;
  }
  return modules.map((module) => ethers.getAddress(module));
};

const refreshSafeOnchainState = async (safe: SafeState) => {
  try {
    const provider = new ethers.JsonRpcProvider(safe.rpcUrl);
    const contract = new ethers.Contract(safe.address, SAFE_ABI, provider);
    const [owners, threshold, modules] = await Promise.all([
      contract.getOwners() as Promise<string[]>,
      contract.getThreshold() as Promise<bigint>,
      loadModules(contract)
    ]);
    safe.owners = owners.map((owner) => ethers.getAddress(owner));
    safe.threshold = Number(threshold);
    safe.modules = modules;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to load Safe onchain state: ${message}`);
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
        delegates: safe.delegates ? safe.delegates.map((delegate) => ({ ...delegate })) : [],
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
      delegates: [],
      transactions: new Map()
    };
    safeStore.set(key, safe);
    persistSafes();
  } else {
    safe.rpcUrl = rpcUrl;
  }
  return safe;
};

export const connectToSafe = async (address: string, rpcUrl?: string) => {
  const cachedSafe = safeStore.get(address.toLowerCase());
  const cachedRpcUrl = cachedSafe?.rpcUrl;
  const resolvedRpcUrl = await resolveRpcUrl(rpcUrl ?? cachedRpcUrl);
  const provider = new ethers.JsonRpcProvider(resolvedRpcUrl);
  const network = await provider.getNetwork();
  const safe = getOrCreateSafe(address, resolvedRpcUrl);
  await refreshSafeOnchainState(safe);
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
  await refreshSafeOnchainState(safe);
  persistSafes();
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
  await refreshSafeOnchainState(safe);
  persistSafes();
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
