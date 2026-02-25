import { EtherscanClient } from './etherscanClient';
import { OnchainClientError } from './errors';
import { chainCacheKey, normalizeAddress } from './types';

export type AbiResolver = {
  getContractAbi(address: string): Promise<unknown[]>;
};

export type AbiRegistryConfig = {
  etherscanClients: Record<number, AbiResolver>;
};

export class AbiRegistry {
  private readonly cache = new Map<string, unknown[]>();

  constructor(private readonly config: AbiRegistryConfig) {}

  getCacheSize(): number {
    return this.cache.size;
  }

  setAbi(address: string, chainId: number, abi: unknown[]): void {
    this.cache.set(chainCacheKey(chainId, address), abi);
  }

  async getAbi(address: string, chainId: number): Promise<unknown[]> {
    const normalized = normalizeAddress(address);
    const key = chainCacheKey(chainId, normalized);
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    const etherscan = this.config.etherscanClients[chainId];
    if (!etherscan) {
      throw new OnchainClientError('No Etherscan client configured for chain.', 'ABI_RESOLUTION_FAILED', {
        chainId,
        address: normalized
      });
    }

    const abi = await etherscan.getContractAbi(normalized);
    this.cache.set(key, abi);
    return abi;
  }
}

export const createAbiRegistryFromEtherscanConfig = (
  configs: Record<number, { apiKey: string; baseUrl?: string; chainId?: number }>
) => {
  const etherscanClients = Object.entries(configs).reduce<Record<number, EtherscanClient>>((acc, [chainId, cfg]) => {
    const numericChainId = Number(chainId);
    acc[numericChainId] = new EtherscanClient(cfg.apiKey, cfg.baseUrl, cfg.chainId ?? numericChainId);
    return acc;
  }, {});
  return new AbiRegistry({ etherscanClients });
};
