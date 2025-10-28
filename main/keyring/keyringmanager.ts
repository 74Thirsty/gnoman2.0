const DEFAULT_PORT = Number.parseInt(process.env.PORT ?? '4399', 10);

type KeyringSecret = { key: string; maskedValue: string | null };

type KeyringListResponse = {
  service: string;
  backend: string;
  secrets: KeyringSecret[];
};

type KeyringGetResponse = {
  service: string;
  key: string;
  value: string;
};

type KeyringSetResponse = {
  service: string;
  key: string;
  maskedValue: string | null;
};

type KeyringRemoveResponse = {
  service: string;
  key: string;
  deleted: boolean;
};

type KeyringSwitchResponse = {
  service: string;
  backend: string;
};

type HttpRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

const buildQuery = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== '');
  if (entries.length === 0) {
    return '';
  }
  const query = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value !== undefined) {
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
    return this.request<KeyringListResponse>(`/list${buildQuery({ service })}`, {
      method: 'GET'
    });
  }

  async addEntry(alias: string, secret: string, service?: string) {
    return this.request<KeyringSetResponse>('/set', {
      method: 'POST',
      body: JSON.stringify({ key: alias, value: secret, service })
    });
  }

  async getEntry(alias: string, service?: string) {
    return this.request<KeyringGetResponse>('/get', {
      method: 'POST',
      body: JSON.stringify({ key: alias, service })
    });
  }

  async removeEntry(alias: string, service?: string) {
    return this.request<KeyringRemoveResponse>('/remove', {
      method: 'DELETE',
      body: JSON.stringify({ key: alias, service })
    });
  }

  async switchService(service: string) {
    return this.request<KeyringSwitchResponse>('/switch', {
      method: 'POST',
      body: JSON.stringify({ service })
    });
  }
}

export default new KeyringManager();
