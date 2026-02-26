import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import { runtimeTelemetry } from '../services/runtimeTelemetryService';
import { secretsResolver } from './secretsResolver';

export type AbiResolveResult = {
  abi: unknown[];
  contractName: string;
  source: 'cache' | 'sourcify' | 'etherscan' | 'manual-registry';
  fetchedAt: string;
  cachePath: string;
  verified: boolean;
  cached: boolean;
};

type IndexEntry = { address: string; contractName: string; source: string; abiHash: string; updatedAt: string };

const root = path.join(process.cwd(), 'abi-cache');
const manualRegistryPath = path.join(process.cwd(), 'abi', 'manual-registry.json');

const chainDir = (chainId: number) => path.join(root, `${chainId}`);
const abiPath = (chainId: number, address: string) => path.join(chainDir(chainId), `${address.toLowerCase()}.json`);
const indexPath = (chainId: number) => path.join(chainDir(chainId), 'index.json');

const readJson = <T>(filePath: string, fallback: T): T => {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (filePath: string, payload: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
};

const normalizeAddress = (address: string) => ethers.getAddress(address).toLowerCase();

export class AbiResolver {
  async resolve(chainId: number, addressInput: string, contractNameHint?: string): Promise<AbiResolveResult> {
    console.debug(JSON.stringify({ event: 'TRACE', phase: 'enter', fn: 'AbiResolver.resolve', chainId, addressInput }));
    const address = normalizeAddress(addressInput);
    const cachedPath = abiPath(chainId, address);
    if (fs.existsSync(cachedPath)) {
      const payload = readJson<{ abi: unknown[]; contractName?: string; source?: AbiResolveResult['source']; fetchedAt?: string; verified?: boolean }>(cachedPath, { abi: [] });
      const result: AbiResolveResult = {
        abi: Array.isArray(payload.abi) ? payload.abi : [],
        contractName: payload.contractName ?? contractNameHint ?? address,
        source: 'cache',
        fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
        cachePath: cachedPath,
        verified: payload.verified ?? true,
        cached: true
      };
      this.logResolve(chainId, address, result);
      console.debug(JSON.stringify({ event: 'TRACE', phase: 'exit', fn: 'AbiResolver.resolve', ok: true, source: 'cache' }));
      return result;
    }

    const sourcify = await this.resolveFromSourcify(chainId, address);
    if (sourcify) {
      const persisted = this.persist(chainId, address, sourcify.abi, sourcify.contractName, 'sourcify', sourcify.verified);
      console.debug(JSON.stringify({ event: 'TRACE', phase: 'exit', fn: 'AbiResolver.resolve', ok: true, source: 'sourcify' }));
      return persisted;
    }

    const etherscan = await this.resolveFromEtherscan(chainId, address);
    if (etherscan) {
      const persisted = this.persist(chainId, address, etherscan.abi, etherscan.contractName, 'etherscan', true);
      console.debug(JSON.stringify({ event: 'TRACE', phase: 'exit', fn: 'AbiResolver.resolve', ok: true, source: 'etherscan' }));
      return persisted;
    }

    const manual = this.resolveFromManualRegistry(chainId, address, contractNameHint);
    if (manual) {
      const persisted = this.persist(chainId, address, manual.abi, manual.contractName, 'manual-registry', manual.verified);
      console.debug(JSON.stringify({ event: 'TRACE', phase: 'exit', fn: 'AbiResolver.resolve', ok: true, source: 'manual-registry' }));
      return persisted;
    }

    console.error(JSON.stringify({ event: 'ABI_RESOLVE_FAILED', reason: 'no-source-hit', chainId, address }));
    console.debug(JSON.stringify({ event: 'TRACE', phase: 'exit', fn: 'AbiResolver.resolve', ok: false }));
    throw new Error(`Unable to resolve ABI for chainId=${chainId} address=${address}`);
  }

  private async resolveFromSourcify(chainId: number, address: string) {
    const url = `https://repo.sourcify.dev/contracts/full_match/${chainId}/${address}/metadata.json`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(JSON.stringify({ event: 'ABI_RESOLVE_SOURCE_FAIL', source: 'sourcify', reason: `http_${response.status}`, chainId, address }));
        return null;
      }
      const payload = (await response.json()) as { output?: { abi?: unknown[] }; contractName?: string };
      if (!Array.isArray(payload.output?.abi)) {
        console.error(JSON.stringify({ event: 'ABI_RESOLVE_SOURCE_FAIL', source: 'sourcify', reason: 'missing-abi', chainId, address }));
        return null;
      }
      return { abi: payload.output.abi, contractName: payload.contractName ?? address, verified: true };
    } catch (error) {
      console.error(JSON.stringify({ event: 'ABI_RESOLVE_SOURCE_FAIL', source: 'sourcify', reason: String(error), chainId, address }));
      return null;
    }
  }

  private async resolveFromEtherscan(chainId: number, address: string) {
    const apiKey = await secretsResolver.resolve('ETHERSCAN_API_KEY', { required: true, failClosed: false });
    if (!apiKey) {
      console.error(JSON.stringify({ event: 'ABI_RESOLVE_SOURCE_FAIL', source: 'etherscan', reason: 'missing_key', chainId, address }));
      return null;
    }
    const endpoint = process.env.ETHERSCAN_BASE_URL?.trim() || 'https://api.etherscan.io/api';
    const query = new URLSearchParams({ module: 'contract', action: 'getabi', address, chainid: `${chainId}`, apikey: apiKey });
    const response = await fetch(`${endpoint}?${query.toString()}`);
    if (!response.ok) {
      console.error(JSON.stringify({ event: 'ABI_RESOLVE_SOURCE_FAIL', source: 'etherscan', reason: `http_${response.status}`, chainId, address }));
      return null;
    }
    const payload = (await response.json()) as { status?: string; result?: string };
    if (payload.status !== '1' || !payload.result) {
      console.error(JSON.stringify({ event: 'ABI_RESOLVE_SOURCE_FAIL', source: 'etherscan', reason: payload.result ?? 'empty-result', chainId, address }));
      return null;
    }
    const abi = JSON.parse(payload.result) as unknown[];
    return { abi, contractName: address };
  }

  private resolveFromManualRegistry(chainId: number, address: string, contractNameHint?: string) {
    const registry = readJson<Record<string, Record<string, { abi: unknown[]; contractName?: string; verified?: boolean }>>>(manualRegistryPath, {});
    const chainKey = `${chainId}`;
    const byChain = registry[chainKey] ?? {};
    const byAddress = byChain[address];
    if (byAddress) {
      return { abi: byAddress.abi, contractName: byAddress.contractName ?? contractNameHint ?? address, verified: Boolean(byAddress.verified) };
    }
    if (contractNameHint) {
      const entries = Object.entries(byChain).filter(([, value]) => value.contractName === contractNameHint);
      if (entries.length === 1) {
        return { abi: entries[0][1].abi, contractName: contractNameHint, verified: Boolean(entries[0][1].verified) };
      }
      if (entries.length > 1) {
        throw new Error(`Contract name ${contractNameHint} resolves to multiple addresses on chain ${chainId}`);
      }
    }
    console.error(JSON.stringify({ event: 'ABI_RESOLVE_SOURCE_FAIL', source: 'manual-registry', reason: 'not-found', chainId, address, hint: contractNameHint ?? null }));
    return null;
  }

  private persist(
    chainId: number,
    address: string,
    abi: unknown[],
    contractName: string,
    source: AbiResolveResult['source'],
    verified: boolean
  ): AbiResolveResult {
    const fetchedAt = new Date().toISOString();
    const cachePath = abiPath(chainId, address);
    const payload = { abi, contractName, source, fetchedAt, verified };
    writeJson(cachePath, payload);
    const index = readJson<Record<string, IndexEntry>>(indexPath(chainId), {});
    index[address] = {
      address,
      contractName,
      source,
      abiHash: crypto.createHash('sha256').update(JSON.stringify(abi)).digest('hex'),
      updatedAt: fetchedAt
    };
    writeJson(indexPath(chainId), index);

    const result: AbiResolveResult = { abi, contractName, source, fetchedAt, cachePath, verified, cached: false };
    this.logResolve(chainId, address, result);
    return result;
  }

  private logResolve(chainId: number, address: string, result: AbiResolveResult) {
    const functionsCount = result.abi.filter(
      (entry) => entry && typeof entry === 'object' && (entry as { type?: string }).type === 'function'
    ).length;
    const line = {
      event: 'ABI_RESOLVED',
      chainId,
      address,
      contractName: result.contractName,
      source: result.source,
      cached: result.cached,
      functionsCount
    };
    console.info(JSON.stringify(line));
    runtimeTelemetry.recordAbiResolve({ ...line, verified: result.verified, fetchedAt: result.fetchedAt });
  }
}

export const abiResolver = new AbiResolver();
