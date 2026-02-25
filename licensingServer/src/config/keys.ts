import fs from 'fs';
import crypto from 'crypto';

export type LoadedKeys = {
  privateKeyPem: string;
  publicKeyPem: string;
};

function readPemOrThrow(path: string, label: string): string {
  try {
    const pem = fs.readFileSync(path, 'utf8');
    if (!pem.includes('BEGIN')) {
      throw new Error('Not PEM formatted');
    }
    return pem;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} read failed at ${path}: ${message}`);
  }
}

function parsePrivateKeyOrThrow(pem: string): crypto.KeyObject {
  try {
    return crypto.createPrivateKey(pem);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Private key parse failed: ${message}`);
  }
}

function parsePublicKeyOrThrow(pem: string): crypto.KeyObject {
  try {
    return crypto.createPublicKey(pem);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Public key parse failed: ${message}`);
  }
}

function assertMatchingKeypairOrThrow(privateKey: crypto.KeyObject, publicKey: crypto.KeyObject) {
  const msg = Buffer.from('license-key-selftest', 'utf8');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(msg);
  signer.end();
  const sig = signer.sign(privateKey);

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(msg);
  verifier.end();
  const ok = verifier.verify(publicKey, sig);

  if (!ok) {
    throw new Error('Keypair self-test failed: public key does not verify private key signatures');
  }
}

export function loadKeysOrExit(): LoadedKeys {
  const privatePath = process.env.LICENSE_PRIVATE_KEY_PATH ?? './keys/license-private.pem';
  const publicPath = process.env.LICENSE_PUBLIC_KEY_PATH ?? './keys/license-public.pem';

  try {
    const privateKeyPem = readPemOrThrow(privatePath, 'LICENSE_PRIVATE_KEY_PATH');
    const publicKeyPem = readPemOrThrow(publicPath, 'LICENSE_PUBLIC_KEY_PATH');

    const priv = parsePrivateKeyOrThrow(privateKeyPem);
    const pub = parsePublicKeyOrThrow(publicKeyPem);

    if (priv.asymmetricKeyType !== 'rsa') {
      throw new Error(`Private key is not RSA (got ${priv.asymmetricKeyType})`);
    }
    if (pub.asymmetricKeyType !== 'rsa') {
      throw new Error(`Public key is not RSA (got ${pub.asymmetricKeyType})`);
    }

    assertMatchingKeypairOrThrow(priv, pub);

    return { privateKeyPem, publicKeyPem };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`FATAL: License key configuration error: ${message}`);
    process.exit(1);
  }
}
