import { AbiRegistry } from '../backend/services/onchain/abiRegistry';
import { EtherscanClient } from '../backend/services/onchain/etherscanClient';
import { OnchainClientError } from '../backend/services/onchain/errors';
import { createOnchainToolkit } from '../backend/services/onchain';

describe('AbiRegistry', () => {
  it('resolves ABI from etherscan client and caches by chainId + address', async () => {
    const resolver = {
      getContractAbi: jest.fn(async () => [{ type: 'function', name: 'balanceOf' }])
    };

    const registry = new AbiRegistry({ etherscanClients: { 1: resolver } });

    const abi1 = await registry.getAbi('0x1111111111111111111111111111111111111111', 1);
    const abi2 = await registry.getAbi('0x1111111111111111111111111111111111111111', 1);

    expect(abi1).toEqual(abi2);
    expect(resolver.getContractAbi).toHaveBeenCalledTimes(1);
    expect(registry.getCacheSize()).toBe(1);
  });

  it('throws a typed error when chain is not configured', async () => {
    const registry = new AbiRegistry({ etherscanClients: {} });
    await expect(registry.getAbi('0x1111111111111111111111111111111111111111', 10)).rejects.toMatchObject({
      code: 'ABI_RESOLUTION_FAILED'
    } satisfies Partial<OnchainClientError>);
  });
});

describe('EtherscanClient', () => {
  it('retries rate limited responses and returns parsed ABI', async () => {
    const client = new EtherscanClient('key');
    const responses = [
      { data: { status: '0', message: 'NOTOK', result: 'Max rate limit reached' } },
      { data: { status: '1', message: 'OK', result: JSON.stringify([{ type: 'function', name: 'foo' }]) } }
    ];

    (client as unknown as { client: { get: jest.Mock } }).client = {
      get: jest.fn(async () => responses.shift())
    };

    const abi = await client.getContractAbi('0x1111111111111111111111111111111111111111');

    expect(Array.isArray(abi)).toBe(true);
  });
});

describe('createOnchainToolkit', () => {
  it('creates swappable per-network clients', () => {
    const toolkit = createOnchainToolkit({
      defaultChainId: 1,
      networks: {
        1: {
          chainId: 1,
          rpcUrl: 'https://rpc-mainnet.example',
          etherscan: { apiKey: 'mainnet-key' },
          tenderly: { rpcUrl: 'https://rpc.tenderly.co/fork/mainnet' }
        },
        11155111: {
          chainId: 11155111,
          rpcUrl: 'https://rpc-sepolia.example',
          etherscan: { apiKey: 'sepolia-key', baseUrl: 'https://api-sepolia.etherscan.io/api' }
        }
      }
    });

    expect(toolkit.getEtherscanClient(11155111)).toBeInstanceOf(EtherscanClient);
    expect(toolkit.getChainlinkClient(1)).toBeDefined();
    expect(toolkit.getTenderlyRpcClient(1)).toBeDefined();
  });
});
