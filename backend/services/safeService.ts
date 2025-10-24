import { ethers } from 'ethers';
import { holdService } from './transactionHoldService';

interface SafeState {
  address: string;
  rpcUrl: string;
  owners: string[];
  threshold: number;
  modules: string[];
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
      transactions: new Map()
    };
    safeStore.set(key, safe);
  }
  return safe;
};

export const connectToSafe = async (address: string, rpcUrl: string) => {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  await provider.getNetwork();
  const safe = getOrCreateSafe(address, rpcUrl);
  return {
    address: safe.address,
    threshold: safe.threshold,
    owners: safe.owners,
    modules: safe.modules,
    rpcUrl: safe.rpcUrl
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
  return { owners: safe.owners, threshold: safe.threshold };
};

export const removeOwner = async (address: string, owner: string, threshold: number) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  safe.owners = safe.owners.filter((existing) => existing.toLowerCase() !== owner.toLowerCase());
  safe.threshold = threshold;
  return { owners: safe.owners, threshold: safe.threshold };
};

export const changeThreshold = async (address: string, threshold: number) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  safe.threshold = threshold;
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
  return { modules: safe.modules };
};

export const disableModule = async (address: string, moduleAddress: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  safe.modules = safe.modules.filter((module) => module.toLowerCase() !== moduleAddress.toLowerCase());
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
  holdService.createHold(hash, safe.address);
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
  return { hash: tx.hash, executed: true };
};
