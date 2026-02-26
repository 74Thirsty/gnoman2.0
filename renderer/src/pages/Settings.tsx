import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LicenseStatus } from '../types/license';
import {
  buildBackendUrl,
  detectBackendBaseUrl,
  getBackendBaseUrl,
  probeBackend,
  setBackendBaseUrl
} from '../utils/backend';

type VanityJobStatus = 'running' | 'completed' | 'cancelled' | 'failed';

interface RobinhoodCredentialStatus {
  configured: boolean;
  apiKeyPreview?: string;
  enabled?: boolean;
  mode?: string;
  auth?: { ok: boolean; reason?: string };
}


interface RuntimeCapabilitiesSnapshot {
  safe: { enabled: boolean; reason: string };
  etherscan: { enabled: boolean; reason: string };
  robinhood: { enabled: boolean; reason: string };
}

interface RuntimeTelemetrySnapshot {
  secrets: Array<{ key: string; present: boolean; source: string }>;
  abi: { cacheHits: number; cacheMisses: number; lastResolves: Array<{ address: string; contractName: string; source: string; cached: boolean; chainId: number }> };
  safe: { version?: string; mastercopyAddress?: string; moduleEnabled?: boolean };
  robinhood: { enabled: boolean; auth: { ok: boolean; reason?: string }; requests: Array<{ endpoint: string; statusCode: number; latencyMs: number }>; orders: Array<{ action: string; id: string; state?: string }> };
}

interface VanityJobSummary {
  id: string;
  status: VanityJobStatus;
  attempts: number;
  attemptRate?: number;
  targetAttempts?: number;
  startedAt: string;
  completedAt?: string;
  address?: string;
  etaMs?: number;
  label?: string;
  pattern: {
    prefix?: string;
    suffix?: string;
    regex?: string;
    derivationPath?: string;
  };
  message?: string;
  mnemonicAlias?: string;
  updatedAt?: string;
}

