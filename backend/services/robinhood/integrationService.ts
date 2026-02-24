import { getSecureSetting, setSecureSetting } from '../secureSettingsService';
import { RobinhoodCryptoClient, type ClientOptions, type OrderResponse, type OrderStatus } from './client';

const ROBINHOOD_CONFIG_KEY = 'ROBINHOOD_CRYPTO_CONFIG';

interface RobinhoodCryptoConfig {
  apiKey: string;
  privateKey: string;
}

export interface RobinhoodCryptoConfigStatus {
  configured: boolean;
  apiKeyPreview?: string;
}

const maskApiKey = (apiKey: string) => {
  if (apiKey.length <= 8) {
    return `${apiKey.slice(0, 2)}***`;
  }
  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`;
};

const readConfig = async (): Promise<RobinhoodCryptoConfig | null> => {
  const config = await getSecureSetting<RobinhoodCryptoConfig | null>(ROBINHOOD_CONFIG_KEY, null);
  if (!config || !config.apiKey?.trim() || !config.privateKey?.trim()) {
    return null;
  }
  return {
    apiKey: config.apiKey.trim(),
    privateKey: config.privateKey.trim(),
  };
};

export const getRobinhoodCryptoConfigStatus = async (): Promise<RobinhoodCryptoConfigStatus> => {
  const config = await readConfig();
  if (!config) {
    return { configured: false };
  }
  return {
    configured: true,
    apiKeyPreview: maskApiKey(config.apiKey),
  };
};

export const setRobinhoodCryptoConfig = async (apiKey: string, privateKey: string) => {
  await setSecureSetting(ROBINHOOD_CONFIG_KEY, {
    apiKey: apiKey.trim(),
    privateKey: privateKey.trim(),
  });
  return getRobinhoodCryptoConfigStatus();
};

const createClient = async (options: ClientOptions = {}) => {
  const config = await readConfig();
  if (!config) {
    throw new Error('Robinhood crypto credentials are not configured.');
  }
  return new RobinhoodCryptoClient(config.apiKey, config.privateKey, options);
};

export const purchaseRobinhoodCryptoWithCash = async (
  symbol: string,
  cashAmount: number,
  options: ClientOptions = {}
): Promise<OrderResponse> => {
  const client = await createClient(options);
  return client.placeOrder(symbol.trim().toUpperCase(), cashAmount);
};

export const getRobinhoodCryptoOrderStatus = async (
  orderId: string,
  options: ClientOptions = {}
): Promise<OrderStatus> => {
  const client = await createClient(options);
  return client.getOrderStatus(orderId);
};
