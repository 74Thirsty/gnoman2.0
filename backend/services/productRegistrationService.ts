import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface RegistrationStatus {
  registered: boolean;
  email?: string;
  registeredAt?: string;
}

interface RegistrationRecord {
  email: string;
  license_hash: string;
  salt: string;
  registered_at: string;
}

class ProductRegistrationService {
  private db: InstanceType<typeof Database>;

  constructor() {
    const storageDir = path.join(process.cwd(), '.safevault');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const dbPath = path.join(storageDir, 'registration.sqlite');
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize() {
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS registrations (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          email TEXT NOT NULL,
          license_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          registered_at TEXT NOT NULL
        )`
      )
      .run();
  }

  getStatus(): RegistrationStatus {
    const existing = this.db.prepare('SELECT email, license_hash, salt, registered_at FROM registrations WHERE id = 1').get() as
      | RegistrationRecord
      | undefined;

    if (!existing) {
      return { registered: false };
    }

    return {
      registered: true,
      email: existing.email,
      registeredAt: existing.registered_at
    };
  }

  register(email: string, licenseKey: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedKey = licenseKey.trim().toUpperCase();

    if (!normalizedEmail) {
      throw new Error('Email is required.');
    }

    if (!normalizedKey) {
      throw new Error('License key is required.');
    }

    const existing = this.db
      .prepare('SELECT email, license_hash, salt, registered_at FROM registrations WHERE id = 1')
      .get() as RegistrationRecord | undefined;

    if (existing) {
      const derivedHash = this.deriveHash(normalizedKey, Buffer.from(existing.salt, 'hex'));
      if (derivedHash !== existing.license_hash) {
        throw new Error('Provided license key does not match the registered product.');
      }

      this.db
        .prepare(
          `UPDATE registrations SET email = @email, registered_at = @registered_at WHERE id = 1`
        )
        .run({
          email: normalizedEmail,
          registered_at: new Date().toISOString()
        });
      return;
    }

    const salt = crypto.randomBytes(16);
    const licenseHash = this.deriveHash(normalizedKey, salt);

    this.db
      .prepare(
        `INSERT INTO registrations (id, email, license_hash, salt, registered_at)
         VALUES (1, @email, @license_hash, @salt, @registered_at)`
      )
      .run({
        email: normalizedEmail,
        license_hash: licenseHash,
        salt: salt.toString('hex'),
        registered_at: new Date().toISOString()
      });
  }

  private deriveHash(licenseKey: string, salt: Buffer): string {
    const derived = crypto.scryptSync(licenseKey, salt, 64, { N: 1 << 15, r: 8, p: 1 });
    return derived.toString('hex');
  }
}

const productRegistrationService = new ProductRegistrationService();

export default productRegistrationService;
