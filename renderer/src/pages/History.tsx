import { useEffect, useMemo, useState } from 'react';
import { buildBackendUrl } from '../utils/backend';

type HistoryCategory = 'wallet' | 'safe' | 'contract';

interface HistoryEntry {
  id: string;
  category: HistoryCategory;
  action: string;
  timestamp: string;
  summary: string;
  metadata: Record<string, unknown>;
}

const categoryStyles: Record<HistoryCategory, string> = {
  wallet: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  safe: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  contract: 'bg-purple-500/10 text-purple-300 border-purple-500/30'
};

const History = () => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState<HistoryCategory | 'all'>('all');

  const loadHistory = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(buildBackendUrl('/api/history'));
      if (!response.ok) {
        throw new Error('Unable to load history');
      }
      const payload = (await response.json()) as HistoryEntry[];
      setEntries(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory().catch(() => undefined);
  }, []);

  const filteredEntries = useMemo(() => {
    if (filter === 'all') {
      return entries;
    }
    return entries.filter((entry) => entry.category === filter);
  }, [entries, filter]);

  const summary = useMemo(() => {
    const counts = { wallet: 0, safe: 0, contract: 0 };
    entries.forEach((entry) => {
      counts[entry.category] += 1;
    });
    const latest = entries[0];
    return { counts, latest };
  }, [entries]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Transaction history dashboard</h2>
            <p className="text-sm text-slate-500">
              Unified timeline for wallet activity, Safe proposals, and contract simulations.
            </p>
          </div>
          <button
            onClick={() => loadHistory()}
            className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(['wallet', 'safe', 'contract'] as const).map((category) => (
            <div key={category} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">{category}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{summary.counts[category]}</p>
            </div>
          ))}
        </div>
        {summary.latest && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-300">
            Latest: <span className="font-semibold text-white">{summary.latest.action}</span> ·{' '}
            <span className="text-slate-400">{new Date(summary.latest.timestamp).toLocaleString()}</span>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Activity feed</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            {(['all', 'wallet', 'safe', 'contract'] as const).map((category) => (
              <button
                key={category}
                onClick={() => setFilter(category)}
                className={`rounded-full border px-3 py-1 transition ${
                  filter === category
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {category === 'all' ? 'All activity' : category}
              </button>
            ))}
          </div>
        </div>
        {loading && <p className="mt-4 text-sm text-slate-500">Loading history…</p>}
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        <ul className="mt-4 space-y-3">
          {filteredEntries.map((entry) => (
            <li key={entry.id} className="rounded border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{entry.action}</p>
                  <p className="text-xs text-slate-400">{entry.summary}</p>
                </div>
                <div className="flex flex-col items-end gap-2 text-xs text-slate-400">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${categoryStyles[entry.category]}`}>
                    {entry.category}
                  </span>
                  <span>{new Date(entry.timestamp).toLocaleString()}</span>
                </div>
              </div>
              <pre className="mt-3 overflow-x-auto rounded bg-slate-900/70 p-3 text-[11px] text-slate-400">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </li>
          ))}
          {!loading && filteredEntries.length === 0 && (
            <li className="rounded border border-dashed border-slate-700 p-4 text-sm text-slate-500">
              No activity recorded yet.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
};

export default History;
