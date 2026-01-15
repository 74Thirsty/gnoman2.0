const STORAGE_KEY = 'gnoman:backend-base-url';
const DEFAULT_PORT = 4399;
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;
const BACKEND_CHANGE_EVENT = 'gnoman:backend-change';

const normalizeBaseUrl = (url: string) => url.trim().replace(/\/+$/, '');

const readEnvBaseUrl = () => {
  const env = import.meta.env.VITE_GNOMAN_BACKEND_URL;
  if (typeof env === 'string' && env.trim().length > 0) {
    return normalizeBaseUrl(env);
  }
  return null;
};

export const getStoredBackendBaseUrl = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const getBackendBaseUrl = () => getStoredBackendBaseUrl() ?? readEnvBaseUrl() ?? DEFAULT_BASE_URL;

export const setBackendBaseUrl = (url: string) => {
  const normalized = normalizeBaseUrl(url);
  localStorage.setItem(STORAGE_KEY, normalized);
  window.dispatchEvent(new CustomEvent(BACKEND_CHANGE_EVENT, { detail: normalized }));
  return normalized;
};

export const buildBackendUrl = (path: string) => {
  const base = getBackendBaseUrl();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
};

export const onBackendBaseUrlChange = (handler: (url: string) => void) => {
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'string') {
      handler(event.detail);
    }
  };
  window.addEventListener(BACKEND_CHANGE_EVENT, listener);
  return () => window.removeEventListener(BACKEND_CHANGE_EVENT, listener);
};

export const probeBackend = async (url: string, timeoutMs = 1500) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${normalizeBaseUrl(url)}/api/health`, {
      cache: 'no-store',
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const detectBackendBaseUrl = async (timeoutMs = 1500) => {
  const candidates = new Set<string>();
  const stored = getStoredBackendBaseUrl();
  const env = readEnvBaseUrl();
  if (stored) {
    candidates.add(normalizeBaseUrl(stored));
  }
  if (env) {
    candidates.add(env);
  }
  candidates.add(DEFAULT_BASE_URL);
  candidates.add(`http://localhost:${DEFAULT_PORT}`);
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    candidates.add(`http://${host}:${DEFAULT_PORT}`);
  }

  for (const candidate of candidates) {
    if (await probeBackend(candidate, timeoutMs)) {
      return normalizeBaseUrl(candidate);
    }
  }
  return null;
};
