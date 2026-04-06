import { resolveRpcUrl } from '../backend/services/rpcService';
import { secretsResolver } from '../backend/utils/secretsResolver';

jest.mock('../backend/utils/secretsResolver', () => ({
  secretsResolver: {
    resolve: jest.fn()
  }
}));

describe('rpcService.resolveRpcUrl', () => {
  const resolveMock = secretsResolver.resolve as jest.MockedFunction<typeof secretsResolver.resolve>;

  beforeEach(() => {
    resolveMock.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ignores etherscan API URLs and falls back to valid RPC URL from env candidates', async () => {
    resolveMock
      .mockResolvedValueOnce('https://api.etherscan.io/v2/api')
      .mockResolvedValueOnce('https://rpc.ankr.com/eth');

    const rpcUrl = await resolveRpcUrl(undefined, 1);

    expect(rpcUrl).toBe('https://rpc.ankr.com/eth');
    expect(resolveMock).toHaveBeenCalledTimes(2);
  });

  it('returns undefined when preferred URL points to explorer API', async () => {
    const rpcUrl = await resolveRpcUrl('https://api.etherscan.io/api?module=proxy&action=eth_getBalance', 1);

    expect(rpcUrl).toBeUndefined();
    expect(resolveMock).toHaveBeenCalled();
  });

  it('ignores malformed preferred URLs and falls back to keyring/env candidates', async () => {
    resolveMock.mockResolvedValueOnce('https://rpc.ankr.com/eth');

    const rpcUrl = await resolveRpcUrl('J', 1);

    expect(rpcUrl).toBe('https://rpc.ankr.com/eth');
    expect(resolveMock).toHaveBeenCalled();
  });

  it('ignores non-JSON-RPC protocols in candidate values', async () => {
    resolveMock
      .mockResolvedValueOnce('file:///tmp/rpc.sock')
      .mockResolvedValueOnce('wss://mainnet.infura.io/ws/v3/demo');

    const rpcUrl = await resolveRpcUrl(undefined, 1);

    expect(rpcUrl).toBe('wss://mainnet.infura.io/ws/v3/demo');
    expect(resolveMock).toHaveBeenCalledTimes(2);
  });
});
