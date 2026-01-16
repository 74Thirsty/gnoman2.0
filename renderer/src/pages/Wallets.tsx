import { FormEvent, useCallback, useMemo, useState } from 'react';
import { useWallets } from '../context/WalletContext';
import { buildBackendUrl } from '../utils/backend';

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
  const [importType, setImportType] = useState<'mnemonic' | 'privateKey'>('mnemonic');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string>();
  const [importMessage, setImportMessage] = useState<string>();
  const [txForm, setTxForm] = useState({ to: '', value: '', data: '', password: '' });
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string>();
  const [txMessage, setTxMessage] = useState<string>();

  const formatRelativeTime = useCallback((value: string) => {
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) {
      return 'Unknown';
    }
    const diff = Date.now() - timestamp;
    if (diff < 60 * 1000) {
      return 'just now';
    }
    const minutes = Math.floor(diff / (60 * 1000));
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    if (days < 30) {
      return `${days}d ago`;
    }
    const months = Math.floor(days / 30);
    if (months < 12) {
      return `${months}mo ago`;
    }
    const years = Math.floor(months / 12);
    return `${years}y ago`;
  }, []);

  const inventoryMetrics = useMemo(() => {
    let hidden = 0;
    let aliasCount = 0;
    let imported = 0;
    let newest: (typeof wallets)[number] | undefined;
    let oldest: (typeof wallets)[number] | undefined;
    const networkCounts = new Map<string, number>();
    for (const wallet of wallets) {
      if (wallet.hidden) {
        hidden += 1;
      }
      if (wallet.alias && wallet.alias.trim()) {
        aliasCount += 1;
      }
      if (wallet.source && wallet.source !== 'generated') {
        imported += 1;
      }
      const createdAt = new Date(wallet.createdAt).getTime();
      if (!Number.isNaN(createdAt)) {
        if (!newest || createdAt > new Date(newest.createdAt).getTime()) {
          newest = wallet;
        }
        if (!oldest || createdAt < new Date(oldest.createdAt).getTime()) {
          oldest = wallet;
        }
      }
      const network = (wallet.network ?? 'mainnet').toLowerCase();
      networkCounts.set(network, (networkCounts.get(network) ?? 0) + 1);
    }
    const total = wallets.length;
    const distribution = Array.from(networkCounts.entries())
      .map(([network, count]) => ({
        network,
        count,
        percentage: total ? Math.round((count / total) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return { total, hidden, aliasCount, imported, newest, oldest, distribution };
  }, [wallets]);

  const hiddenPercentage = inventoryMetrics.total
    ? Math.round((inventoryMetrics.hidden / inventoryMetrics.total) * 100)
    : 0;
  const aliasCoverage = inventoryMetrics.total
    ? Math.round((inventoryMetrics.aliasCount / inventoryMetrics.total) * 100)
    : 0;
  const importedShare = inventoryMetrics.total
    ? Math.round((inventoryMetrics.imported / inventoryMetrics.total) * 100)
    : 0;
  const newestRelative = useMemo(
    () => (inventoryMetrics.newest ? formatRelativeTime(inventoryMetrics.newest.createdAt) : '—'),
    [formatRelativeTime, inventoryMetrics.newest?.createdAt]
  );
  const oldestRelative = useMemo(
    () => (inventoryMetrics.oldest ? formatRelativeTime(inventoryMetrics.oldest.createdAt) : '—'),
    [formatRelativeTime, inventoryMetrics.oldest?.createdAt]
  );
  const walletInsights = useMemo(() => {
    const insights: string[] = [];
    if (!inventoryMetrics.total) {
      insights.push('No wallets stored yet. Generate a wallet to populate telemetry.');
      return insights;
    }
    insights.push(
      `${hiddenPercentage}% hidden via keyring isolation (${inventoryMetrics.hidden}/${inventoryMetrics.total}).`
    );
    insights.push(
      aliasCoverage
        ? `${inventoryMetrics.aliasCount} wallet aliases assigned for quick operator recognition.`
        : 'Add wallet aliases to improve operator visibility during incident response.'
    );
    insights.push(
      importedShare
        ? `${inventoryMetrics.imported} imported wallets (${importedShare}%).`
        : 'All managed wallets were generated locally inside GNOMAN.'
    );
    if (inventoryMetrics.newest) {
      insights.push(`Most recent rotation happened ${newestRelative}.`);
    }
    if (inventoryMetrics.oldest) {
      insights.push(`Longest-lived wallet observed ${oldestRelative}.`);
    }
    return insights;
  }, [aliasCoverage, hiddenPercentage, importedShare, inventoryMetrics, newestRelative, oldestRelative]);

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(buildBackendUrl('/api/wallets/generate'), {
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

  const handleImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setImportLoading(true);
    setImportError(undefined);
    setImportMessage(undefined);
    const endpoint =
      importType === 'mnemonic' ? '/api/wallets/import/mnemonic' : '/api/wallets/import/private-key';
    const payload =
      importType === 'mnemonic'
        ? {
            mnemonic: formData.get('mnemonic'),
            path: formData.get('derivationPath') || undefined,
            alias: formData.get('importAlias') || undefined,
            password: formData.get('importPassword') || undefined,
            hidden: formData.get('importHidden') === 'on'
          }
        : {
            privateKey: formData.get('privateKey'),
            alias: formData.get('importAlias') || undefined,
            password: formData.get('importPassword') || undefined,
            hidden: formData.get('importHidden') === 'on'
          };
    try {
      const response = await fetch(buildBackendUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('Wallet import failed');
      }
      await refresh();
      setImportMessage('Wallet imported');
      event.currentTarget.reset();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import wallet');
    } finally {
      setImportLoading(false);
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
    setTxForm({ to: '', value: '', data: '', password: '' });
    setTxError(undefined);
    setTxMessage(undefined);
    try {
      const response = await fetch(buildBackendUrl(`/api/wallets/${address}/details`));
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
    setTxError(undefined);
    setTxMessage(undefined);
  };

  const derivedBalance = useMemo(() => {
    if (!properties?.balance) {
      return 'Not yet synced';
    }
    return properties.balance.includes('ETH') ? properties.balance : `${properties.balance} ETH`;
  }, [properties?.balance]);

  const mnemonicLabel = useMemo(() => {
    if (!properties) {
      return '—';
    }
    if (properties.source === 'privateKey') {
      return 'Not available (imported via private key)';
    }
    return properties.mnemonic ?? 'Unavailable';
  }, [properties]);

  const derivationPathLabel = useMemo(() => {
    if (!properties) {
      return '—';
    }
    if (properties.source === 'privateKey') {
      return 'Not applicable for private key imports';
    }
    return properties.derivationPath ?? '—';
  }, [properties]);

  const handleSendTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!propertiesAddress) {
      return;
    }
    setTxLoading(true);
    setTxError(undefined);
    setTxMessage(undefined);
    try {
      const response = await fetch(buildBackendUrl(`/api/wallets/${propertiesAddress}/transactions`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: txForm.to,
          value: txForm.value || undefined,
          data: txForm.data || undefined,
          password: txForm.password
        })
      });
      if (!response.ok) {
        throw new Error('Failed to send transaction');
      }
      const payload = (await response.json()) as { hash: string };
      setTxMessage(`Transaction submitted: ${payload.hash}`);
      setTxForm({ to: '', value: '', data: '', password: '' });
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Unable to send transaction');
    } finally {
      setTxLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Inventory overview</h2>
          <span className="text-xs uppercase tracking-widest text-slate-500">
            {inventoryMetrics.total ? 'Keyring sync active' : 'Awaiting wallets'}
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">Managed wallets</p>
            <p className="mt-2 text-2xl font-semibold text-white">{inventoryMetrics.total}</p>
            <p className="mt-1 text-xs text-slate-400">
              {inventoryMetrics.total
                ? `${inventoryMetrics.hidden} hidden • ${inventoryMetrics.total - inventoryMetrics.hidden} visible`
                : 'Generate or import to begin'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">Hidden coverage</p>
            <p className="mt-2 text-2xl font-semibold text-white">{hiddenPercentage}%</p>
            <p className="mt-1 text-xs text-slate-400">
              {inventoryMetrics.hidden
                ? 'Keyring isolation enforced'
                : 'No hidden wallets stored'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">Rotation cadence</p>
            <p className="mt-2 text-2xl font-semibold text-white">{newestRelative}</p>
            <p className="mt-1 text-xs text-slate-400">Longest lived: {oldestRelative}</p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-widest text-slate-500">Network distribution</p>
            <ul className="mt-3 space-y-2 text-xs text-slate-300">
              {inventoryMetrics.distribution.length ? (
                inventoryMetrics.distribution.map((entry) => (
                  <li
                    key={entry.network}
                    className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-900/60 px-3 py-2"
                  >
                    <span className="font-medium capitalize text-white">{entry.network}</span>
                    <span className="text-[11px] text-slate-400">
                      {entry.count} • {entry.percentage}%
                    </span>
                  </li>
                ))
              ) : (
                <li className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-3 py-2 text-slate-500">
                  Distribution will appear once wallets are generated.
                </li>
              )}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-widest text-slate-500">Operational insights</p>
            <ul className="mt-3 space-y-2 text-xs text-slate-300">
              {walletInsights.map((insight) => (
                <li key={insight} className="rounded-lg border border-slate-800/80 bg-slate-900/60 px-3 py-2">
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-[2fr,3fr]">
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-lg font-semibold">Generate Wallet</h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a new wallet secured with encryption. Hidden wallets are stored only in the active keyring service.
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
            <h2 className="text-lg font-semibold">Import Wallet</h2>
            <p className="mt-1 text-sm text-slate-500">
              Bring an existing wallet into GNOMAN using a mnemonic phrase or private key.
            </p>
            <div className="mt-4 flex gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-1 text-xs">
              <button
                type="button"
                onClick={() => setImportType('mnemonic')}
                className={`flex-1 rounded px-3 py-2 font-semibold transition ${
                  importType === 'mnemonic'
                    ? 'bg-emerald-500 text-emerald-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Mnemonic
              </button>
              <button
                type="button"
                onClick={() => setImportType('privateKey')}
                className={`flex-1 rounded px-3 py-2 font-semibold transition ${
                  importType === 'privateKey'
                    ? 'bg-purple-500 text-purple-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Private key
              </button>
            </div>
            <form className="mt-4 space-y-3" onSubmit={handleImport}>
              {importType === 'mnemonic' ? (
                <>
                  <label className="block text-sm">
                    <span className="text-slate-300">Mnemonic phrase</span>
                    <textarea
                      name="mnemonic"
                      rows={3}
                      required
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs"
                      placeholder="word word word ..."
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-300">Derivation path</span>
                    <input
                      name="derivationPath"
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs"
                      placeholder="m/44'/60'/0'/0/0"
                    />
                  </label>
                </>
              ) : (
                <label className="block text-sm">
                  <span className="text-slate-300">Private key</span>
                  <input
                    name="privateKey"
                    required
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs"
                    placeholder="0x..."
                  />
                </label>
              )}
              <label className="block text-sm">
                <span className="text-slate-300">Alias</span>
                <input
                  name="importAlias"
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-300">Encryption Password</span>
                <input
                  name="importPassword"
                  type="password"
                  placeholder="Auto-generate when empty"
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" name="importHidden" className="h-4 w-4 rounded border-slate-700" />
                Hidden wallet (keyring storage)
              </label>
              <button
                type="submit"
                disabled={importLoading}
                className="w-full rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {importLoading ? 'Importing...' : 'Import wallet'}
              </button>
              {importError && <p className="text-sm text-red-400">{importError}</p>}
              {importMessage && <p className="text-sm text-emerald-300">{importMessage}</p>}
            </form>
          </section>
        </div>
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
                  Alias: {wallet.alias ?? '—'} • Created {new Date(wallet.createdAt).toLocaleString()} • Source: {wallet.source ?? 'generated'} • Network: {wallet.network ?? 'mainnet'} • Balance:{' '}
                  {wallet.balance
                    ? wallet.balance.includes('ETH')
                      ? wallet.balance
                      : `${wallet.balance} ETH`
                    : 'Not yet synced'}
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
      </div>

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
                      <p>{derivedBalance}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Visibility</p>
                      <p>{properties.hidden ? 'Hidden (keyring storage)' : 'Visible'}</p>
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
                        {mnemonicLabel}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Derivation path</p>
                      <p className="mt-1 font-mono text-xs text-slate-200">
                        {derivationPathLabel}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                    <h4 className="text-sm font-semibold text-white">Send transaction</h4>
                    <form className="space-y-3" onSubmit={handleSendTransaction}>
                      <label className="block text-xs uppercase tracking-widest text-slate-500">To address</label>
                      <input
                        value={txForm.to}
                        onChange={(event) => setTxForm((prev) => ({ ...prev, to: event.target.value }))}
                        className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs"
                        placeholder="0x..."
                        required
                      />
                      <label className="block text-xs uppercase tracking-widest text-slate-500">Value (ETH)</label>
                      <input
                        value={txForm.value}
                        onChange={(event) => setTxForm((prev) => ({ ...prev, value: event.target.value }))}
                        className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs"
                        placeholder="0.0"
                      />
                      <label className="block text-xs uppercase tracking-widest text-slate-500">Data (optional)</label>
                      <textarea
                        value={txForm.data}
                        onChange={(event) => setTxForm((prev) => ({ ...prev, data: event.target.value }))}
                        className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs"
                        rows={3}
                        placeholder="0x"
                      />
                      <label className="block text-xs uppercase tracking-widest text-slate-500">Wallet password</label>
                      <input
                        type="password"
                        value={txForm.password}
                        onChange={(event) => setTxForm((prev) => ({ ...prev, password: event.target.value }))}
                        className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs"
                        placeholder="Password used to encrypt the wallet"
                        required
                      />
                      <button
                        type="submit"
                        disabled={txLoading}
                        className="w-full rounded bg-blue-500 px-3 py-2 text-xs font-semibold text-blue-950 transition hover:bg-blue-400 disabled:opacity-50"
                      >
                        {txLoading ? 'Sending...' : 'Send transaction'}
                      </button>
                      {(txError || txMessage) && (
                        <p className={`text-xs ${txError ? 'text-red-400' : 'text-emerald-400'}`}>
                          {txError ?? txMessage}
                        </p>
                      )}
                    </form>
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
