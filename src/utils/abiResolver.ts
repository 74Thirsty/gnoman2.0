import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getAddress, isAddress } from 'ethers';
import { http } from '../../backend/utils/http';
import { resolveSecret } from './secretsResolver';
import { runtimeObservability } from './runtimeObservability';

export type AbiResolveResult = {
  abi: unknown[];
  contractName: string | null;
  source: 'cache' | 'sourcify' | 'etherscan' | 'manual';
  fetchedAt: string;
  cachePath: string;
  verified: boolean;
};

const CACHE_ROOT = path.join(process.cwd(), 'abi-cache');

const normalizeAddress = (address: string) => {
  if (!isAddress(address)) {
    throw new Error(`Invalid address ${address}`);
  }
  return getAddress(address).toLowerCase();
};

const cachePath = (chainId: number, address: string) => path.join(CACHE_ROOT, String(chainId), `${address}.json`);
const indexPath = (chainId: number) => path.join(CACHE_ROOT, String(chainId), 'index.json');

type IndexEntry = { contractName: string | null; source: string; abiHash: string; address: string };

const readIndex = (chainId: number): Record<string, IndexEntry> => {
  const file = indexPath(chainId);
  if (!fs.existsSync(file)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, IndexEntry>;
};

const writeIndex = (chainId: number, index: Record<string, IndexEntry>) => {
  const file = indexPath(chainId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(index, null, 2), 'utf8');
};

const writeCache = (chainId: number, address: string, payload: AbiResolveResult) => {
  const file = cachePath(chainId, address);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  const index = readIndex(chainId);
  index[address] = {
    contractName: payload.contractName,
    source: payload.source,
    abiHash: crypto.createHash('sha256').update(JSON.stringify(payload.abi)).digest('hex'),
    address
  };
  writeIndex(chainId, index);
  return file;
};

const parseJsonIfNeeded = (abi: unknown): unknown[] => {
  if (Array.isArray(abi)) {
    return abi;
  }
  if (typeof abi === 'string') {
    const parsed = JSON.parse(abi) as unknown;
    if (Array.isArray(parsed)) {
      return parsed;
    }
  }
  throw new Error('ABI fragments are required.');
};

const resolveFromSourcify = async (chainId: number, address: string) => {
  const url = `https://repo.sourcify.dev/contracts/full_match/${chainId}/${address}/metadata.json`;
  try {
    const response = await http.get(url);
    const output = (response.data as { output?: { abi?: unknown[] }; settings?: { compilationTarget?: Record<string, string> } }) ?? {};
    const abi = output.output?.abi;
    if (!Array.isArray(abi) || abi.length === 0) {
      return null;
    }
    const contractName = Object.values(output.settings?.compilationTarget ?? {})[0] ?? null;
    return { abi, contractName: typeof contractName === 'string' ? contractName : null, source: 'sourcify' as const, verified: true };
  } catch (_error) {
    return null;
  }
};

const resolveFromEtherscan = async (chainId: number, address: string) => {
  const { value: apiKey } = await resolveSecret('ETHERSCAN_API_KEY', true);
  const sourceResponse = await http.get('', {
    params: {
      module: 'contract',
      action: 'getsourcecode',
      chainid: chainId,
      address,
      apikey: apiKey
    }
  });
  const source = sourceResponse.data as { result?: Array<{ ContractName?: string; Implementation?: string }> };
  const impl = source.result?.[0]?.Implementation?.trim();
  const abiAddress = impl && /^0x[a-fA-F0-9]{40}$/.test(impl) && impl !== '0x0000000000000000000000000000000000000000' ? normalizeAddress(impl) : address;

  const abiResponse = await http.get('', {
    params: {
      module: 'contract',
      action: 'getabi',
      chainid: chainId,
      address: abiAddress,
      apikey: apiKey
    }
  });
  const abiData = abiResponse.data as { status?: string; result?: string };
  if (abiData.status !== '1' || !abiData.result) {
    throw new Error(`Failed to fetch ABI from Etherscan for ${address}: ${abiData.result}`);
  }
  const abi = parseJsonIfNeeded(abiData.result);
  return {
    abi,
    contractName: source.result?.[0]?.ContractName?.trim() || null,
    source: 'etherscan' as const,
    verified: true
  };
};

const resolveFromManualRegistry = (chainId: number, address: string) => {
  const registryPath = process.env.ABI_MANUAL_REGISTRY_PATH?.trim();
  if (!registryPath) {
    return null;
  }
  const payload = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as Record<string, Record<string, { abi: unknown[]; contractName?: string }>>;
  const chain = payload[String(chainId)] ?? {};
  const hit = chain[address];
  if (!hit) {
    return null;
  }
  return {
    abi: hit.abi,
    contractName: hit.contractName ?? null,
    source: 'manual' as const,
    verified: false
  };
};

export class AbiResolver {
  async resolve(chainId: number, inputAddress: string): Promise<AbiResolveResult> {
    const address = normalizeAddress(inputAddress);
    const fromCachePath = cachePath(chainId, address);
    if (fs.existsSync(fromCachePath)) {
      const cached = JSON.parse(fs.readFileSync(fromCachePath, 'utf8')) as AbiResolveResult;
      console.info(JSON.stringify({ event: 'ABI_RESOLVED', chainId, address, contractName: cached.contractName, source: 'cache', cached: true, functionsCount: cached.abi.length }));
      runtimeObservability.pushAbiResolved({ chainId, address, contractName: cached.contractName, source: 'cache', cached: true, functionsCount: cached.abi.length, fetchedAt: cached.fetchedAt, cachePath: fromCachePath, verified: cached.verified });
      return cached;
    }


    const legacyPath = path.join(process.cwd(), 'abi', 'address', String(chainId), `${address}.json`);
    if (fs.existsSync(legacyPath)) {
      const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8')) as { abi?: unknown[] } | unknown[];
      const abi = Array.isArray(parsed) ? parsed : parsed.abi ?? [];
      const payload: AbiResolveResult = {
        abi,
        contractName: readIndex(chainId)[address]?.contractName ?? null,
        source: 'cache',
        fetchedAt: new Date().toISOString(),
        cachePath: fromCachePath,
        verified: false
      };
      writeCache(chainId, address, payload);
      console.info(JSON.stringify({ event: 'ABI_RESOLVED', chainId, address, contractName: payload.contractName, source: 'cache', cached: true, functionsCount: payload.abi.length }));
      runtimeObservability.pushAbiResolved({ chainId, address, contractName: payload.contractName, source: 'cache', cached: true, functionsCount: payload.abi.length, fetchedAt: payload.fetchedAt, cachePath: fromCachePath, verified: payload.verified });
      return payload;
    }

    const sourcify = await resolveFromSourcify(chainId, address);
    const etherscan = sourcify ? null : await resolveFromEtherscan(chainId, address);
    const manual = sourcify || etherscan ? null : resolveFromManualRegistry(chainId, address);
    const resolved = sourcify ?? etherscan ?? manual;
    if (!resolved) {
      throw new Error(`Unable to resolve ABI for ${address} on chain ${chainId}`);
    }

    const payload: AbiResolveResult = {
      abi: resolved.abi,
      contractName: resolved.contractName,
      source: resolved.source,
      fetchedAt: new Date().toISOString(),
      cachePath: fromCachePath,
      verified: resolved.verified
    };
    writeCache(chainId, address, payload);

    console.info(JSON.stringify({ event: 'ABI_RESOLVED', chainId, address, contractName: payload.contractName, source: payload.source, cached: false, functionsCount: payload.abi.length }));
    runtimeObservability.pushAbiResolved({ chainId, address, contractName: payload.contractName, source: payload.source, cached: false, functionsCount: payload.abi.length, fetchedAt: payload.fetchedAt, cachePath: fromCachePath, verified: payload.verified });
    return payload;
  }
}

export const abiResolver = new AbiResolver();
