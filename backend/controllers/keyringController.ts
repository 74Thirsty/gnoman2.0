import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import keyringManager from '../services/keyringAccessor';
import type { KeyringBackendName } from '../../src/core/backends/types';

const AVAILABLE_BACKENDS: KeyringBackendName[] = ['system', 'file', 'memory'];

const maskValue = (value: string | null) => {
  if (!value) {
    return null;
  }
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

const isBackendName = (value: unknown): value is KeyringBackendName =>
  typeof value === 'string' && AVAILABLE_BACKENDS.includes(value as KeyringBackendName);

const resolveBackend = (req: Request): KeyringBackendName | undefined | null => {
  const body = req.body as { service?: unknown; backend?: unknown } | undefined;
  const query = req.query as { service?: unknown; backend?: unknown } | undefined;
  const candidate = body?.service ?? body?.backend ?? query?.service ?? query?.backend ?? req.params.name;
  if (candidate === undefined) {
    return undefined;
  }
  if (!isBackendName(candidate)) {
    return null;
  }
  return candidate;
};

const ensureBackend = async (req: Request, res: Response) => {
  const requested = resolveBackend(req);
  if (requested === null) {
    res.status(400).json({ message: 'Unsupported backend. Use system, file, or memory.' });
    return null;
  }
  if (requested) {
    await keyringManager.switchBackend(requested);
  }
  return keyringManager.currentBackend();
};

export const listSecrets = asyncHandler(async (_req: Request, res: Response) => {
  const active = await ensureBackend(_req, res);
  if (!active) {
    return;
  }
  const secrets = await keyringManager.list();
  res.json({
    service: active,
    backend: active,
    secrets: Object.entries(secrets).map(([key, value]) => ({
      key,
      maskedValue: maskValue(value)
    }))
  });
});

const resolveKey = (req: Request) => req.params.key ?? (req.body as { key?: string }).key;

export const getSecret = asyncHandler(async (req: Request, res: Response) => {
  const active = await ensureBackend(req, res);
  if (!active) {
    return;
  }
  const key = resolveKey(req);
  if (typeof key !== 'string' || key.trim() === '') {
    res.status(400).json({ message: 'key is required' });
    return;
  }
  const value = await keyringManager.get(key);
  if (value === null) {
    res.status(404).json({ message: 'Secret not found' });
    return;
  }
  res.json({ key, value, backend: active, service: active });
});

export const setSecret = asyncHandler(async (req: Request, res: Response) => {
  const active = await ensureBackend(req, res);
  if (!active) {
    return;
  }
  const key = resolveKey(req);
  const { value } = req.body as { value?: string };
  if (typeof key !== 'string' || key.trim() === '') {
    res.status(400).json({ message: 'key is required' });
    return;
  }
  if (typeof value !== 'string') {
    res.status(400).json({ message: 'value must be a string' });
    return;
  }
  await keyringManager.set(key, value);
  res.json({
    key,
    backend: active,
    service: active,
    maskedValue: maskValue(value)
  });
});

export const deleteSecret = asyncHandler(async (req: Request, res: Response) => {
  const active = await ensureBackend(req, res);
  if (!active) {
    return;
  }
  const key = resolveKey(req);
  if (typeof key !== 'string' || key.trim() === '') {
    res.status(400).json({ message: 'key is required' });
    return;
  }
  await keyringManager.delete(key);
  res.json({ key, backend: active, service: active, deleted: true });
});

export const getBackend = asyncHandler(async (_req: Request, res: Response) => {
  const active = keyringManager.currentBackend();
  res.json({ active, service: active, backend: active, available: AVAILABLE_BACKENDS });
});

export const switchBackend = asyncHandler(async (req: Request, res: Response) => {
  const backend = resolveBackend(req);
  if (!backend) {
    res.status(400).json({ message: 'Unsupported backend. Use system, file, or memory.' });
    return;
  }
  await keyringManager.switchBackend(backend);
  const active = keyringManager.currentBackend();
  res.json({ active, service: active, backend: active, available: AVAILABLE_BACKENDS });
});
