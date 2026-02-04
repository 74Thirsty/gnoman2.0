import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import * as walletService from '../services/walletService';
import {
  cancelVanityJob,
  getVanityJob,
  listVanityJobs,
  startVanityJob
} from '../services/vanityService';
import { getSecureSetting, setSecureSetting } from '../services/secureSettingsService';

export const listWallets = asyncHandler(async (_req: Request, res: Response) => {
  const wallets = await walletService.listWalletMetadata();
  res.json(wallets);
});

export const getWalletDetails = asyncHandler(async (req: Request, res: Response) => {
  const wallet = await walletService.getWalletDetails(req.params.address);
  res.json(wallet);
});

export const generateWallet = asyncHandler(async (req: Request, res: Response) => {
  const { alias, password, hidden } = req.body as { alias?: string; password?: string; hidden?: boolean };
  const wallet = await walletService.createRandomWallet({ alias, password, hidden: Boolean(hidden) });
  res.json(wallet);
});

export const importMnemonic = asyncHandler(async (req: Request, res: Response) => {
  const { mnemonic, alias, password, path, hidden } = req.body as {
    mnemonic: string;
    alias?: string;
    password?: string;
    path?: string;
    hidden?: boolean;
  };
  const wallet = await walletService.importWalletFromMnemonic({
    mnemonic,
    alias,
    password,
    derivationPath: path,
    hidden: Boolean(hidden)
  });
  res.json(wallet);
});

export const importPrivateKey = asyncHandler(async (req: Request, res: Response) => {
  const { privateKey, alias, password, hidden } = req.body as {
    privateKey: string;
    alias?: string;
    password?: string;
    hidden?: boolean;
  };
  const wallet = await walletService.importWalletFromPrivateKey({
    privateKey,
    alias,
    password,
    hidden: Boolean(hidden)
  });
  res.json(wallet);
});

export const generateVanity = asyncHandler(async (req: Request, res: Response) => {
  const { prefix, suffix, regex, derivationPath, maxAttempts, label, progressInterval } = req.body as {
    prefix?: string;
    suffix?: string;
    regex?: string;
    derivationPath?: string;
    maxAttempts?: number;
    label?: string;
    progressInterval?: number;
  };
  const job = startVanityJob({ prefix, suffix, regex, derivationPath, maxAttempts, label, progressInterval });
  res.status(202).json(job);
});

export const pollVanity = asyncHandler(async (req: Request, res: Response) => {
  const job = getVanityJob(req.params.id);
  if (!job) {
    res.status(404).json({ message: 'Vanity job not found' });
    return;
  }
  res.json(job);
});

export const cancelVanity = asyncHandler(async (req: Request, res: Response) => {
  const job = cancelVanityJob(req.params.id);
  if (!job) {
    res.status(404).json({ message: 'Vanity job not found' });
    return;
  }
  res.json(job);
});

export const listVanityJobsHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json(listVanityJobs());
});

export const exportWalletHandler = asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body as { password: string };
  const { address } = req.params;
  const exported = await walletService.exportWallet(address, password);
  res.json(exported);
});

export const sendWalletTransaction = asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;
  const { password, to, value, data } = req.body as {
    password: string;
    to: string;
    value?: string;
    data?: string;
  };
  const result = await walletService.sendWalletTransaction({ address, password, to, value, data });
  res.json(result);
});

export const removeWallet = asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;
  const result = await walletService.removeWallet(address);
  res.json(result);
});

interface HoldSettingsPayload {
  enabled: boolean;
  holdHours?: number;
}

const HOLD_KEY = 'SAFE_TX_HOLD_ENABLED';

export const getTransactionHoldSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await getSecureSetting(HOLD_KEY, { enabled: true, holdHours: 24 });
  res.json(settings);
});

export const updateTransactionHoldSettings = asyncHandler(async (req: Request, res: Response) => {
  const { enabled, holdHours = 24 } = req.body as HoldSettingsPayload;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ message: 'enabled must be a boolean' });
    return;
  }
  const numericHours = Number(holdHours);
  if (!Number.isFinite(numericHours)) {
    res.status(400).json({ message: 'holdHours must be a number' });
    return;
  }
  const normalizedHours = Math.max(1, Math.min(Math.round(numericHours), 24 * 14));
  const payload = { enabled, holdHours: normalizedHours };
  await setSecureSetting(HOLD_KEY, payload);
  res.json(payload);
});
