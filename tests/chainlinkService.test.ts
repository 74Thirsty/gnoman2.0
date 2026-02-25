import { getChainlinkRuntimeConfig } from '../backend/services/chainlinkService';

describe('chainlinkService config validation', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('validates required chainlink runtime config', () => {
    process.env.CHAINLINK_NODE_URL = 'https://node.example';
    process.env.CHAINLINK_JOB_ID = 'job-123';
    process.env.CHAINLINK_OPERATOR_ADDRESS = '0x1111111111111111111111111111111111111111';
    process.env.CHAINLINK_LINK_TOKEN = '0x2222222222222222222222222222222222222222';

    const config = getChainlinkRuntimeConfig();

    expect(config.nodeUrl).toBe('https://node.example');
    expect(config.jobId).toBe('job-123');
    expect(config.operatorAddress).toBe('0x1111111111111111111111111111111111111111');
    expect(config.linkToken).toBe('0x2222222222222222222222222222222222222222');
  });

  it('throws on invalid operator address', () => {
    process.env.CHAINLINK_NODE_URL = 'https://node.example';
    process.env.CHAINLINK_JOB_ID = 'job-123';
    process.env.CHAINLINK_OPERATOR_ADDRESS = 'not-an-address';
    process.env.CHAINLINK_LINK_TOKEN = '0x2222222222222222222222222222222222222222';

    expect(() => getChainlinkRuntimeConfig()).toThrow('CHAINLINK_OPERATOR_ADDRESS is not a valid Ethereum address');
  });
});
