import crypto from 'crypto';
import { ethers } from 'ethers';
import type { Wallet, HDNodeWallet } from 'ethers';
import { PersistedWalletRecord, walletRepository, DEVICE_KEY, encryptValue, decryptValue } from './walletStore';
import { sessionWalletService } from './sessionWalletService';
import { getBalance, requireRpcUrl } from './rpcService';

// ─── Key derivation (same parameters as walletStore) ─────────────────────────

const deriveKey = (password: string, salt: string) =>
  crypto.pbkdf2Sync(password, salt, 100_000, 32, 'sha512');

const encryptSecret = (secret: string, password: string) => encryptValue(secret, password);

const decryptSecret = (record: PersistedWalletRecord, password: string): string => {
  return decryptValue(record.encryptedSecret, record.iv, record.salt, password);
};

const resolveEncryptionPassword = (record: PersistedWalletRecord, userPassword: string): string => {
  if (record.keySource === 'device') return DEVICE_KEY;
  if (!record.hasPassword) return DEVICE_KEY;
  return userPassword;
};

const resolvePrivateKey = (record: PersistedWalletRecord, password: string): string => {
  return decryptSecret(record, resolveEncryptionPassword(record, password));
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface WalletCreationOptions {
  alias?: string;
  password?: string;
  hidden?: boolean;
}

const NETWORK_TO_CHAIN_ID: Record<string, number> = {
  mainnet: 1,
  ethereum: 1,
  sepolia: 11155111,
  base: 8453,
  arbitrum: 42161,
  'arbitrum-one': 42161
};

const resolveChainIdFromNetwork = (network?: string): number | undefined => {
  if (!network) return undefined;
  const normalized = network.trim().toLowerCase();
  if (!normalized) return undefined;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return NETWORK_TO_CHAIN_ID[normalized];
};

export interface WalletMetadata {
  address: string;
  alias?: string;
  hidden: boolean;
  createdAt: string;
  source: string;
  network?: string;
  balance?: string;
  /** True if this wallet requires a user password to sign (false = device key or session wallet) */
  requiresPassword: boolean;
  isSession: false;
}

export interface WalletDetails extends WalletMetadata {
  publicKey?: string;
  mnemonic?: string;
  derivationPath?: string;
  privateKey?: string;
}

export interface SessionWalletMetadata {
  id: string;
  address: string;
  alias?: string;
  label: string;
  source: string;
  createdAt: string;
  requiresPassword: false;
  isSession: true;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const sanitizeAlias = (alias?: string): string | undefined => {
  if (typeof alias !== 'string') return undefined;
  const t = alias.trim();
  return t.length > 0 ? t : undefined;
};

const deriveCompressedPublicKey = (privateKey: string) =>
  ethers.SigningKey.computePublicKey(privateKey, true);

const resolveMnemonic = (record: PersistedWalletRecord, password = ''): string | undefined => {
  if (!record.encryptedMnemonic || !record.mnemonicIv || !record.mnemonicSalt) return undefined;
  const key = resolveEncryptionPassword(record, password);
  try {
    return decryptValue(record.encryptedMnemonic, record.mnemonicIv, record.mnemonicSalt, key);
  } catch {
    return undefined;
  }
};

const toWalletDetails = (record: PersistedWalletRecord, liveBalance?: string): WalletDetails => {
  const privateKey = record.hasPassword ? undefined : resolvePrivateKey(record, '');
  const mnemonic = record.hasPassword ? undefined : resolveMnemonic(record, '');
  const publicKey = record.publicKey ?? (privateKey ? deriveCompressedPublicKey(privateKey) : undefined);

  return {
    address: record.address,
    alias: record.alias,
    hidden: record.hidden,
    createdAt: record.createdAt,
    source: record.source,
    network: record.network,
    balance: liveBalance ?? record.balance,
    publicKey,
    mnemonic,
    derivationPath: record.derivationPath,
    privateKey,
    requiresPassword: record.hasPassword,
    isSession: false,
  };
};

const storeWallet = (
  wallet: Wallet | HDNodeWallet,
  options: WalletCreationOptions & {
    source: string;
    network?: string;
    balance?: string;
    mnemonic?: string;
    derivationPath?: string;
    publicKey?: string;
  }
): WalletDetails => {
  const {
    alias,
    password,
    hidden = false,
    source,
    network = 'mainnet',
    balance,
    mnemonic,
    derivationPath,
    publicKey,
  } = options;
  const normalizedAlias = sanitizeAlias(alias);
  const hasPassword = typeof password === 'string' && password.length > 0;
  const keySource = hasPassword ? 'user' : 'device';
  const encryptionPassword = hasPassword ? password : DEVICE_KEY;

  const { encryptedSecret, iv, salt } = encryptSecret(wallet.privateKey, encryptionPassword);

  let encryptedMnemonic: string | undefined;
  let mnemonicIv: string | undefined;
  let mnemonicSalt: string | undefined;

  if (mnemonic) {
    const enc = encryptSecret(mnemonic, encryptionPassword);
    encryptedMnemonic = enc.encryptedSecret;
    mnemonicIv = enc.iv;
    mnemonicSalt = enc.salt;
  }

  const record: PersistedWalletRecord = {
    address: wallet.address,
    alias: normalizedAlias,
    hidden,
    createdAt: new Date().toISOString(),
    source,
    network,
    balance,
    publicKey: publicKey ?? ('publicKey' in wallet ? wallet.publicKey : undefined),
    derivationPath:
      derivationPath ??
      ('path' in wallet && typeof wallet.path === 'string' ? wallet.path : undefined),
    encryptedSecret,
    iv,
    salt,
    hasPassword,
    keySource,
    encryptedMnemonic,
    mnemonicIv,
    mnemonicSalt,
  };

  walletRepository.save(record);

  return {
    address: wallet.address,
    alias: normalizedAlias,
    hidden,
    source,
    createdAt: record.createdAt,
    network: record.network,
    balance: record.balance,
    publicKey: record.publicKey,
    mnemonic: mnemonic,
    derivationPath: record.derivationPath,
    privateKey: undefined,
    requiresPassword: hasPassword,
    isSession: false,
  };
};

// ─── Wallet creation / import ─────────────────────────────────────────────────

export const createRandomWallet = async (
  options: WalletCreationOptions & { wordCount?: 12 | 24 }
): Promise<WalletDetails> => {
  const entropyBytes = options.wordCount === 24 ? 32 : 16;
  const entropy = ethers.randomBytes(entropyBytes);
  const mnemonic = ethers.Mnemonic.fromEntropy(entropy);
  const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic);
  const derivationPath = typeof wallet.path === 'string' ? wallet.path : undefined;
  const metadata = storeWallet(wallet, {
    ...options,
    source: 'generated',
    network: 'mainnet',
    mnemonic: mnemonic.phrase,
    derivationPath,
    publicKey: deriveCompressedPublicKey(wallet.privateKey),
  });

  return {
    ...metadata,
    publicKey: metadata.publicKey ?? deriveCompressedPublicKey(wallet.privateKey),
    mnemonic: mnemonic.phrase,
    derivationPath,
    privateKey: wallet.privateKey,
  };
};

export const importWalletFromMnemonic = async ({
  mnemonic,
  derivationPath,
  ...rest
}: WalletCreationOptions & { mnemonic: string; derivationPath?: string }): Promise<WalletDetails> => {
  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, derivationPath);
  const resolvedPath = derivationPath ?? (typeof hdNode.path === 'string' ? hdNode.path : undefined);
  const metadata = storeWallet(hdNode, {
    ...rest,
    source: 'mnemonic',
    derivationPath: resolvedPath,
    mnemonic: hdNode.mnemonic?.phrase,
    network: 'mainnet',
    publicKey: deriveCompressedPublicKey(hdNode.privateKey),
  });

  return {
    ...metadata,
    publicKey: metadata.publicKey ?? deriveCompressedPublicKey(hdNode.privateKey),
    mnemonic: hdNode.mnemonic?.phrase,
    derivationPath: resolvedPath,
    privateKey: hdNode.privateKey,
  };
};

