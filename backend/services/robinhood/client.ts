import { signRobinhoodRequest } from './auth';
import { runtimeObservability } from '../../../src/utils/runtimeObservability';

const DEFAULT_BASE_URL = 'https://trading.robinhood.com';

export interface BalanceResponse {
  [key: string]: unknown;
}

export interface MarketDataResponse {
  [key: string]: unknown;
}

export interface OrderResponse {
  id?: string;
  [key: string]: unknown;
}

export interface OrderStatus {
  id?: string;
  state?: string;
  [key: string]: unknown;
}

export interface ClientOptions {
  baseUrl?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
  onRequestComplete?: (event: { endpoint: string; method: string; statusCode: number; latencyMs: number }) => void;
}

export class RobinhoodCryptoClient {
  private readonly baseUrl: string;

  private readonly maxRetries: number;

  private readonly retryDelayMs: number;

  private readonly fetchImpl: typeof fetch;

  private readonly onRequestComplete?: ClientOptions['onRequestComplete'];

  constructor(
    private readonly apiKey: string,
    private readonly privateKey: string,
    options: ClientOptions = {}
  ) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onRequestComplete = options.onRequestComplete;
  }

  async getAccounts(): Promise<BalanceResponse> {
    return this.request<BalanceResponse>('GET', '/api/v1/crypto/trading/accounts/');
  }

  async getAccountBalance(): Promise<BalanceResponse> {
    return this.getAccounts();
  }

  async getMarketData(symbol: string): Promise<MarketDataResponse> {
    return this.request<MarketDataResponse>('GET', `/api/v1/crypto/marketdata/best_bid_ask/?symbol=${encodeURIComponent(symbol)}`);
  }

  async placeOrder(symbol: string, amountCash: number): Promise<OrderResponse> {
    return this.request<OrderResponse>('POST', '/api/v1/crypto/trading/orders/', {
      symbol,
      side: 'buy',
      type: 'market',
      cash_amount: amountCash,
    });
  }

  async cancelOrder(orderID: string): Promise<Record<string, unknown>> {
    return this.request('POST', `/api/v1/crypto/trading/orders/${encodeURIComponent(orderID)}/cancel/`);
  }

  async getOrderStatus(orderID: string): Promise<OrderStatus> {
    return this.request<OrderStatus>('GET', `/api/v1/crypto/trading/orders/${encodeURIComponent(orderID)}/`);
  }

  async cancelOrder(orderID: string): Promise<OrderStatus> {
    return this.request<OrderStatus>('POST', `/api/v1/crypto/trading/orders/${encodeURIComponent(orderID)}/cancel/`);
  }

  private async request<T>(method: string, path: string, payload?: Record<string, unknown>): Promise<T> {
    const body = payload ? JSON.stringify(payload) : '';
    const headers = signRobinhoodRequest({
      apiKey: this.apiKey,
      privateKey: this.privateKey,
      method,
      path,
      body,
    });

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const startedAt = Date.now();
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...headers,
          'content-type': 'application/json',
        },
        body: body || undefined,
      });

      this.onRequestComplete?.({ endpoint: path, method, statusCode: response.status, latencyMs: Date.now() - startedAt });

      if (response.status === 429 && attempt < this.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * (attempt + 1)));
        continue;
      }

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Robinhood API error (${response.status}): ${responseText}`);
      }

      return (await response.json()) as T;
    }

    throw new Error('Robinhood API retry budget exhausted.');
  }
}
