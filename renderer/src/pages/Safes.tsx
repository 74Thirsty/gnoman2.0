import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSafe, type SafeState, type SafeDelegate } from '../context/SafeContext';

interface HoldRecord {
  txHash: string;
  safeAddress: string;
  createdAt: string;
  holdUntil: string;
  executed: number;
  holdHours: number;
}

interface HoldSummary {
  executed: number;
  pending: number;
}

interface EffectivePolicy {
  global: { enabled: boolean; holdHours: number };
  local: { enabled: boolean; holdHours: number; updatedAt: string; safeAddress: string };
}

interface OwnerInfo {
  address: string;
  isContract: boolean;
  isSafe: boolean;
  nestedSafeInfo?: {
    address: string;
    isOwner: boolean;
    threshold?: number;
    ownerCount?: number;
  };
}

interface NestedSafe {
  address: string;
  isOwner: boolean;
  threshold?: number;
  ownerCount?: number;
}

interface SafeDetails {
  address: string;
  threshold: number;
  owners: string[];
  delegates: SafeDelegate[];
  modules: string[];
  rpcUrl: string;
  network?: string;
  nonce?: number;
  ownerDetails?: OwnerInfo[];
  nestedSafes?: NestedSafe[];
  holdPolicy: { enabled: boolean; holdHours: number; updatedAt: string };
  holdSummary: HoldSummary;
  effectiveHold: EffectivePolicy;
}

