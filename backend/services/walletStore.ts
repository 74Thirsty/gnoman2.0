import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface PersistedWalletRecord {
  address: string;
  alias?: string;
  encryptedSecret: string;
  iv: string;
  salt: string;
  /** AES-256-GCM encrypted mnemonic (if present) */
  encryptedMnemonic?: string;
  mnemonicIv?: string;
  mnemonicSalt?: string;
  hidden: boolean;
  createdAt: string;
  source: string;
  publicKey?: string;
  derivationPath?: string;
  network?: string;
  balance?: string;
  hasPassword: boolean;
  /** 'user' = encrypted with user-supplied password; 'device' = encrypted with device key */
  keySource: 'user' | 'device';
}

// ─── Storage directory ───────────────────────────────────────────────────────

const storageDir = path.join(process.cwd(), '.gnoman');
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
}

// ─── Device key (replaces random UUID for password-less wallets) ─────────────

const DEVICE_KEY_PATH = path.join(storageDir, '.device-key');

const getOrCreateDeviceKey = (): string => {
  if (fs.existsSync(DEVICE_KEY_PATH)) {
    return fs.readFileSync(DEVICE_KEY_PATH, 'utf8').trim();
  }
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(DEVICE_KEY_PATH, key, { mode: 0o600 });
  return key;
};

export const DEVICE_KEY = getOrCreateDeviceKey();

// ─── Encryption helpers (exported for walletService) ─────────────────────────

const deriveKey = (password: string, salt: string) =>
  crypto.pbkdf2Sync(password, salt, 100_000, 32, 'sha512');

export const encryptValue = (
  value: string,
  password: string
): { encryptedSecret: string; iv: string; salt: string } => {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedSecret: Buffer.concat([encrypted, tag]).toString('hex'),
    iv: iv.toString('hex'),
    salt,
  };
};

