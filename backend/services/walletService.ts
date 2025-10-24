import crypto from 'crypto';
import { ethers } from 'ethers';

interface WalletRecord {
  address: string;
  alias?: string;
  encryptedSecret: string;
  iv: string;
  salt: string;
  hidden: boolean;
  createdAt: string;
  source: string;
}

const walletStore = new Map<string, WalletRecord>();

interface EncryptionResult {
  encryptedSecret: string;
  iv: string;
  salt: string;
}

const deriveKey = (password: string, salt: string) =>
  crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');

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

const decryptSecret = (record: WalletRecord, password: string) => {
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

interface WalletCreationOptions {
  alias?: string;
  password?: string;
  hidden?: boolean;
}

export const createRandomWallet = async (options: WalletCreationOptions) => {
  const wallet = ethers.Wallet.createRandom();
  return storeWallet(wallet, { ...options, source: 'generated' });
};

interface MnemonicImportOptions extends WalletCreationOptions {
  mnemonic: string;
  derivationPath?: string;
}

export const importWalletFromMnemonic = async ({ mnemonic, derivationPath, ...rest }: MnemonicImportOptions) => {
  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, derivationPath);
  return storeWallet(new ethers.Wallet(hdNode.privateKey), { ...rest, source: 'mnemonic' });
};

interface PrivateKeyImportOptions extends WalletCreationOptions {
  privateKey: string;
}

export const importWalletFromPrivateKey = async ({ privateKey, ...rest }: PrivateKeyImportOptions) => {
  const wallet = new ethers.Wallet(privateKey);
  return storeWallet(wallet, { ...rest, source: 'privateKey' });
};

interface VanityOptions extends WalletCreationOptions {
  prefix?: string;
  suffix?: string;
  maxAttempts?: number;
}

export const generateVanityAddress = async ({
  prefix,
  suffix,
  maxAttempts = 500000,
  ...rest
}: VanityOptions) => {
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

interface StoreOptions extends WalletCreationOptions {
  source: string;
}

const storeWallet = (
  wallet: ethers.Wallet,
  { alias, password = crypto.randomUUID(), hidden = false, source }: StoreOptions
) => {
  const encryptionResult = encryptSecret(wallet.privateKey, password);
  const record: WalletRecord = {
    address: wallet.address,
    alias,
    hidden,
    createdAt: new Date().toISOString(),
    source,
    ...encryptionResult
  };
  walletStore.set(wallet.address.toLowerCase(), record);
  return {
    address: wallet.address,
    alias,
    hidden,
    source,
    createdAt: record.createdAt
  };
};

export const listWalletMetadata = async () => {
  return Array.from(walletStore.values()).map((record) => ({
    address: record.address,
    alias: record.alias,
    hidden: record.hidden,
    createdAt: record.createdAt,
    source: record.source
  }));
};

export const exportWallet = async (address: string, password: string) => {
  const record = walletStore.get(address.toLowerCase());
  if (!record) {
    throw new Error('Wallet not found');
  }
  const privateKey = decryptSecret(record, password);
  const wallet = new ethers.Wallet(privateKey);
  return wallet.encrypt(password);
};
