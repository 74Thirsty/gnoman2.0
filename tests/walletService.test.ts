import fs from 'fs';
import os from 'os';
import path from 'path';
import { ethers } from 'ethers';

describe('walletService', () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnoman-wallet-service-'));
    process.chdir(tempDir);
    jest.doMock('../backend/services/rpcService', () => ({
      getBalance: jest.fn(async () => '0.0000'),
      requireRpcUrl: jest.fn(async () => 'http://localhost:8545')
    }));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.dontMock('../backend/services/rpcService');
  });

  it('persists mnemonic material for generated wallets', async () => {
    const walletService = await import('../backend/services/walletService');
    const generated = await walletService.createRandomWallet({ alias: 'generated-wallet' });
    const details = await walletService.getWalletDetails(generated.address);

    expect(details.source).toBe('generated');
    expect(details.mnemonic?.trim().split(/\s+/)).toHaveLength(12);
    expect(details.derivationPath).toBe(ethers.defaultPath);
    expect(details.publicKey).toBe(ethers.SigningKey.computePublicKey(details.privateKey, true));
    expect(generated.mnemonic).toBe(details.mnemonic);
    expect(generated.derivationPath).toBe(details.derivationPath);
    expect(generated.privateKey).toBe(details.privateKey);
  });

  it('derives the canonical public key from imported private keys', async () => {
    const walletService = await import('../backend/services/walletService');
    const wallet = ethers.Wallet.createRandom();

    await walletService.importWalletFromPrivateKey({
      alias: 'pk-wallet',
      privateKey: wallet.privateKey
    });

    const details = await walletService.getWalletDetails(wallet.address);
    const expectedPublicKey = ethers.SigningKey.computePublicKey(wallet.privateKey, true);

    expect(details.privateKey).toBe(wallet.privateKey);
    expect(details.publicKey).toBe(expectedPublicKey);
    expect(details.publicKey).not.toBe(details.privateKey);
    expect(details.mnemonic).toBeUndefined();
  });
});
