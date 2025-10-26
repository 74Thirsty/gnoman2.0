import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

const ROOT = process.cwd();
const VERIFY_SCRIPT = path.join(ROOT, 'backend/licenses/verify_license.py');
const PUB_KEY_PATH = path.join(ROOT, 'backend/licenses/license_public.pem');
const SAFEVAULT_DIR = path.join(ROOT, '.safevault');
const ENV_PATH = path.join(SAFEVAULT_DIR, 'license.env');

if (!fs.existsSync(SAFEVAULT_DIR)) {
  fs.mkdirSync(SAFEVAULT_DIR, { recursive: true });
}

export type LicenseValidationResult = {
  ok: boolean;
  reason?: string;
};

function runVerification(token: string): boolean {
  try {
    const out = execFileSync(
      'python3',
      [VERIFY_SCRIPT, PUB_KEY_PATH, token, 'GNOMAN', '2.0.0'],
      {
        encoding: 'utf8',
        timeout: 5000
      }
    );
    const trimmed = out.trim();
    if (trimmed === 'True' || trimmed === 'False') {
      return trimmed === 'True';
    }
  } catch (error) {
    // Ignore and attempt fallback below.
  }

  try {
    const script = `import runpy\nns = runpy.run_path(${JSON.stringify(
      VERIFY_SCRIPT
    )})\nfunc = ns.get("verify_token")\nargs = ${JSON.stringify([
      PUB_KEY_PATH,
      token,
      'GNOMAN',
      '2.0.0'
    ])}\nresult = False\nif callable(func):\n    result = func(*args)\nprint("True" if result else "False")\n`;
    const fallbackOut = execFileSync('python3', ['-c', script], {
      encoding: 'utf8',
      timeout: 5000
    });
    return fallbackOut.trim() === 'True';
  } catch (innerError) {
    return false;
  }
}

export function verifyOfflineLicense(token: string): boolean {
  return runVerification(token);
}

function persistToken(token: string): void {
  const content = [
    `LICENSE_KEY=${token}`,
    `VALIDATED_AT=${Math.floor(Date.now() / 1000)}`
  ].join('\n');
  fs.writeFileSync(ENV_PATH, content, 'utf8');
}

export function loadToken(): string | null {
  if (!fs.existsSync(ENV_PATH)) {
    return null;
  }
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  const kv = Object.fromEntries(lines.filter(Boolean).map((line) => line.split('=', 2)));
  return kv.LICENSE_KEY ?? null;
}

export function validateAndSave(token: string): LicenseValidationResult {
  const valid = verifyOfflineLicense(token);
  if (valid) {
    persistToken(token);
    return { ok: true };
  }
  return { ok: false, reason: 'invalid_or_expired' };
}
