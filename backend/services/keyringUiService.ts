import keyringManager from './keyringAccessor';
import type { KeyringManager } from './keyringAccessor';
import { getKeyringBackendDisplayName } from '../../src/core/keyringManager';
import type { KeyringBackendName } from '../../src/core/backends/types';

export type KeyringUiSecret = {
  alias: string;
  maskedValue: string;
};

export type KeyringUiSummary = {
  backend: KeyringBackendName;
  service: KeyringBackendName;
  displayName: string;
  secrets: KeyringUiSecret[];
};

const maskSecretValue = (value: string): string => {
  if (!value) {
    return '••••';
  }
  if (value.length <= 4) {
    return '•'.repeat(value.length);
  }
  return `${value.slice(0, 2)}•••${value.slice(-2)}`;
};

const syncToService = async (manager: KeyringManager, service?: string) => {
  if (!service?.trim()) {
    return;
  }
  await manager.switchToBackend(service.trim() as KeyringBackendName);
};

export const getKeyringUiSummary = async (manager: KeyringManager = keyringManager): Promise<KeyringUiSummary> => {
  const secrets = await manager.list();
  const backend = manager.currentBackend() as KeyringBackendName;
  return {
    backend,
    service: backend,
    displayName: getKeyringBackendDisplayName(backend),
    secrets: Object.entries(secrets)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([alias, value]) => ({
        alias,
        maskedValue: maskSecretValue(value)
      }))
  };
};

export const storeKeyringSecret = async (
  payload: { alias: string; secret: string; service?: string },
  manager: KeyringManager = keyringManager
) => {
  await syncToService(manager, payload.service);
  await manager.set(payload.alias, payload.secret);
  return getKeyringUiSummary(manager);
};

export const revealKeyringSecret = async (
  payload: { alias: string; service?: string },
  manager: KeyringManager = keyringManager
) => {
  await syncToService(manager, payload.service);
  return manager.get(payload.alias);
};

export const deleteKeyringSecret = async (
  payload: { alias: string; service?: string },
  manager: KeyringManager = keyringManager
) => {
  await syncToService(manager, payload.service);
  await manager.delete(payload.alias);
  return getKeyringUiSummary(manager);
};

export const switchKeyringBackend = async (
  name: string,
  manager: KeyringManager = keyringManager
) => {
  await manager.switchToBackend(name.trim() as KeyringBackendName);
  return getKeyringUiSummary(manager);
};
