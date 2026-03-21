import type { Request, Response } from 'express';

jest.mock('../backend/services/etherscanService', () => ({
  getTxHistory: jest.fn(async () => ({ status: '1', result: [{ hash: '0x1' }] })),
  getGasOracle: jest.fn(async () => ({ status: '1', result: { SafeGasPrice: '10' } }))
}));

jest.mock('../backend/utils/abiResolver', () => ({
  abiResolver: {
    resolve: jest.fn(async () => ({
      abi: [{ type: 'function', name: 'transfer' }],
      contractName: 'ERC20',
      source: 'cache',
      fetchedAt: '2025-01-01T00:00:00.000Z',
      cachePath: '/tmp/abi/address/1/0xabc.json',
      verified: true,
      cached: true
    }))
  }
}));

import {
  getAddressTxHistory,
  getCurrentGasOracle,
  resolveContractAbi,
  resolveContractAbiFile
} from '../backend/controllers/etherscanController';
import { getGasOracle, getTxHistory } from '../backend/services/etherscanService';
import { abiResolver } from '../backend/utils/abiResolver';

const mockedResolve = abiResolver.resolve as jest.MockedFunction<typeof abiResolver.resolve>;
const mockedGetTxHistory = getTxHistory as jest.MockedFunction<typeof getTxHistory>;
const mockedGetGasOracle = getGasOracle as jest.MockedFunction<typeof getGasOracle>;

describe('etherscanController', () => {
  afterEach(() => {
    mockedResolve.mockClear();
    mockedGetTxHistory.mockClear();
    mockedGetGasOracle.mockClear();
  });

  it('resolves contract ABI from body params', async () => {
    const req = {
      body: { address: '0x1111111111111111111111111111111111111111', chainId: '8453', abiNameHint: 'ERC20' }
    } as Request;
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const res = { json, status } as unknown as Response;

    await resolveContractAbi(req, res, jest.fn());

    expect(mockedResolve).toHaveBeenCalledWith(
      8453,
      '0x1111111111111111111111111111111111111111',
      'ERC20'
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ itemCount: 1, chainId: 8453 }));
  });

  it('returns 400 when ABI resolve request has no address', async () => {
    const req = { body: {} } as Request;
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const res = { json, status } as unknown as Response;

    await resolveContractAbi(req, res, jest.fn());

    expect(status).toHaveBeenCalledWith(400);
    expect(mockedResolve).not.toHaveBeenCalled();
  });

  it('resolves ABI file path via query params', async () => {
    const req = {
      params: { address: '0x1111111111111111111111111111111111111111' },
      query: { chainId: '10', abiNameHint: 'Proxy' }
    } as unknown as Request;
    const json = jest.fn();
    const res = { json } as unknown as Response;

    await resolveContractAbiFile(req, res, jest.fn());

    expect(mockedResolve).toHaveBeenCalledWith(
      10,
      '0x1111111111111111111111111111111111111111',
      'Proxy'
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        address: '0x1111111111111111111111111111111111111111',
        chainId: 10,
        filePath: '/tmp/abi/address/1/0xabc.json'
      })
    );
  });

  it('proxies tx history and gas oracle calls', async () => {
    const txReq = { params: { address: '0x1111111111111111111111111111111111111111' }, query: { chainId: '1' } } as unknown as Request;
    const gasReq = { query: { chainId: '137' } } as unknown as Request;
    const txJson = jest.fn();
    const gasJson = jest.fn();

    await getAddressTxHistory(txReq, { json: txJson } as unknown as Response, jest.fn());
    await getCurrentGasOracle(gasReq, { json: gasJson } as unknown as Response, jest.fn());

    expect(mockedGetTxHistory).toHaveBeenCalledWith('0x1111111111111111111111111111111111111111', 1);
    expect(mockedGetGasOracle).toHaveBeenCalledWith(137);
    expect(txJson).toHaveBeenCalled();
    expect(gasJson).toHaveBeenCalled();
  });
});