const Safes = () => {
  const { currentSafe, setCurrentSafe } = useSafe();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [heldTransactions, setHeldTransactions] = useState<HoldRecord[]>([]);
  const [holdSummary, setHoldSummary] = useState<HoldSummary>({ executed: 0, pending: 0 });
  const [holdPolicy, setHoldPolicy] = useState<EffectivePolicy>();
  const [holdForm, setHoldForm] = useState({ enabled: true, holdHours: 24 });
  const [holdSaving, setHoldSaving] = useState(false);
  const [holdMessage, setHoldMessage] = useState<string>();
  const [, setTick] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string>();
  const [details, setDetails] = useState<SafeDetails>();

  // Operation modals
  const [addOwnerOpen, setAddOwnerOpen] = useState(false);
  const [removeOwnerOpen, setRemoveOwnerOpen] = useState(false);
  const [changeThresholdOpen, setChangeThresholdOpen] = useState(false);
  const [addDelegateOpen, setAddDelegateOpen] = useState(false);
  const [removeDelegateOpen, setRemoveDelegateOpen] = useState(false);
  const [enableModuleOpen, setEnableModuleOpen] = useState(false);
  const [disableModuleOpen, setDisableModuleOpen] = useState(false);

  // Operation forms
  const [addOwnerForm, setAddOwnerForm] = useState({ address: '', threshold: currentSafe?.threshold || 1 });
  const [removeOwnerForm, setRemoveOwnerForm] = useState({ address: '', threshold: currentSafe?.threshold || 1 });
  const [thresholdForm, setThresholdForm] = useState({ threshold: currentSafe?.threshold || 1 });
  const [addDelegateForm, setAddDelegateForm] = useState({ label: '' });
  const [removeDelegateForm, setRemoveDelegateForm] = useState({ address: '' });
  const [enableModuleForm, setEnableModuleForm] = useState({ address: '' });
  const [disableModuleForm, setDisableModuleForm] = useState({ address: '' });

  // Operation loading and messages
  const [operationLoading, setOperationLoading] = useState(false);
  const [operationMessage, setOperationMessage] = useState<string>();

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
      const heldPayload = heldResponse.ok ? await heldResponse.json() : [];
      const records = Array.isArray(heldPayload)
        ? (heldPayload as HoldRecord[])
        : ((heldPayload?.records ?? []) as HoldRecord[]);
      setCurrentSafe((prev) => (prev && prev.address === safeAddress ? { ...prev, owners } : prev));
      setHeldTransactions(records);
      if (!Array.isArray(heldPayload) && heldPayload) {
        setHoldSummary(heldPayload.summary ?? { executed: 0, pending: 0 });
        if (heldPayload.effective) {
          const effective = heldPayload.effective as EffectivePolicy;
          setHoldPolicy(effective);
          setHoldForm({
            enabled: effective.local.enabled,
            holdHours: effective.local.holdHours
          });
        }
      }
    },
    [setCurrentSafe]
  );

  useEffect(() => {
    const loadPersistedSafes = async () => {
      try {
        const response = await fetch('http://localhost:4399/api/safes/');
        if (!response.ok) {
          return;
        }
        const safes = (await response.json()) as SafeState[];
        if (safes.length > 0 && !currentSafe) {
          setCurrentSafe(safes[0]);
        }
      } catch (err) {
        console.error('Failed to load persisted safes:', err);
      }
    };
    void loadPersistedSafes();
  }, []);

  useEffect(() => {
    if (currentSafe) {
      refreshSafe(currentSafe.address).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }
  }, [currentSafe?.address, refreshSafe]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const countdowns = useMemo(() => {
    const now = Date.now();
    return heldTransactions.reduce<Record<string, string>>((acc, hold) => {
      const remaining = new Date(hold.holdUntil).getTime() - now;
      if (Number.isNaN(remaining)) {
        acc[hold.txHash] = 'Unknown';
        return acc;
      }
      if (remaining <= 0) {
        acc[hold.txHash] = 'Ready';
        return acc;
      }
      const seconds = Math.floor(remaining / 1000);
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      acc[hold.txHash] = `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      return acc;
    }, {});
  }, [heldTransactions]);

  const releaseHold = async (txHash: string) => {
    if (!currentSafe) {
      return;
    }
    try {
      const response = await fetch(
        `http://localhost:4399/api/safes/${currentSafe.address}/transactions/${txHash}/release`,
        {
          method: 'POST'
        }
      );
      if (!response.ok) {
        throw new Error('Failed to release hold');
      }
      await refreshSafe(currentSafe.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to release hold');
    }
  };

  const handleHoldSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentSafe) {
      return;
    }
    setHoldSaving(true);
    setHoldMessage(undefined);
    try {
      const response = await fetch(`http://localhost:4399/api/safes/${currentSafe.address}/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: holdForm.enabled, holdHours: holdForm.holdHours })
      });
      if (!response.ok) {
        throw new Error('Failed to update hold policy');
      }
      const payload = (await response.json()) as {
        policy: EffectivePolicy['local'];
        summary: HoldSummary;
        effective: EffectivePolicy;
      };
      setHoldPolicy(payload.effective);
      setHoldSummary(payload.summary);
      setHoldForm({ enabled: payload.policy.enabled, holdHours: payload.policy.holdHours });
      setHoldMessage('Hold policy saved');
    } catch (err) {
      setHoldMessage(err instanceof Error ? err.message : 'Unable to save hold policy');
    } finally {
      setHoldSaving(false);
    }
  };

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

  const openDetails = async () => {
    if (!currentSafe) {
      return;
    }
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsError(undefined);
    setDetails(undefined);
    try {
      const response = await fetch(`http://localhost:4399/api/safes/${currentSafe.address}/details`);
      if (!response.ok) {
        throw new Error('Unable to load Safe properties');
      }
      const payload = (await response.json()) as SafeDetails;
      setDetails(payload);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : 'Failed to load Safe details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setDetails(undefined);
    setDetailsError(undefined);
  };

  const handleAddOwner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentSafe) return;
    setOperationLoading(true);
    setOperationMessage(undefined);
    try {
      const response = await fetch(`http://localhost:4399/api/safes/${currentSafe.address}/owners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: addOwnerForm.address, threshold: addOwnerForm.threshold })
      });
      if (!response.ok) throw new Error('Failed to add owner');
      setOperationMessage('Owner added successfully');
      setAddOwnerOpen(false);
      await refreshSafe(currentSafe.address);
    } catch (err) {
      setOperationMessage(err instanceof Error ? err.message : 'Failed to add owner');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleRemoveOwner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentSafe) return;
    setOperationLoading(true);
    setOperationMessage(undefined);
    try {
      const response = await fetch(`http://localhost:4399/api/safes/${currentSafe.address}/owners/${removeOwnerForm.address}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: removeOwnerForm.threshold })
      });
      if (!response.ok) throw new Error('Failed to remove owner');
      setOperationMessage('Owner removed successfully');
      setRemoveOwnerOpen(false);
      await refreshSafe(currentSafe.address);
    } catch (err) {
      setOperationMessage(err instanceof Error ? err.message : 'Failed to remove owner');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleChangeThreshold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentSafe) return;
    setOperationLoading(true);
    setOperationMessage(undefined);
    try {
      const response = await fetch(`http://localhost:4399/api/safes/${currentSafe.address}/threshold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: thresholdForm.threshold })
      });
      if (!response.ok) throw new Error('Failed to change threshold');
      setOperationMessage('Threshold changed successfully');
      setChangeThresholdOpen(false);
      await refreshSafe(currentSafe.address);
    } catch (err) {
      setOperationMessage(err instanceof Error ? err.message : 'Failed to change threshold');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleEnableModule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentSafe) return;
    setOperationLoading(true);
    setOperationMessage(undefined);
    try {
      const response = await fetch(`http://localhost:4399/api/safes/${currentSafe.address}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: enableModuleForm.address })
      });
      if (!response.ok) throw new Error('Failed to enable module');
      setOperationMessage('Module enabled successfully');
      setEnableModuleOpen(false);
      await refreshSafe(currentSafe.address);
    } catch (err) {
      setOperationMessage(err instanceof Error ? err.message : 'Failed to enable module');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleDisableModule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentSafe) return;
    setOperationLoading(true);
    setOperationMessage(undefined);
    try {
      const response = await fetch(`http://localhost:4399/api/safes/${currentSafe.address}/modules/${disableModuleForm.address}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to disable module');
      setOperationMessage('Module disabled successfully');
      setDisableModuleOpen(false);
      await refreshSafe(currentSafe.address);
    } catch (err) {
      setOperationMessage(err instanceof Error ? err.message : 'Failed to disable module');
    } finally {
      setOperationLoading(false);
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Owners</h2>
              <p className="text-xs text-slate-500">Threshold {currentSafe.threshold}</p>
            </div>
            <div className="flex items-center gap-2">
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
              <button
                onClick={openDetails}
                className="rounded border border-blue-700/70 px-3 py-1 text-xs font-semibold text-blue-300 transition hover:bg-blue-900/40"
              >
                Safe properties
              </button>
            </div>
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
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setAddOwnerOpen(true)}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              Add Owner
            </button>
            <button
              onClick={() => setRemoveOwnerOpen(true)}
              className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-500"
            >
              Remove Owner
            </button>
            <button
              onClick={() => setChangeThresholdOpen(true)}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-500"
            >
              Change Threshold ({currentSafe.threshold})
            </button>
          </div>
          {operationMessage && (
            <p className={`text-sm ${operationMessage.includes('successfully') ? 'text-emerald-400' : 'text-red-400'}`}>
              {operationMessage}
            </p>
          )}
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
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => setEnableModuleOpen(true)}
                className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                Enable Module
              </button>
              <button
                onClick={() => setDisableModuleOpen(true)}
                className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-500"
              >
                Disable Module
              </button>
            </div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
            <form className="space-y-3" onSubmit={handleHoldSubmit}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-200">Safe hold policy</h3>
                  <p className="text-xs text-slate-500">
                    Global default: {holdPolicy?.global.enabled ? 'Enabled' : 'Disabled'} ·{' '}
                    {holdPolicy?.global.holdHours ?? 24}h
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500"
                    checked={holdForm.enabled}
                    onChange={(event) =>
                      setHoldForm((prev) => ({ ...prev, enabled: event.target.checked }))
                    }
                  />
                  Enable
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Hold duration (hours)
                <input
                  type="number"
                  min={1}
                  max={24 * 14}
                  className="rounded border border-slate-800 bg-slate-900 p-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={holdForm.holdHours}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    setHoldForm((prev) => ({
                      ...prev,
                      holdHours: Number.isNaN(value)
                        ? prev.holdHours
                        : Math.max(1, Math.min(value, 24 * 14))
                    }));
                  }}
                  disabled={!holdForm.enabled}
                />
              </label>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Pending holds: {holdSummary.pending}</span>
                <span>Executed via hold: {holdSummary.executed}</span>
              </div>
              {holdMessage && (
                <p className={`text-xs ${holdMessage.includes('saved') ? 'text-emerald-400' : 'text-red-400'}`}>
                  {holdMessage}
                </p>
              )}
              <button
                type="submit"
                className="w-full rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900"
                disabled={holdSaving}
              >
                {holdSaving ? 'Saving…' : 'Save policy'}
              </button>
            </form>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Held Transactions</h2>
            <ul className="mt-2 space-y-2 text-xs">
              {heldTransactions.map((tx) => (
                <li key={tx.txHash} className="space-y-2 rounded border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex flex-col gap-1 text-[11px] text-slate-300 md:flex-row md:items-center md:justify-between">
                    <span className="font-mono text-[10px] text-slate-400">{tx.txHash}</span>
                    <span className="font-medium text-slate-200">Countdown: {countdowns[tx.txHash] ?? '…'}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                    <span>Hold until {new Date(tx.holdUntil).toLocaleString()}</span>
                    <span>Duration {tx.holdHours}h</span>
                    <span>Status {tx.executed ? 'Executed' : 'Pending'}</span>
                  </div>
                  <button
                    onClick={() => releaseHold(tx.txHash)}
                    className="rounded bg-amber-500/90 px-3 py-1 text-[11px] font-semibold text-amber-950 transition hover:bg-amber-400"
                  >
                    Release now
                  </button>
                </li>
              ))}
              {heldTransactions.length === 0 && <p className="text-sm text-slate-500">No held transactions.</p>}
            </ul>
          </div>
        </section>
      )}

      {detailsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="relative w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-200 shadow-2xl">
            <button
              onClick={closeDetails}
              className="absolute right-4 top-4 rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300 transition hover:bg-slate-800"
            >
              Close
            </button>
            <h3 className="text-xl font-semibold text-white">Safe properties</h3>
            <p className="mt-1 font-mono text-xs text-slate-400">{currentSafe?.address}</p>
            <div className="mt-4 space-y-3">
              {detailsLoading && <p className="text-slate-400">Loading Safe telemetry…</p>}
              {detailsError && <p className="text-red-400">{detailsError}</p>}
              {!detailsLoading && !detailsError && details && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Network</p>
                      <p className="text-base font-semibold text-white">{details.network ?? 'Unknown'}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Threshold</p>
                      <p className="text-base font-semibold text-white">
                        {details.threshold} of {details.owners.length} owners
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">RPC endpoint</p>
                      <p className="break-all text-xs text-slate-300">{details.rpcUrl}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">Hold policy</p>
                      <p className="text-xs text-slate-300">
                        {details.holdPolicy.enabled ? 'Enabled' : 'Disabled'} · {details.holdPolicy.holdHours}h lock · Updated{' '}
                        {new Date(details.holdPolicy.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                    <h4 className="text-sm font-semibold text-white">Delegates</h4>
                    <ul className="mt-3 space-y-2 text-xs">
                      {details.delegates.length === 0 && (
                        <li className="text-slate-500">No delegates registered.</li>
                      )}
                      {details.delegates.map((delegate) => (
                        <li
                          key={`${delegate.address}-${delegate.label}`}
                          className="flex flex-col gap-1 rounded border border-slate-800 bg-slate-950/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="font-semibold text-slate-200">{delegate.label}</span>
                          <span className="font-mono text-[11px] text-emerald-300">{delegate.address}</span>
                          <span className="text-[11px] text-slate-400">
                            Since {new Date(delegate.since).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                    <h4 className="text-sm font-semibold text-white">Owners ({details.owners.length})</h4>
                    <ul className="mt-3 space-y-2 text-xs">
                      {details.ownerDetails && details.ownerDetails.length > 0 ? (
                        details.ownerDetails.map((ownerInfo) => (
                          <li
                            key={ownerInfo.address}
                            className="rounded border border-slate-800 bg-slate-950/80 p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] text-slate-300 break-all">{ownerInfo.address}</span>
                              <div className="flex gap-1 shrink-0">
                                {ownerInfo.isContract && (
                                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
                                    Contract
                                  </span>
                                )}
                                {ownerInfo.isSafe && (
                                  <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300">
                                    Nested Safe
                                  </span>
                                )}
                              </div>
                            </div>
                            {ownerInfo.nestedSafeInfo && (
                              <div className="mt-2 text-[10px] text-slate-400">
                                Threshold: {ownerInfo.nestedSafeInfo.threshold} / {ownerInfo.nestedSafeInfo.ownerCount} owners
                              </div>
                            )}
                          </li>
                        ))
                      ) : (
                        details.owners.map((owner) => (
                          <li
                            key={owner}
                            className="rounded border border-slate-800 bg-slate-950/80 p-2 font-mono text-[11px] text-slate-300"
                          >
                            {owner}
                          </li>
                        ))
                      )}
                      {details.owners.length === 0 && <li className="text-slate-500">Owners will populate after synchronization.</li>}
                    </ul>
                  </div>
                  {details.nestedSafes && details.nestedSafes.length > 0 && (
                    <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
                      <h4 className="text-sm font-semibold text-purple-200">Nested Safes ({details.nestedSafes.length})</h4>
                      <p className="mt-1 text-xs text-purple-300/80">These Safes are owners of the current Safe</p>
                      <ul className="mt-3 space-y-2 text-xs">
                        {details.nestedSafes.map((nested) => (
                          <li
                            key={nested.address}
                            className="rounded border border-purple-500/20 bg-purple-950/40 p-3"
                          >
                            <p className="font-mono text-[11px] text-purple-200 break-all">{nested.address}</p>
                            <p className="mt-1 text-[10px] text-purple-300/70">
                              Threshold: {nested.threshold} / {nested.ownerCount} owners
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                    <h4 className="text-sm font-semibold text-white">Modules ({details.modules.length})</h4>
                    <ul className="mt-3 flex flex-wrap gap-2 text-[11px]">
                      {details.modules.map((module) => (
                        <li key={module} className="rounded border border-slate-800 bg-slate-950/80 px-2 py-1 font-mono text-emerald-300">
                          {module}
                        </li>
                      ))}
                      {details.modules.length === 0 && <li className="text-slate-500">No automation modules linked.</li>}
                    </ul>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                      <p className="text-xs uppercase tracking-widest text-slate-500">Held transactions</p>
                      <p className="mt-2 text-lg font-semibold text-white">Pending {details.holdSummary.pending}</p>
                      <p className="text-xs text-slate-400">Executed in hold window: {details.holdSummary.executed}</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                      <p className="text-xs uppercase tracking-widest text-slate-500">Effective policy</p>
                      <p className="mt-2 text-xs text-slate-300">
                        Global: {details.effectiveHold.global.enabled ? 'On' : 'Off'} · {details.effectiveHold.global.holdHours}h
                      </p>
                      <p className="text-xs text-slate-300">
                        Local: {details.effectiveHold.local.enabled ? 'On' : 'Off'} · {details.effectiveHold.local.holdHours}h
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Owner Modal */}
      {addOwnerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="relative w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Add Owner</h3>
            <form className="mt-4 space-y-4" onSubmit={handleAddOwner}>
              <label className="block text-sm">
                <span className="text-slate-300">Owner Address</span>
                <input
                  type="text"
                  required
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-white"
                  value={addOwnerForm.address}
                  onChange={(e) => setAddOwnerForm((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="0x..."
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-300">New Threshold</span>
                <input
                  type="number"
                  min={1}
                  required
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-white"
                  value={addOwnerForm.threshold}
                  onChange={(e) => setAddOwnerForm((prev) => ({ ...prev, threshold: parseInt(e.target.value) }))}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={operationLoading}
                  className="flex-1 rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {operationLoading ? 'Adding...' : 'Add Owner'}
                </button>
                <button
                  type="button"
                  onClick={() => setAddOwnerOpen(false)}
                  className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Owner Modal */}
      {removeOwnerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="relative w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Remove Owner</h3>
            <form className="mt-4 space-y-4" onSubmit={handleRemoveOwner}>
              <label className="block text-sm">
                <span className="text-slate-300">Owner Address to Remove</span>
                <input
                  type="text"
                  required
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-white"
                  value={removeOwnerForm.address}
                  onChange={(e) => setRemoveOwnerForm((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="0x..."
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-300">New Threshold</span>
                <input
                  type="number"
                  min={1}
                  required
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-white"
                  value={removeOwnerForm.threshold}
                  onChange={(e) => setRemoveOwnerForm((prev) => ({ ...prev, threshold: parseInt(e.target.value) }))}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={operationLoading}
                  className="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {operationLoading ? 'Removing...' : 'Remove Owner'}
                </button>
                <button
                  type="button"
                  onClick={() => setRemoveOwnerOpen(false)}
                  className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Threshold Modal */}
      {changeThresholdOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="relative w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Change Threshold</h3>
            <form className="mt-4 space-y-4" onSubmit={handleChangeThreshold}>
              <label className="block text-sm">
                <span className="text-slate-300">New Threshold</span>
                <input
                  type="number"
                  min={1}
                  max={currentSafe?.owners.length || 1}
                  required
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-white"
                  value={thresholdForm.threshold}
                  onChange={(e) => setThresholdForm({ threshold: parseInt(e.target.value) })}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Must be between 1 and {currentSafe?.owners.length || 1} (total owners)
                </p>
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={operationLoading}
                  className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                >
                  {operationLoading ? 'Changing...' : 'Change Threshold'}
                </button>
                <button
                  type="button"
                  onClick={() => setChangeThresholdOpen(false)}
                  className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enable Module Modal */}
      {enableModuleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="relative w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Enable Module</h3>
            <form className="mt-4 space-y-4" onSubmit={handleEnableModule}>
              <label className="block text-sm">
                <span className="text-slate-300">Module Address</span>
                <input
                  type="text"
                  required
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-white"
                  value={enableModuleForm.address}
                  onChange={(e) => setEnableModuleForm({ address: e.target.value })}
                  placeholder="0x..."
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={operationLoading}
                  className="flex-1 rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {operationLoading ? 'Enabling...' : 'Enable Module'}
                </button>
                <button
                  type="button"
                  onClick={() => setEnableModuleOpen(false)}
                  className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Disable Module Modal */}
      {disableModuleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="relative w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Disable Module</h3>
            <form className="mt-4 space-y-4" onSubmit={handleDisableModule}>
              <label className="block text-sm">
                <span className="text-slate-300">Module Address to Disable</span>
                <select
                  required
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-white"
                  value={disableModuleForm.address}
                  onChange={(e) => setDisableModuleForm({ address: e.target.value })}
                >
                  <option value="">Select a module...</option>
                  {currentSafe?.modules.map((module) => (
                    <option key={module} value={module}>
                      {module}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={operationLoading}
                  className="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {operationLoading ? 'Disabling...' : 'Disable Module'}
                </button>
                <button
                  type="button"
                  onClick={() => setDisableModuleOpen(false)}
                  className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Safes;
