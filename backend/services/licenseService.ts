import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface LicenseStatus {
  active: boolean;
  identifier?: string;
  product?: string;
  version?: string;
  expiry?: string;
  token?: string;
}

interface StoredLicense {
  identifier: string;
  product: string;
  version: string;
  expiry: number;
  token: string;
}

class LicenseService {
  private readonly storageDir = path.join(process.cwd(), '.gnoman');
  private readonly licensePath = path.join(this.storageDir, 'license.json');
  private readonly publicKeyPath = path.join(__dirname, '../licenses/license_public.pem');

  constructor() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  getStatus(): LicenseStatus {
    if (!fs.existsSync(this.licensePath)) {
      return { active: false };
    }

    try {
      const contents = fs.readFileSync(this.licensePath, 'utf8');
      const parsed = JSON.parse(contents) as StoredLicense;
      return {
        active: true,
        identifier: parsed.identifier,
        product: parsed.product,
        version: parsed.version,
        expiry: new Date(parsed.expiry * 1000).toISOString(),
        token: parsed.token
      };
    } catch (error) {
      console.error('Unable to read license.json', error);
      return { active: false };
    }
  }

  applyLicense(input: string): LicenseStatus {
    const rawToken = this.normalizeToken(input);
    const { payload, signature } = this.splitToken(rawToken);
    const payloadBuffer = this.decodeBase64Url(payload);
    const signatureBuffer = this.decodeBase64Url(signature);

    this.ensurePublicKey();
    const publicKey = crypto.createPublicKey(fs.readFileSync(this.publicKeyPath));
    const isValid = crypto.verify(null, payloadBuffer, publicKey, signatureBuffer);

    if (!isValid) {
      throw new Error('Invalid license signature.');
    }

    const decoded = payloadBuffer.toString('utf8');
    const [identifier, product, version, expiry] = decoded.split('|');

    if (!identifier || !product || !version || !expiry) {
      throw new Error('License payload is malformed.');
    }

    const expiryNumber = Number.parseInt(expiry, 10);
    if (Number.isNaN(expiryNumber)) {
      throw new Error('License expiry is invalid.');
    }

    if (expiryNumber < Math.floor(Date.now() / 1000)) {
      throw new Error('License token has expired.');
    }

    const record: StoredLicense = {
      identifier,
      product,
      version,
      expiry: expiryNumber,
      token: rawToken
    };

    fs.writeFileSync(this.licensePath, JSON.stringify(record, null, 2));

    return {
      active: true,
      identifier,
      product,
      version,
      expiry: new Date(expiryNumber * 1000).toISOString(),
      token: rawToken
    };
  }

  private normalizeToken(input: string): string {
    const trimmed = input.trim();
    if (trimmed.includes('.')) {
      return trimmed;
    }

    const cleaned = trimmed.replace(/[-\s]/g, '').toUpperCase();
    const buffer = this.decodeBase32(cleaned);
    const token = buffer.toString('utf8');
    if (!token.includes('.')) {
      throw new Error('Decoded license token is malformed.');
    }
    return token;
  }

  private splitToken(token: string) {
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new Error('License token must contain a payload and signature.');
    }
    return { payload: parts[0], signature: parts[1] };
  }

  private decodeBase64Url(value: string): Buffer {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (padded.length % 4)) % 4;
    const normalized = padded + '='.repeat(padLength);
    return Buffer.from(normalized, 'base64');
  }

  private decodeBase32(value: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';

    for (const char of value) {
      const index = alphabet.indexOf(char);
      if (index === -1) {
        throw new Error('License token contains invalid base32 characters.');
      }
      bits += index.toString(2).padStart(5, '0');
    }

    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      const chunk = bits.slice(i, i + 8);
      bytes.push(Number.parseInt(chunk, 2));
    }

    return Buffer.from(bytes);
  }

  private ensurePublicKey() {
    if (!fs.existsSync(this.publicKeyPath)) {
      throw new Error('Missing license_public.pem. Place the public key in backend/licenses/.');
    }
  }
}

export const licenseService = new LicenseService();
