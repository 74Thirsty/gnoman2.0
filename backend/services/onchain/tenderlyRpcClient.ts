import axios, { AxiosInstance } from 'axios';
import { OnchainClientError } from './errors';

export type TenderlyRpcClientConfig = {
  rpcUrl: string;
  accessKey?: string;
  chainId: number;
  timeoutMs?: number;
};

type JsonRpcResponse<T> = {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export class TenderlyRpcClient {
  private readonly client: AxiosInstance;

  constructor(private readonly config: TenderlyRpcClientConfig) {
    this.client = axios.create({
      baseURL: config.rpcUrl,
      timeout: config.timeoutMs ?? 20_000,
      headers: config.accessKey ? { 'X-Access-Key': config.accessKey } : undefined
    });
  }

  async request<T>(method: string, params: unknown[] = []): Promise<T> {
    try {
      const response = await this.client.post<JsonRpcResponse<T>>('', {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      });
      if (response.data.error) {
        throw new OnchainClientError('Tenderly RPC returned an error.', 'TENDERLY_RPC_ERROR', {
          method,
          chainId: this.config.chainId,
          error: response.data.error
        });
      }
      if (typeof response.data.result === 'undefined') {
        throw new OnchainClientError('Tenderly RPC response missing result.', 'TENDERLY_RPC_ERROR', {
          method,
          chainId: this.config.chainId
        });
      }
      return response.data.result;
    } catch (error) {
      if (error instanceof OnchainClientError) {
        throw error;
      }
      throw new OnchainClientError('Tenderly RPC call failed.', 'TENDERLY_RPC_ERROR', {
        method,
        chainId: this.config.chainId,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  getBlockNumber(): Promise<string> {
    return this.request<string>('eth_blockNumber');
  }

  call(transaction: { to: string; data: string }, blockTag: string = 'latest'): Promise<string> {
    return this.request<string>('eth_call', [transaction, blockTag]);
  }
}
