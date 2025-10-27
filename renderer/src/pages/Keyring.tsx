import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type KeyringEntry = {
  alias: string;
};

type OperationKind = 'create' | 'reveal' | 'delete' | 'list';

type OperationStatus = 'success' | 'error';

type OperationLog = {
  id: string;
  alias: string;
  kind: OperationKind;
  status: OperationStatus;
  timestamp: string;
  message?: string;
};

const MAX_LOGS = 12;

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const Keyring = () => {
  const [entries, setEntries] = useState<KeyringEntry[]>([]);
  const [selectedAlias, setSelectedAlias] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [formAlias, setFormAlias] = useState('');
  const [formSecret, setFormSecret] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const activeSecret = useMemo(() => {
    if (!selectedAlias) {
      return null;
    }
    return revealedSecrets[selectedAlias] ?? null;
  }, [selectedAlias, revealedSecrets]);

  const appendLog = useCallback((entry: OperationLog) => {
    setLogs((previous) => [entry, ...previous].slice(0, MAX_LOGS));
  }, []);

  const ensureBridge = (kind: OperationKind, alias: string) => {
    if (!window.gnoman) {
      const message = 'Keyring bridge unavailable. Launch through the Electron shell.';
      setError(message);
      appendLog({
        id: `${Date.now()}-${Math.random()}`,
        alias,
        kind,
        status: 'error',
        timestamp: new Date().toISOString(),
        message,
      });
      return false;
    }
    return true;
  };

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    if (!ensureBridge('list', 'bridge')) {
      setIsLoading(false);
      return;
    }
    try {
      const items = await window.gnoman.invoke<KeyringEntry[]>('keyring:list');
      setEntries(items ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load keyring entries';
      setError(message);
      appendLog({
        id: `${Date.now()}-${Math.random()}`,
        alias: 'list',
        kind: 'list',
        status: 'error',
        timestamp: new Date().toISOString(),
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [appendLog]);

  useEffect(() => {
    loadEntries().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    });
  }, [loadEntries]);

  const handleReveal = async (alias: string) => {
    setError(null);
    setSelectedAlias(alias);
    if (!ensureBridge('reveal', alias)) {
      return;
    }
    try {
      const value = await window.gnoman.invoke<string | null>('keyring:get', { alias });
      if (value) {
        setRevealedSecrets((previous) => ({ ...previous, [alias]: value }));
      }
      appendLog({
        id: `${Date.now()}-${Math.random()}`,
        alias,
        kind: 'reveal',
        status: 'success',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to reveal secret';
      setError(message);
      appendLog({
        id: `${Date.now()}-${Math.random()}`,
        alias,
        kind: 'reveal',
        status: 'error',
        timestamp: new Date().toISOString(),
        message,
      });
    }
  };

  const handleDelete = async (alias: string) => {
    if (!ensureBridge('delete', alias)) {
      return;
    }
    try {
      await window.gnoman.invoke('keyring:delete', { alias });
      setEntries((previous) => previous.filter((entry) => entry.alias !== alias));
      setRevealedSecrets((previous) => {
        const next = { ...previous };
        delete next[alias];
        return next;
      });
      if (selectedAlias === alias) {
        setSelectedAlias(null);
      }
      appendLog({
        id: `${Date.now()}-${Math.random()}`,
        alias,
        kind: 'delete',
        status: 'success',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete entry';
      setError(message);
      appendLog({
        id: `${Date.now()}-${Math.random()}`,
        alias,
        kind: 'delete',
        status: 'error',
        timestamp: new Date().toISOString(),
        message,
      });
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const alias = formAlias.trim();
    const secret = formSecret.trim();
    if (!alias || !secret) {
      setError('Alias and secret are both required.');
      appendLog({
        id: `${Date.now()}-${Math.random()}`,
        alias: alias || 'create',
        kind: 'create',
        status: 'error',
        timestamp: new Date().toISOString(),
        message: 'Alias and secret are both required.',
      });
      return;
    }

    if (!ensureBridge('create', alias || 'create')) {
      return;
    }

    setIsSubmitting(true);
    try {
      await window.gnoman.invoke('keyring:add', { alias, secret });
      setFormAlias('');
      setFormSecret('');
      await loadEntries();
      appendLog({
        id: `${Date.now()}-${Math.random()}`,
        alias,
        kind: 'create',
        status: 'success',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create keyring entry';
      setError(message);
      appendLog({
        id: `${Date.now()}-${Math.random()}`,
        alias,
        kind: 'create',
        status: 'error',
        timestamp: new Date().toISOString(),
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Keyring Control Center</h1>
        <p className="text-sm text-slate-400">
          Manage AES key material without dropping to the CLI. Create, reveal, and revoke entries directly in the
          graphical workspace.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-white">Stored Entries</h2>
              <p className="text-xs text-slate-400">Review and reveal every alias currently resident in the secure keyring.</p>
            </div>
            <button
              onClick={() => loadEntries().catch((err) => setError(err instanceof Error ? err.message : String(err)))}
              className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:bg-slate-800"
              disabled={isLoading}
            >
              {isLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <ul className="mt-4 space-y-3">
            {entries.map((entry) => {
              const isSelected = entry.alias === selectedAlias;
              return (
                <li
                  key={entry.alias}
                  className={`flex items-center justify-between rounded border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm transition ${
                    isSelected ? 'border-emerald-600/70 shadow-[0_0_12px_rgba(16,185,129,0.35)]' : ''
                  }`}
                >
                  <div>
                    <p className="font-mono text-sm text-emerald-300">{entry.alias}</p>
                    {revealedSecrets[entry.alias] && (
                      <p className="mt-1 text-xs text-emerald-200">Secret cached in session</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReveal(entry.alias)}
                      className="rounded border border-emerald-600 px-3 py-1 text-xs text-emerald-300 transition hover:bg-emerald-500/10"
                    >
                      Reveal
                    </button>
                    <button
                      onClick={() => handleDelete(entry.alias)}
                      className="rounded border border-red-500 px-3 py-1 text-xs text-red-300 transition hover:bg-red-500/10"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
            {entries.length === 0 && (
              <li className="rounded border border-dashed border-slate-700 p-6 text-sm text-slate-500">
                No AES keyring entries stored for GNOMAN 2.0.
              </li>
            )}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
          <h2 className="text-lg font-semibold text-white">Create or Import</h2>
          <p className="mt-1 text-xs text-slate-400">
            Capture CLI-only flows like <code className="rounded bg-slate-800 px-1 py-0.5">gnoman keyring set</code> inside the
            UI. Provide an alias and the encrypted payload to store it securely.
          </p>
          <form className="mt-4 space-y-4" onSubmit={handleCreate}>
            <label className="block text-xs font-medium text-slate-300">
              Alias
              <input
                value={formAlias}
                onChange={(event) => setFormAlias(event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                placeholder="production-safe"
                spellCheck={false}
              />
            </label>
            <label className="block text-xs font-medium text-slate-300">
              Secret value
              <textarea
                value={formSecret}
                onChange={(event) => setFormSecret(event.target.value)}
                className="mt-1 h-28 w-full resize-none rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                placeholder="Encrypted secret material"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Storing…' : 'Store secret'}
            </button>
          </form>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Focused Secret</h2>
            {selectedAlias && (
              <button
                onClick={() => setSelectedAlias(null)}
                className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
              >
                Clear focus
              </button>
            )}
          </div>
          {selectedAlias && activeSecret ? (
            <div className="mt-4 space-y-3 rounded border border-emerald-600/60 bg-emerald-950/30 p-4 text-xs text-emerald-100">
              <div className="flex items-center justify-between text-emerald-200">
                <span className="font-semibold">Alias</span>
                <span className="font-mono">{selectedAlias}</span>
              </div>
              <div>
                <p className="font-semibold text-emerald-200">Secret</p>
                <p className="mt-2 break-all font-mono">{activeSecret}</p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              {selectedAlias
                ? 'Secret has not been revealed yet. Use Reveal to unlock it inside the session.'
                : 'Select an alias to inspect the stored secret within the session.'}
            </p>
          )}
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Activity</h2>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
            >
              Clear log
            </button>
          </div>
          <ul className="mt-4 space-y-3 text-xs">
            {logs.map((log) => (
              <li
                key={log.id}
                className={`rounded border px-3 py-2 ${
                  log.status === 'success'
                    ? 'border-emerald-600/40 bg-emerald-900/20 text-emerald-200'
                    : 'border-red-500/40 bg-red-900/20 text-red-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold capitalize">{log.kind}</span>
                  <span className="font-mono text-[10px] text-slate-300">{formatTimestamp(log.timestamp)}</span>
                </div>
                <p className="mt-1 font-mono text-[11px]">{log.alias}</p>
                {log.message && <p className="mt-2 text-[11px] text-slate-200">{log.message}</p>}
              </li>
            ))}
            {logs.length === 0 && (
              <li className="rounded border border-dashed border-slate-700 p-4 text-[11px] text-slate-500">
                Your session activity log will display keyring operations executed from this interface.
              </li>
            )}
          </ul>
        </section>
      </div>

      {error && (
        <div className="rounded border border-red-500/60 bg-red-900/20 p-4 text-sm text-red-200">
          <p className="font-semibold">Something went wrong</p>
          <p className="mt-1 text-red-100">{error}</p>
        </div>
      )}
    </div>
  );
};

export default Keyring;
