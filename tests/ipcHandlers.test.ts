const handle = jest.fn();

jest.mock('../src/core/keyringManager', () => ({
  __esModule: true,
  default: {
    list: jest.fn(async () => ({ SECRET: 'value' })),
    set: jest.fn(async () => undefined),
    get: jest.fn(async () => 'value'),
    delete: jest.fn(async () => undefined)
  }
}));

jest.mock('../backend/services/walletService', () => ({
  listWalletMetadata: jest.fn(async () => []),
  getWalletDetails: jest.fn(async () => ({ address: '0x1', privateKey: '0x2', hidden: false, createdAt: 'now' })),
  createRandomWallet: jest.fn(async (payload) => payload),
  importWalletFromMnemonic: jest.fn(async (payload) => payload),
  importWalletFromPrivateKey: jest.fn(async (payload) => payload),
  sendWalletTransaction: jest.fn(async (payload) => ({ hash: `${payload.address}:${payload.to}` })),
  removeWallet: jest.fn(async (address) => ({ address }))
}));

jest.mock('../backend/services/contractRegistryService', () => ({
  addContract: jest.fn((payload) => ({ id: 'contract-1', ...payload })),
  listContracts: jest.fn(() => []),
  removeContract: jest.fn((id) => (id === 'missing' ? undefined : { id }))
}));

jest.mock('../backend/services/rpcService', () => ({
  getBalance: jest.fn(async () => '1.0000')
}));

jest.mock('../backend/utils/abiResolver', () => ({
  abiResolver: {
    resolve: jest.fn(async (chainId, address, contractName) => ({ chainId, address, contractName, abi: [] }))
  }
}));

jest.mock('../backend/services/safeService', () => ({
  addDelegate: jest.fn(async (_address, delegate) => [delegate]),
  addOwner: jest.fn(async (_address, owner, threshold) => ({ owners: [owner], threshold })),
  changeThreshold: jest.fn(async (_address, threshold) => ({ threshold })),
  connectToSafe: jest.fn(async (address, rpcUrl) => ({ address, rpcUrl, owners: [], threshold: 1, modules: [], delegates: [] })),
  disableModule: jest.fn(async () => ({ modules: [] })),
  enableModule: jest.fn(async (_address, module) => ({ modules: [module] })),
  executeTransaction: jest.fn(async (address, txHash, password) => ({ address, txHash, password, executed: true })),
  getSafeDetails: jest.fn(async (address) => ({ address, owners: [], threshold: 1, modules: [], delegates: [], rpcUrl: 'rpc', holdPolicy: { enabled: true, holdHours: 24, updatedAt: 'now' }, holdSummary: { executed: 0, pending: 0 }, effectiveHold: { global: { enabled: true, holdHours: 24 }, local: { safeAddress: address, enabled: true, holdHours: 24, updatedAt: 'now' } } })),
  proposeTransaction: jest.fn(async (address, tx, meta) => ({ address, tx, meta, hash: '0xhash' })),
  removeDelegate: jest.fn(async () => []),
  removeOwner: jest.fn(async () => ({ owners: [], threshold: 1 })),
  syncSafeState: jest.fn(async (address) => ({ address, owners: [], threshold: 1, modules: [], delegates: [], rpcUrl: 'rpc', network: 'mainnet' })),
  updateFallbackHandler: jest.fn(async (_address, handler) => ({ fallbackHandler: handler })),
  updateGuard: jest.fn(async (_address, guard) => ({ guard }))
}));

jest.mock('../backend/services/transactionHoldService', () => ({
  holdService: {
    getHold: jest.fn(),
    canExecute: jest.fn(),
    markExecuted: jest.fn(),
    listHolds: jest.fn(() => []),
    summarize: jest.fn(() => ({ executed: 0, pending: 0 })),
    getEffectivePolicy: jest.fn(async (address) => ({ global: { enabled: true, holdHours: 24 }, local: { safeAddress: address, enabled: true, holdHours: 24, updatedAt: 'now' } })),
    getHoldState: jest.fn((address) => ({ safeAddress: address, enabled: true, holdHours: 24, updatedAt: 'now' })),
    setHoldState: jest.fn(async (address, enabled, holdHours) => ({ safeAddress: address, enabled, holdHours, updatedAt: 'now' })),
    releaseNow: jest.fn((txHash) => ({ txHash, released: true })),
    listHoldPolicies: jest.fn(() => [])
  }
}));

jest.mock('../backend/services/vanityService', () => ({
  cancelVanityJob: jest.fn((id) => (id === 'missing' ? undefined : { id, status: 'cancelled' })),
  listVanityJobs: jest.fn(() => [{ id: 'job-1', status: 'running', attempts: 0, startedAt: 'now', pattern: {} }]),
  startVanityJob: jest.fn((payload) => ({ id: 'job-2', status: 'running', attempts: 0, startedAt: 'now', pattern: payload }))
}));

import * as walletService from '../backend/services/walletService';
import { holdService } from '../backend/services/transactionHoldService';
import { registerIpcHandlers } from '../main/ipcHandlers';

const mockedWalletImport = walletService.importWalletFromMnemonic as jest.MockedFunction<typeof walletService.importWalletFromMnemonic>;
const mockedGetHold = holdService.getHold as jest.MockedFunction<typeof holdService.getHold>;
const mockedCanExecute = holdService.canExecute as jest.MockedFunction<typeof holdService.canExecute>;
const mockedMarkExecuted = holdService.markExecuted as jest.MockedFunction<typeof holdService.markExecuted>;

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    handle.mockClear();
    mockedWalletImport.mockClear();
    mockedGetHold.mockReset();
    mockedCanExecute.mockReset();
    mockedMarkExecuted.mockReset();
    registerIpcHandlers({ handle } as never);
  });

  const getHandler = (channel: string) => {
    const registration = handle.mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    expect(registration).toBeDefined();
    return registration?.[1] as (...args: unknown[]) => Promise<unknown>;
  };

  it('maps mnemonic import payloads with derivationPath', async () => {
    const handler = getHandler('wallet:import:mnemonic');

    await handler({}, {
      mnemonic: 'test test test test test test test test test test test junk',
      derivationPath: "m/44'/60'/0'/0/7",
      alias: 'alpha',
      password: 'pw',
      hidden: true
    });

    expect(mockedWalletImport).toHaveBeenCalledWith(
      expect.objectContaining({ derivationPath: "m/44'/60'/0'/0/7" })
    );
  });

  it('blocks safe execution during the hold window with an IPC-style code', async () => {
    const handler = getHandler('safe:tx:execute');
    mockedGetHold.mockReturnValue({ txHash: '0xhold' } as never);
    mockedCanExecute.mockReturnValue(false);

    await expect(handler({}, { address: '0xsafe', txHash: '0xhold', password: 'pw' })).rejects.toMatchObject({
      message: 'Transaction is still in hold period',
      code: 423
    });
    expect(mockedMarkExecuted).not.toHaveBeenCalled();
  });

  it('marks held transactions executed after successful execution', async () => {
    const handler = getHandler('safe:tx:execute');
    mockedGetHold.mockReturnValue({ txHash: '0xhold' } as never);
    mockedCanExecute.mockReturnValue(true);

    await expect(handler({}, { address: '0xsafe', txHash: '0xhold', password: 'pw' })).resolves.toMatchObject({
      executed: true
    });
    expect(mockedMarkExecuted).toHaveBeenCalledWith('0xhold');
  });
});