export const importWalletFromPrivateKey = async ({
  privateKey,
  ...rest
}: WalletCreationOptions & { privateKey: string }): Promise<WalletDetails> => {
  const wallet = new ethers.Wallet(privateKey);
  const metadata = storeWallet(wallet, {
    ...rest,
    source: 'privateKey',
    network: 'mainnet',
    publicKey: deriveCompressedPublicKey(wallet.privateKey),
  });

  return {
    ...metadata,
    publicKey: metadata.publicKey ?? deriveCompressedPublicKey(wallet.privateKey),
    privateKey: wallet.privateKey,
  };
};

export const importWalletFromEncryptedJson = async ({
  json,
  password,
  alias,
  hidden,
}: {
  json: string;
  password: string;
  alias?: string;
  hidden?: boolean;
}): Promise<WalletMetadata> => {
  const wallet = await ethers.Wallet.fromEncryptedJson(json, password);
  return storeWallet(wallet, { alias, password, hidden: Boolean(hidden), source: 'keystore', network: 'mainnet' });
};

// ─── Vanity ───────────────────────────────────────────────────────────────────

export const generateVanityAddress = async ({
  prefix,
  suffix,
  maxAttempts = 500_000,
  ...rest
}: WalletCreationOptions & { prefix?: string; suffix?: string; maxAttempts?: number }): Promise<WalletMetadata> => {
  const normPrefix = prefix?.replace(/^0x/i, '').toLowerCase();
  const normSuffix = suffix?.toLowerCase();
  let attempts = 0;
  while (attempts < maxAttempts) {
    const wallet = ethers.Wallet.createRandom();
    const addr = wallet.address.toLowerCase().replace(/^0x/, '');
    if ((!normPrefix || addr.startsWith(normPrefix)) && (!normSuffix || addr.endsWith(normSuffix))) {
      return storeWallet(wallet, { ...rest, source: 'vanity' });
    }
    attempts++;
  }
  throw new Error('Unable to find vanity address within the maximum number of attempts.');
};

