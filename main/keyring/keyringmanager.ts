import crypto from 'crypto';

type KeyringSecret = { key: string; maskedValue: string | null };

type KeyringListResponse = {
  service: string;
  backend: string;
  secrets: KeyringSecret[];
};

type KeyringGetResponse = {
  service: string;
  key: string;
  value: string | null;
};

type KeyringStatus = {
  service: string;
  backend: string;
  available: string[];
};

const DEFAULT_PORT = Number.parseInt(process.env.PORT ?? '4399', 10);

type HttpRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

const encodeQuery = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== '');
  if (entries.length === 0) {
    return '';
  }
  const query = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value) {
      query.set(key, value);
    }
  }
  return `?${query.toString()}`;
};

export class KeyringManager {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? `http://127.0.0.1:${DEFAULT_PORT}/api/keyring`;
  }

  private async request<T>(path: string, init: HttpRequestInit = {}) {
    const { method = 'GET', body, headers } = init;
    const requestInit: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(headers ?? {})
      }
    };
    if (body !== undefined) {
      requestInit.body = JSON.stringify(body);
    }
    const response = await fetch(`${this.baseUrl}${path}`, requestInit);
    if (!response.ok) {
      let detail = `Keyring request failed with status ${response.status}`;
      try {
        const payload = (await response.json()) as { message?: string };
        if (payload?.message) {
          detail = payload.message;
        }
      } catch (error) {
        console.warn('Keyring request returned a non-JSON payload.', error);
      }
      throw new Error(detail);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  async list(service?: string) {
    const query = encodeQuery({ service });
    const summary = await this.request<KeyringListResponse>(`/list${query}`);
    const records: Record<string, string | null> = {};
    for (const entry of summary.secrets) {
      records[entry.key] = entry.maskedValue;
    }
    return records;
  }

  async set(key: string, value: string, service?: string) {
    await this.request('/set', {
      method: 'POST',
      body: { key, value, service }
    });
  }

  async addEntry(alias: string, secret: string, service?: string) {
    await this.set(alias, secret, service);
  }

  async get(key: string, service?: string) {
    const payload = await this.request<KeyringGetResponse>('/get', {
      method: 'POST',
      body: { key, service }
    });
    return payload.value;
  }

  async delete(key: string, service?: string) {
    await this.request('/remove', {
      method: 'DELETE',
      body: { key, service }
    });
  }

  async remove(key: string, service?: string) {
    await this.delete(key, service);
  }

  async switchService(service: string) {
    await this.request('/switch', {
      method: 'POST',
      body: { service }
    });
  }

  async currentStatus() {
    return this.request<KeyringStatus>('/status');
  }

  async currentBackend() {
    const status = await this.currentStatus();
    return status.backend;
  }

  async availableBackends() {
    const status = await this.currentStatus();
    return status.available;
  }

  async switchBackend(name: string) {
    await this.request('/backend', {
      method: 'POST',
      body: { backend: name }
    });
  }

  async exportSecrets(service?: string) {
    const summary = await this.request<KeyringListResponse>(`/list${encodeQuery({ service })}`);
    const records: Record<string, string> = {};
    for (const entry of summary.secrets) {
      records[entry.key] = entry.maskedValue ?? '';
    }
    return records;
  }

  generateAlias(prefix = 'GNOMAN'): string {
    return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
  }
}

export default new KeyringManager();
