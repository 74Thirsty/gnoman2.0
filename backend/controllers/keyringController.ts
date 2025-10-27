import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import keyringAccessor from '../services/keyringAccessor';

const maskValue = (value: string | null) => {
  if (!value) {
    return null;
  }
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

export const listSecrets = asyncHandler(async (req: Request, res: Response) => {
  const service = typeof req.query.service === 'string' ? req.query.service : undefined;
  const summary = await keyringAccessor.listSecrets(service);
  res.json(summary);
});

type SetPayload = { service?: string; key?: string; value?: string };

type RemovePayload = { service?: string; key?: string };

type SwitchPayload = { service?: string };

type GetPayload = { service?: string; key?: string };

export const setSecret = asyncHandler(async (req: Request, res: Response) => {
  const { service, key, value } = req.body as SetPayload;
  if (typeof key !== 'string' || key.trim() === '') {
    res.status(400).json({ message: 'key is required' });
    return;
  }
  if (typeof value !== 'string') {
    res.status(400).json({ message: 'value must be a string' });
    return;
  }
  await keyringAccessor.setSecret(key, value, service);
  const normalizedService = service?.trim() || keyringAccessor.getActiveService();
  const maskedValue = maskValue(await keyringAccessor.getSecret(key, normalizedService));
  res.json({ service: normalizedService, key, maskedValue });
});

export const getSecret = asyncHandler(async (req: Request, res: Response) => {
  const { service, key } = req.body as GetPayload;
  if (typeof key !== 'string' || key.trim() === '') {
    res.status(400).json({ message: 'key is required' });
    return;
  }
  const normalizedService = service?.trim() || keyringAccessor.getActiveService();
  const value = await keyringAccessor.getSecret(key, normalizedService);
  if (value === null) {
    res.status(404).json({ message: 'Secret not found' });
    return;
  }
  res.json({ service: normalizedService, key, value });
});

export const removeSecret = asyncHandler(async (req: Request, res: Response) => {
  const { service, key } = req.body as RemovePayload;
  if (typeof key !== 'string' || key.trim() === '') {
    res.status(400).json({ message: 'key is required' });
    return;
  }
  await keyringAccessor.removeSecret(key, service);
  const normalizedService = service?.trim() || keyringAccessor.getActiveService();
  res.json({ service: normalizedService, key, removed: true });
});

export const switchService = asyncHandler(async (req: Request, res: Response) => {
  const { service } = req.body as SwitchPayload;
  if (typeof service !== 'string' || service.trim() === '') {
    res.status(400).json({ message: 'service is required' });
    return;
  }
  const result = await keyringAccessor.switchService(service);
  res.json(result);
});
