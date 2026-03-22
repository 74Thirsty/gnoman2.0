const save = jest.fn();
const find = jest.fn();

jest.mock('../backend/services/walletStore', () => ({
  walletRepository: {
    save,
    find,
    list: jest.fn(() => []),
    delete: jest.fn(() => true)
  }
}));

jest.mock('../backend/services/rpcService', () => ({
  getBalance: jest.fn(async () => '1.0000'),
  requireRpcUrl: jest.fn(async () => 'http://localhost:8545')
}));

import { ethers } from 'ethers';
import { createRandomWallet, getWalletDetails } from '../backend/services/walletService';

describe('walletService', () => {
  beforeEach(() => {
    save.mockReset();
    find.mockReset();
  });

  it('persists generated wallets with mnemonic material and a derived public key', async () => {
    const metadata = await createRandomWallet({ alias: 'alpha' });

    expect(metadata.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(save).toHaveBeenCalledTimes(1);

    const persistedRecord = save.mock.calls[0][0];
    expect(persistedRecord.address).toBe(metadata.address);
    expect(persistedRecord.mnemonic).toMatch(/^(\w+\s){11}\w+$/);
    expect(persistedRecord.derivationPath).toBe("m/44'/60'/0'/0/0");
    expect(persistedRecord.publicKey).toBe(
      ethers.SigningKey.computePublicKey(persistedRecord.privateKey, false)
    );
    expect(persistedRecord.publicKey).not.toBe(persistedRecord.privateKey);
  });

  it('repairs corrupted public-key records from the private key when returning wallet details', async () => {
    const wallet = ethers.Wallet.createRandom();
    find.mockReturnValue({
      address: wallet.address,
      alias: 'alpha',
      encryptedSecret: 'ciphertext',
      iv: 'iv',
      salt: 'salt',
      hidden: false,
      createdAt: '2026-03-22T00:00:00.000Z',
      source: 'generated',
      publicKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase,
      derivationPath: wallet.path,
      network: 'mainnet',
      balance: '0.5000',
      privateKey: wallet.privateKey
    });

    const details = await getWalletDetails(wallet.address);

    expect(details.publicKey).toBe(ethers.SigningKey.computePublicKey(wallet.privateKey, false));
    expect(details.publicKey).not.toBe(wallet.privateKey);
    expect(details.mnemonic).toBe(wallet.mnemonic?.phrase);
  });
});
