import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import { getHistoryEntries } from '../services/historyService';

export const listHistory = asyncHandler(async (_req: Request, res: Response) => {
  res.json(getHistoryEntries());
});
