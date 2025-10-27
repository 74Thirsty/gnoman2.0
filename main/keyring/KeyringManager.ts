import crypto from 'crypto';

type KeyringListResponse = {
  service: string;
  backend: string;
  secrets: { key: string; maskedValue: string | null }[];
};

type KeyringGetResponse = {
  service: string;
  key: string;
  value: string;
};

const DEFAULT_PORT = Number.parseInt(process.env.PORT ?? '4399', 10);

export class KeyringManager {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? `http://127.0.0.1:${DEFAULT_PORT}/api/keyring`;
  }

  private async request<T>(
    path: string,
    init: {
      method: 'GET' | 'POST' | 'DELETE';
      body?: string;
      headers?: Record<string, string>;
    }
  ) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    });
    if (!response.ok) {
      let detail = `Keyring request failed with status ${response.status}`;
      try {
        const payload = (await response.json()) as { message?: string };
        if (payload?.message) {
          detail = payload.message;
        }
      } catch (error) {
        // ignore parsing errors to avoid leaking sensitive payloads
        console.warn('Keyring request returned a non-JSON payload.', error);
      }
      throw new Error(detail);
    }
    return (await response.json()) as T;
  }

  async addEntry(alias: string, secret: string) {
    await this.request('/set', {
      method: 'POST',
      body: JSON.stringify({ key: alias, value: secret })
    });
  }

  async getEntry(alias: string) {
    const response = await fetch(`${this.baseUrl}/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: alias })
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      let detail = `Keyring request failed with status ${response.status}`;
      try {
        const payload = (await response.json()) as { message?: string };
        if (payload?.message) {
          detail = payload.message;
        }
      } catch (error) {
        console.warn('Keyring get request returned a non-JSON payload.', error);
      }
      throw new Error(detail);
    }
    const payload = (await response.json()) as KeyringGetResponse;
    return payload.value ?? null;
  }

  async deleteEntry(alias: string) {
    await this.request('/remove', {
      method: 'DELETE',
      body: JSON.stringify({ key: alias })
    });
  }

  async listEntries() {
    const response = await fetch(`${this.baseUrl}/list`, { method: 'GET' });
    if (!response.ok) {
      let detail = `Keyring request failed with status ${response.status}`;
      try {
        const payload = (await response.json()) as { message?: string };
        if (payload?.message) {
          detail = payload.message;
        }
      } catch (error) {
        console.warn('Keyring list request returned a non-JSON payload.', error);
      }
      throw new Error(detail);
    }
    const payload = (await response.json()) as KeyringListResponse;
    return payload.secrets.map((secret) => ({ alias: secret.key }));
  }

  async switchService(service: string) {
    await this.request('/switch', {
      method: 'POST',
      body: JSON.stringify({ service })
    });
  }

  generateEphemeralSecret(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }
}
