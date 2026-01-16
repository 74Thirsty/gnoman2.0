import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import { addContract, listContracts, removeContract } from '../services/contractRegistryService';

export const listContractsHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json(listContracts());
});

export const addContractHandler = asyncHandler(async (req: Request, res: Response) => {
  const { address, name, network, tags, type } = req.body as {
    address: string;
    name?: string;
    network?: string;
    tags?: string[];
    type?: string;
  };
  const record = addContract({ address, name, network, tags, type });
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