// ─── Listing ──────────────────────────────────────────────────────────────────

export const listWalletMetadata = async (): Promise<WalletMetadata[]> => {
  const records = walletRepository.list();
  const balances = await Promise.all(
    records.map((r) => getBalance(r.address, undefined, resolveChainIdFromNetwork(r.network)))
  );
  return records.map((r, i) => ({
    address: r.address,
    alias: r.alias,
    hidden: r.hidden,
    createdAt: r.createdAt,
    source: r.source,
    network: r.network,
    balance: balances[i] ?? r.balance,
    requiresPassword: r.hasPassword,
    isSession: false as const,
  }));
};

// ─── Details (no private key exposed without explicit export) ─────────────────

export const getWalletDetails = async (address: string): Promise<WalletDetails> => {
  const record = walletRepository.find(address);
  if (!record) throw new Error('Wallet not found');
  const liveBalance = await getBalance(record.address, undefined, resolveChainIdFromNetwork(record.network));
  return toWalletDetails(record, liveBalance);
};

// ─── Export (explicit, requires password) ────────────────────────────────────

export const exportWallet = async (address: string, password: string): Promise<string> => {
  const record = walletRepository.find(address);
  if (!record) throw new Error('Wallet not found');
  const privateKey = resolvePrivateKey(record, password);
  const wallet = new ethers.Wallet(privateKey);
  return wallet.encrypt(password);
};

// ─── Send ─────────────────────────────────────────────────────────────────────

export const sendWalletTransaction = async ({
  address,
  password,
  to,
  value,
  data,
}: {
  address: string;
  password: string;
  to: string;
  value?: string;
  data?: string;
}): Promise<{ hash: string }> => {
  const record = walletRepository.find(address);
  if (!record) throw new Error('Wallet not found');
  const rpcUrl = await requireRpcUrl();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const privateKey = resolvePrivateKey(record, password);
  const wallet = new ethers.Wallet(privateKey, provider);
  const tx = await wallet.sendTransaction({
    to: ethers.getAddress(to),
    value: value?.trim() ? ethers.parseEther(value.trim()) : 0n,
    data: data?.trim() || undefined,
  });
  return { hash: tx.hash };
};

// ─── Remove ───────────────────────────────────────────────────────────────────

export const removeWallet = async (address: string): Promise<{ address: string }> => {
  const record = walletRepository.find(address);
  if (!record) throw new Error('Wallet not found');
  walletRepository.delete(address);
  return { address };
};

// ─── Signer helper (used by safeService) ─────────────────────────────────────

/**
 * Returns an ethers.Wallet for the given address.
 * Checks session wallets first (no password needed), then persistent wallets.
 * Throws if the wallet is not found or the password is wrong.
 */
export const getDecryptedSigner = (signerAddress: string, signerPassword?: string): ethers.Wallet => {
  // Session wallet — no password needed
  const session = sessionWalletService.getEthersWalletByAddress(signerAddress);
  if (session) return session;

  // Persistent wallet
  const record = walletRepository.find(signerAddress);
  if (!record) throw new Error(`Signer wallet not found: ${signerAddress}`);
  const privateKey = resolvePrivateKey(record, signerPassword ?? '');
  return new ethers.Wallet(privateKey);
};
