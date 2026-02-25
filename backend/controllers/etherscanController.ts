import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import { getGasOracle, getTxHistory, resolveAbiByAddress, resolveAbiFileForAddress } from '../services/etherscanService';

const parseChainId = (value: unknown) => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
};

export const resolveContractAbi = asyncHandler(async (req: Request, res: Response) => {
  const { address, chainId, abiNameHint } = req.body as {
    address: string;
    chainId?: number | string;
    abiNameHint?: string;
  };

  if (!address?.trim()) {
    res.status(400).json({ message: 'address is required' });
    return;
  }

  const resolvedChainId = parseChainId(chainId);
  const abi = await resolveAbiByAddress(resolvedChainId ?? 1, address, abiNameHint);

  res.json({
    address,
    chainId: resolvedChainId ?? 1,
    abi,
    itemCount: abi.length
  });
});

export const resolveContractAbiFile = asyncHandler(async (req: Request, res: Response) => {
  const chainId = parseChainId(req.query.chainId) ?? 1;
  const abiNameHint = typeof req.query.abiNameHint === 'string' ? req.query.abiNameHint : undefined;
  const filePath = await resolveAbiFileForAddress(chainId, req.params.address, abiNameHint);
  res.json({ address: req.params.address, chainId, filePath });
});

export const getAddressTxHistory = asyncHandler(async (req: Request, res: Response) => {
  const chainId = parseChainId(req.query.chainId);
  const history = await getTxHistory(req.params.address, chainId);
  res.json(history);
});

export const getCurrentGasOracle = asyncHandler(async (req: Request, res: Response) => {
  const chainId = parseChainId(req.query.chainId);
  const oracle = await getGasOracle(chainId);
  res.json(oracle);
});
