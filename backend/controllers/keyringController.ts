import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import keyringAccessor from '../services/keyringAccessor';

const normalizeServiceParam = (service?: unknown) => {
  if (typeof service !== 'string') {
    return undefined;
  }
  const trimmed = service.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

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
  const service = normalizeServiceParam(req.query.service);
  const summary = await keyringAccessor.listSecrets(service);
  res.json(summary);
});

type SetPayload = { service?: string; key?: string; value?: string };

type GetPayload = { service?: string; key?: string };

type RemovePayload = { service?: string; key?: string };

type SwitchPayload = { service?: string };

type BackendPayload = { backend?: string };

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
  const normalizedService = await keyringAccessor.setSecret(key.trim(), value, normalizeServiceParam(service));
  const { value: storedValue } = await keyringAccessor.getSecret(key.trim(), normalizedService);
  res.json({ service: normalizedService, key: key.trim(), maskedValue: maskValue(storedValue) });
});

export const getSecret = asyncHandler(async (req: Request, res: Response) => {
  const { service, key } = req.body as GetPayload;
  if (typeof key !== 'string' || key.trim() === '') {
    res.status(400).json({ message: 'key is required' });
    return;
  }
  const result = await keyringAccessor.getSecret(key.trim(), normalizeServiceParam(service));
  if (result.value === null) {
    res.status(404).json({ message: 'Secret not found' });
    return;
  }
  res.json({ service: result.service, key: key.trim(), value: result.value });
});

export const removeSecret = asyncHandler(async (req: Request, res: Response) => {
  const { service, key } = req.body as RemovePayload;
  if (typeof key !== 'string' || key.trim() === '') {
    res.status(400).json({ message: 'key is required' });
    return;
  }
  const result = await keyringAccessor.removeSecret(key.trim(), normalizeServiceParam(service));
  if (!result.removed) {
    res.status(404).json({ message: 'Secret not found' });
    return;
  }
  res.json({ service: result.service, key: key.trim(), removed: true });
});

export const switchService = asyncHandler(async (req: Request, res: Response) => {
  const { service } = req.body as SwitchPayload;
  const normalizedService = normalizeServiceParam(service);
  if (!normalizedService) {
    res.status(400).json({ message: 'service is required' });
    return;
  }
  const result = await keyringAccessor.switchService(normalizedService);
  res.json(result);
});

export const getStatus = asyncHandler(async (_req: Request, res: Response) => {
  const status = await keyringAccessor.status();
  res.json(status);
});

export const switchBackend = asyncHandler(async (req: Request, res: Response) => {
  const { backend } = req.body as BackendPayload;
  if (backend !== 'file' && backend !== 'memory') {
    res.status(400).json({ message: 'backend must be "file" or "memory"' });
    return;
  }
  const result = await keyringAccessor.switchBackend(backend);
  res.json({ ...result, available: keyringAccessor.availableBackends() });
});
