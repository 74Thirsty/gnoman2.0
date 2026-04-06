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

const EXPLORER_API_HOSTS = new Set([
  'api.etherscan.io',
  'api-sepolia.etherscan.io',
  'api-holesky.etherscan.io',
  'api.basescan.org',
  'api.arbiscan.io',
  'api.polygonscan.com',
  'api-optimistic.etherscan.io',
  'api.snowtrace.io',
  'api.ftmscan.com',
  'api.bscscan.com'
]);

const isExplorerApiUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (EXPLORER_API_HOSTS.has(host)) {
      return true;
    }
    if (path.endsWith('/api') && (parsed.searchParams.has('module') || parsed.searchParams.has('action'))) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

const normalizeRpcUrl = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'ws:' && protocol !== 'wss:') {
      return undefined;
    }
  } catch {
    return undefined;
  }
  if (isExplorerApiUrl(trimmed)) {
    return undefined;
  }
  return trimmed;
};

export const resolveRpcUrl = async (preferred?: string, chainId?: number) => {
  const preferredUrl = normalizeRpcUrl(preferred);
  if (preferredUrl) {
    return preferredUrl;
  }
  if (preferred?.trim()) {
    console.warn('Ignoring invalid RPC URL provided where JSON-RPC URL is required.');
  }

  for (const key of buildRpcCandidateKeys(chainId)) {
    const value = await secretsResolver.resolve(key, { failClosed: false });
    const rpcUrl = normalizeRpcUrl(value);
    if (rpcUrl) {
      return rpcUrl;
    }
    if (value?.trim()) {
      console.warn(`Ignoring ${key}: invalid RPC URL (must be http(s):// or ws(s):// JSON-RPC endpoint).`);
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
