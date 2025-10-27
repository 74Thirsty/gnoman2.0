import { FormEvent, useMemo, useState } from 'react';
import { useWallets } from '../context/WalletContext';

interface WalletDetails {
  address: string;
  alias?: string;
  hidden: boolean;
  createdAt: string;
  source?: string;
  network?: string;
  balance?: string;
  publicKey?: string;
  mnemonic?: string;
  derivationPath?: string;
  privateKey: string;
}

const Wallets = () => {
  const { wallets, refresh } = useWallets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesError, setPropertiesError] = useState<string>();
  const [properties, setProperties] = useState<WalletDetails | undefined>();
  const [propertiesAddress, setPropertiesAddress] = useState<string>();

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

  const openProperties = async (address: string) => {
    setPropertiesAddress(address);
    setPropertiesOpen(true);
    setPropertiesLoading(true);
    setPropertiesError(undefined);
    setProperties(undefined);
    try {
      const response = await fetch(`http://localhost:4399/api/wallets/${address}/details`);
      if (!response.ok) {
        throw new Error('Unable to load wallet details');
      }
      const payload = (await response.json()) as WalletDetails;
      setProperties(payload);
    } catch (err) {
      setPropertiesError(err instanceof Error ? err.message : 'Failed to fetch wallet details');
    } finally {
      setPropertiesLoading(false);
    }
  };

  const closeProperties = () => {
    setPropertiesOpen(false);
    setProperties(undefined);
    setPropertiesAddress(undefined);
    setPropertiesError(undefined);
  };

  const derivedBalance = useMemo(() => {
    if (!properties?.balance) {
      return undefined;
    }
    return properties.balance.includes('ETH') ? properties.balance : `${properties.balance} ETH`;
  }, [properties?.balance]);

  return (
    <div className="grid gap-6 md:grid-cols-[2fr,3fr]">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Generate Wallet</h2>
        <p className="mt-1 text-sm text-slate-500">
          Create a new wallet secured with AES-GCM encryption. Hidden wallets are stored only in the
          AES keyring service.
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
            Hidden wallet (AES keyring storage)
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
                {wallet.source ?? 'generated'} • Network: {wallet.network ?? 'mainnet'} • Balance:{' '}
                {wallet.balance
                  ? wallet.balance.includes('ETH')
                    ? wallet.balance
                    : `${wallet.balance} ETH`
                  : '0.0000 ETH'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    wallet.hidden
                      ? 'bg-slate-800 text-slate-300'
                      : 'bg-emerald-500/10 text-emerald-300'
                  }`}
                >
                  {wallet.hidden ? 'Hidden' : 'Visible'}
                </span>
                <button
                  onClick={() => openProperties(wallet.address)}
                  className="rounded border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-800"
                >
                  View properties
                </button>
              </div>
            </li>
          ))}
          {wallets.length === 0 && (
            <li className="rounded border border-dashed border-slate-700 p-4 text-sm text-slate-500">
              No wallets stored yet.
            </li>
          )}
        </ul>
      </section>

      {propertiesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="relative w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <button
              onClick={closeProperties}
              className="absolute right-4 top-4 rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300 transition hover:bg-slate-800"
            >
              Close
            </button>
            <h3 className="text-lg font-semibold text-white">Wallet properties</h3>
            <p className="mt-1 text-xs text-slate-400">{propertiesAddress}</p>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              {propertiesLoading && <p className="text-slate-400">Loading properties…</p>}
              {propertiesError && <p className="text-red-400">{propertiesError}</p>}
              {!propertiesLoading && !propertiesError && properties && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Alias</p>
                      <p className="font-medium text-white">{properties.alias ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Created</p>
                      <p>{new Date(properties.createdAt).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Network</p>
                      <p>{properties.network ?? 'mainnet'}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Balance</p>
                      <p>{derivedBalance ?? '0.0000 ETH'}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Visibility</p>
                      <p>{properties.hidden ? 'Hidden (AES keyring)' : 'Visible'}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Source</p>
                      <p>{properties.source ?? 'generated'}</p>
                    </div>
                  </div>
                  <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Public key</p>
                      <p className="mt-1 break-all font-mono text-xs text-emerald-300">
                        {properties.publicKey ?? 'Unavailable'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Private key</p>
                      <p className="mt-1 break-all font-mono text-xs text-amber-300">
                        {properties.privateKey}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Mnemonic</p>
                      <p className="mt-1 break-words font-mono text-xs text-slate-200">
                        {properties.mnemonic ?? 'Not available (imported via private key)'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Derivation path</p>
                      <p className="mt-1 font-mono text-xs text-slate-200">
                        {properties.derivationPath ?? '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Wallets;
