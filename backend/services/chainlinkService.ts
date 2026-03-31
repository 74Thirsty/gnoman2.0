import { Contract, JsonRpcProvider, isAddress } from 'ethers';

const AGGREGATOR_V3_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)'
];

export type ChainlinkPrice = {
  roundId: bigint;
  answer: bigint;
  startedAt: bigint;
  updatedAt: bigint;
  answeredInRound: bigint;
  decimals: number;
};

const requireRpcUrl = () => {
  const rpc = process.env.RPC_URL?.trim() || process.env.GNOMAN_RPC_URL?.trim() || process.env.SAFE_RPC_URL?.trim();
  if (!rpc) {
    throw new Error('RPC_URL (or GNOMAN_RPC_URL / SAFE_RPC_URL) is required for Chainlink reads.');
  }
  return rpc;
};

const requireAddress = (label: string, value?: string | null) => {
  if (!value?.trim()) {
    throw new Error(`${label} is required.`);
  }
  if (!isAddress(value)) {
    throw new Error(`${label} is not a valid Ethereum address: ${value}`);
  }
  return value;
};

export const getLatestPriceFeedData = async (feedAddressInput: string): Promise<ChainlinkPrice> => {
  const feedAddress = requireAddress('feedAddress', feedAddressInput);
  const provider = new JsonRpcProvider(requireRpcUrl());
  const contract = new Contract(feedAddress, AGGREGATOR_V3_ABI, provider);
  const [roundId, answer, startedAt, updatedAt, answeredInRound] = await contract.latestRoundData();
  const decimals = Number(await contract.decimals());
  return { roundId, answer, startedAt, updatedAt, answeredInRound, decimals };
};

export type ChainlinkRuntimeConfig = {
  nodeUrl: string;
  jobId: string;
  operatorAddress: string;
  linkToken: string;
};

export const getChainlinkRuntimeConfig = (): ChainlinkRuntimeConfig => {
  const nodeUrl = process.env.CHAINLINK_NODE_URL?.trim();
  const jobId = process.env.CHAINLINK_JOB_ID?.trim();
  const operatorAddress = requireAddress('CHAINLINK_OPERATOR_ADDRESS', process.env.CHAINLINK_OPERATOR_ADDRESS ?? null);
  const linkToken = requireAddress('CHAINLINK_LINK_TOKEN', process.env.CHAINLINK_LINK_TOKEN ?? null);

  if (!nodeUrl) {
    throw new Error('CHAINLINK_NODE_URL is required.');
  }
  if (!jobId) {
    throw new Error('CHAINLINK_JOB_ID is required.');
  }

  return { nodeUrl, jobId, operatorAddress, linkToken };
};
