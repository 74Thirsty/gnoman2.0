import crypto from 'crypto';
import keyringManager from '../../src/core/keyringManager';
import { listContracts } from './contractRegistryService';
import { safeConfigRepository } from './safeConfigRepository';
import { DEVICE_KEY, encryptValue, walletRepository } from './walletStore';

interface ExportPayload {
  version: 1;
  createdAt: string;
  keyring: Record<string, string>;
  wallets: {
    deviceKey: string;
    records: ReturnType<typeof walletRepository.list>;
  };
  contracts: ReturnType<typeof listContracts>;
  safes: ReturnType<typeof safeConfigRepository.load>;
}

export interface EncryptedExportBundle {
  format: 'gnoman-export-v1';
  createdAt: string;
  checksumSha256: string;
  iv: string;
  salt: string;
  encryptedSecret: string;
}

const checksumSha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export const exportEncryptedWorkspace = async (password: string): Promise<EncryptedExportBundle> => {
  const trimmedPassword = password.trim();
  if (trimmedPassword.length < 8) {
    throw new Error('Export password must be at least 8 characters');
  }

  const payload: ExportPayload = {
    version: 1,
    createdAt: new Date().toISOString(),
    keyring: await keyringManager.list(),
    wallets: {
      deviceKey: DEVICE_KEY,
      records: walletRepository.list()
    },
    contracts: listContracts(),
    safes: safeConfigRepository.load()
  };

  const serialized = JSON.stringify(payload);
  const encrypted = encryptValue(serialized, trimmedPassword);

  return {
    format: 'gnoman-export-v1',
    createdAt: payload.createdAt,
    checksumSha256: checksumSha256(serialized),
    iv: encrypted.iv,
    salt: encrypted.salt,
    encryptedSecret: encrypted.encryptedSecret
  };
};
