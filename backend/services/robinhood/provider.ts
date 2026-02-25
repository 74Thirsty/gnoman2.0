import type { ClientOptions, OrderResponse, OrderStatus } from './client';
import { cancelRobinhoodCryptoOrder, getRobinhoodCryptoOrderStatus, purchaseRobinhoodCryptoWithCash } from './integrationService';

export interface ExchangeProvider {
  placeMarketBuy(symbol: string, cashAmount: number, options?: ClientOptions): Promise<OrderResponse>;
  cancelOrder(orderId: string, options?: ClientOptions): Promise<Record<string, unknown>>;
  getOrderStatus(orderId: string, options?: ClientOptions): Promise<OrderStatus>;
}

export class RobinhoodCryptoProvider implements ExchangeProvider {
  async placeMarketBuy(symbol: string, cashAmount: number, options: ClientOptions = {}) {
    return purchaseRobinhoodCryptoWithCash(symbol, cashAmount, options);
  }

  async cancelOrder(orderId: string, options: ClientOptions = {}) {
    return cancelRobinhoodCryptoOrder(orderId, options);
  }

  async getOrderStatus(orderId: string, options: ClientOptions = {}) {
    return getRobinhoodCryptoOrderStatus(orderId, options);
  }
}
