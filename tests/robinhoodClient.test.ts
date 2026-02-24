import crypto from 'crypto';
import { signRobinhoodRequest } from '../backend/services/robinhood/auth';
import { RobinhoodCryptoClient } from '../backend/services/robinhood/client';
import { RobinhoodUnofficialClient } from '../backend/services/robinhood/unofficialClient';

describe('Robinhood templates', () => {
  it('signRobinhoodRequest returns signed headers', () => {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const headers = signRobinhoodRequest({
      apiKey: 'key_123',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      method: 'POST',
      path: '/v1/orders',
      body: '{"foo":"bar"}',
      timestamp: 1700000000000,
    });

    expect(headers['x-api-key']).toBe('key_123');
    expect(headers['x-timestamp']).toBe('1700000000000');
    expect(headers['x-signature']).toEqual(expect.any(String));
    expect(headers['x-signature'].length).toBeGreaterThan(10);
  });

  it('retries on 429 and eventually succeeds', async () => {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    let calls = 0;
    const fetchImpl = jest.fn(async () => {
      calls += 1;
      if (calls < 2) {
        return new Response('rate limited', { status: 429 });
      }
      return new Response(JSON.stringify({ id: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = new RobinhoodCryptoClient('key', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 1,
      maxRetries: 2,
    });

    const order = await client.placeOrder('BTC-USD', 25);
    expect(order.id).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('blocks unofficial stock calls unless feature flag is enabled', async () => {
    delete process.env.GNOMAN_ENABLE_UNOFFICIAL_ROBINHOOD;
    const client = new RobinhoodUnofficialClient('token', jest.fn() as unknown as typeof fetch);
    await expect(client.placeStockBuy('AAPL', 1)).rejects.toThrow('disabled');
  });
});
