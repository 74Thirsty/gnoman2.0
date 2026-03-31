import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getSecureSetting } from './secureSettingsService';

const HOLD_MAX_HOURS = 24 * 14; // two weeks safety window

export interface HoldPolicy {
  safeAddress: string;
  enabled: boolean;
  holdHours: number;
  updatedAt: string;
}

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
          holdHours INTEGER DEFAULT 24,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      .run();
    this.db
      .prepare(`
        CREATE TABLE IF NOT EXISTS hold_settings (
          safeAddress TEXT PRIMARY KEY,
          enabled INTEGER DEFAULT 0,
          holdHours INTEGER DEFAULT 24,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      .run();
    try {
      this.db.prepare(`ALTER TABLE hold_settings ADD COLUMN updatedAt DATETIME`).run();
    } catch (error) {
      if (!(error instanceof Error) || !/duplicate column/i.test(error.message)) {
        throw error;
      }
    }
    this.purgeExpired();
  }

  private normalizeHours(requested: number) {
    if (!Number.isFinite(requested)) {
      return 24;
    }
    const hours = Math.max(1, Math.min(Math.round(requested), HOLD_MAX_HOURS));
    return hours;
  }

  private purgeExpired() {
    this.db
      .prepare(
        `DELETE FROM tx_holds
         WHERE executed = 1 AND datetime(holdUntil) < datetime('now', '-90 days')`
      )
      .run();
    this.db
      .prepare(
        `DELETE FROM tx_holds
         WHERE executed = 0 AND datetime(createdAt) < datetime('now', '-180 days')`
      )
      .run();
  }

  async setHoldState(safeAddress: string, enabled: boolean, holdHours: number) {
    const normalizedHours = this.normalizeHours(holdHours);
    this.db
      .prepare(
        `INSERT INTO hold_settings (safeAddress, enabled, holdHours, updatedAt)
         VALUES (@safeAddress, @enabled, @holdHours, CURRENT_TIMESTAMP)
         ON CONFLICT(safeAddress) DO UPDATE SET
           enabled=@enabled,
           holdHours=@holdHours,
           updatedAt=CURRENT_TIMESTAMP`
      )
      .run({ safeAddress, enabled: enabled ? 1 : 0, holdHours: normalizedHours });
    return this.getHoldState(safeAddress);
  }

  getHoldState(safeAddress: string) {
    const row = this.db
      .prepare(`SELECT enabled, holdHours, updatedAt FROM hold_settings WHERE safeAddress = ?`)
      .get(safeAddress) as { enabled: number; holdHours: number; updatedAt: string } | undefined;
    return {
      safeAddress,
      enabled: row ? Boolean(row.enabled) : true,
      holdHours: this.normalizeHours(row?.holdHours ?? 24),
      updatedAt: row?.updatedAt ?? new Date(0).toISOString()
    } satisfies HoldPolicy;
  }

  listHoldPolicies() {
    const rows = this.db
      .prepare(`SELECT safeAddress, enabled, holdHours, updatedAt FROM hold_settings ORDER BY updatedAt DESC`)
      .all() as { safeAddress: string; enabled: number; holdHours: number; updatedAt: string }[];
    return rows.map((row) => ({
      safeAddress: row.safeAddress,
      enabled: Boolean(row.enabled),
      holdHours: this.normalizeHours(row.holdHours),
      updatedAt: row.updatedAt
    })) satisfies HoldPolicy[];
  }

  async getEffectivePolicy(safeAddress: string) {
    const [globalPolicy, localPolicy] = await Promise.all([
      getSecureSetting('SAFE_TX_HOLD_ENABLED', { enabled: true, holdHours: 24 }),
      Promise.resolve(this.getHoldState(safeAddress))
    ]);
    const normalizedGlobalHours = this.normalizeHours(globalPolicy.holdHours ?? 24);
    return {
      global: { enabled: Boolean(globalPolicy.enabled), holdHours: normalizedGlobalHours },
      local: localPolicy
    };
  }

  async createHold(txHash: string, safeAddress: string) {
    const { global, local } = await this.getEffectivePolicy(safeAddress);
    if (!global.enabled) {
      return null;
    }
    if (!local.enabled) {
      return null;
    }
    const createdAt = new Date();
    const holdHours = this.normalizeHours(local.holdHours);
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

  releaseNow(txHash: string) {
    this.db
      .prepare(
        `UPDATE tx_holds
         SET holdUntil = datetime('now'), executed = executed
         WHERE txHash = ?`
      )
      .run(txHash);
    return this.getHold(txHash);
  }

  summarize(safeAddress: string) {
    const summary = this.db
      .prepare(
        `SELECT
            SUM(CASE WHEN executed = 1 THEN 1 ELSE 0 END) AS executed,
            SUM(CASE WHEN executed = 0 THEN 1 ELSE 0 END) AS pending
         FROM tx_holds
         WHERE safeAddress = ?`
      )
      .get(safeAddress) as { executed: number | null; pending: number | null } | undefined;
    const totals = {
      executed: summary?.executed ?? 0,
      pending: summary?.pending ?? 0
    };
    return totals;
  }
}

export const holdService = new TransactionHoldService();
