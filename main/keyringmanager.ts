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

type HttpRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export class KeyringManager {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? `http://127.0.0.1:${DEFAULT_PORT}/api/keyring`;
  }

  private async request<T>(path: string, init: RequestInit) {
  private async request<T>(path: string, init: HttpRequestInit) {
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