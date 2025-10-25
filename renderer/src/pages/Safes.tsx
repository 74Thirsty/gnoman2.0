import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useSafe, type SafeState } from '../context/SafeContext';

const Safes = () => {
  const { currentSafe, setCurrentSafe } = useSafe();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [heldTransactions, setHeldTransactions] = useState<unknown[]>([]);

  const refreshSafe = useCallback(
    async (safeAddress: string) => {
      const [ownersResponse, heldResponse] = await Promise.all([
        fetch(`http://localhost:4399/api/safes/${safeAddress}/owners`),
        fetch(`http://localhost:4399/api/safes/${safeAddress}/transactions/held`)
      ]);
      if (!ownersResponse.ok) {
        throw new Error('Failed to load Safe owners');
      }
      const owners = (await ownersResponse.json()) as string[];
      const held = heldResponse.ok ? await heldResponse.json() : [];
      setCurrentSafe((prev) => (prev && prev.address === safeAddress ? { ...prev, owners } : prev));
      setHeldTransactions(Array.isArray(held) ? held : []);
    },
    [setCurrentSafe]
  );

  useEffect(() => {
    if (currentSafe) {
      refreshSafe(currentSafe.address).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }
  }, [currentSafe?.address, refreshSafe]);

  const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const address = String(formData.get('address') ?? '');
    const rpcUrl = String(formData.get('rpcUrl') ?? '');
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch('http://localhost:4399/api/safes/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, rpcUrl })
      });
      if (!response.ok) {
        throw new Error('Failed to load Safe');
      }
      const data = (await response.json()) as SafeState;
      setCurrentSafe(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect Safe');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Connect Safe</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleConnect}>
          <label className="text-sm text-slate-300">
            Safe Address
            <input
              name="address"
              required
              placeholder="0x..."
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
            />
          </label>
          <label className="text-sm text-slate-300">
            RPC URL
            <input
              name="rpcUrl"
              required
              placeholder="https://mainnet.infura.io/v3/..."
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="col-span-full rounded bg-blue-500 px-4 py-2 text-sm font-semibold text-blue-950 transition hover:bg-blue-400 disabled:opacity-50"
          >
            {loading ? 'Connecting...' : 'Connect Safe'}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </section>

      {currentSafe && (
        <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Owners</h2>
              <p className="text-xs text-slate-500">Threshold {currentSafe.threshold}</p>
            </div>
            <button
              onClick={() =>
                refreshSafe(currentSafe.address).catch((err) =>
                  setError(err instanceof Error ? err.message : String(err))
                )
              }
              className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:bg-slate-800"
            >
              Reload
            </button>
          </div>
          <ul className="mt-2 space-y-2">
            {currentSafe.owners.map((owner) => (
              <li key={owner} className="rounded border border-slate-800 bg-slate-950/60 p-2 font-mono text-xs">
                {owner}
              </li>
            ))}
            {currentSafe.owners.length === 0 && (
              <li className="rounded border border-dashed border-slate-700 p-3 text-sm text-slate-500">
                Owners will appear here once synchronized.
              </li>
            )}
          </ul>
          <div>
            <h2 className="text-lg font-semibold">Modules</h2>
            <ul className="mt-2 flex flex-wrap gap-2 text-xs">
              {currentSafe.modules.map((module) => (
                <li key={module} className="rounded border border-slate-700 px-2 py-1 font-mono">
                  {module}
                </li>
              ))}
              {currentSafe.modules.length === 0 && <p className="text-sm text-slate-500">No modules enabled.</p>}
            </ul>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Held Transactions</h2>
            <ul className="mt-2 space-y-2 text-xs">
              {heldTransactions.map((tx, index) => (
                <li key={(tx as { txHash?: string }).txHash ?? index} className="rounded border border-slate-800 bg-slate-950/60 p-2">
                  <pre className="overflow-x-auto text-[10px]">{JSON.stringify(tx, null, 2)}</pre>
                </li>
              ))}
              {heldTransactions.length === 0 && <p className="text-sm text-slate-500">No held transactions.</p>}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
};

export default Safes;
