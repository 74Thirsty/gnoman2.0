// main/preload/licenseBridge.ts
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

const ROOT = process.cwd();
const PUB_KEY_PATH = path.join(ROOT, "backend/licenses/license_public.pem");
const SAFEVAULT_DIR = path.join(ROOT, ".safevault");
const ENV_PATH = path.join(SAFEVAULT_DIR, "license.env");
const PYTHON_BRIDGE = `
import sys
from backend.licenses.verify_license import verify_token


def main():
    _, pub_path, token, product, version = sys.argv
    result = verify_token(pub_path, token, product, version)
    print("True" if result else "False")


if __name__ == "__main__":
    main()
`;

// ensure .safevault exists
if (!fs.existsSync(SAFEVAULT_DIR)) fs.mkdirSync(SAFEVAULT_DIR, { recursive: true });

/**
 * Run verify_license.py directly to confirm the token offline.
 * Returns true if valid, false otherwise.
 */
export function verifyOfflineLicense(token: string): boolean {
  try {
    const out = execFileSync(
      "python3",
      ["-c", PYTHON_BRIDGE, PUB_KEY_PATH, token, "GNOMAN", "2.0.0"],
      {
        encoding: "utf8",
        timeout: 5000,
      }
    );
    return out.trim() === "True";
  } catch {
    return false;
  }
}

/** Persist valid token in .safevault/license.env */
function persistToken(token: string) {
  const content = [
    `LICENSE_KEY=${token}`,
    `VALIDATED_AT=${Math.floor(Date.now() / 1000)}`,
  ].join("\n");
  fs.writeFileSync(ENV_PATH, content, "utf8");
}

/** Load previously saved token (if any) */
export function loadToken(): string | null {
  if (!fs.existsSync(ENV_PATH)) return null;
  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  const kv = Object.fromEntries(lines.filter(Boolean).map(l => l.split("=", 2)));
  return kv.LICENSE_KEY || null;
}

/** Validate key and save if valid */
export function validateAndSave(token: string): { ok: boolean; reason?: string } {
  const valid = verifyOfflineLicense(token);
  if (valid) {
    persistToken(token);
    return { ok: true };
  }
  return { ok: false, reason: "invalid_or_expired" };
}
