import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import {
  getRobinhoodCryptoConfigStatus,
  getRobinhoodCryptoOrderStatus,
  purchaseRobinhoodCryptoWithCash,
  cancelRobinhoodCryptoOrder,
  setRobinhoodCryptoConfig,
  validateRobinhoodCryptoAuth,
} from '../services/robinhood/integrationService';

export const getCryptoCredentialsStatus = asyncHandler(async (_req: Request, res: Response) => {
  const [status, auth] = await Promise.all([getRobinhoodCryptoConfigStatus(), validateRobinhoodCryptoAuth()]);
  res.json({ ...status, auth });
});

export const setCryptoCredentials = asyncHandler(async (req: Request, res: Response) => {
  const { apiKey, privateKey } = req.body as { apiKey?: string; privateKey?: string };
  if (!apiKey?.trim()) {
    res.status(400).json({ message: 'apiKey is required.' });
    return;
  }
  if (!privateKey?.trim()) {
    res.status(400).json({ message: 'privateKey is required.' });
    return;
  }
  res.json(await setRobinhoodCryptoConfig(apiKey, privateKey));
});

export const placeCryptoCashOrder = asyncHandler(async (req: Request, res: Response) => {
  const { symbol, cashAmount } = req.body as { symbol?: string; cashAmount?: number };
  if (!symbol?.trim()) {
    res.status(400).json({ message: 'symbol is required.' });
    return;
  }
  const amount = Number(cashAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ message: 'cashAmount must be a positive number.' });
    return;
  }
  const order = await purchaseRobinhoodCryptoWithCash(symbol, amount);
  res.status(201).json(order);
});

export const getCryptoOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = req.params;
  if (!orderId?.trim()) {
    res.status(400).json({ message: 'orderId is required.' });
    return;
  }
  const status = await getRobinhoodCryptoOrderStatus(orderId);
  res.json(status);
});


export const cancelCryptoOrder = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = req.params;
  if (!orderId?.trim()) {
    res.status(400).json({ message: 'orderId is required.' });
    return;
  }
  const payload = await cancelRobinhoodCryptoOrder(orderId);
  res.json(payload);
});
