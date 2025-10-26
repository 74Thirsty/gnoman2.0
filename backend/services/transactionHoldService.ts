import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface HoldRecord {
  txHash: string;
  safeAddress: string;
  createdAt: string;
  holdUntil: string;
  executed: number;
  holdHours: number;
}

class TransactionHoldService {
  private db: InstanceType<typeof Database>;

  constructor() {
    const storageDir = path.join(process.cwd(), '.gnoman');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    const dbPath = path.join(storageDir, 'holds.sqlite');
    this.db = new Database(dbPath);
    this.prepare();
  }

  private prepare() {
    this.db
      .prepare(`
        CREATE TABLE IF NOT EXISTS tx_holds (
          txHash TEXT PRIMARY KEY,
          safeAddress TEXT,
          createdAt DATETIME,
          holdUntil DATETIME,
          executed INTEGER DEFAULT 0,
          holdHours INTEGER DEFAULT 24
        )
      `)
      .run();
    this.db
      .prepare(`
        CREATE TABLE IF NOT EXISTS hold_settings (
          safeAddress TEXT PRIMARY KEY,
          enabled INTEGER DEFAULT 0,
          holdHours INTEGER DEFAULT 24
        )
      `)
      .run();
  }

  setHoldState(safeAddress: string, enabled: boolean, holdHours: number) {
    this.db
      .prepare(
        `INSERT INTO hold_settings (safeAddress, enabled, holdHours)
         VALUES (@safeAddress, @enabled, @holdHours)
         ON CONFLICT(safeAddress) DO UPDATE SET enabled=@enabled, holdHours=@holdHours`
      )
      .run({ safeAddress, enabled: enabled ? 1 : 0, holdHours });
    return { safeAddress, enabled, holdHours };
  }

  getHoldState(safeAddress: string) {
    const row = this.db
      .prepare(`SELECT enabled, holdHours FROM hold_settings WHERE safeAddress = ?`)
      .get(safeAddress) as { enabled: number; holdHours: number } | undefined;
    return {
      enabled: Boolean(row?.enabled ?? 0),
      holdHours: row?.holdHours ?? 24
    };
  }

  createHold(txHash: string, safeAddress: string) {
    const { enabled, holdHours } = this.getHoldState(safeAddress);
    if (!enabled) {
      return null;
    }
    const createdAt = new Date();
    const holdUntil = new Date(createdAt.getTime() + holdHours * 60 * 60 * 1000);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO tx_holds (txHash, safeAddress, createdAt, holdUntil, executed, holdHours)
         VALUES (@txHash, @safeAddress, @createdAt, @holdUntil, 0, @holdHours)`
      )
      .run({
        txHash,
        safeAddress,
        createdAt: createdAt.toISOString(),
        holdUntil: holdUntil.toISOString(),
        holdHours
      });
    return this.getHold(txHash);
  }

  getHold(txHash: string) {
    return this.db
      .prepare(`SELECT * FROM tx_holds WHERE txHash = ?`)
      .get(txHash) as HoldRecord | undefined;
  }

  listHolds(safeAddress: string) {
    return this.db
      .prepare(`SELECT * FROM tx_holds WHERE safeAddress = ? ORDER BY createdAt DESC`)
      .all(safeAddress) as HoldRecord[];
  }

  canExecute(hold: HoldRecord) {
    if (hold.executed) {
      return true;
    }
    return new Date(hold.holdUntil).getTime() <= Date.now();
  }

  markExecuted(txHash: string) {
    this.db.prepare(`UPDATE tx_holds SET executed = 1 WHERE txHash = ?`).run(txHash);
  }
}

export const holdService = new TransactionHoldService();
