import { AbiRegistry, createAbiRegistryFromEtherscanConfig } from './abiRegistry';
import { ChainlinkClient } from './chainlinkClient';
import { EtherscanClient } from './etherscanClient';
import { TenderlyRpcClient } from './tenderlyRpcClient';
import { OnchainServiceConfig } from './types';

export * from './types';
export * from './errors';
export * from './etherscanClient';
export * from './chainlinkClient';
export * from './tenderlyRpcClient';
export * from './abiRegistry';

export type OnchainToolkit = {
  getEtherscanClient(chainId?: number): EtherscanClient;
  getChainlinkClient(chainId?: number): ChainlinkClient;
  getTenderlyRpcClient(chainId?: number): TenderlyRpcClient;
  abiRegistry: AbiRegistry;
};

export const createOnchainToolkit = (config: OnchainServiceConfig): OnchainToolkit => {
  const defaultChainId = config.defaultChainId;

  const etherscanConfig = Object.entries(config.networks).reduce<
    Record<number, { apiKey: string; baseUrl?: string; chainId?: number }>
  >((acc, [chainId, network]) => {
    if (network.etherscan) {
      acc[Number(chainId)] = {
        apiKey: network.etherscan.apiKey,
        baseUrl: network.etherscan.baseUrl,
        chainId: network.chainId
      };
    }
    return acc;
  }, {});

  const abiRegistry = createAbiRegistryFromEtherscanConfig(etherscanConfig);

  const resolveChain = (chainId = defaultChainId) => {
    const network = config.networks[chainId];
    if (!network) {
      throw new Error(`Network not configured for chainId=${chainId}`);
    }
    return network;
  };

  return {
    abiRegistry,
    getEtherscanClient: (chainId = defaultChainId) => {
      const network = resolveChain(chainId);
      if (!network.etherscan) {
        throw new Error(`Etherscan config missing for chainId=${chainId}`);
      }
      return new EtherscanClient(network.etherscan.apiKey, network.etherscan.baseUrl, chainId);
    },
    getChainlinkClient: (chainId = defaultChainId) => {
      const network = resolveChain(chainId);
      if (!network.rpcUrl) {
        throw new Error(`rpcUrl missing for chainId=${chainId}`);
      }
      return new ChainlinkClient({ rpcUrl: network.rpcUrl, chainId });
    },
    getTenderlyRpcClient: (chainId = defaultChainId) => {
      const network = resolveChain(chainId);
      const rpcUrl = network.tenderly?.rpcUrl ?? network.rpcUrl;
      if (!rpcUrl) {
        throw new Error(`Tenderly rpcUrl missing for chainId=${chainId}`);
      }
      return new TenderlyRpcClient({
        rpcUrl,
        accessKey: network.tenderly?.accessKey,
        chainId
      });
    }
  };
};
