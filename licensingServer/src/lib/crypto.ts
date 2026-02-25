import crypto from 'crypto';

export const LICENSE_ALG = 'RSA-SHA256';

export function signBytesToB64(privateKeyPem: string, payloadBytes: Buffer): string {
  const sign = crypto.createSign(LICENSE_ALG);
  sign.update(payloadBytes);
  sign.end();
  const signature = sign.sign(privateKeyPem);
  return signature.toString('base64');
}

export function verifyB64Signature(publicKeyPem: string, payloadBytes: Buffer, signatureB64: string): boolean {
  let sig: Buffer;
  try {
    sig = Buffer.from(signatureB64, 'base64');
  } catch {
    return false;
  }

  const verify = crypto.createVerify(LICENSE_ALG);
  verify.update(payloadBytes);
  verify.end();
  return verify.verify(publicKeyPem, sig);
}
