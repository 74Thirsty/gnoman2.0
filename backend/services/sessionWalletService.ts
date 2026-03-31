/**
 * Session (ephemeral) wallet service.
 * Wallets live ONLY in process memory — never written to disk.
 * Cleared automatically when the Electron process exits.
 */
import crypto from 'crypto';
import { ethers } from 'ethers';

export interface SessionWallet {
  id: string;
  address: string;
  label: string;
  source: 'generated' | 'imported-privatekey' | 'imported-mnemonic';
  createdAt: string;
}

interface SessionEntry extends SessionWallet {
  _key: string;
}

const store = new Map<string, SessionEntry>();

const pub = ({ _key: _k, ...rest }: SessionEntry): SessionWallet => rest;

export const sessionWalletService = {
  generate(label?: string): SessionWallet {
    const w = ethers.Wallet.createRandom();
    const id = crypto.randomUUID();
    const entry: SessionEntry = {
      id,
      address: w.address,
      label: label || `Session ${store.size + 1}`,
      source: 'generated',
      createdAt: new Date().toISOString(),
      _key: w.privateKey,
    };
    store.set(id, entry);
    return pub(entry);
  },

  importByPrivateKey(privateKey: string, label?: string): SessionWallet {
    const w = new ethers.Wallet(privateKey);
    const id = crypto.randomUUID();
    const entry: SessionEntry = {
      id,
      address: w.address,
      label: label || `Imported ${w.address.slice(0, 10)}…`,
      source: 'imported-privatekey',
      createdAt: new Date().toISOString(),
      _key: w.privateKey,
    };
    store.set(id, entry);
    return pub(entry);
  },

  importByMnemonic(mnemonic: string, derivationPath?: string, label?: string): SessionWallet {
    const w = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, derivationPath);
    const id = crypto.randomUUID();
    const entry: SessionEntry = {
      id,
      address: w.address,
      label: label || `Imported ${w.address.slice(0, 10)}…`,
      source: 'imported-mnemonic',
      createdAt: new Date().toISOString(),
      _key: w.privateKey,
    };
    store.set(id, entry);
    return pub(entry);
  },

  list(): SessionWallet[] {
    return Array.from(store.values()).map(pub);
  },

  get(id: string): SessionWallet | undefined {
    const e = store.get(id);
    return e ? pub(e) : undefined;
  },

  /** Returns an ethers.Wallet connected to NO provider. Caller connects. */
  getEthersWallet(id: string): ethers.Wallet | undefined {
    const e = store.get(id);
    return e ? new ethers.Wallet(e._key) : undefined;
  },

  getEthersWalletByAddress(address: string): ethers.Wallet | undefined {
    const normalized = ethers.getAddress(address);
    for (const e of store.values()) {
      if (ethers.getAddress(e.address) === normalized) return new ethers.Wallet(e._key);
    }
    return undefined;
  },

  /**
   * Generate a brand-new wallet with the same label, wipe the old key from memory.
   * Used for ephemeral rotation — caller is responsible for on-chain owner swap.
   */
  rotate(id: string): { prev: SessionWallet; next: SessionWallet } {
    const old = store.get(id);
    if (!old) throw new Error('Session wallet not found');
    const prevPublic = pub(old);
    // Overwrite key bytes before deleting
    old._key = crypto.randomBytes(32).toString('hex');
    store.delete(id);
    const next = this.generate(old.label);
    return { prev: prevPublic, next };
  },

  delete(id: string): boolean {
    const e = store.get(id);
    if (e) e._key = crypto.randomBytes(32).toString('hex');
    return store.delete(id);
  },

  clearAll(): void {
    for (const e of store.values()) e._key = crypto.randomBytes(32).toString('hex');
    store.clear();
  },
};
