import { FormEvent, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Eye,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  SwitchCamera,
  Trash2
} from 'lucide-react';
import { useKeyring } from '../context/KeyringContext';

const Keyring = () => {
  const { summary, loading, error, history, refresh, createSecret, revealSecret, removeSecret, switchService } =
    useKeyring();
  const [formState, setFormState] = useState({ key: '', value: '', service: '' });
  const [revealTarget, setRevealTarget] = useState('');
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [switchTarget, setSwitchTarget] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionState, setActionState] = useState<'idle' | 'creating' | 'revealing' | 'switching'>('idle');
  const [removing, setRemoving] = useState<string | null>(null);

  const secrets = summary?.secrets ?? [];
  const activeService = summary?.service ?? 'aes';

  const maskedSecrets = useMemo(() => secrets.sort((a, b) => a.key.localeCompare(b.key)), [secrets]);

  const handleRefresh = async () => {
    setActionMessage(null);
    await refresh(activeService);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.key || !formState.value) {
      setActionMessage('Key and value are required to store a secret.');
      return;
    }
    setActionMessage(null);
    setActionState('creating');
    try {
      await createSecret({ key: formState.key, value: formState.value, service: formState.service || undefined });
      setFormState({ key: '', value: '', service: formState.service });
      setActionMessage('Secret stored successfully.');
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Unable to store secret.');
    } finally {
      setActionState('idle');
    }
  };

  const handleReveal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!revealTarget) {
      setActionMessage('Enter an alias to reveal.');
      return;
    }
    setActionMessage(null);
    setActionState('revealing');
    setRevealedSecret(null);
    try {
      const value = await revealSecret({ key: revealTarget, service: formState.service || undefined });
      setRevealedSecret(value);
      setActionMessage(value ? 'Secret revealed. Copy and store it securely.' : 'No secret found for that alias.');
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Unable to reveal secret.');
    } finally {
      setActionState('idle');
    }
  };

  const handleRemove = async (key: string) => {
    setActionMessage(null);
    setRemoving(key);
    try {
      await removeSecret({ key, service: formState.service || undefined });
      setActionMessage(`Secret “${key}” removed.`);
      if (revealTarget === key) {
        setRevealedSecret(null);
      }
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Unable to remove secret.');
    } finally {
      setRemoving(null);
    }
  };

  const handleSwitch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!switchTarget.trim()) {
      setActionMessage('Provide a service label to activate.');
      return;
    }
    setActionMessage(null);
    setActionState('switching');
    try {
      await switchService(switchTarget.trim());
      setActionMessage(`Keyring service switched to “${switchTarget.trim()}”.`);
      setSwitchTarget('');
      setFormState((prev) => ({ ...prev, service: '' }));
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Unable to switch keyring service.');
    } finally {
      setActionState('idle');
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr,1.1fr]">
      <div className="space-y-6">
        <section className="theme-panel rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-500">Active keyring service</p>
              <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-100">
                <KeyRound className="h-5 w-5 text-emerald-300" />
                {loading ? 'Loading…' : activeService}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Secrets are encrypted per service. Switching services isolates secrets for different environments or tenants.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleRefresh()}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-xs uppercase tracking-widest text-emerald-300">Stored aliases</p>
              <p className="mt-2 text-2xl font-semibold text-white">{secrets.length}</p>
              <p className="mt-1 text-xs text-emerald-200">Masked until revealed with multi-step confirmation</p>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-widest text-slate-500">Backend</p>
              <p className="mt-2 text-lg font-semibold text-slate-200">{summary?.backend ?? 'unknown'}</p>
              <p className="mt-1 text-xs text-slate-400">Keyring module with AES encryption or in-memory fallback</p>
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          {actionMessage && <p className="mt-4 text-sm text-emerald-300">{actionMessage}</p>}
        </section>

        <section className="theme-panel rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">Store a secret</h2>
          <p className="mt-1 text-sm text-slate-400">
            Persist credentials or RPC tokens with AES encryption. Provide a service label to target another namespace.
          </p>
          <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={handleCreate}>
            <label className="text-sm text-slate-300">
              Alias
              <input
                value={formState.key}
                onChange={(event) => setFormState((prev) => ({ ...prev, key: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 p-2"
                placeholder="ledger.api"
              />
            </label>
            <label className="text-sm text-slate-300">
              Service (optional)
              <input
                value={formState.service}
                onChange={(event) => setFormState((prev) => ({ ...prev, service: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 p-2"
                placeholder={activeService}
              />
            </label>
            <label className="sm:col-span-2 text-sm text-slate-300">
              Secret value
              <textarea
                value={formState.value}
                onChange={(event) => setFormState((prev) => ({ ...prev, value: event.target.value }))}
                className="mt-1 min-h-[120px] w-full rounded-lg border border-slate-700 bg-slate-950/60 p-3 font-mono text-xs"
                placeholder="Paste JSON, mnemonics, or API tokens"
              />
            </label>
            <button
              type="submit"
              className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
              disabled={actionState === 'creating'}
            >
              {actionState === 'creating' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {actionState === 'creating' ? 'Encrypting…' : 'Store secret'}
            </button>
          </form>
        </section>

        <section className="theme-panel rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Stored aliases</h2>
            <p className="text-xs text-slate-500">{secrets.length} entries</p>
          </div>
          <div className="mt-4 space-y-3">
            <AnimatePresence initial={false}>
              {maskedSecrets.map((entry) => (
                <motion.div
                  key={entry.key}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 p-4"
                >
                  <div>
                    <p className="font-mono text-sm text-emerald-300">{entry.key}</p>
                    <p className="text-xs text-slate-400">{entry.maskedValue ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setRevealTarget(entry.key);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 px-3 py-1 text-emerald-300 transition hover:bg-emerald-500/10"
                    >
                      <Eye className="h-3.5 w-3.5" /> Reveal
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(entry.key)}
                      className="inline-flex items-center gap-1 rounded-full border border-red-500/40 px-3 py-1 text-red-300 transition hover:bg-red-500/10"
                      disabled={removing === entry.key}
                    >
                      {removing === entry.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Remove
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {maskedSecrets.length === 0 && !loading && (
              <div className="rounded-xl border border-dashed border-slate-800/80 bg-slate-950/40 p-6 text-sm text-slate-500">
                No secrets stored for this service yet. Use the form above to add your first key.
              </div>
            )}
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="theme-panel rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold text-white">Reveal a secret</h3>
          <p className="mt-1 text-sm text-slate-400">Revealed secrets stay in memory only while this panel is open.</p>
          <form className="mt-4 space-y-3" onSubmit={handleReveal}>
            <label className="text-sm text-slate-300">
              Alias
              <input
                value={revealTarget}
                onChange={(event) => setRevealTarget(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 p-2"
                placeholder="ledger.api"
              />
            </label>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
              disabled={actionState === 'revealing'}
            >
              {actionState === 'revealing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {actionState === 'revealing' ? 'Decrypting…' : 'Reveal secret'}
            </button>
          </form>
          {revealedSecret !== null && (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-xs uppercase tracking-widest text-emerald-300">Revealed secret</p>
              <p className="mt-2 break-all font-mono text-xs text-emerald-200">{revealedSecret}</p>
            </div>
          )}
        </section>

        <section className="theme-panel rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold text-white">Switch service</h3>
          <p className="mt-1 text-sm text-slate-400">Segment credentials per environment by switching services.</p>
          <form className="mt-4 space-y-3" onSubmit={handleSwitch}>
            <label className="text-sm text-slate-300">
              Service label
              <input
                value={switchTarget}
                onChange={(event) => setSwitchTarget(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 p-2"
                placeholder="production"
              />
            </label>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300 disabled:opacity-50"
              disabled={actionState === 'switching'}
            >
              {actionState === 'switching' ? <Loader2 className="h-4 w-4 animate-spin" /> : <SwitchCamera className="h-4 w-4" />}
              {actionState === 'switching' ? 'Switching…' : 'Activate service'}
            </button>
          </form>
        </section>

        <section className="theme-panel rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold text-white">Activity feed</h3>
          <p className="mt-1 text-sm text-slate-400">Every keyring operation initiated from the UI is captured here.</p>
          <ul className="mt-4 space-y-3 text-xs">
            {history.length === 0 && (
              <li className="rounded-xl border border-dashed border-slate-800/80 bg-slate-950/40 p-4 text-slate-500">
                Interact with the keyring to populate the activity feed.
              </li>
            )}
            {history.map((event) => (
              <li
                key={event.id}
                className={`rounded-xl border px-4 py-3 ${
                  event.intent === 'success'
                    ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-200'
                    : event.intent === 'warning'
                    ? 'border-amber-500/40 bg-amber-500/5 text-amber-200'
                    : 'border-slate-700/60 bg-slate-950/60 text-slate-300'
                }`}
              >
                <p className="font-medium">{event.message}</p>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">
                  {new Date(event.timestamp).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-100">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-1 h-5 w-5" />
            <div>
              <h4 className="text-base font-semibold">UI-first mandate</h4>
              <p className="mt-1 text-amber-50">
                The command-line keyring is now legacy. Manage secrets, switch namespaces, and audit activity entirely from this
                panel. Scripts using the CLI still function but receive no new capabilities.
              </p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
};

export default Keyring;
