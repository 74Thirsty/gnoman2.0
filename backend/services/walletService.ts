import crypto from 'crypto';
import { ethers } from 'ethers';
import type { Wallet, HDNodeWallet } from 'ethers';
import { PersistedWalletRecord, walletRepository } from './walletStore';

interface WalletCreationOptions {
  alias?: string;
  password?: string;
  hidden?: boolean;
}

const deriveKey = (password: string, salt: string) =>
  crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');

interface EncryptionResult {
  encryptedSecret: string;
  iv: string;
  salt: string;
}

const encryptSecret = (secret: string, password: string): EncryptionResult => {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedSecret: Buffer.concat([encrypted, tag]).toString('hex'),
    iv: iv.toString('hex'),
    salt
  };
};

const decryptSecret = (record: PersistedWalletRecord, password: string) => {
  const key = deriveKey(password, record.salt);
  const iv = Buffer.from(record.iv, 'hex');
  const buffer = Buffer.from(record.encryptedSecret, 'hex');
  const tag = buffer.subarray(buffer.length - 16);
  const encrypted = buffer.subarray(0, buffer.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};

interface WalletMetadata {
  address: string;
  alias?: string;
  hidden: boolean;
  createdAt: string;
  source: string;
  network?: string;
  balance?: string;
}

export interface WalletDetails extends WalletMetadata {
  publicKey?: string;
  mnemonic?: string;
  derivationPath?: string;
  privateKey: string;
}

interface MnemonicImportOptions extends WalletCreationOptions {
  mnemonic: string;
  derivationPath?: string;
}

interface PrivateKeyImportOptions extends WalletCreationOptions {
  privateKey: string;
}

interface StoreOptions extends WalletCreationOptions {
  source: string;
}

const sanitizeAlias = (alias?: string) => {
  if (typeof alias !== 'string') {
    return undefined;
  }
  const trimmed = alias.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const storeWallet = (
  wallet: Wallet | HDNodeWallet,
  {
    alias,
    password = crypto.randomUUID(),
    hidden = false,
    source,
    network = 'mainnet',
    balance = '0.0000',
    mnemonic,
    derivationPath
  }: StoreOptions & { network?: string; balance?: string; mnemonic?: string; derivationPath?: string }
): WalletMetadata => {
  const normalizedAlias = sanitizeAlias(alias);
  const encryptionResult = encryptSecret(wallet.privateKey, password);
  const record: PersistedWalletRecord = {
    address: wallet.address,
    alias: normalizedAlias,
    hidden,
    createdAt: new Date().toISOString(),
    source,
    network,
    balance,
    publicKey: 'publicKey' in wallet ? wallet.publicKey : undefined,
    mnemonic: mnemonic ?? ('mnemonic' in wallet ? wallet.mnemonic?.phrase : undefined),
    derivationPath:
      derivationPath ??
      ('path' in wallet && typeof wallet.path === 'string' ? wallet.path : undefined),
    privateKey: wallet.privateKey,
    ...encryptionResult
  };
  walletRepository.save(record);
  return {
    address: wallet.address,
    alias: normalizedAlias,
    hidden,
    source,
    createdAt: record.createdAt,
    network: record.network,
    balance: record.balance
  };
};

export const createRandomWallet = async (options: WalletCreationOptions) => {
  const wallet = ethers.Wallet.createRandom();
  return storeWallet(wallet, { ...options, source: 'generated', network: 'mainnet' });
};

export const importWalletFromMnemonic = async ({
  mnemonic,
  derivationPath,
  ...rest
}: MnemonicImportOptions) => {
  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, derivationPath);
  return storeWallet(hdNode, {
    ...rest,
    source: 'mnemonic',
    derivationPath:
      derivationPath ?? (typeof hdNode.path === 'string' ? hdNode.path : undefined),
    mnemonic: hdNode.mnemonic?.phrase,
    network: 'mainnet'
  });
};

export const importWalletFromPrivateKey = async ({ privateKey, ...rest }: PrivateKeyImportOptions) => {
  const wallet = new ethers.Wallet(privateKey);
  return storeWallet(wallet, { ...rest, source: 'privateKey', network: 'mainnet' });
};

export const generateVanityAddress = async ({
  prefix,
  suffix,
  maxAttempts = 500000,
  ...rest
}: WalletCreationOptions & { prefix?: string; suffix?: string; maxAttempts?: number }) => {
  const normalizedPrefix = prefix?.replace(/^0x/i, '').toLowerCase();
  const normalizedSuffix = suffix?.toLowerCase();
  let attempts = 0;
  while (attempts < maxAttempts) {
    const wallet = ethers.Wallet.createRandom();
    const address = wallet.address.toLowerCase().replace(/^0x/, '');
    const matchesPrefix = normalizedPrefix ? address.startsWith(normalizedPrefix) : true;
    const matchesSuffix = normalizedSuffix ? address.endsWith(normalizedSuffix) : true;
    if (matchesPrefix && matchesSuffix) {
      return storeWallet(wallet, { ...rest, source: 'vanity' });
    }
    attempts += 1;
  }
  throw new Error('Unable to find vanity address within the maximum number of attempts.');
};

export const listWalletMetadata = async (): Promise<WalletMetadata[]> => {
  return walletRepository.list().map((record) => ({
    address: record.address,
    alias: record.alias,
    hidden: record.hidden,
    createdAt: record.createdAt,
    source: record.source,
    network: record.network,
    balance: record.balance
  }));
};

export const exportWallet = async (address: string, password: string) => {
  const record = walletRepository.find(address);
  if (!record) {
    throw new Error('Wallet not found');
  }
  const privateKey = decryptSecret(record, password);
  const wallet = new ethers.Wallet(privateKey);
  return wallet.encrypt(password);
};

export const getWalletDetails = async (address: string): Promise<WalletDetails> => {
  const record = walletRepository.find(address);
  if (!record) {
    throw new Error('Wallet not found');
  }
  return {
    address: record.address,
    alias: record.alias,
    hidden: record.hidden,
    createdAt: record.createdAt,
    source: record.source,
    network: record.network,
    balance: record.balance,
    publicKey: record.publicKey,
    mnemonic: record.mnemonic,
    derivationPath: record.derivationPath,
    privateKey: record.privateKey || 'Unavailable'
  } satisfies WalletDetails;
};
