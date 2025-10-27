import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import {
  createRandomWallet,
  exportWallet,
  getWalletDetails as fetchWalletDetails,
  importWalletFromMnemonic,
  importWalletFromPrivateKey,
  listWalletMetadata
} from '../services/walletService';
import {
  cancelVanityJob,
  listVanityJobs,
  startVanityJob,
  getVanityJob
} from '../services/vanityService';

interface GeneratePayload {
  alias?: string;
  password?: string;
  hidden?: boolean;
}

interface MnemonicPayload extends GeneratePayload {
  mnemonic?: string;
  derivationPath?: string;
}

interface PrivateKeyPayload extends GeneratePayload {
  privateKey?: string;
}

interface VanityPayload {
  prefix?: string;
  suffix?: string;
  regex?: string;
  derivationPath?: string;
  maxAttempts?: number;
  label?: string;
  progressInterval?: number;
}

interface ExportPayload {
  password?: string;
}

export const listWallets = asyncHandler(async (_req: Request, res: Response) => {
  const wallets = await listWalletMetadata();
  res.json(wallets);
});

export const generateWallet = asyncHandler(async (req: Request, res: Response) => {
  const { alias, password, hidden } = req.body as GeneratePayload;
  if (password !== undefined && typeof password !== 'string') {
    res.status(400).json({ message: 'password must be a string when provided' });
    return;
  }
  const wallet = await createRandomWallet({
    alias: typeof alias === 'string' ? alias : undefined,
    password,
    hidden: Boolean(hidden)
  });
  res.status(201).json(wallet);
});

export const importMnemonic = asyncHandler(async (req: Request, res: Response) => {
  const { mnemonic, derivationPath, alias, password, hidden } = req.body as MnemonicPayload;
  if (typeof mnemonic !== 'string' || mnemonic.trim() === '') {
    res.status(400).json({ message: 'mnemonic is required' });
    return;
  }
  const wallet = await importWalletFromMnemonic({
    mnemonic,
    derivationPath: typeof derivationPath === 'string' ? derivationPath : undefined,
    alias: typeof alias === 'string' ? alias : undefined,
    password,
    hidden: Boolean(hidden)
  });
  res.status(201).json(wallet);
});

export const importPrivateKey = asyncHandler(async (req: Request, res: Response) => {
  const { privateKey, alias, password, hidden } = req.body as PrivateKeyPayload;
  if (typeof privateKey !== 'string' || privateKey.trim() === '') {
    res.status(400).json({ message: 'privateKey is required' });
    return;
  }
  const wallet = await importWalletFromPrivateKey({
    privateKey,
    alias: typeof alias === 'string' ? alias : undefined,
    password,
    hidden: Boolean(hidden)
  });
  res.status(201).json(wallet);
});

export const generateVanity = asyncHandler(async (req: Request, res: Response) => {
  const payload = req.body as VanityPayload;
  const job = startVanityJob({
    prefix: typeof payload.prefix === 'string' && payload.prefix.length > 0 ? payload.prefix : undefined,
    suffix: typeof payload.suffix === 'string' && payload.suffix.length > 0 ? payload.suffix : undefined,
    regex: typeof payload.regex === 'string' && payload.regex.length > 0 ? payload.regex : undefined,
    derivationPath:
      typeof payload.derivationPath === 'string' && payload.derivationPath.length > 0
        ? payload.derivationPath
        : undefined,
    maxAttempts:
      typeof payload.maxAttempts === 'number' && Number.isFinite(payload.maxAttempts) && payload.maxAttempts > 0
        ? payload.maxAttempts
        : undefined,
    label: typeof payload.label === 'string' && payload.label.length > 0 ? payload.label : undefined,
    progressInterval:
      typeof payload.progressInterval === 'number' && Number.isFinite(payload.progressInterval)
        ? payload.progressInterval
        : undefined
  });
  res.status(202).json(job);
});

export const listVanityJobsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const jobs = listVanityJobs();
  res.json(jobs);
});

export const pollVanity = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const job = id ? getVanityJob(id) : undefined;
  if (!job) {
    res.status(404).json({ message: 'Job not found' });
    return;
  }
  res.json(job);
});

export const cancelVanity = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const job = id ? cancelVanityJob(id) : undefined;
  if (!job) {
    res.status(404).json({ message: 'Job not found' });
    return;
  }
  res.json(job);
});

export const getWalletDetails = asyncHandler(async (req: Request, res: Response) => {
  const address = req.params.address;
  if (!address) {
    res.status(400).json({ message: 'address is required' });
    return;
  }
  try {
    const details = await fetchWalletDetails(address);
    res.json(details);
  } catch (error) {
    res.status(404).json({ message: error instanceof Error ? error.message : 'Wallet not found' });
  }
});

export const exportWalletHandler = asyncHandler(async (req: Request, res: Response) => {
  const address = req.params.address;
  const { password } = req.body as ExportPayload;
  if (!address) {
    res.status(400).json({ message: 'address is required' });
    return;
  }
  if (typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ message: 'password is required' });
    return;
  }
  const keystore = await exportWallet(address, password);
  res.json({ address, keystore });
});
