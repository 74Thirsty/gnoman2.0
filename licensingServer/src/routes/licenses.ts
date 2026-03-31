import { Router } from 'express';
import crypto from 'crypto';
import { canonicalizeLicenseJson } from '../lib/canonicalize';
import { LICENSE_ALG, signBytesToB64, verifyB64Signature } from '../lib/crypto';
import {
  IssueInput,
  LicensePayload,
  assertString,
  assertMaxBytes,
  isIsoDateString,
  assertExpiresNotBeforeIssued,
  isExpired
} from '../lib/validate';
import { requireIssueApiKey } from '../middleware/auth';

export function licensesRouter(keys: { privateKeyPem: string; publicKeyPem: string }) {
  const r = Router();

  r.post('/issue', requireIssueApiKey, (req, res) => {
    try {
      const body: IssueInput = req.body ?? {};

      assertString('customer', body.customer);
      assertString('product', body.product);
      assertString('plan', body.plan);

      const issuedAt = new Date().toISOString();
      const expiresAt = body.expiresAt ?? null;

      if (expiresAt !== null) {
        if (!isIsoDateString(expiresAt)) {
          throw new Error('expiresAt must be ISO string or null');
        }
        assertExpiresNotBeforeIssued(issuedAt, expiresAt);
      }

      const license: LicensePayload = {
        licenseId: `LIC-${crypto.randomBytes(9).toString('hex').toUpperCase()}`,
        issuedAt,
        expiresAt,
        customer: body.customer.trim(),
        product: body.product.trim(),
        plan: body.plan.trim(),
        features: body.features && typeof body.features === 'object' ? body.features : {},
        machineHash: body.machineHash ?? null,
        nonce: crypto.randomBytes(16).toString('hex')
      };

      const canonical = canonicalizeLicenseJson(license);
      const payloadBytes = Buffer.from(canonical, 'utf8');
      assertMaxBytes('license', payloadBytes.length, 8 * 1024);

      const signatureB64 = signBytesToB64(keys.privateKeyPem, payloadBytes);

      return res.json({
        license,
        signatureB64,
        alg: LICENSE_ALG
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ error: message });
    }
  });

  r.post('/verify', (req, res) => {
    try {
      const { license, signatureB64 } = req.body ?? {};
      if (!license || typeof license !== 'object') {
        throw new Error('license object required');
      }
      if (typeof signatureB64 !== 'string' || signatureB64.length === 0) {
        throw new Error('signatureB64 required');
      }

      const canonical = canonicalizeLicenseJson(license);
      const payloadBytes = Buffer.from(canonical, 'utf8');
      assertMaxBytes('license', payloadBytes.length, 8 * 1024);

      const sigOk = verifyB64Signature(keys.publicKeyPem, payloadBytes, signatureB64);
      if (!sigOk) {
        return res.json({ valid: false, reason: 'bad_signature' });
      }

      const expiresAt: string | null = license.expiresAt ?? null;
      if (expiresAt !== null && !isIsoDateString(expiresAt)) {
        return res.json({ valid: false, reason: 'bad_expiresAt' });
      }
      if (isExpired(expiresAt)) {
        return res.json({ valid: false, reason: 'expired' });
      }

      const machineHash: string | null = license.machineHash ?? null;
      const presentedMachineHash: string | null = req.body.machineHash ?? null;
      if (machineHash && presentedMachineHash && machineHash !== presentedMachineHash) {
        return res.json({ valid: false, reason: 'machine_mismatch' });
      }
      if (machineHash && !presentedMachineHash) {
        return res.json({ valid: false, reason: 'machine_required' });
      }

      return res.json({ valid: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ valid: false, reason: message });
    }
  });

  return r;
}
