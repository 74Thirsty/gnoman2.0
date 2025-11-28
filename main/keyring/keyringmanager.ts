const DEFAULT_PORT = Number.parseInt(process.env.PORT ?? '4399', 10);

type KeyringSecret = { key: string; maskedValue: string | null };

type KeyringSecretSummary = { key: string; maskedValue: string | null };

type KeyringListResponse = { backend: string; secrets: KeyringSecretSummary[] };

type KeyringGetResponse = { key: string; value: string; backend: string };

type KeyringDeleteResponse = { key: string; deleted: boolean; backend: string };

type KeyringBackendResponse = { active: string; available: string[] };

type KeyringSetResponse = { service: string; key: string; maskedValue: string | null };

type KeyringRemoveResponse = { service: string; key: string; deleted: boolean };

type KeyringSwitchResponse = { service: string; backend: string };

type HttpRequestInit = { method?: string; headers?: Record<string, string>; body?: string };

class KeyringRequestError extends Error {
  constructor(message: string, readonly status: number, cause?: unknown) {
    super(message);
    this.name = 'KeyringRequestError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

const sanitizePayload = (payload: Record<string, unknown>) => {
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
  if (!entries.length) return undefined;
  return JSON.stringify(Object.fromEntries(entries));
};

const encodeKey = (key: string) => `/${encodeURIComponent(key)}`;

const safeParseJson = <T>(raw: string): T | undefined => {
  try { return JSON.parse(raw) as T; }
  catch (err) { console.warn('Keyring returned non-JSON:', err); return undefined; }
};

export class KeyringManager {
  private readonly baseUrl: string;
  private activeService = 'GNOMAN';

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
    if (init.body !== undefined) requestInit.body = init.body;

    let response: Response;
    try { response = await fetch(`${this.baseUrl}${path}`, requestInit); }
    catch (err) { throw new KeyringRequestError('Cannot reach keyring service.', -1, err); }

    const raw = await response.text();
    if (!response.ok) {
      let msg = `Keyring failed with status ${response.status}`;
      const payload = raw ? safeParseJson<{ message?: string }>(raw) : undefined;
      if (payload?.message) msg = payload.message;
      throw new KeyringRequestError(msg, response.status);
    }

    if (!raw) return undefined as T;
    return safeParseJson<T>(raw) ?? (undefined as T);
  }

  /** SERVICE METHODS **/

  async hasService(service: string): Promise<boolean> {
    const backend = await this.request<KeyringBackendResponse>('/backend');
    return backend.available.includes(service);
  }

  async createService(service: string): Promise<void> {
    await this.request<KeyringSwitchResponse>(`/backend/${encodeURIComponent(service)}`, { method: 'POST' });
  }

  async setActiveService(service: string): Promise<void> {
    if (!(await this.hasService(service))) await this.createService(service);
    this.activeService = service;
  }

  getActiveService(): string {
    return this.activeService;
  }

  /** KEY METHODS **/

  private wrapKey(key: string) {
    return `${this.activeService}:${key}`;
  }

  async listKeys(): Promise<string[]> {
    const resp = await this.request<KeyringListResponse>('/');
    return resp.secrets
      .map(s => s.key)
      .filter(k => k.startsWith(this.activeService + ':'))
      .map(k => k.slice(this.activeService.length + 1));
  }

  async getKey(alias: string): Promise<string | null> {
    try {
      const resp = await this.request<KeyringGetResponse>(encodeKey(this.wrapKey(alias)));
      return resp.value ?? null;
    } catch { return null; }
  }

  async setKey(alias: string, value: string): Promise<void> {
    await this.request<KeyringSetResponse>(encodeKey(this.wrapKey(alias)), {
      method: 'POST',
      body: sanitizePayload({ value })
    });
  }

  async removeKey(alias: string): Promise<void> {
    await this.request<KeyringDeleteResponse>(encodeKey(this.wrapKey(alias)), { method: 'DELETE' });
  }
}

export const keyringManager = new KeyringManager();
export default keyringManager;