const Settings = () => {
  const [status, setStatus] = useState<LicenseStatus>({ active: false });
  const [licenseToken, setLicenseToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [holdEnabled, setHoldEnabled] = useState(true);
  const [holdHours, setHoldHours] = useState(24);
  const [holdSaving, setHoldSaving] = useState(false);
  const [holdMessage, setHoldMessage] = useState('');
  const [vanityJobs, setVanityJobs] = useState<VanityJobSummary[]>([]);
  const [vanityLoading, setVanityLoading] = useState(false);
  const [vanityMessage, setVanityMessage] = useState('');
  const [vanitySubmitting, setVanitySubmitting] = useState(false);
  const [backendUrl, setBackendUrl] = useState(() => getBackendBaseUrl());
  const [backendMessage, setBackendMessage] = useState('');
  const [backendChecking, setBackendChecking] = useState(false);
  const [robinhoodStatus, setRobinhoodStatus] = useState<RobinhoodCredentialStatus>({ configured: false });
  const [robinhoodApiKey, setRobinhoodApiKey] = useState('');
  const [robinhoodPrivateKey, setRobinhoodPrivateKey] = useState('');
  const [robinhoodSymbol, setRobinhoodSymbol] = useState('BTC-USD');
  const [robinhoodCashAmount, setRobinhoodCashAmount] = useState('25');
  const [robinhoodMessage, setRobinhoodMessage] = useState('');
  const [robinhoodOrderId, setRobinhoodOrderId] = useState('');
  const [robinhoodLoading, setRobinhoodLoading] = useState(false);
  const [runtimeTelemetry, setRuntimeTelemetry] = useState<RuntimeTelemetrySnapshot | null>(null);
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<RuntimeCapabilitiesSnapshot | null>(null);
  const [vanityForm, setVanityForm] = useState({
    prefix: '',
    suffix: '',
    regex: '',
    derivationPath: "m/44'/60'/0'/0/0",
    label: '',
    maxAttempts: 0
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(buildBackendUrl('/api/license'));
        if (!response.ok) {
          throw new Error('Unable to load license status.');
        }
        const data: LicenseStatus = await response.json();
        setStatus(data);
      } catch (err) {
        console.error(err);
      }
    };

    const fetchHoldSettings = async () => {
      try {
        const response = await fetch(buildBackendUrl('/api/settings/transaction-hold'));
        if (!response.ok) {
          throw new Error('Unable to load transaction hold settings.');
        }
        const data: { enabled: boolean; holdHours: number } = await response.json();
        setHoldEnabled(data.enabled);
        setHoldHours(data.holdHours);
      } catch (err) {
        console.error(err);
      }
    };


    const fetchRobinhoodStatus = async () => {
      try {
        const response = await fetch(buildBackendUrl('/api/brokers/robinhood/crypto/credentials'));
        if (!response.ok) {
          throw new Error('Unable to load Robinhood credentials.');
        }
        const data: RobinhoodCredentialStatus = await response.json();
        setRobinhoodStatus(data);
      } catch (err) {
        console.error(err);
      }
    };

    const fetchRuntimeTelemetry = async () => {
      try {
        const response = await fetch(buildBackendUrl('/api/runtime/telemetry'));
        if (!response.ok) {
          throw new Error('Unable to load runtime telemetry.');
        }
        const data: RuntimeTelemetrySnapshot = await response.json();
        setRuntimeTelemetry(data);
      } catch (err) {
        console.error(err);
      }
    };

    const fetchRuntimeCapabilities = async () => {
      try {
        const response = await fetch(buildBackendUrl('/api/runtime/capabilities'));
        if (!response.ok) {
          throw new Error('Unable to load runtime capabilities.');
        }
        const data: RuntimeCapabilitiesSnapshot = await response.json();
        setRuntimeCapabilities(data);
      } catch (err) {
        console.error(err);
      }
    };

    void fetchStatus();
    void fetchHoldSettings();
    void fetchRobinhoodStatus();
    void fetchRuntimeTelemetry();
    void fetchRuntimeCapabilities();
  }, []);

  const refreshVanityJobs = useCallback(async () => {
    try {
      setVanityLoading(true);
      const response = await fetch(buildBackendUrl('/api/wallets/vanity'));
      if (!response.ok) {
        throw new Error('Unable to load vanity jobs');
      }
      const payload = (await response.json()) as VanityJobSummary[];
      setVanityJobs(Array.isArray(payload) ? payload : []);
    } catch (err) {
      console.error(err);
    } finally {
      setVanityLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshVanityJobs();
    const interval = window.setInterval(() => {
      void refreshVanityJobs();
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [refreshVanityJobs]);

  const handleBackendSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBackendMessage('');
    const trimmed = backendUrl.trim();
    if (!trimmed) {
      setBackendMessage('Enter a backend URL to continue.');
      return;
    }
    setBackendChecking(true);
    const healthy = await probeBackend(trimmed);
    if (!healthy) {
      setBackendMessage('Unable to reach the backend health endpoint.');
      setBackendChecking(false);
      return;
    }
    const normalized = setBackendBaseUrl(trimmed);
    setBackendUrl(normalized);
    setBackendMessage(`Connected to ${normalized}.`);
    setBackendChecking(false);
  };

  const handleBackendDetect = async () => {
    setBackendMessage('');
    setBackendChecking(true);
    const detected = await detectBackendBaseUrl();
    if (!detected) {
      setBackendMessage('No reachable backend detected. Check the host and port.');
      setBackendChecking(false);
      return;
    }
    const normalized = setBackendBaseUrl(detected);
    setBackendUrl(normalized);
    setBackendMessage(`Auto-detected ${normalized}.`);
    setBackendChecking(false);
  };

  const handleRobinhoodCredentialsSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRobinhoodLoading(true);
    setRobinhoodMessage('');
    try {
      const response = await fetch(buildBackendUrl('/api/brokers/robinhood/crypto/credentials'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: robinhoodApiKey, privateKey: robinhoodPrivateKey })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? 'Unable to save Robinhood credentials.');
      }
      setRobinhoodStatus(payload);
      setRobinhoodPrivateKey('');
      setRobinhoodMessage('Robinhood credentials saved.');
    } catch (err) {
      setRobinhoodMessage(err instanceof Error ? err.message : 'Unable to save Robinhood credentials.');
    } finally {
      setRobinhoodLoading(false);
    }
  };

  const handleRobinhoodBuy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRobinhoodLoading(true);
    setRobinhoodMessage('');
    setRobinhoodOrderId('');
    try {
      const response = await fetch(buildBackendUrl('/api/brokers/robinhood/crypto/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: robinhoodSymbol, cashAmount: Number(robinhoodCashAmount) })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? 'Unable to place Robinhood order.');
      }
      setRobinhoodOrderId(typeof payload.id === 'string' ? payload.id : 'submitted');
      setRobinhoodMessage('Robinhood order submitted.');
    } catch (err) {
      setRobinhoodMessage(err instanceof Error ? err.message : 'Unable to place Robinhood order.');
    } finally {
      setRobinhoodLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(buildBackendUrl('/api/license'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: licenseToken })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? 'License validation failed.');
      }

      setStatus(payload);
      setSuccess('License token validated and stored securely.');
      setLicenseToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'License validation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleHoldSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHoldSaving(true);
    setHoldMessage('');
    try {
      const response = await fetch(buildBackendUrl('/api/settings/transaction-hold'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: holdEnabled, holdHours })
      });
      if (!response.ok) {
        throw new Error('Unable to update hold settings.');
      }
      setHoldMessage('Transaction hold configuration saved.');
    } catch (err) {
      setHoldMessage(err instanceof Error ? err.message : 'Unable to update hold settings.');
    } finally {
      setHoldSaving(false);
    }
  };

  const handleVanitySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVanitySubmitting(true);
    setVanityMessage('');
    try {
      const body = {
        prefix: vanityForm.prefix || undefined,
        suffix: vanityForm.suffix || undefined,
        regex: vanityForm.regex || undefined,
        derivationPath: vanityForm.derivationPath || undefined,
        maxAttempts: vanityForm.maxAttempts > 0 ? vanityForm.maxAttempts : undefined,
        label: vanityForm.label || undefined
      };
      const response = await fetch(buildBackendUrl('/api/wallets/vanity'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? 'Failed to start vanity job');
      }
      setVanityMessage('Vanity search started');
      setVanityForm((prev) => ({ ...prev, label: '' }));
      void refreshVanityJobs();
    } catch (err) {
      setVanityMessage(err instanceof Error ? err.message : 'Failed to start vanity job');
    } finally {
      setVanitySubmitting(false);
    }
  };

  const cancelVanityJob = async (id: string) => {
    try {
      const response = await fetch(buildBackendUrl(`/api/wallets/vanity/${id}`), {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Unable to cancel job');
      }
      setVanityMessage('Cancellation requested');
      void refreshVanityJobs();
    } catch (err) {
      setVanityMessage(err instanceof Error ? err.message : 'Unable to cancel job');
    }
  };

  const vanityStats = useMemo(() => {
    const active = vanityJobs.filter((job) => job.status === 'running');
    const completed = vanityJobs.filter((job) => job.status === 'completed');
    return {
      active: active.length,
      completed: completed.length
    };
  }, [vanityJobs]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Backend Connection</h2>
        <p className="mt-2 text-sm text-slate-400">
          Point GNOMAN at the backend you want to use. Auto-detect will scan common local hosts for the health endpoint.
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleBackendSave}>
          <label className="text-sm font-medium text-slate-300" htmlFor="backend-url">
            Backend base URL
          </label>
          <input
            id="backend-url"
            type="url"
            className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={backendUrl}
            onChange={(event) => setBackendUrl(event.target.value)}
            placeholder="http://127.0.0.1:4399"
            disabled={backendChecking}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:text-slate-500"
              onClick={() => void handleBackendDetect()}
              disabled={backendChecking}
            >
              {backendChecking ? 'Scanning…' : 'Auto-detect backend'}
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900"
              disabled={backendChecking}
            >
              {backendChecking ? 'Checking…' : 'Save backend'}
            </button>
          </div>
          {backendMessage && (
            <p className={`text-sm ${backendMessage.includes('Connected') || backendMessage.includes('Auto-detected') ? 'text-emerald-400' : 'text-red-400'}`}>
              {backendMessage}
            </p>
          )}
        </form>
      </section>
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Integrations & Runtime Features</h2>
        <p className="mt-2 text-sm text-slate-400">
          This section centralizes feature state for SAFE mode, Etherscan ABI lookups, and Robinhood integration so operators can verify what is actually active at runtime.
        </p>
        <div className="mt-4 grid gap-3 text-xs md:grid-cols-3">
          <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
            <p className="font-semibold text-white">Safe</p>
            <p className="mt-1 text-slate-300">Enabled: {String(runtimeCapabilities?.safe.enabled ?? false)}</p>
            <p className="text-slate-400">Reason: {runtimeCapabilities?.safe.reason ?? 'unknown'}</p>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
            <p className="font-semibold text-white">Etherscan</p>
            <p className="mt-1 text-slate-300">Enabled: {String(runtimeCapabilities?.etherscan.enabled ?? false)}</p>
            <p className="text-slate-400">Reason: {runtimeCapabilities?.etherscan.reason ?? 'unknown'}</p>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
            <p className="font-semibold text-white">Robinhood</p>
            <p className="mt-1 text-slate-300">Enabled: {String(runtimeCapabilities?.robinhood.enabled ?? false)}</p>
            <p className="text-slate-400">Reason: {runtimeCapabilities?.robinhood.reason ?? 'unknown'}</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Integration Configuration: Robinhood Crypto Trading API</h2>
        <p className="mt-2 text-sm text-slate-400">
          Configure official Robinhood Crypto Trading API credentials. Stocks/options are intentionally unsupported.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Crypto credentials status: {robinhoodStatus.configured ? `Configured (${robinhoodStatus.apiKeyPreview ?? 'hidden'})` : 'Not configured'}
        </p>
        <p className="mt-2 text-xs text-slate-400">Auth: {robinhoodStatus.auth?.ok ? 'OK' : `FAIL (${robinhoodStatus.auth?.reason ?? 'not attempted'})`}</p>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleRobinhoodCredentialsSave}>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="robinhood-api-key">API key</label>
            <input
              id="robinhood-api-key"
              type="text"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={robinhoodApiKey}
              onChange={(event) => setRobinhoodApiKey(event.target.value)}
              disabled={robinhoodLoading}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="robinhood-private-key">Private key (PEM)</label>
            <input
              id="robinhood-private-key"
              type="password"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={robinhoodPrivateKey}
              onChange={(event) => setRobinhoodPrivateKey(event.target.value)}
              disabled={robinhoodLoading}
              required
            />
          </div>
          <button
            type="submit"
            className="md:col-span-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900"
            disabled={robinhoodLoading}
          >
            {robinhoodLoading ? 'Saving…' : 'Save Robinhood credentials'}
          </button>
        </form>

        <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={handleRobinhoodBuy}>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="robinhood-symbol">Symbol</label>
            <input
              id="robinhood-symbol"
              type="text"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={robinhoodSymbol}
              onChange={(event) => setRobinhoodSymbol(event.target.value)}
              disabled={robinhoodLoading}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="robinhood-cash-amount">Cash amount (USD)</label>
            <input
              id="robinhood-cash-amount"
              type="number"
              min="0.01"
              step="0.01"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={robinhoodCashAmount}
              onChange={(event) => setRobinhoodCashAmount(event.target.value)}
              disabled={robinhoodLoading || !robinhoodStatus.configured}
              required
            />
          </div>
          <button
            type="submit"
            className="self-end rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-900"
            disabled={robinhoodLoading || !robinhoodStatus.configured}
          >
            {robinhoodLoading ? 'Submitting…' : 'Buy crypto with cash'}
          </button>
        </form>
        {robinhoodMessage && (
          <p className={`mt-3 text-sm ${robinhoodMessage.includes('saved') || robinhoodMessage.includes('submitted') ? 'text-emerald-400' : 'text-red-400'}`}>
            {robinhoodMessage}
            {robinhoodOrderId ? ` (Order: ${robinhoodOrderId})` : ''}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Runtime Diagnostics</h2>
        <p className="mt-2 text-xs text-slate-400">Robinhood support is official crypto API only; stocks/options automation is not exposed via Robinhood public API.</p>
        <div className="mt-3 grid gap-4 text-xs text-slate-300 md:grid-cols-2">
          <div>
            <p className="font-semibold text-white">ABI cache</p>
            <p>Hits: {runtimeTelemetry?.abi.cacheHits ?? 0} · Misses: {runtimeTelemetry?.abi.cacheMisses ?? 0}</p>
            <ul className="mt-2 space-y-1">
              {(runtimeTelemetry?.abi.lastResolves ?? []).slice(0, 20).map((entry) => (
                <li key={`${entry.chainId}-${entry.address}`}>{entry.address} · {entry.contractName} · {entry.source} · cached={String(entry.cached)}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">Secrets status</p>
            <ul className="mt-2 space-y-1">
              {(runtimeTelemetry?.secrets ?? []).map((entry) => (
                <li key={entry.key}>{entry.key}: {entry.present ? 'present' : 'missing'} via {entry.source}</li>
              ))}
            </ul>
            <p className="mt-3 font-semibold text-white">Safe runtime</p>
            <p>Version: {runtimeTelemetry?.safe.version ?? 'unknown'}</p>
            <p>Mastercopy: {runtimeTelemetry?.safe.mastercopyAddress ?? 'unknown'}</p>
            <p>Module enabled: {String(runtimeTelemetry?.safe.moduleEnabled ?? false)}</p>
            <p className="mt-3 font-semibold text-white">Robinhood Crypto</p>
            <p>Enabled: {String(runtimeTelemetry?.robinhood.enabled ?? false)} · Auth: {runtimeTelemetry?.robinhood.auth.ok ? 'OK' : `FAIL (${runtimeTelemetry?.robinhood.auth.reason ?? 'unknown'})`}</p>
            <ul className="mt-2 space-y-1">
              {(runtimeTelemetry?.robinhood.requests ?? []).slice(0, 20).map((entry, idx) => (
                <li key={`${entry.endpoint}-${idx}`}>{entry.endpoint} · {entry.statusCode} · {entry.latencyMs}ms</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Offline License Activation</h2>
        <p className="mt-2 text-sm text-slate-400">
          Activate GNOMAN 2.0 by pasting an offline license token. Licenses are signed with Ed25519 and
          verified locally before being stored in encrypted storage.
        </p>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-sm text-slate-400">
            {status.active ? (
              <span>
                Licensed to{' '}
                <span className="font-medium text-slate-200">{status.identifier ?? 'Unassigned'}</span>
                {status.product && status.version && (
                  <>
                    {' '}for{' '}
                    <span className="font-medium text-slate-200">
                      {status.product} {status.version}
                    </span>
                  </>
                )}{' '}
                <span className="font-medium text-slate-200">
                  {status.expiry ? `Expires ${new Date(status.expiry).toLocaleString()}` : 'No expiry recorded'}
                </span>
              </span>
            ) : (
              'No offline license detected yet.'
            )}
          </p>
        </div>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="license-token">
              License token
            </label>
            <input
              id="license-token"
              type="text"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-mono text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={licenseToken}
              onChange={(event) => setLicenseToken(event.target.value)}
              placeholder="Paste raw token or grouped Base32 string"
              disabled={loading}
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Tokens are validated locally with the bundled Ed25519 public key; no network requests leave this device.
            </p>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-emerald-400">{success}</p>}
          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900"
            disabled={loading}
          >
            {loading ? 'Validating…' : status.active ? 'Replace license token' : 'Activate license'}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Transaction Hold Period</h2>
        <p className="mt-2 text-sm text-slate-400">
          Queue outgoing Safe transactions for a review window before execution. When enabled, transactions wait for the
          configured number of hours and display a live countdown in the queue.
        </p>
        <form className="mt-4 space-y-4" onSubmit={handleHoldSave}>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500"
              checked={holdEnabled}
              onChange={(event) => setHoldEnabled(event.target.checked)}
            />
            Enable 24-hour hold across all Safes
          </label>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="hold-hours">
              Hold duration (hours)
            </label>
            <input
              id="hold-hours"
              type="number"
              min={1}
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={holdHours}
              onChange={(event) => setHoldHours(Number.parseInt(event.target.value, 10) || 24)}
              disabled={!holdEnabled}
            />
            <p className="mt-1 text-xs text-slate-500">
              Stored securely via the active keyring service (entry SAFE_TX_HOLD_ENABLED).
            </p>
          </div>
          {holdMessage && (
            <p className={`text-sm ${holdMessage.includes('saved') ? 'text-emerald-400' : 'text-red-400'}`}>{holdMessage}</p>
          )}
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900"
            disabled={holdSaving}
          >
            {holdSaving ? 'Saving…' : 'Save hold policy'}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Vanity Wallet Generator</h2>
            <p className="text-sm text-slate-400">
              Launch GPU-friendly worker searches for desired address patterns. Secrets never leave the local secure
              store; only aliases are persisted.
            </p>
          </div>
          <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
            Active jobs: <span className="font-semibold text-slate-200">{vanityStats.active}</span> · Completed:{' '}
            <span className="font-semibold text-slate-200">{vanityStats.completed}</span>
          </div>
        </div>
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleVanitySubmit}>
          <label className="text-sm text-slate-300">
            Prefix
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-xs"
              placeholder="0xdead"
              value={vanityForm.prefix}
              onChange={(event) => setVanityForm((prev) => ({ ...prev, prefix: event.target.value }))}
            />
          </label>
          <label className="text-sm text-slate-300">
            Suffix
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-xs"
              placeholder="beef"
              value={vanityForm.suffix}
              onChange={(event) => setVanityForm((prev) => ({ ...prev, suffix: event.target.value }))}
            />
          </label>
          <label className="text-sm text-slate-300">
            Regex pattern
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-xs"
              placeholder="^0x[a-f]{6}"
              value={vanityForm.regex}
              onChange={(event) => setVanityForm((prev) => ({ ...prev, regex: event.target.value }))}
            />
          </label>
          <label className="text-sm text-slate-300">
            Derivation path
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-xs"
              value={vanityForm.derivationPath}
              onChange={(event) => setVanityForm((prev) => ({ ...prev, derivationPath: event.target.value }))}
            />
          </label>
          <label className="text-sm text-slate-300">
            Label (alias)
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs"
              placeholder="Treasury Vanity"
              value={vanityForm.label}
              onChange={(event) => setVanityForm((prev) => ({ ...prev, label: event.target.value }))}
            />
          </label>
          <label className="text-sm text-slate-300">
            Max attempts (optional)
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs"
              value={vanityForm.maxAttempts}
              onChange={(event) =>
                setVanityForm((prev) => ({ ...prev, maxAttempts: Number.parseInt(event.target.value, 10) || 0 }))
              }
            />
          </label>
          <button
            type="submit"
            className="col-span-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900"
            disabled={vanitySubmitting}
          >
            {vanitySubmitting ? 'Launching…' : 'Start vanity search'}
          </button>
        </form>
        {vanityMessage && (
          <p className={`mt-2 text-sm ${vanityMessage.includes('started') ? 'text-emerald-400' : 'text-amber-400'}`}>
            {vanityMessage}
          </p>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-left text-xs">
            <thead>
              <tr className="text-slate-400">
                <th className="px-3 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">Pattern</th>
                <th className="px-3 py-2 font-medium">Progress</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {vanityJobs.map((job) => {
                const eta = job.etaMs && job.etaMs > 0 ? Math.ceil(job.etaMs / 1000) : 0;
                return (
                  <tr key={job.id} className="text-slate-300">
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold text-slate-100">{job.label ?? job.id.slice(0, 8)}</div>
                      <div className="font-mono text-[10px] text-slate-500">{job.id}</div>
                      <div className="text-[10px] text-slate-500">
                        Started {new Date(job.startedAt).toLocaleString()}
                      </div>
                      {job.completedAt && (
                        <div className="text-[10px] text-slate-500">
                          Finished {new Date(job.completedAt).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-[11px] text-slate-400">
                      <div>Prefix: {job.pattern.prefix || '—'}</div>
                      <div>Suffix: {job.pattern.suffix || '—'}</div>
                      <div>Regex: {job.pattern.regex || '—'}</div>
                      <div>Path: {job.pattern.derivationPath}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-[11px]">
                      <div>Attempts: {job.attempts.toLocaleString()}</div>
                      <div>
                        Rate: {job.attemptRate ? `${job.attemptRate.toFixed(0)} /s` : '—'}
                      </div>
                      <div>
                        ETA: {eta > 0 ? `${eta}s` : job.status === 'running' ? '…' : '0s'}
                      </div>
                      {job.targetAttempts && (
                        <div>Expected: {Math.round(job.targetAttempts).toLocaleString()}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-[11px] text-slate-300">
                      <div className="font-medium capitalize">{job.status}</div>
                      {job.address && (
                        <div className="font-mono text-[10px] text-emerald-400">{job.address}</div>
                      )}
                      {job.mnemonicAlias && (
                        <div className="text-[10px] text-slate-400">Secret alias: {job.mnemonicAlias}</div>
                      )}
                      {job.message && <div className="text-[10px] text-amber-400">{job.message}</div>}
                    </td>
                    <td className="px-3 py-2 align-top text-[11px]">
                      {job.status === 'running' ? (
                        <button
                          className="rounded border border-amber-500 px-2 py-1 text-amber-300 transition hover:bg-amber-500/20"
                          onClick={() => cancelVanityJob(job.id)}
                          disabled={vanityLoading}
                        >
                          Cancel
                        </button>
                      ) : job.address ? (
                        <span className="text-emerald-400">Ready</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {vanityJobs.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-sm text-slate-500" colSpan={5}>
                    {vanityLoading ? 'Loading vanity jobs…' : 'No vanity jobs yet. Start one above.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Developer Sandbox</h2>
        <p className="mt-2 text-sm text-slate-500">
          Use Hardhat or anvil to fork a live network for Safe testing. Configure RPC credentials in an upcoming release.
        </p>
      </section>
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Knowledge Base</h2>
        <p className="mt-1 text-sm text-slate-500">
          Visit the in-app wiki for onboarding tips, security practices, and GNOMAN 2.0 walkthroughs.
        </p>
        <Link
          to="/guide"
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-blue-500 px-3 py-2 text-sm font-medium text-blue-300 transition hover:border-blue-400 hover:text-blue-200"
        >
          Open wiki user guide
        </Link>
      </section>
    </div>
  );
};

export default Settings;
