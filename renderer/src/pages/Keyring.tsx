import { useEffect, useState } from 'react';

type KeyringEntry = {
  alias: string;
};

const Keyring = () => {
  const [entries, setEntries] = useState<KeyringEntry[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = async () => {
    if (!window.gnoman) {
      setError('Keyring bridge unavailable. Launch through the Electron shell.');
      return;
    }
    try {
      const items = await window.gnoman.invoke<KeyringEntry[]>('keyring:list');
      setEntries(items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load keyring entries');
    }
  };

  useEffect(() => {
    loadEntries().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const handleReveal = async (alias: string) => {
    setError(null);
    if (!window.gnoman) {
      setError('Keyring bridge unavailable. Launch through the Electron shell.');
      return;
    }
    try {
      const value = await window.gnoman.invoke<string | null>('keyring:get', { alias });
      setSecret(value ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reveal secret');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">OS Keyring Entries</h2>
          <button
            onClick={() =>
              loadEntries().catch((err) => setError(err instanceof Error ? err.message : String(err)))
            }
            className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.alias} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/60 p-3">
              <span className="font-mono text-xs text-emerald-300">{entry.alias}</span>
              <button
                onClick={() => handleReveal(entry.alias)}
                className="rounded border border-emerald-600 px-3 py-1 text-xs text-emerald-300 transition hover:bg-emerald-500/10"
              >
                Reveal
              </button>
            </li>
          ))}
          {entries.length === 0 && (
            <li className="rounded border border-dashed border-slate-700 p-4 text-sm text-slate-500">
              No keyring entries stored for GNOMAN 2.0.
            </li>
          )}
        </ul>
        {secret && (
          <div className="mt-4 rounded border border-emerald-600 bg-emerald-950/40 p-3 text-xs text-emerald-200">
            <p className="font-semibold">Unlocked Secret</p>
            <p className="mt-1 break-all font-mono">{secret}</p>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </section>
    </div>
  );
};

export default Keyring;
