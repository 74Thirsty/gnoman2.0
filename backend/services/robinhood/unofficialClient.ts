/**
 * WARNING: This client is for undocumented Robinhood equity endpoints.
 * It is intentionally gated to reduce accidental production usage.
 */
export class RobinhoodUnofficialClient {
  private readonly baseUrl = 'https://api.robinhood.com';

  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private assertEnabled() {
    if (process.env.GNOMAN_ENABLE_UNOFFICIAL_ROBINHOOD !== 'true') {
      throw new Error(
        'Unofficial Robinhood stock endpoints are disabled. Set GNOMAN_ENABLE_UNOFFICIAL_ROBINHOOD=true to continue.'
      );
    }
  }

  async placeStockBuy(symbol: string, quantity: number) {
    this.assertEnabled();
    return this.doPost('/orders/', {
      symbol,
      quantity,
      type: 'market',
      side: 'buy',
    });
  }

  async getOrderStatus(orderId: string) {
    this.assertEnabled();
    return this.doGet(`/orders/${encodeURIComponent(orderId)}/`);
  }

  private async doPost(path: string, payload: Record<string, unknown>) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    return this.requireOk(response);
  }

  private async doGet(path: string) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(),
    });
    return this.requireOk(response);
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'content-type': 'application/json',
    };
  }

  private async requireOk(response: Response) {
    if (!response.ok) {
      throw new Error(`Unofficial Robinhood request failed (${response.status}): ${await response.text()}`);
    }
    return response.json();
  }
}
