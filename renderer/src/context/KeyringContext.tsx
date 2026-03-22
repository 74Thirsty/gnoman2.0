import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import type { ReactNode } from 'react';

type KeyringSecret = {
  key: string;
  maskedValue: string | null;
};

type KeyringSummary = {
  service?: string;
  backend: string;
  displayName?: string;
  secrets: KeyringSecret[];
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

const makeEvent = (message: string, intent: KeyringEvent['intent'] = 'info'): KeyringEvent => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  timestamp: new Date().toISOString(),
  message,
  intent
});

const ipc = () => window.gnoman?.invoke;

type KeyringProviderProps = { children: ReactNode };

export const KeyringProvider = ({ children }: KeyringProviderProps) => {
  const [summary, setSummary] = useState<KeyringSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<KeyringEvent[]>([]);

  const pushEvent = useCallback((event: KeyringEvent) => {
    setHistory((prev) => [event, ...prev].slice(0, 24));
  }, []);

  const refresh = useCallback(async (service?: string) => {
    setLoading(true);
    setError(null);
    try {
      const invoke = ipc();
      if (!invoke) throw new Error('Keyring IPC unavailable');
      if (service?.trim()) {
        await invoke('keyring:switch', { name: service.trim() });
      }
      const entries = await invoke<{
        service: string;
        backend: string;
        displayName?: string;
        secrets: Array<{ alias: string; maskedValue: string }>;
      }>('keyring:list');
      setSummary({
        backend: entries.backend,
        service: entries.service,
        displayName: entries.displayName,
        secrets: entries.secrets.map((e) => ({ key: e.alias, maskedValue: e.maskedValue ?? null }))
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load keyring entries';
      setError(message);
      pushEvent(makeEvent(message, 'warning'));
    } finally {
      setLoading(false);
    }
  }, [pushEvent]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createSecret = useCallback(
    async ({ key, value, service }: { key: string; value: string; service?: string }) => {
      const invoke = ipc();
      if (!invoke) throw new Error('Keyring IPC unavailable');
      await invoke('keyring:add', { alias: key, secret: value, service });
      pushEvent(makeEvent(`Stored secret "${key}".`, 'success'));
      await refresh(service);
    },
    [pushEvent, refresh]
  );

  const revealSecret = useCallback(
    async ({ key, service }: { key: string; service?: string }) => {
      const invoke = ipc();
      if (!invoke) throw new Error('Keyring IPC unavailable');
      const value = await invoke<string | null>('keyring:get', { alias: key, service });
      pushEvent(makeEvent(`Revealed secret "${key}".`, 'info'));
      return value ?? null;
    },
    [pushEvent]
  );

  const removeSecret = useCallback(
    async ({ key, service }: { key: string; service?: string }) => {
      const invoke = ipc();
      if (!invoke) throw new Error('Keyring IPC unavailable');
      await invoke('keyring:delete', { alias: key, service });
      pushEvent(makeEvent(`Removed secret "${key}".`, 'warning'));
      await refresh(service);
    },
    [pushEvent, refresh]
  );

  const switchService = useCallback(async (service: string) => {
    const invoke = ipc();
    if (!invoke) throw new Error('Keyring IPC unavailable');
    await invoke('keyring:switch', { name: service });
    pushEvent(makeEvent(`Switched active keyring backend to "${service}".`, 'info'));
    await refresh(service);
  }, [pushEvent, refresh]);

  // Update masked values when secrets are revealed via refresh
  const refreshWithMasks = useCallback(async (service?: string) => {
    await refresh(service);
  }, [refresh]);

  const value = useMemo(
    () => ({ summary, loading, error, history, refresh: refreshWithMasks, createSecret, revealSecret, removeSecret, switchService }),
    [summary, loading, error, history, refreshWithMasks, createSecret, revealSecret, removeSecret, switchService]
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
