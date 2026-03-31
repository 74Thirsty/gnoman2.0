export class OnchainClientError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'ETHERSCAN_API_ERROR'
      | 'ETHERSCAN_ABI_NOT_VERIFIED'
      | 'ETHERSCAN_RATE_LIMIT'
      | 'ABI_RESOLUTION_FAILED'
      | 'CHAINLINK_FEED_ERROR'
      | 'TENDERLY_RPC_ERROR',
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OnchainClientError';
  }
}
