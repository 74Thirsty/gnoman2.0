import { Contract, JsonRpcProvider } from 'ethers';
import { normalizeAddress } from './types';
import { OnchainClientError } from './errors';

const AGGREGATOR_V3_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)'
] as const;

export type ChainlinkLatestRoundData = {
  roundId: bigint;
  answer: bigint;
  startedAt: bigint;
  updatedAt: bigint;
  answeredInRound: bigint;
  decimals: number;
  description: string;
};

export type ChainlinkClientConfig = {
  rpcUrl: string;
  chainId: number;
};

export class ChainlinkClient {
  private readonly provider: JsonRpcProvider;

  constructor(private readonly config: ChainlinkClientConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  }

  async getLatestFeedData(feedAddress: string): Promise<ChainlinkLatestRoundData> {
    const normalized = normalizeAddress(feedAddress);
    try {
      const contract = new Contract(normalized, AGGREGATOR_V3_ABI, this.provider);
      const [roundId, answer, startedAt, updatedAt, answeredInRound] = await contract.latestRoundData();
      const [decimals, description] = await Promise.all([contract.decimals(), contract.description()]);
      return {
        roundId,
        answer,
        startedAt,
        updatedAt,
        answeredInRound,
        decimals: Number(decimals),
        description
      };
    } catch (error) {
      throw new OnchainClientError('Unable to read Chainlink feed data.', 'CHAINLINK_FEED_ERROR', {
        chainId: this.config.chainId,
        feedAddress: normalized,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
