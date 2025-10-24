import { FormEvent, useState } from 'react';
import { useWallets } from '../context/WalletContext';

const Wallets = () => {
  const { wallets, refresh } = useWallets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch('http://localhost:4399/api/wallets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: formData.get('alias') || undefined,
          password: formData.get('password') || undefined,
          hidden: formData.get('hidden') === 'on'
        })
      });
      if (!response.ok) {
        throw new Error('Wallet generation failed');
      }
      await refresh();
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setLoading(false);
    }
  };

  const safeRefresh = async () => {
    try {
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh wallets');
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[2fr,3fr]">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Generate Wallet</h2>
        <p className="mt-1 text-sm text-slate-500">
          Create a new wallet secured with AES-GCM encryption. Hidden wallets are stored only in the
          OS keyring when available.
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleGenerate}>
          <label className="block text-sm">
            <span className="text-slate-300">Alias</span>
            <input name="alias" className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-300">Encryption Password</span>
            <input
              name="password"
              type="password"
              placeholder="Auto-generate when empty"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" name="hidden" className="h-4 w-4 rounded border-slate-700" />
            Hidden wallet (keyring storage)
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Wallet'}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      </section>
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Stored Wallets</h2>
          <button
            onClick={() => safeRefresh()}
            className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
        <ul className="mt-4 space-y-3">
          {wallets.map((wallet) => (
            <li key={wallet.address} className="rounded border border-slate-800 p-3">
              <p className="font-mono text-sm text-emerald-300">{wallet.address}</p>
              <p className="text-xs text-slate-500">
                Alias: {wallet.alias ?? '—'} • Created {new Date(wallet.createdAt).toLocaleString()} • Source:{' '}
                {wallet.source}
              </p>
            </li>
          ))}
          {wallets.length === 0 && (
            <li className="rounded border border-dashed border-slate-700 p-4 text-sm text-slate-500">
              No wallets stored yet.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
};

export default Wallets;
