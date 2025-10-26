import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import { getSecureSetting, setSecureSetting } from '../services/secureSettingsService';

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
