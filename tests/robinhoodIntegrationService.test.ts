import {
  getRobinhoodCryptoConfigStatus,
  purchaseRobinhoodCryptoWithCash,
  setRobinhoodCryptoConfig,
} from '../backend/services/robinhood/integrationService';

jest.mock('../backend/services/secureSettingsService', () => {
  let store: Record<string, unknown> = {};
  return {
    getSecureSetting: jest.fn(async (key: string, fallback: unknown) =>
      Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback
    ),
    setSecureSetting: jest.fn(async (key: string, value: unknown) => {
      store[key] = value;
    }),
    __reset: () => {
      store = {};
    },
  };
});

describe('Robinhood integration service', () => {
  const secureSettings = jest.requireMock('../backend/services/secureSettingsService') as {
    __reset: () => void;
  };

  beforeEach(() => {
    secureSettings.__reset();
    process.env.ENABLE_ROBINHOOD_CRYPTO = 'true';
  });

  afterEach(() => {
    delete process.env.ENABLE_ROBINHOOD_CRYPTO;
  });

  it('persists credentials and returns masked status', async () => {
    const status = await setRobinhoodCryptoConfig('abcd1234wxyz', 'PRIVATE_KEY');
    expect(status.configured).toBe(true);
    expect(status.apiKeyPreview).toBe('abcd***wxyz');
  });

  it('throws if placing order without configured credentials', async () => {
    await expect(purchaseRobinhoodCryptoWithCash('BTC-USD', 25)).rejects.toThrow('not configured');
  });

  it('loads unconfigured status by default', async () => {
    const status = await getRobinhoodCryptoConfigStatus();
    expect(status).toEqual({ configured: false, enabled: true, mode: 'official-crypto-only' });
  });
});
