import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import { simulateCallStatic, simulateForkTransaction } from '../services/sandboxService';

export const callStaticSimulation = asyncHandler(async (req: Request, res: Response) => {
  const result = await simulateCallStatic(req.body);
  res.json(result);
});

export const runForkSimulation = asyncHandler(async (req: Request, res: Response) => {
  const result = await simulateForkTransaction(req.body);
  res.json(result);
});
