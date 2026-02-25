import { runtimeObservability } from '../../../src/utils/runtimeObservability';
import { FileBackend } from '../../../src/core/backends/fileBackend';
import { resolveSecret } from '../../../src/utils/secretsResolver';
import { RobinhoodCryptoClient, type ClientOptions, type OrderResponse, type OrderStatus } from './client';

export interface RobinhoodCryptoConfigStatus {
  configured: boolean;
  apiKeyPreview?: string;
  enabled: boolean;
  mode: 'crypto';
  note: string;
}

const maskApiKey = (apiKey: string) => {
  if (apiKey.length <= 8) {
    return `${apiKey.slice(0, 2)}***`;
  }
  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`;
};

const readConfig = async () => {
  const key = await resolveSecret('ROBINHOOD_CRYPTO_API_KEY', false);
  const privateKey = await resolveSecret('ROBINHOOD_CRYPTO_PRIVATE_KEY', false);
  if (!key.value || !privateKey.value) {
    return null;
  }
  return { apiKey: key.value, privateKey: privateKey.value };
};

const ensureEnabled = () => {
  if (process.env.ENABLE_ROBINHOOD_CRYPTO !== 'true') {
    throw new Error('Robinhood Crypto Trading API is disabled. Set ENABLE_ROBINHOOD_CRYPTO=true.');
  }
};

export const getRobinhoodCryptoConfigStatus = async (): Promise<RobinhoodCryptoConfigStatus> => {
  const config = await readConfig();
  return {
    configured: Boolean(config),
    apiKeyPreview: config ? maskApiKey(config.apiKey) : undefined,
    enabled: process.env.ENABLE_ROBINHOOD_CRYPTO === 'true',
    mode: 'crypto',
    note: 'Stocks/options are not supported via official Robinhood public API.'
  };
};

const createClient = async (options: ClientOptions = {}) => {
  ensureEnabled();
  const key = await resolveSecret('ROBINHOOD_CRYPTO_API_KEY', true);
  const privateKey = await resolveSecret('ROBINHOOD_CRYPTO_PRIVATE_KEY', true);
  return new RobinhoodCryptoClient(key.value!, privateKey.value!, options);
};

export const purchaseRobinhoodCryptoWithCash = async (
  symbol: string,
  cashAmount: number,
  options: ClientOptions = {}
): Promise<OrderResponse> => {
  const client = await createClient(options);
  const order = await client.placeOrder(symbol.trim().toUpperCase(), cashAmount);
  if (typeof order.id === 'string') {
    runtimeObservability.pushRobinhoodOrder({ action: 'created', orderId: order.id, at: new Date().toISOString() });
  }
  return order;
};

export const getRobinhoodCryptoOrderStatus = async (
  orderId: string,
  options: ClientOptions = {}
): Promise<OrderStatus> => {
  const client = await createClient(options);
  const status = await client.getOrderStatus(orderId);
  if (status.state === 'filled' && typeof status.id === 'string') {
    runtimeObservability.pushRobinhoodOrder({ action: 'filled', orderId: status.id, at: new Date().toISOString() });
  }
  return status;
};

export const validateRobinhoodCryptoAuth = async (options: ClientOptions = {}) => {
  try {
    const client = await createClient(options);
    await client.getAccounts();
    runtimeObservability.setRobinhoodAuth(true, 'Auth OK');
    return { ok: true as const };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    runtimeObservability.setRobinhoodAuth(false, reason);
    return { ok: false as const, reason };
  }
};


export const setRobinhoodCryptoConfig = async (apiKey: string, privateKey: string) => {
  const fileBackend = new FileBackend(process.env.GNOMAN_KEYRING_FILE);
  await fileBackend.initialize();
  await fileBackend.set('ROBINHOOD_CRYPTO_API_KEY', apiKey.trim());
  await fileBackend.set('ROBINHOOD_CRYPTO_PRIVATE_KEY', privateKey.trim());
  return getRobinhoodCryptoConfigStatus();
};

export const cancelRobinhoodCryptoOrder = async (orderId: string, options: ClientOptions = {}) => {
  const client = await createClient(options);
  const response = await client.cancelOrder(orderId);
  runtimeObservability.pushRobinhoodOrder({ action: 'canceled', orderId, at: new Date().toISOString() });
  return response;
};
