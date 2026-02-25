import { RobinhoodCryptoClient, type ClientOptions, type OrderResponse, type OrderStatus } from './client';
import { runtimeTelemetry } from '../runtimeTelemetryService';
import { secretsResolver } from '../../utils/secretsResolver';
import { getSecureSetting, setSecureSetting } from '../secureSettingsService';

interface RobinhoodCryptoConfig {
  apiKey: string;
  privateKey: string;
}

const ROBINHOOD_CONFIG_KEY = 'robinhood.crypto.config';

export interface RobinhoodCryptoConfigStatus {
  configured: boolean;
  apiKeyPreview?: string;
  enabled: boolean;
  mode: 'official-crypto-only';
}

const isEnabled = () => process.env.ENABLE_ROBINHOOD_CRYPTO === 'true';

const maskApiKey = (apiKey: string) => {
  if (apiKey.length <= 8) {
    return `${apiKey.slice(0, 2)}***`;
  }
  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`;
};

const readConfig = async (): Promise<RobinhoodCryptoConfig | null> => {
  const config = await getSecureSetting<RobinhoodCryptoConfig | null>(ROBINHOOD_CONFIG_KEY, null);
  if (!config || !config.apiKey?.trim() || !config.privateKey?.trim()) {
    const apiKey = await secretsResolver.resolve('ROBINHOOD_CRYPTO_API_KEY', { failClosed: false });
    const privateKey = await secretsResolver.resolve('ROBINHOOD_CRYPTO_PRIVATE_KEY', { failClosed: false });
    if (apiKey && privateKey) {
      return { apiKey, privateKey };
    }
    return null;
  }
  return {
    apiKey: config.apiKey.trim(),
    privateKey: config.privateKey.trim()
  };
};

export const getRobinhoodCryptoConfigStatus = async (): Promise<RobinhoodCryptoConfigStatus> => {
  const enabled = isEnabled();
  runtimeTelemetry.setRobinhoodEnabled(enabled);
  const config = await readConfig();
  if (!config) {
    return { configured: false, enabled, mode: 'official-crypto-only' };
  }
  return {
    configured: true,
    apiKeyPreview: maskApiKey(config.apiKey),
    enabled,
    mode: 'official-crypto-only'
  };
};

export const setRobinhoodCryptoConfig = async (apiKey: string, privateKey: string) => {
  await setSecureSetting(ROBINHOOD_CONFIG_KEY, {
    apiKey: apiKey.trim(),
    privateKey: privateKey.trim()
  });
  return getRobinhoodCryptoConfigStatus();
};

const createClient = async (options: ClientOptions = {}) => {
  if (!isEnabled()) {
    throw new Error('Robinhood Crypto Trading API is disabled. Set ENABLE_ROBINHOOD_CRYPTO=true to enable.');
  }
  const config = await readConfig();
  if (!config) {
    throw new Error('Robinhood crypto credentials are not configured.');
  }
  const client = new RobinhoodCryptoClient(config.apiKey, config.privateKey, {
    ...options,
    onRequestComplete: (event) => {
      runtimeTelemetry.recordRobinhoodRequest({ ...event, createdAt: new Date().toISOString() });
      options.onRequestComplete?.(event);
    }
  });
  runtimeTelemetry.setRobinhoodAuthStatus(true);
  return client;
};


export const validateRobinhoodCryptoAuth = async (options: ClientOptions = {}) => {
  try {
    const client = await createClient(options);
    await client.getAccounts();
    runtimeTelemetry.setRobinhoodAuthStatus(true);
    return { ok: true as const };
  } catch (error) {
    runtimeTelemetry.setRobinhoodAuthStatus(false, error instanceof Error ? error.message : 'Unknown error');
    return { ok: false as const, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const purchaseRobinhoodCryptoWithCash = async (
  symbol: string,
  cashAmount: number,
  options: ClientOptions = {}
): Promise<OrderResponse> => {
  const client = await createClient(options);
  const order = await client.placeOrder(symbol.trim().toUpperCase(), cashAmount);
  runtimeTelemetry.recordRobinhoodOrder({ action: 'created', id: String(order.id ?? 'unknown'), createdAt: new Date().toISOString() });
  return order;
};

export const getRobinhoodCryptoOrderStatus = async (
  orderId: string,
  options: ClientOptions = {}
): Promise<OrderStatus> => {
  const client = await createClient(options);
  const status = await client.getOrderStatus(orderId);
  runtimeTelemetry.recordRobinhoodOrder({ action: 'status', id: String(status.id ?? orderId), state: String(status.state ?? 'unknown'), createdAt: new Date().toISOString() });
  return status;
};

export const cancelRobinhoodCryptoOrder = async (orderId: string, options: ClientOptions = {}): Promise<OrderStatus> => {
  const client = await createClient(options);
  const result = await client.cancelOrder(orderId);
  runtimeTelemetry.recordRobinhoodOrder({ action: 'canceled', id: String(result.id ?? orderId), state: String(result.state ?? 'canceled'), createdAt: new Date().toISOString() });
  return result;
};


export const getRobinhoodCryptoAccounts = async (options: ClientOptions = {}) => {
  const client = await createClient(options);
  return client.getAccounts();
};

export const getRobinhoodCryptoMarketData = async (symbol: string, options: ClientOptions = {}) => {
  const client = await createClient(options);
  return client.getMarketData(symbol);
};
