import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import { addContract, listContracts, removeContract } from '../services/contractRegistryService';
import { abiResolver } from '../utils/abiResolver';
import { getBalance } from '../services/rpcService';

export const listContractsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const records = listContracts();
  const balances = await Promise.all(records.map((record) => getBalance(record.address)));
  res.json(
    records.map((record, index) => ({
      ...record,
      balance: balances[index]
    }))
  );
});

export const addContractHandler = asyncHandler(async (req: Request, res: Response) => {
  const { address, name, network, tags, type, abi } = req.body as {
    address: string;
    name?: string;
    network?: string;
    tags?: string[];
    type?: string;
    abi?: string;
  };
  const record = addContract({ address, name, network, tags, type, abi });
  res.status(201).json(record);
});

export const removeContractHandler = asyncHandler(async (req: Request, res: Response) => {
  const removed = removeContract(req.params.id);
  if (!removed) {
    res.status(404).json({ message: 'Contract not found' });
    return;
  }
  res.json(removed);
});


export const resolveContractAbiHandler = asyncHandler(async (req: Request, res: Response) => {
  const { chainId, address, contractName } = req.body as { chainId?: number; address?: string; contractName?: string };
  if (!address?.trim()) {
    res.status(400).json({ message: 'address is required.' });
    return;
  }
  const result = await abiResolver.resolve(Number(chainId) || 1, address, contractName);
  res.json(result);
});
