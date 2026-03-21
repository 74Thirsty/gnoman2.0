import { abiResolver } from '../backend/utils/abiResolver';
import { resolveAbiByAddress, resolveAbiFileForAddress, _internal as etherscanInternal } from '../backend/services/etherscanService';

jest.mock('../backend/utils/abiResolver', () => ({
  abiResolver: {
    resolve: jest.fn()
  }
}));

const mockedResolve = abiResolver.resolve as jest.MockedFunction<typeof abiResolver.resolve>;

describe('etherscanService ABI resolver', () => {
  beforeEach(() => {
    delete process.env.ETHERSCAN_CHAIN_ID;
    etherscanInternal.clearCaches();
    mockedResolve.mockReset();
  });

  it('returns cached ABI payload without altering the resolver result', async () => {
    mockedResolve.mockResolvedValue({
      abi: [{ type: 'function', name: 'transfer' }],
      contractName: 'ERC20',
      source: 'cache',
      fetchedAt: new Date().toISOString(),
      cachePath: '/tmp/abi/address/1/0x1111.json',
      verified: true,
      cached: true
    });

    const abi = await resolveAbiByAddress(1, '0x1111111111111111111111111111111111111111');

    expect(mockedResolve).toHaveBeenCalledWith(1, '0x1111111111111111111111111111111111111111', undefined);
    expect(abi[0]).toEqual(expect.objectContaining({ name: 'transfer' }));
  });

  it('passes the ABI name hint through to cache-path resolution', async () => {
    mockedResolve.mockResolvedValue({
      abi: [{ type: 'function', name: 'balanceOf' }],
      contractName: 'ERC20',
      source: 'etherscan',
      fetchedAt: new Date().toISOString(),
      cachePath: '/tmp/abi/address/1/0x2222.json',
      verified: true,
      cached: false
    });

    const resolvedPath = await resolveAbiFileForAddress(1, '0x2222222222222222222222222222222222222222', 'ERC20');

    expect(mockedResolve).toHaveBeenCalledWith(1, '0x2222222222222222222222222222222222222222', 'ERC20');
    expect(resolvedPath).toBe('/tmp/abi/address/1/0x2222.json');
  });

  it('normalizes invalid chain ids to mainnet', async () => {
    mockedResolve.mockResolvedValue({
      abi: [{ type: 'function', name: 'foo' }],
      contractName: 'Foo',
      source: 'cache',
      fetchedAt: new Date().toISOString(),
      cachePath: '/tmp/abi/address/1/0x5555.json',
      verified: true,
      cached: true
    });

    await resolveAbiByAddress(0, '0x5555555555555555555555555555555555555555');

    expect(mockedResolve).toHaveBeenCalledWith(1, '0x5555555555555555555555555555555555555555', undefined);
  });

  it('fails clearly when the resolver raises a missing-key error', async () => {
    mockedResolve.mockRejectedValue(new Error('Missing ABI and no ETHERSCAN_API_KEY configured'));

    await expect(resolveAbiByAddress(1, '0x4444444444444444444444444444444444444444')).rejects.toThrow(
      'Missing ABI and no ETHERSCAN_API_KEY configured'
    );
  });
});
