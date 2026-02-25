import { getAddress, isAddress } from 'ethers';

export type OnchainNetworkConfig = {
  chainId: number;
  rpcUrl?: string;
  etherscan?: {
    apiKey: string;
    baseUrl?: string;
  };
  tenderly?: {
    accountSlug?: string;
    projectSlug?: string;
    accessKey?: string;
    baseUrl?: string;
    rpcUrl?: string;
  };
};

export type OnchainServiceConfig = {
  defaultChainId: number;
  networks: Record<number, OnchainNetworkConfig>;
};

export type Address = `0x${string}`;

export const normalizeAddress = (address: string): Address => {
  if (!isAddress(address)) {
    throw new Error(`Invalid Ethereum address: ${address}`);
  }
  return getAddress(address) as Address;
};

export const chainCacheKey = (chainId: number, address: string) => `${chainId}:${normalizeAddress(address).toLowerCase()}`;
