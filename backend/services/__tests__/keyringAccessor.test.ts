import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

test('keyring accessor preserves secrets across service switches', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnoman-keyring-'));
  const originalDir = process.env.GNOMAN_KEYRING_DIR;
  try {
    process.env.GNOMAN_KEYRING_DIR = tempDir;
    const modulePath = path.join(__dirname, '..', 'keyringAccessor');
    delete require.cache[require.resolve(modulePath)];
    const { KeyringAccessor } = (await import(modulePath)) as typeof import('../keyringAccessor');
    const accessor = new KeyringAccessor();
    const testKey = `cycle-${Date.now()}`;
    const testValue = 'secret-value';

    await accessor.setSecret(testKey, testValue);
    const firstRead = await accessor.getSecret(testKey);
    assert.equal(firstRead, testValue);

    await accessor.switchService('alternate');
    const missing = await accessor.getSecret(testKey);
    assert.equal(missing, null);

    await accessor.switchService('aes');
    const secondRead = await accessor.getSecret(testKey);
    assert.equal(secondRead, testValue);

    await accessor.removeSecret(testKey);
  } finally {
    if (originalDir) {
      process.env.GNOMAN_KEYRING_DIR = originalDir;
    } else {
      delete process.env.GNOMAN_KEYRING_DIR;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
