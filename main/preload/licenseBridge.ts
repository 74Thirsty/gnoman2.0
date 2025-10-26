import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = process.cwd();
const VERIFY_SCRIPT = path.join(ROOT, 'backend/licenses/verify_license.py');
const PUB_KEY_PATH = path.join(ROOT, 'backend/licenses/license_public.pem');
const SAFEVAULT_DIR = path.join(ROOT, '.safevault');
const ENV_PATH = path.join(SAFEVAULT_DIR, 'license.env');

if (!fs.existsSync(SAFEVAULT_DIR)) fs.mkdirSync(SAFEVAULT_DIR, { recursive: true });

export function verifyOfflineLicense(token: string): boolean {
  try {
    const out = execFileSync('python3', [VERIFY_SCRIPT, PUB_KEY_PATH, token, 'GNOMAN', '2.0.0'], {
      encoding: 'utf8',
      timeout: 5000
    });
    return out.trim() === 'True';
  } catch {
    return false;
  }
}

function persistToken(token: string) {
  const content = [`LICENSE_KEY=${token}`, `VALIDATED_AT=${Math.floor(Date.now() / 1000)}`].join('\n');
  fs.writeFileSync(ENV_PATH, content, 'utf8');
}

export function loadToken(): string | null {
  if (!fs.existsSync(ENV_PATH)) return null;
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  const kv = Object.fromEntries(lines.filter(Boolean).map((line) => line.split('=', 2)));
  return kv.LICENSE_KEY || null;
}

export function validateAndSave(token: string): { ok: boolean; reason?: string } {
  const valid = verifyOfflineLicense(token);
  if (valid) {
    persistToken(token);
    return { ok: true };
  }
  return { ok: false, reason: 'invalid_or_expired' };
}
