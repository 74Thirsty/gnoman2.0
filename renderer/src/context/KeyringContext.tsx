import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import type { ReactNode } from 'react';
import { buildBackendUrl, onBackendBaseUrlChange } from '../utils/backend';

type KeyringSecret = {
  key: string;
  maskedValue: string | null;
};

type KeyringSummary = {
  service?: string;
  backend: string;
  secrets: KeyringSecret[];
};

const SUPPORTED_BACKENDS = ['system', 'file', 'memory'] as const;
type SupportedBackend = (typeof SUPPORTED_BACKENDS)[number];

const normalizeService = (service?: string): SupportedBackend | undefined => {
  if (!service) {
    return undefined;
  }
  const trimmed = service.trim();
  if (!trimmed) {
    return undefined;
  }
  return SUPPORTED_BACKENDS.includes(trimmed as SupportedBackend) ? (trimmed as SupportedBackend) : undefined;
};

type KeyringEvent = {
  id: string;
  timestamp: string;
  message: string;
  intent: 'info' | 'success' | 'warning';
};

type KeyringContextValue = {
  summary: KeyringSummary | null;
  loading: boolean;
  error: string | null;
  history: KeyringEvent[];
  refresh: (service?: string) => Promise<void>;
  createSecret: (payload: { key: string; value: string; service?: string }) => Promise<void>;
  revealSecret: (payload: { key: string; service?: string }) => Promise<string | null>;
  removeSecret: (payload: { key: string; service?: string }) => Promise<void>;
  switchService: (service: string) => Promise<void>;
};

const KeyringContext = createContext<KeyringContextValue | undefined>(undefined);

const buildQuery = (params: Record<string, string | undefined>) => {
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

const makeEvent = (message: string, intent: KeyringEvent['intent'] = 'info'): KeyringEvent => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  timestamp: new Date().toISOString(),
  message,
  intent
});

type KeyringProviderProps = { children: ReactNode };

export const KeyringProvider = ({ children }: KeyringProviderProps) => {
  const [summary, setSummary] = useState<KeyringSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<KeyringEvent[]>([]);

  const pushEvent = useCallback((event: KeyringEvent) => {
    setHistory((prev) => [event, ...prev].slice(0, 24));
  }, []);

  const refresh = useCallback(
    async (service?: string) => {
      setLoading(true);
      setError(null);
      const normalizedService = normalizeService(service);
      try {
        const response = await fetch(
          buildBackendUrl(`/api/keyring/list${buildQuery({ service: normalizedService })}`)
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message ?? 'Unable to load keyring entries');
        }
        const payload = (await response.json()) as KeyringSummary;
        setSummary(payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load keyring entries';
        setError(message);
        pushEvent(makeEvent(message, 'warning'));
      } finally {
        setLoading(false);
      }
    },
    [pushEvent]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => onBackendBaseUrlChange(() => void refresh()), [refresh]);

  const createSecret = useCallback(
    async ({ key, value, service }: { key: string; value: string; service?: string }) => {
      const normalizedService = normalizeService(service);
      const response = await fetch(buildBackendUrl('/api/keyring/set'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, service: normalizedService })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message ?? 'Unable to store secret');
      }
      pushEvent(
        makeEvent(
          `Stored secret “${key}” in ${payload.service ?? normalizedService ?? 'active service'}.`,
          'success'
        )
      );
      await refresh(payload.service ?? normalizedService);
    },
    [pushEvent, refresh]
  );

  const revealSecret = useCallback(
    async ({ key, service }: { key: string; service?: string }) => {
      const normalizedService = normalizeService(service);
      const query = buildQuery({ service: normalizedService });
      const response = await fetch(buildBackendUrl(`/api/keyring/${encodeURIComponent(key)}${query}`));
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message ?? 'Unable to reveal secret');
      }
      pushEvent(
        makeEvent(`Revealed secret “${key}” from ${payload.service ?? normalizedService ?? 'active service'}.`, 'info')
      );
      return (payload.value as string | undefined) ?? null;
    },
    [pushEvent]
  );

  const removeSecret = useCallback(
    async ({ key, service }: { key: string; service?: string }) => {
      const normalizedService = normalizeService(service);
      const query = buildQuery({ service: normalizedService });
      const response = await fetch(buildBackendUrl(`/api/keyring/${encodeURIComponent(key)}${query}`), {
        method: 'DELETE'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message ?? 'Unable to remove secret');
      }
      pushEvent(makeEvent(`Removed secret “${key}”.`, 'warning'));
      await refresh(payload.service ?? normalizedService);
    },
    [pushEvent, refresh]
  );

  const switchService = useCallback(
    async (service: string) => {
      const normalizedService = normalizeService(service);
      if (!normalizedService) {
        throw new Error('Unsupported backend. Use system, file, or memory.');
      }
      const response = await fetch(buildBackendUrl('/api/keyring/switch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: normalizedService })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message ?? 'Unable to switch keyring service');
      }
      pushEvent(
        makeEvent(`Switched active keyring service to “${payload.service ?? normalizedService}”.`, 'success')
      );
      await refresh(payload.service ?? normalizedService);
    },
    [pushEvent, refresh]
  );

  const value = useMemo(
    () => ({ summary, loading, error, history, refresh, createSecret, revealSecret, removeSecret, switchService }),
    [summary, loading, error, history, refresh, createSecret, revealSecret, removeSecret, switchService]
  );

  return <KeyringContext.Provider value={value}>{children}</KeyringContext.Provider>;
};

export const useKeyring = () => {
  const context = useContext(KeyringContext);
  if (!context) {
    throw new Error('useKeyring must be used within a KeyringProvider');
  }
  return context;
};
