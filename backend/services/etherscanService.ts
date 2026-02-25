import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isAddress, getAddress } from 'ethers';
import { http } from '../utils/http';

const DEFAULT_CHAIN_ID = 1;
const MAX_CALLS_PER_SECOND = 3;

type EtherscanResult<T> = {
  status: string;
  message: string;
  result: T;
};

type SourceCodeRecord = {
  Implementation?: string;
};

export type AbiResolutionMetadata = {
  chainId: number;
  address: string;
  abiTargetAddress: string;
  isProxy: boolean;
  implementation: string | null;
  abiNameHint: string | null;
  source: 'etherscan' | 'name-cache' | 'address-cache';
  fetchedAt: string;
  abiSha256: string;
};

const inMemoryAbiCache = new Map<string, unknown[]>();
const inMemoryPathCache = new Map<string, string>();
const fetchedAddresses = new Set<string>();

const callTimestamps: number[] = [];

const abiRoot = () => path.join(process.cwd(), 'abi');

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

const addressCachePath = (chainId: number, address: string) =>
  path.join(abiRoot(), 'address', `${chainId}`, `${normalizeAddress(address)}.json`);

const addressMetaPath = (chainId: number, address: string) =>
  path.join(abiRoot(), 'address', `${chainId}`, `${normalizeAddress(address)}.meta.json`);

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
  action: 'getabi' | 'getsourcecode' | 'txlist' | 'gasoracle',
  chainId: number,
  params: Record<string, string>
) => {
  await waitForRateLimit();
  const key = process.env.ETHERSCAN_API_KEY?.trim();
  if (!key) {
    throw new Error('ETHERSCAN_API_KEY is required for Etherscan API requests.');
  }
  const response = await http.get<EtherscanResult<T>>('', {
    params: {
      module: action === 'txlist' ? 'account' : action === 'gasoracle' ? 'gastracker' : 'contract',
      action,
      apikey: key,
      chainid: chainId,
      ...params
    }
  });
  return response.data;
};

const readAbiFromFile = (filePath: string): unknown[] => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { abi?: unknown[] }).abi)) {
    return (parsed as { abi: unknown[] }).abi;
  }
  throw new Error(`Invalid ABI payload at ${filePath}`);
};

const writeAddressCache = (
  chainId: number,
  originalAddress: string,
  abi: unknown[],
  metadata: Omit<AbiResolutionMetadata, 'abiSha256' | 'fetchedAt'>
) => {
  const normalizedAddress = normalizeAddress(originalAddress);
  const filePath = addressCachePath(chainId, normalizedAddress);
  const metaPath = addressMetaPath(chainId, normalizedAddress);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = { abi };
  const canonical = JSON.stringify(payload);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');

  const meta: AbiResolutionMetadata = {
    ...metadata,
    fetchedAt: new Date().toISOString(),
    abiSha256: crypto.createHash('sha256').update(canonical).digest('hex')
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  return filePath;
};

const resolveByNameHint = (chainId: number, address: string, abiNameHint: string) => {
  const candidates = [path.join(abiRoot(), `${abiNameHint}.json`), path.join(abiRoot(), `_${abiNameHint}.json`)];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    const abi = readAbiFromFile(candidate);
    const cachedPath = writeAddressCache(chainId, address, abi, {
      chainId,
      address: normalizeAddress(address),
      abiTargetAddress: normalizeAddress(address),
      isProxy: false,
      implementation: null,
      abiNameHint,
      source: 'name-cache'
    });
    return { filePath: cachedPath, abi };
  }
  return undefined;
};

export const resolveAbiFileForAddress = async (
  chainIdInput: number,
  address: string,
  abiNameHint?: string | null
): Promise<string> => {
  const chainId = normalizeChainId(chainIdInput);
  const normalizedAddress = normalizeAddress(address);
  const cacheKey = `${chainId}:${normalizedAddress}`;

  const memPath = inMemoryPathCache.get(cacheKey);
  if (memPath) {
    return memPath;
  }

  const tetheredPath = addressCachePath(chainId, normalizedAddress);
  if (fs.existsSync(tetheredPath)) {
    console.info(`ABI cache hit: abi/address/${chainId}/${normalizedAddress}.json`);
    inMemoryPathCache.set(cacheKey, tetheredPath);
    return tetheredPath;
  }

  if (abiNameHint?.trim()) {
    const resolved = resolveByNameHint(chainId, normalizedAddress, abiNameHint.trim());
    if (resolved) {
      inMemoryAbiCache.set(cacheKey, resolved.abi);
      inMemoryPathCache.set(cacheKey, resolved.filePath);
      return resolved.filePath;
    }
  }

  const apiKey = process.env.ETHERSCAN_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Missing ABI and no ETHERSCAN_API_KEY configured');
  }

  if (fetchedAddresses.has(cacheKey)) {
    throw new Error(`ABI already fetched for ${normalizedAddress} during this process run`);
  }

  fetchedAddresses.add(cacheKey);
  console.info(`ABI cache miss → fetching from Etherscan: ${normalizedAddress} chainId=${chainId}`);

  const source = await etherscanRequest<SourceCodeRecord[]>('getsourcecode', chainId, {
    address: normalizedAddress
  });

  const implementation = source.result?.[0]?.Implementation?.trim();
  const isProxy = Boolean(implementation && implementation !== '0x0000000000000000000000000000000000000000');
  const abiTarget = isProxy ? normalizeAddress(implementation as string) : normalizedAddress;

  if (isProxy) {
    console.info(`Proxy detected → implementation=${abiTarget} (caching ABI for original address)`);
  }

  const abiResponse = await etherscanRequest<string>('getabi', chainId, { address: abiTarget });
  if (abiResponse.status !== '1' || !abiResponse.result) {
    throw new Error(`Failed to fetch ABI from Etherscan for ${normalizedAddress}: ${abiResponse.result}`);
  }

  let abi: unknown[];
  try {
    abi = JSON.parse(abiResponse.result) as unknown[];
  } catch {
    throw new Error(`Failed to parse ABI from Etherscan for ${normalizedAddress}`);
  }

  if (!Array.isArray(abi) || !abi.length) {
    throw new Error(`Failed to fetch ABI from Etherscan for ${normalizedAddress}: empty ABI`);
  }

  const filePath = writeAddressCache(chainId, normalizedAddress, abi, {
    chainId,
    address: normalizedAddress,
    abiTargetAddress: abiTarget,
    isProxy,
    implementation: implementation ? normalizeAddress(implementation) : null,
    abiNameHint: abiNameHint?.trim() || null,
    source: 'etherscan'
  });

  inMemoryAbiCache.set(cacheKey, abi);
  inMemoryPathCache.set(cacheKey, filePath);
  return filePath;
};

export const resolveAbiByAddress = async (
  chainIdInput: number,
  address: string,
  abiNameHint?: string | null
): Promise<unknown[]> => {
  const chainId = normalizeChainId(chainIdInput);
  const normalizedAddress = normalizeAddress(address);
  const cacheKey = `${chainId}:${normalizedAddress}`;
  const memory = inMemoryAbiCache.get(cacheKey);
  if (memory) {
    return memory;
  }

  const filePath = await resolveAbiFileForAddress(chainId, normalizedAddress, abiNameHint);
  const abi = readAbiFromFile(filePath);
  inMemoryAbiCache.set(cacheKey, abi);
  return abi;
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
    inMemoryAbiCache.clear();
    inMemoryPathCache.clear();
    fetchedAddresses.clear();
    callTimestamps.splice(0, callTimestamps.length);
  }
};
