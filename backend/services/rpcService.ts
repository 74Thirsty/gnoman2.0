import { ethers } from 'ethers';
import { secretsResolver } from '../utils/secretsResolver';

const CHAIN_ENV_KEYS: Record<number, string[]> = {
  1: ['ETHEREUM_RPC_URL', 'MAINNET_RPC_URL'],
  11155111: ['SEPOLIA_RPC_URL'],
  8453: ['BASE_RPC_URL'],
  42161: ['ARBITRUM_RPC_URL', 'ARBITRUM_ONE_RPC_URL']
};

const buildRpcCandidateKeys = (chainId?: number) => {
  if (!chainId) {
    return ['GNOMAN_RPC_URL', 'SAFE_RPC_URL', 'RPC_URL'];
  }
  const chainKeys = CHAIN_ENV_KEYS[chainId] ?? [];
  return [
    ...chainKeys,
    `GNOMAN_RPC_URL_${chainId}`,
    `SAFE_RPC_URL_${chainId}`,
    `RPC_URL_${chainId}`,
    'GNOMAN_RPC_URL',
    'SAFE_RPC_URL',
    'RPC_URL'
  ];
};

export const resolveRpcUrl = async (preferred?: string, chainId?: number) => {
  const trimmed = preferred?.trim();
  if (trimmed) {
    return trimmed;
  }

  for (const key of buildRpcCandidateKeys(chainId)) {
    const value = await secretsResolver.resolve(key, { failClosed: false });
    if (value?.trim()) {
      return value.trim();
    }
  }

  return undefined;
};

export const requireRpcUrl = async (preferred?: string, chainId?: number) => {
  const rpcUrl = await resolveRpcUrl(preferred, chainId);
  if (!rpcUrl) {
    throw new Error('RPC URL missing. Configure GNOMAN_RPC_URL (or chain-specific RPC_URL_<CHAIN_ID>) or encrypted local secrets file.');
  }
  return rpcUrl;
};

export const formatEtherBalance = (value: bigint) => {
  const formatted = ethers.formatEther(value);
  const [whole, fraction = ''] = formatted.split('.');
  const paddedFraction = fraction.padEnd(4, '0').slice(0, 4);
  return `${whole}.${paddedFraction}`;
};

export const getBalance = async (address: string, preferredRpcUrl?: string) => {
  const rpcUrl = await resolveRpcUrl(preferredRpcUrl);
  if (!rpcUrl) {
    return undefined;
  }
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(address);
    return formatEtherBalance(balance);
  } catch (error) {
    console.warn('Unable to fetch balance', error);
    return undefined;
  }
};

export const createRpcProvider = async (options: { preferredRpcUrl?: string; chainId?: number } = {}) => {
  const rpcUrl = await requireRpcUrl(options.preferredRpcUrl, options.chainId);
  if (options.chainId) {
    return new ethers.JsonRpcProvider(rpcUrl, options.chainId, { staticNetwork: true });
  }
  return new ethers.JsonRpcProvider(rpcUrl);
};
