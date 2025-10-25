import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import {
  simulateCallStatic,
  simulateContract,
  simulateSafe,
  getHistory,
  clearHistory,
  loadAbi,
  listAbis,
  startFork,
  stopFork,
  forkStatus
} from '../services/sandboxService';

export const callStaticSimulation = asyncHandler(async (req: Request, res: Response) => {
  const result = await simulateCallStatic(req.body);
  res.json(result);
});

export const contractSimulation = asyncHandler(async (req: Request, res: Response) => {
  const result = await simulateContract(req.body);
  res.json(result);
});

export const safeSimulation = asyncHandler(async (req: Request, res: Response) => {
  const result = await simulateSafe(req.body);
  res.json(result);
});

export const loadAbiHandler = asyncHandler(async (req: Request, res: Response) => {
  const metadata = loadAbi(req.body);
  res.json(metadata);
});

export const listAbisHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json(listAbis());
});

export const historyHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json(getHistory());
});

export const clearHistoryHandler = asyncHandler(async (_req: Request, res: Response) => {
  clearHistory();
  res.status(204).send();
});

export const startForkHandler = asyncHandler(async (req: Request, res: Response) => {
  const { rpcUrl, blockNumber, port, command } = req.body;
  const status = startFork(rpcUrl, blockNumber, port, command);
  res.json(status);
});

export const stopForkHandler = asyncHandler(async (_req: Request, res: Response) => {
  const status = stopFork();
  res.json(status);
});

export const forkStatusHandler = asyncHandler(async (_req: Request, res: Response) => {
  const status = forkStatus();
  res.json(status);
});
