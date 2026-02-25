import type { Request, Response } from 'express';

jest.mock('../backend/services/walletService', () => ({
  importWalletFromMnemonic: jest.fn(async (payload: unknown) => payload)
}));

import { importWalletFromMnemonic } from '../backend/services/walletService';
import { importMnemonic } from '../backend/controllers/walletController';

const mockedImportWalletFromMnemonic = importWalletFromMnemonic as jest.MockedFunction<
  typeof importWalletFromMnemonic
>;

describe('walletController importMnemonic', () => {
  afterEach(() => {
    mockedImportWalletFromMnemonic.mockClear();
  });

  it('accepts derivationPath field from request body', async () => {
    const req = {
      body: {
        mnemonic: 'test test test test test test test test test test test junk',
        alias: 'alpha',
        password: 'pw',
        derivationPath: "m/44'/60'/0'/0/7",
        hidden: true
      }
    } as Request;
    const json = jest.fn();
    const res = { json } as unknown as Response;

    await importMnemonic(req, res, jest.fn());

    expect(mockedImportWalletFromMnemonic).toHaveBeenCalledWith(
      expect.objectContaining({ derivationPath: "m/44'/60'/0'/0/7" })
    );
    expect(json).toHaveBeenCalled();
  });

  it('falls back to legacy path field when derivationPath is not provided', async () => {
    const req = {
      body: {
        mnemonic: 'test test test test test test test test test test test junk',
        path: "m/44'/60'/0'/0/3"
      }
    } as Request;
    const json = jest.fn();
    const res = { json } as unknown as Response;

    await importMnemonic(req, res, jest.fn());

    expect(mockedImportWalletFromMnemonic).toHaveBeenCalledWith(
      expect.objectContaining({ derivationPath: "m/44'/60'/0'/0/3" })
    );
    expect(json).toHaveBeenCalled();
  });
});
