import type { Request, Response } from 'express';

jest.mock('../backend/services/robinhood/integrationService', () => ({
  cancelRobinhoodCryptoOrder: jest.fn(),
  getRobinhoodCryptoAccounts: jest.fn(),
  getRobinhoodCryptoConfigStatus: jest.fn(),
  getRobinhoodCryptoMarketData: jest.fn(),
  getRobinhoodCryptoOrderStatus: jest.fn(),
  purchaseRobinhoodCryptoWithCash: jest.fn(async (_symbol: string, _cashAmount: number) => ({ id: 'order_1' })),
  setRobinhoodCryptoConfig: jest.fn(),
  validateRobinhoodCryptoAuth: jest.fn(async () => ({ ok: true }))
}));

import { purchaseRobinhoodCryptoWithCash } from '../backend/services/robinhood/integrationService';
import { placeCryptoCashOrder } from '../backend/controllers/robinhoodController';

const mockedPurchaseRobinhoodCryptoWithCash = purchaseRobinhoodCryptoWithCash as jest.MockedFunction<
  typeof purchaseRobinhoodCryptoWithCash
>;

describe('robinhoodController placeCryptoCashOrder', () => {
  afterEach(() => {
    mockedPurchaseRobinhoodCryptoWithCash.mockClear();
  });

  it('rejects cashAmount below the usd depth gate', async () => {
    const req = {
      body: {
        symbol: 'BTC-USD',
        cashAmount: 1999.99
      }
    } as Request;
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const res = { status, json } as unknown as Response;

    await placeCryptoCashOrder(req, res, jest.fn());

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ message: 'cashAmount must be at least 2000.' });
    expect(mockedPurchaseRobinhoodCryptoWithCash).not.toHaveBeenCalled();
  });



  it('accepts cashAmount above the usd depth gate', async () => {
    const req = {
      body: {
        symbol: 'BTC-USD',
        cashAmount: 2500
      }
    } as Request;
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const res = { status, json } as unknown as Response;

    await placeCryptoCashOrder(req, res, jest.fn());

    expect(mockedPurchaseRobinhoodCryptoWithCash).toHaveBeenCalledWith('BTC-USD', 2500);
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith({ id: 'order_1' });
  });

  it('accepts cashAmount at the usd depth gate', async () => {
    const req = {
      body: {
        symbol: 'BTC-USD',
        cashAmount: 2000
      }
    } as Request;
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const res = { status, json } as unknown as Response;

    await placeCryptoCashOrder(req, res, jest.fn());

    expect(mockedPurchaseRobinhoodCryptoWithCash).toHaveBeenCalledWith('BTC-USD', 2000);
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith({ id: 'order_1' });
  });
});
