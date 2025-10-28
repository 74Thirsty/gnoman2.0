const DEFAULT_PORT = Number.parseInt(process.env.PORT ?? '4399', 10);

type KeyringSecret = { key: string; maskedValue: string | null };

type KeyringSecretSummary = {
  key: string;
  maskedValue: string | null;
};

type KeyringListResponse = {
  backend: string;
  secrets: KeyringSecretSummary[];
};

type KeyringGetResponse = {
  key: string;
  value: string;
  backend: string;
};

type KeyringSetResponse = {
  key: string;
  maskedValue: string | null;
  backend: string;
};

type KeyringDeleteResponse = {
  key: string;
  deleted: boolean;
  backend: string;
};

type KeyringBackendResponse = {
  active: string;
  available: string[];
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

class KeyringRequestError extends Error {
  constructor(message: string, readonly status: number, cause?: unknown) {
    super(message);
    this.name = 'KeyringRequestError';
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

const sanitizePayload = (payload: Record<string, unknown>) => {
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return undefined;
  }
  return JSON.stringify(Object.fromEntries(entries));
};

const encodeKey = (key: string) => `/${encodeURIComponent(key)}`;

export class KeyringManager {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? `http://127.0.0.1:${DEFAULT_PORT}/api/keyring`;
  }

  private async request<T>(path: string, init: HttpRequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': crypto.randomUUID(),
      ...(init.headers ?? {})
    };

    const requestInit: RequestInit = {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers
    };

    if (init.body !== undefined) {
      requestInit.body = init.body;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, requestInit);
    } catch (error) {
      throw new KeyringRequestError('Unable to reach keyring service.', -1, error);
    }

    const raw = await response.text();

    if (!response.ok) {
      let detail = `Keyring request failed with status ${response.status}`;
      if (raw) {
        try {
          const payload = JSON.parse(raw) as { message?: string };
          if (payload?.message) {
            detail = payload.message;
          }
        } catch (error) {
          console.warn('Keyring request returned a non-JSON payload.', error);
        }
      } catch (error) {
        console.warn('Keyring request returned a non-JSON payload.', error);
      }
      throw new KeyringRequestError(detail, response.status);
    }

    if (!raw) {
      return undefined as T;
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
