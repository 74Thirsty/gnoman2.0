import { isAddress, getAddress } from 'ethers';
import { http } from '../utils/http';
import { abiResolver } from '../../src/utils/abiResolver';
import { resolveSecret } from '../../src/utils/secretsResolver';

const DEFAULT_CHAIN_ID = 1;
const MAX_CALLS_PER_SECOND = 3;

type EtherscanResult<T> = {
  status: string;
  message: string;
  result: T;
};

const callTimestamps: number[] = [];

const normalizeAddress = (address: string) => {
  if (!isAddress(address)) {
    throw new Error(`Invalid Ethereum address: ${address}`);
  }
  return getAddress(address).toLowerCase();
};

const normalizeChainId = (chainId?: number) => {
  if (chainId && Number.isInteger(chainId) && chainId > 0) {
    return chainId;
  }
  const envValue = Number.parseInt(process.env.ETHERSCAN_CHAIN_ID ?? `${DEFAULT_CHAIN_ID}`, 10);
  return Number.isInteger(envValue) && envValue > 0 ? envValue : DEFAULT_CHAIN_ID;
};

const waitForRateLimit = async () => {
  const now = Date.now();
  while (callTimestamps.length && now - callTimestamps[0] >= 1000) {
    callTimestamps.shift();
  }
  if (callTimestamps.length < MAX_CALLS_PER_SECOND) {
    callTimestamps.push(now);
    return;
  }
  const waitMs = 1000 - (now - callTimestamps[0]);
  await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 1)));
  return waitForRateLimit();
};

const etherscanRequest = async <T>(
  action: 'txlist' | 'gasoracle',
  chainId: number,
  params: Record<string, string>
) => {
  await waitForRateLimit();
  const { value: key } = await resolveSecret('ETHERSCAN_API_KEY', true);
  const response = await http.get<EtherscanResult<T>>('', {
    params: {
      module: action === 'txlist' ? 'account' : 'gastracker',
      action,
      apikey: key,
      chainid: chainId,
      ...params
    }
  });
  return response.data;
};

export const resolveAbiFileForAddress = async (
  chainIdInput: number,
  address: string,
  _abiNameHint?: string | null
): Promise<string> => {
  const chainId = normalizeChainId(chainIdInput);
  const normalizedAddress = normalizeAddress(address);
  const resolved = await abiResolver.resolve(chainId, normalizedAddress);
  return resolved.cachePath;
};

export const resolveAbiByAddress = async (
  chainIdInput: number,
  address: string,
  _abiNameHint?: string | null
): Promise<unknown[]> => {
  const chainId = normalizeChainId(chainIdInput);
  const normalizedAddress = normalizeAddress(address);
  const resolved = await abiResolver.resolve(chainId, normalizedAddress);
  return resolved.abi;
};

export const getTxHistory = async (address: string, chainIdInput?: number) => {
  const chainId = normalizeChainId(chainIdInput);
  return etherscanRequest<unknown[]>('txlist', chainId, {
    address: normalizeAddress(address),
    sort: 'desc'
  });
};

export const getGasOracle = async (chainIdInput?: number) => {
  const chainId = normalizeChainId(chainIdInput);
  return etherscanRequest<Record<string, string>>('gasoracle', chainId, {});
};

export const _internal = {
  clearCaches: () => {
    callTimestamps.splice(0, callTimestamps.length);
  }
};
