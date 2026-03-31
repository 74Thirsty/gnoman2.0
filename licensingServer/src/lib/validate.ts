export type IssueInput = {
  customer: string;
  product: string;
  plan: string;
  expiresAt?: string | null;
  features?: Record<string, unknown>;
  machineHash?: string | null;
};

export type LicensePayload = {
  licenseId: string;
  issuedAt: string;
  expiresAt: string | null;
  customer: string;
  product: string;
  plan: string;
  features: Record<string, unknown>;
  machineHash?: string | null;
  nonce: string;
};

export function isIsoDateString(s: unknown): boolean {
  if (typeof s !== 'string') {
    return false;
  }
  const t = Date.parse(s);
  return Number.isFinite(t);
}

export function assertString(name: string, v: unknown) {
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
}

export function assertMaxBytes(name: string, bytes: number, maxBytes: number) {
  if (bytes > maxBytes) {
    throw new Error(`${name} too large (${bytes} bytes > ${maxBytes} bytes)`);
  }
}

export function assertExpiresNotBeforeIssued(issuedAtIso: string, expiresAtIso: string) {
  const i = Date.parse(issuedAtIso);
  const e = Date.parse(expiresAtIso);
  if (!Number.isFinite(i) || !Number.isFinite(e)) {
    throw new Error('Invalid issuedAt/expiresAt');
  }
  if (e < i) {
    throw new Error('expiresAt cannot be before issuedAt');
  }
}

export function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }
  const e = Date.parse(expiresAt);
  if (!Number.isFinite(e)) {
    return true;
  }
  return Date.now() > e;
}
