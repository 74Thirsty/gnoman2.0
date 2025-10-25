import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import * as walletService from '../services/walletService';

export const listWallets = asyncHandler(async (_req: Request, res: Response) => {
  const wallets = await walletService.listWalletMetadata();
  res.json(wallets);
});

export const generateWallet = asyncHandler(async (req: Request, res: Response) => {
  const { alias, password, hidden } = req.body as { alias?: string; password?: string; hidden?: boolean };
  const wallet = await walletService.createRandomWallet({ alias, password, hidden: Boolean(hidden) });
  res.json(wallet);
});

export const importMnemonic = asyncHandler(async (req: Request, res: Response) => {
  const { mnemonic, alias, password, path } = req.body as {
    mnemonic: string;
    alias?: string;
    password?: string;
    path?: string;
  };
  const wallet = await walletService.importWalletFromMnemonic({ mnemonic, alias, password, derivationPath: path });
  res.json(wallet);
});

export const importPrivateKey = asyncHandler(async (req: Request, res: Response) => {
  const { privateKey, alias, password } = req.body as { privateKey: string; alias?: string; password?: string };
  const wallet = await walletService.importWalletFromPrivateKey({ privateKey, alias, password });
  res.json(wallet);
});

export const generateVanity = asyncHandler(async (req: Request, res: Response) => {
  const { prefix, suffix, alias, password, maxAttempts } = req.body as {
    prefix?: string;
    suffix?: string;
    alias?: string;
    password?: string;
    maxAttempts?: number;
  };
  const wallet = await walletService.generateVanityAddress({ prefix, suffix, alias, password, maxAttempts });
  res.json(wallet);
});

export const exportWallet = asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body as { password: string };
  const { address } = req.params;
  const exported = await walletService.exportWallet(address, password);
  res.json(exported);
});
