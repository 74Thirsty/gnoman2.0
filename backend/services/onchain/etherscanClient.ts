import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { normalizeAddress } from './types';
import { OnchainClientError } from './errors';

const DEFAULT_BASE_URL = 'https://api.etherscan.io/api';

type EtherscanEnvelope<T> = {
  status: string;
  message: string;
  result: T;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryRateLimit = (response: AxiosResponse<EtherscanEnvelope<unknown>> | undefined) => {
  const msg = String(response?.data?.result ?? response?.data?.message ?? '').toLowerCase();
  return msg.includes('rate limit') || msg.includes('max rate limit');
};

export class EtherscanClient {
  private readonly client: AxiosInstance;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    private readonly chainId: number = 1
  ) {
    if (!apiKey?.trim()) {
      throw new OnchainClientError('Etherscan API key is required.', 'ETHERSCAN_API_ERROR');
    }
    this.client = axios.create({ baseURL: baseUrl, timeout: 15_000 });
  }

  private async request<T>(action: string, params: Record<string, string>, attempt = 0): Promise<EtherscanEnvelope<T>> {
    const response = await this.client.get<EtherscanEnvelope<T>>('', {
      params: {
        module: 'contract',
        action,
        chainid: this.chainId,
        apikey: this.apiKey,
        ...params
      }
    });

    if (response.data.status === '1') {
      return response.data;
    }

    if (shouldRetryRateLimit(response) && attempt < 3) {
      await sleep((attempt + 1) * 400);
      return this.request<T>(action, params, attempt + 1);
    }

    if (shouldRetryRateLimit(response)) {
      throw new OnchainClientError('Etherscan rate limit exceeded after retries.', 'ETHERSCAN_RATE_LIMIT', {
        action,
        chainId: this.chainId,
        result: response.data.result
      });
    }

    throw new OnchainClientError('Etherscan request failed.', 'ETHERSCAN_API_ERROR', {
      action,
      chainId: this.chainId,
      result: response.data.result,
      message: response.data.message
    });
  }

  async getContractAbi(address: string): Promise<unknown[]> {
    const normalized = normalizeAddress(address);
    const response = await this.request<string>('getabi', { address: normalized });

    try {
      const parsed = JSON.parse(response.result) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error('ABI payload was not an array');
      }
      return parsed;
    } catch (error) {
      throw new OnchainClientError('Contract ABI is not verified or malformed on Etherscan.', 'ETHERSCAN_ABI_NOT_VERIFIED', {
        address: normalized,
        chainId: this.chainId,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async getContractSource(address: string): Promise<unknown> {
    const normalized = normalizeAddress(address);
    const response = await this.request<unknown>('getsourcecode', { address: normalized });
    return response.result;
  }
}
