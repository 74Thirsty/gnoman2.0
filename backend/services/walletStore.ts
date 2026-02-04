import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface PersistedWalletRecord {
  address: string;
  alias?: string;
  encryptedSecret: string;
  iv: string;
  salt: string;
  hidden: boolean;
  createdAt: string;
  source: string;
  publicKey?: string;
  mnemonic?: string;
  derivationPath?: string;
  network?: string;
  balance?: string;
  privateKey: string;
}

const storageDir = path.join(process.cwd(), '.gnoman');
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
}

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
    address TEXT PRIMARY KEY COLLATE NOCASE,
    alias TEXT,
    encryptedSecret TEXT NOT NULL,
    iv TEXT NOT NULL,
    salt TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    source TEXT NOT NULL,
    publicKey TEXT,
    mnemonic TEXT,
    derivationPath TEXT,
    network TEXT,
    balance TEXT,
    privateKey TEXT NOT NULL
  )
`);

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
ensureColumn('mnemonic', 'TEXT');
ensureColumn('derivationPath', 'TEXT');
ensureColumn('network', 'TEXT');
ensureColumn('balance', 'TEXT');
ensureColumn('privateKey', 'TEXT');

const insertStatement: Statement = db.prepare(
  `INSERT INTO wallets (address, alias, encryptedSecret, iv, salt, hidden, createdAt, source, publicKey, mnemonic, derivationPath, network, balance, privateKey)
   VALUES (@address, @alias, @encryptedSecret, @iv, @salt, @hidden, @createdAt, @source, @publicKey, @mnemonic, @derivationPath, @network, @balance, @privateKey)
   ON CONFLICT(address) DO UPDATE SET
     alias = excluded.alias,
     encryptedSecret = excluded.encryptedSecret,
     iv = excluded.iv,
     salt = excluded.salt,
     hidden = excluded.hidden,
     source = excluded.source,
     publicKey = excluded.publicKey,
     mnemonic = excluded.mnemonic,
     derivationPath = excluded.derivationPath,
     network = excluded.network,
     balance = excluded.balance,
     privateKey = excluded.privateKey`
);

const listStatement: Statement = db.prepare(`
  SELECT address, alias, encryptedSecret, iv, salt, hidden, createdAt, source, publicKey, mnemonic, derivationPath, network, balance, privateKey
  FROM wallets
  ORDER BY datetime(createdAt) DESC
`);

const getStatement: Statement = db.prepare(`
  SELECT address, alias, encryptedSecret, iv, salt, hidden, createdAt, source, publicKey, mnemonic, derivationPath, network, balance, privateKey
  FROM wallets
  WHERE address = ?
`);

const deleteStatement: Statement = db.prepare(`
  DELETE FROM wallets
  WHERE address = ?
`);

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
  mnemonic: string | null;
  derivationPath: string | null;
  network: string | null;
  balance: string | null;
  privateKey: string;
};

const mapRow = (row: WalletRow): PersistedWalletRecord => {
  return {
    address: row.address,
    alias: row.alias ?? undefined,
    encryptedSecret: row.encryptedSecret,
    iv: row.iv,
    salt: row.salt,
    hidden: Boolean(row.hidden),
    createdAt: row.createdAt,
    source: row.source,
    publicKey: row.publicKey ?? undefined,
    mnemonic: row.mnemonic ?? undefined,
    derivationPath: row.derivationPath ?? undefined,
    network: row.network ?? undefined,
    balance: row.balance ?? undefined,
    privateKey: row.privateKey ?? ''
  };
};

export const walletRepository = {
  save(record: PersistedWalletRecord) {
    insertStatement.run({
      ...record,
      alias: record.alias ?? null,
      hidden: record.hidden ? 1 : 0,
      publicKey: record.publicKey ?? null,
      mnemonic: record.mnemonic ?? null,
      derivationPath: record.derivationPath ?? null,
      network: record.network ?? null,
      balance: record.balance ?? null
    });
  },

  list(): PersistedWalletRecord[] {
    return (listStatement.all() as WalletRow[]).map((row) => mapRow(row));
  },

  find(address: string): PersistedWalletRecord | undefined {
    const row = getStatement.get(address) as WalletRow | undefined;
    if (!row) {
      return undefined;
    }
    return mapRow(row);
  },

  delete(address: string): boolean {
    const result = deleteStatement.run(address);
    return result.changes > 0;
  }
};
