import { listContracts } from './contractRegistryService';
import { getHistory } from './sandboxService';
import { listSafeTransactions } from './safeService';
import { walletRepository } from './walletStore';

export type HistoryCategory = 'wallet' | 'safe' | 'contract';

export interface HistoryEntry {
  id: string;
  category: HistoryCategory;
  action: string;
  timestamp: string;
  summary: string;
  metadata: Record<string, unknown>;
}

const safeTimestamp = (value?: string) => {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const getHistoryEntries = (): HistoryEntry[] => {
  const walletEntries = walletRepository.list().map((wallet) => ({
    id: `wallet-${wallet.address}`,
    category: 'wallet' as const,
    action: wallet.source === 'generated' ? 'Wallet generated' : `Wallet imported (${wallet.source})`,
    timestamp: wallet.createdAt,
    summary: wallet.alias ? `${wallet.alias} · ${wallet.address}` : wallet.address,
    metadata: {
      address: wallet.address,
      alias: wallet.alias,
      source: wallet.source,
      network: wallet.network,
      hidden: wallet.hidden
    }
  }));

  const safeEntries = listSafeTransactions().map(({ safeAddress, transaction }) => ({
    id: `safe-${safeAddress}-${transaction.hash}`,
    category: 'safe' as const,
    action: transaction.executed ? 'Safe transaction executed' : 'Safe transaction proposed',
    timestamp: transaction.createdAt,
    summary: `${safeAddress} · ${transaction.hash.slice(0, 10)}…`,
    metadata: {
      safeAddress,
      hash: transaction.hash,
      approvals: transaction.approvals,
      executed: transaction.executed,
      meta: transaction.meta
    }
  }));

  const contractEntries = getHistory().map((entry) => ({
    id: `contract-sim-${entry.id}`,
    category: 'contract' as const,
    action: entry.success ? 'Contract simulation succeeded' : 'Contract simulation failed',
    timestamp: entry.timestamp,
    summary: `${entry.functionName} · ${entry.contractAddress}`,
    metadata: {
      contractAddress: entry.contractAddress,
      functionName: entry.functionName,
      rpcUrl: entry.rpcUrl,
      network: entry.network,
      success: entry.success
    }
  }));

  const contractRegistryEntries = listContracts().map((contract) => ({
    id: `contract-${contract.id}`,
    category: 'contract' as const,
    action: 'Contract registered',
    timestamp: contract.createdAt,
    summary: contract.name ? `${contract.name} · ${contract.address}` : contract.address,
    metadata: {
      address: contract.address,
      name: contract.name,
      network: contract.network,
      tags: contract.tags,
      type: contract.type
    }
  }));

  return [...walletEntries, ...safeEntries, ...contractEntries, ...contractRegistryEntries].sort(
    (a, b) => safeTimestamp(b.timestamp) - safeTimestamp(a.timestamp)
  );
};