export const decryptValue = (
  encryptedSecret: string,
  iv: string,
  salt: string,
  password: string
): string => {
  const key = deriveKey(password, salt);
  const ivBuf = Buffer.from(iv, 'hex');
  const buf = Buffer.from(encryptedSecret, 'hex');
  const tag = buf.subarray(buf.length - 16);
  const encrypted = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

// ─── Database ─────────────────────────────────────────────────────────────────

const databasePath = path.join(storageDir, 'wallets.db');
const db = new Database(databasePath);

try {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
} catch (error) {
  console.warn('Unable to configure wallet database pragmas', error);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    address          TEXT PRIMARY KEY COLLATE NOCASE,
    alias            TEXT,
    encryptedSecret  TEXT NOT NULL,
    iv               TEXT NOT NULL,
    salt             TEXT NOT NULL,
    hidden           INTEGER NOT NULL DEFAULT 0,
    createdAt        TEXT NOT NULL,
    source           TEXT NOT NULL,
    publicKey        TEXT,
    derivationPath   TEXT,
    network          TEXT,
    balance          TEXT,
    hasPassword      INTEGER NOT NULL DEFAULT 0,
    keySource        TEXT NOT NULL DEFAULT 'device',
    encryptedMnemonic TEXT,
    mnemonicIv       TEXT,
    mnemonicSalt     TEXT
  )
`);

// Ensure columns exist for existing databases
const ensureColumn = (name: string, type: string, defaultValue?: string) => {
  try {
    db.exec(
      `ALTER TABLE wallets ADD COLUMN ${name} ${type}${
        typeof defaultValue !== 'undefined' ? ` DEFAULT ${defaultValue}` : ''
      }`
    );
  } catch (error) {
    if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) {
      throw error;
    }
  }
};

ensureColumn('publicKey', 'TEXT');
ensureColumn('derivationPath', 'TEXT');
ensureColumn('network', 'TEXT');
ensureColumn('balance', 'TEXT');
ensureColumn('hasPassword', 'INTEGER', '0');
ensureColumn('keySource', 'TEXT', "'device'");
ensureColumn('encryptedMnemonic', 'TEXT');
ensureColumn('mnemonicIv', 'TEXT');
ensureColumn('mnemonicSalt', 'TEXT');
// Legacy columns — kept only for the one-time migration below
ensureColumn('privateKey', 'TEXT', "''");
ensureColumn('mnemonic', 'TEXT');

// ─── One-time migration: re-encrypt plaintext keys with device key ─────────────

const runMigration = db.transaction(() => {
  type LegacyRow = { address: string; privateKey: string; mnemonic: string | null };

  // Any wallet that still has a plaintext private key (regardless of keySource)
  const toMigrate = db.prepare(
    `SELECT address, privateKey, mnemonic FROM wallets
     WHERE (privateKey IS NOT NULL AND privateKey != '')`
  ).all() as LegacyRow[];

  const update = db.prepare(
    `UPDATE wallets SET
       encryptedSecret  = @encryptedSecret,
       iv               = @iv,
       salt             = @salt,
       keySource        = 'device',
       encryptedMnemonic = @encryptedMnemonic,
       mnemonicIv       = @mnemonicIv,
       mnemonicSalt     = @mnemonicSalt,
       privateKey       = '',
       mnemonic         = NULL
     WHERE address = @address`
  );

  for (const row of toMigrate) {
    if (!row.privateKey) continue;
    try {
      const enc = encryptValue(row.privateKey, DEVICE_KEY);
      let encM: string | null = null;
      let mnIv: string | null = null;
      let mnSalt: string | null = null;
      if (row.mnemonic) {
        const m = encryptValue(row.mnemonic, DEVICE_KEY);
        encM = m.encryptedSecret;
        mnIv = m.iv;
        mnSalt = m.salt;
      }
      update.run({
        encryptedSecret: enc.encryptedSecret,
        iv: enc.iv,
        salt: enc.salt,
        encryptedMnemonic: encM,
        mnemonicIv: mnIv,
        mnemonicSalt: mnSalt,
        address: row.address,
      });
      console.info(JSON.stringify({ event: 'WALLET_MIGRATED_TO_DEVICE_KEY', address: row.address }));
    } catch (err) {
      console.error(`Migration failed for wallet ${row.address}`, err);
    }
  }

  // For wallets WITH a user password: just clear the now-redundant plaintext
  db.prepare(
    `UPDATE wallets SET privateKey = '', mnemonic = NULL
     WHERE hasPassword = 1 AND privateKey IS NOT NULL AND privateKey != ''`
  ).run();
});

runMigration();

// ─── Statements ───────────────────────────────────────────────────────────────

const insertStatement: Statement = db.prepare(
  `INSERT INTO wallets (
     address, alias, encryptedSecret, iv, salt, hidden, createdAt, source,
     publicKey, derivationPath, network, balance, hasPassword, keySource,
     encryptedMnemonic, mnemonicIv, mnemonicSalt,
     privateKey, mnemonic
   ) VALUES (
     @address, @alias, @encryptedSecret, @iv, @salt, @hidden, @createdAt, @source,
     @publicKey, @derivationPath, @network, @balance, @hasPassword, @keySource,
     @encryptedMnemonic, @mnemonicIv, @mnemonicSalt,
     '', NULL
   )
   ON CONFLICT(address) DO UPDATE SET
     alias            = excluded.alias,
     encryptedSecret  = excluded.encryptedSecret,
     iv               = excluded.iv,
     salt             = excluded.salt,
     hidden           = excluded.hidden,
     source           = excluded.source,
     publicKey        = excluded.publicKey,
     derivationPath   = excluded.derivationPath,
     network          = excluded.network,
     balance          = excluded.balance,
     hasPassword      = excluded.hasPassword,
     keySource        = excluded.keySource,
     encryptedMnemonic = excluded.encryptedMnemonic,
     mnemonicIv       = excluded.mnemonicIv,
     mnemonicSalt     = excluded.mnemonicSalt,
     privateKey       = '',
     mnemonic         = NULL`
);

const listStatement: Statement = db.prepare(
  `SELECT address, alias, encryptedSecret, iv, salt, hidden, createdAt, source,
          publicKey, derivationPath, network, balance, hasPassword, keySource,
          encryptedMnemonic, mnemonicIv, mnemonicSalt
   FROM wallets ORDER BY datetime(createdAt) DESC`
);

const getStatement: Statement = db.prepare(
  `SELECT address, alias, encryptedSecret, iv, salt, hidden, createdAt, source,
          publicKey, derivationPath, network, balance, hasPassword, keySource,
          encryptedMnemonic, mnemonicIv, mnemonicSalt
   FROM wallets WHERE address = ?`
);

const deleteStatement: Statement = db.prepare(
  `DELETE FROM wallets WHERE address = ?`
);

// ─── Row mapping ──────────────────────────────────────────────────────────────

type WalletRow = {
  address: string;
  alias: string | null;
  encryptedSecret: string;
  iv: string;
  salt: string;
  hidden: number;
  createdAt: string;
  source: string;
  publicKey: string | null;
  derivationPath: string | null;
  network: string | null;
  balance: string | null;
  hasPassword: number;
  keySource: string;
  encryptedMnemonic: string | null;
  mnemonicIv: string | null;
  mnemonicSalt: string | null;
};

const mapRow = (row: WalletRow): PersistedWalletRecord => ({
  address: row.address,
  alias: row.alias ?? undefined,
  encryptedSecret: row.encryptedSecret,
  iv: row.iv,
  salt: row.salt,
  encryptedMnemonic: row.encryptedMnemonic ?? undefined,
  mnemonicIv: row.mnemonicIv ?? undefined,
  mnemonicSalt: row.mnemonicSalt ?? undefined,
  hidden: Boolean(row.hidden),
  createdAt: row.createdAt,
  source: row.source,
  publicKey: row.publicKey ?? undefined,
  derivationPath: row.derivationPath ?? undefined,
  network: row.network ?? undefined,
  balance: row.balance ?? undefined,
  hasPassword: Boolean(row.hasPassword),
  keySource: (row.keySource as 'user' | 'device') ?? 'device',
});

// ─── Repository ───────────────────────────────────────────────────────────────

export const walletRepository = {
  save(record: PersistedWalletRecord) {
    insertStatement.run({
      address: record.address,
      alias: record.alias ?? null,
      encryptedSecret: record.encryptedSecret,
      iv: record.iv,
      salt: record.salt,
      hidden: record.hidden ? 1 : 0,
      createdAt: record.createdAt,
      source: record.source,
      publicKey: record.publicKey ?? null,
      derivationPath: record.derivationPath ?? null,
      network: record.network ?? null,
      balance: record.balance ?? null,
      hasPassword: record.hasPassword ? 1 : 0,
      keySource: record.keySource,
      encryptedMnemonic: record.encryptedMnemonic ?? null,
      mnemonicIv: record.mnemonicIv ?? null,
      mnemonicSalt: record.mnemonicSalt ?? null,
    });
  },

  list(): PersistedWalletRecord[] {
    return (listStatement.all() as WalletRow[]).map(mapRow);
  },

  find(address: string): PersistedWalletRecord | undefined {
    const row = getStatement.get(address) as WalletRow | undefined;
    return row ? mapRow(row) : undefined;
  },

  delete(address: string): boolean {
    return deleteStatement.run(address).changes > 0;
  },
};
