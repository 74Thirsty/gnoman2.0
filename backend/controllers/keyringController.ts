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

export const listSecrets = asyncHandler(async (req: Request, res: Response) => {
  const service = (req.query.service as string | undefined) ?? undefined;
  const secrets = await keyringManager.list(service);
  res.json({
    service: service ?? keyringManager.getActiveService(),
    backend: keyringManager.getCurrentBackend(),
    secrets: Object.entries(secrets).map(([key, value]) => ({
      key,
      maskedValue: maskValue(value)
    }))
  });
});

const resolveKey = (req: Request) => req.params.key ?? (req.body as { key?: string }).key;
const resolveService = (req: Request) => (req.body as { service?: string }).service ?? undefined;

export const getSecret = asyncHandler(async (req: Request, res: Response) => {
  const key = resolveKey(req);
  const service = resolveService(req);
  if (typeof key !== 'string' || key.trim() === '') {
    res.status(400).json({ message: 'key is required' });
    return;
  }
  const value = await keyringManager.get(key, service);
  if (value === null) {
    res.status(404).json({ message: 'Secret not found' });
    return;
  }
  res.json({
    key,
    value,
    service: service ?? keyringManager.getActiveService(),
    backend: keyringManager.getCurrentBackend()
  });
});

export const setSecret = asyncHandler(async (req: Request, res: Response) => {
  const key = resolveKey(req);
  const service = resolveService(req);
  const { value } = req.body as { value?: string };
  if (typeof key !== 'string' || key.trim() === '') {
    res.status(400).json({ message: 'key is required' });
    return;
  }
  if (typeof value !== 'string') {
    res.status(400).json({ message: 'value must be a string' });
    return;
  }
  await keyringManager.set(key, value, service);
  res.json({
    key,
    service: service ?? keyringManager.getActiveService(),
    backend: keyringManager.getCurrentBackend(),
    maskedValue: maskValue(value)
  });
});

export const deleteSecret = asyncHandler(async (req: Request, res: Response) => {
  const key = resolveKey(req);
  const service = resolveService(req);
  if (typeof key !== 'string' || key.trim() === '') {
    res.status(400).json({ message: 'key is required' });
    return;
  }
  await keyringManager.delete(key, service);
  res.json({
    key,
    service: service ?? keyringManager.getActiveService(),
    backend: keyringManager.getCurrentBackend(),
    deleted: true
  });
});

export const getBackend = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ active: keyringManager.getCurrentBackend(), available: AVAILABLE_BACKENDS });
});

export const switchBackend = asyncHandler(async (req: Request, res: Response) => {
  const backend = (req.params.name ?? req.body.backend) as KeyringBackendName | undefined;
  if (!isBackendName(backend)) {
    res.status(400).json({ message: 'Unsupported backend. Use system, file, or memory.' });
    return;
  }
  await keyringManager.switchBackend(backend);
  res.json({ active: keyringManager.getCurrentBackend(), available: AVAILABLE_BACKENDS });
});

export const listServices = asyncHandler(async (_req: Request, res: Response) => {
  const services = await keyringManager.listAllServices();
  res.json({
    active: keyringManager.getActiveService(),
    available: services,
    backend: keyringManager.getCurrentBackend()
  });
});

export const switchService = asyncHandler(async (req: Request, res: Response) => {
  const { service } = req.body as { service?: string };
  if (typeof service !== 'string' || service.trim() === '') {
    res.status(400).json({ message: 'service is required' });
    return;
  }
  keyringManager.setActiveService(service.trim());
  res.json({
    service: keyringManager.getActiveService(),
    backend: keyringManager.getCurrentBackend()
  });
});
