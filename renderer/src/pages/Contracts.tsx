import { FormEvent, useEffect, useMemo, useState } from 'react';
import { buildBackendUrl } from '../utils/backend';

interface ContractRecord {
  id: string;
  address: string;
  name?: string;
  network?: string;
  balance?: string;
  tags?: string[];
  type?: string;
  createdAt: string;
  updatedAt: string;
}

interface WalletSummary {
  address: string;
  alias?: string;
}

const Contracts = () => {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [txForm, setTxForm] = useState({
    contractId: '',
    from: '',
    to: '',
    value: '',
    data: '',
    password: ''
  });
  const [txLoading, setTxLoading] = useState(false);
  const [txMessage, setTxMessage] = useState<string>();

  const loadContracts = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(buildBackendUrl('/api/contracts'));
      if (!response.ok) {
        throw new Error('Unable to load contracts');
      }
      const payload = (await response.json()) as ContractRecord[];
      setContracts(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contracts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContracts().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!txForm.contractId && contracts.length) {
      setTxForm((prev) => ({
        ...prev,
        contractId: contracts[0].id,
        to: contracts[0].address
      }));
    }
  }, [contracts, txForm.contractId]);

  useEffect(() => {
    const loadWallets = async () => {
      try {
        const response = await fetch(buildBackendUrl('/api/wallets'));
        if (!response.ok) {
          throw new Error('Unable to load wallets');
        }
        const payload = (await response.json()) as WalletSummary[];
        setWallets(payload);
        setTxForm((prev) => ({
          ...prev,
          from: prev.from || payload[0]?.address || ''
        }));
      } catch (err) {
        console.error(err);
      }
    };
    loadWallets().catch(() => undefined);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(undefined);
    const formData = new FormData(event.currentTarget);
    const tags = String(formData.get('tags') ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    try {
      const response = await fetch(buildBackendUrl('/api/contracts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: String(formData.get('address') ?? ''),
          name: formData.get('name') || undefined,
          network: formData.get('network') || undefined,
          type: formData.get('type') || undefined,
          tags: tags.length ? tags : undefined
        })
      });
      if (!response.ok) {
        throw new Error('Failed to register contract');
      }
      const record = (await response.json()) as ContractRecord;
      setContracts((prev) => {
        const without = prev.filter((item) => item.id !== record.id);
        return [record, ...without];
      });
      setMessage('Contract registered');
      event.currentTarget.reset();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save contract');
    } finally {
      setSaving(false);
    }
  };

  const deleteContract = async (id: string) => {
    setMessage(undefined);
    try {
      const response = await fetch(buildBackendUrl(`/api/contracts/${id}`), { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to remove contract');
      }
      setContracts((prev) => prev.filter((contract) => contract.id !== id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to remove contract');
    }
  };

  const handleTxSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTxMessage(undefined);
    setMessage(undefined);
    setTxLoading(true);
    try {
      const response = await fetch(buildBackendUrl(`/api/wallets/${txForm.from}/transactions`), {
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
      setTxForm((prev) => ({ ...prev, value: '', data: '', password: '' }));
    } catch (err) {
      setTxMessage(err instanceof Error ? err.message : 'Unable to send transaction');
    } finally {
      setTxLoading(false);
    }
  };

  const summary = useMemo(() => {
    const total = contracts.length;
    const uniqueNetworks = new Set(
      contracts.map((contract) => contract.network?.toLowerCase()).filter(Boolean)
    );
    const recent = contracts[0];
    return { total, uniqueNetworks: uniqueNetworks.size, recent };
  }, [contracts]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Smart contract registry</h2>
            <p className="text-sm text-slate-500">
              Track contracts for Safe modules, protocol integrations, and sandbox simulations.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-2 text-xs text-slate-300">
            {summary.total} tracked · {summary.uniqueNetworks} network(s)
          </div>
        </div>
        {summary.recent && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-300">
            Latest: <span className="font-semibold text-emerald-300">{summary.recent.name ?? 'Unnamed'}</span> ·{' '}
            <span className="font-mono text-[11px] text-slate-400">{summary.recent.address}</span>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr,2fr]">
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-base font-semibold">Add a smart contract</h3>
            <form className="mt-4 space-y-3 text-sm" onSubmit={handleSubmit}>
              <label className="block">
                <span className="text-slate-300">Contract address</span>
                <input
                  name="address"
                  required
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                  placeholder="0x..."
                />
              </label>
              <label className="block">
                <span className="text-slate-300">Label</span>
                <input name="name" className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2" />
              </label>
              <label className="block">
                <span className="text-slate-300">Network</span>
                <input
                  name="network"
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                  placeholder="mainnet"
                />
              </label>
              <label className="block">
                <span className="text-slate-300">Type</span>
                <input
                  name="type"
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                  placeholder="module, token, guard..."
                />
              </label>
              <label className="block">
                <span className="text-slate-300">Tags (comma-separated)</span>
                <input
                  name="tags"
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                  placeholder="governance, treasury"
                />
              </label>
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Register contract'}
              </button>
              {message && <p className="text-xs text-slate-400">{message}</p>}
            </form>
          </section>
          <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-base font-semibold">Send transaction</h3>
            <form className="mt-4 space-y-3 text-sm" onSubmit={handleTxSubmit}>
              <label className="block">
                <span className="text-slate-300">Contract</span>
                <select
                  value={txForm.contractId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const selected = contracts.find((contract) => contract.id === nextId);
                    setTxForm((prev) => ({
                      ...prev,
                      contractId: nextId,
                      to: selected?.address ?? prev.to
                    }));
                  }}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                >
                  <option value="">Select contract</option>
                  {contracts.map((contract) => (
                    <option key={contract.id} value={contract.id}>
                      {contract.name ?? contract.address}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-slate-300">From wallet</span>
                <select
                  value={txForm.from}
                  onChange={(event) => setTxForm((prev) => ({ ...prev, from: event.target.value }))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                  required
                >
                  <option value="">Select wallet</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.address} value={wallet.address}>
                      {wallet.alias ? `${wallet.alias} (${wallet.address.slice(0, 8)}…)` : wallet.address}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-slate-300">To address</span>
                <input
                  value={txForm.to}
                  onChange={(event) => setTxForm((prev) => ({ ...prev, to: event.target.value }))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                  placeholder="0x..."
                  required
                />
              </label>
              <label className="block">
                <span className="text-slate-300">Value (ETH)</span>
                <input
                  value={txForm.value}
                  onChange={(event) => setTxForm((prev) => ({ ...prev, value: event.target.value }))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                  placeholder="0.0"
                />
              </label>
              <label className="block">
                <span className="text-slate-300">Data (optional)</span>
                <textarea
                  value={txForm.data}
                  onChange={(event) => setTxForm((prev) => ({ ...prev, data: event.target.value }))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs"
                  rows={3}
                  placeholder="0x"
                />
              </label>
              <label className="block">
                <span className="text-slate-300">Wallet password</span>
                <input
                  type="password"
                  value={txForm.password}
                  onChange={(event) => setTxForm((prev) => ({ ...prev, password: event.target.value }))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                  placeholder="Password used to encrypt the wallet"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={txLoading}
                className="w-full rounded bg-blue-500 px-4 py-2 text-sm font-semibold text-blue-950 transition hover:bg-blue-400 disabled:opacity-50"
              >
                {txLoading ? 'Sending…' : 'Send transaction'}
              </button>
              {txMessage && <p className="text-xs text-slate-400">{txMessage}</p>}
            </form>
          </section>
        </div>

        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Tracked contracts</h3>
            <button
              onClick={() => loadContracts()}
              className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
          {loading && <p className="mt-4 text-sm text-slate-500">Loading contracts…</p>}
          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          <ul className="mt-4 space-y-3 text-sm">
            {contracts.map((contract) => (
              <li key={contract.id} className="rounded border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{contract.name ?? 'Unnamed contract'}</p>
                    <p className="font-mono text-xs text-emerald-300">{contract.address}</p>
                  </div>
                  <button
                    onClick={() => deleteContract(contract.id)}
                    className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 transition hover:bg-slate-800"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                  <span>Network: {contract.network ?? 'unknown'}</span>
                  <span>Type: {contract.type ?? 'unspecified'}</span>
                  <span>
                    Balance:{' '}
                    {contract.balance
                      ? contract.balance.includes('ETH')
                        ? contract.balance
                        : `${contract.balance} ETH`
                      : 'Not yet synced'}
                  </span>
                  <span>Updated {new Date(contract.updatedAt).toLocaleString()}</span>
                </div>
                {contract.tags && contract.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {contract.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-emerald-500/40 px-2 py-0.5 text-emerald-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
            {!loading && contracts.length === 0 && (
              <li className="rounded border border-dashed border-slate-700 p-4 text-sm text-slate-500">
                No contracts tracked yet.
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default Contracts;
