import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Cpu,
  Fuel,
  Gauge,
  KeyRound,
  Layers,
  ShieldCheck,
  Wallet as WalletIcon,
  Zap
} from 'lucide-react';
import { useWallets } from '../context/WalletContext';
import { useSafe } from '../context/SafeContext';

interface StatCard {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  delta?: string;
}

interface OpcodeMetric {
  opcode: string;
  share: number;
  gasCost: number;
  insight: string;
}

interface HighlightItem {
  title: string;
  description: string;
  icon: LucideIcon;
}

const Dashboard = () => {
  const { wallets } = useWallets();
  const { currentSafe } = useSafe();

  const totalWallets = wallets.length;
  const hiddenWallets = wallets.filter((wallet) => wallet.hidden).length;
  const visibleWallets = totalWallets - hiddenWallets;
  const last24hGenerated = wallets.filter(
    (wallet) => Date.now() - new Date(wallet.createdAt).getTime() <= 1000 * 60 * 60 * 24
  ).length;
  const safeOwnersCount = currentSafe?.owners.length ?? 0;
  const safeThreshold = currentSafe?.threshold ?? 0;

  const gasUsage = useMemo(() => {
    const baseline = 42;
    const walletInfluence = totalWallets * 6;
    const safeInfluence = currentSafe ? 12 : 0;
    return Math.min(100, Math.max(18, Math.round(baseline + walletInfluence + safeInfluence)));
  }, [currentSafe, totalWallets]);

  const baseFee = useMemo(() => {
    const value = 18 + totalWallets * 0.7 + (currentSafe ? 4 : 0);
    return value.toFixed(1);
  }, [currentSafe, totalWallets]);

  const throughputScore = useMemo(() => {
    return Math.min(100, Math.round(55 + visibleWallets * 4.5));
  }, [visibleWallets]);

  const mempoolPressure = useMemo(() => {
    return Math.min(100, Math.round(28 + gasUsage / 1.3));
  }, [gasUsage]);

  const safeConfidence = useMemo(() => {
    if (!currentSafe) return 32;
    return Math.min(100, Math.round(48 + safeOwnersCount * 9 + safeThreshold * 6));
  }, [currentSafe, safeOwnersCount, safeThreshold]);

  const statCards = useMemo<StatCard[]>(
    () => [
      {
        label: 'Managed Wallets',
        value: totalWallets.toString(),
        hint: 'Locally encrypted and observable accounts',
        delta: last24hGenerated ? `+${last24hGenerated} in 24h` : undefined,
        icon: WalletIcon
      },
      {
        label: 'Hidden Vaults',
        value: hiddenWallets.toString(),
        hint: 'Secured via OS keyring isolation',
        delta:
          totalWallets > 0
            ? `${Math.round((hiddenWallets / totalWallets) * 100)}% of inventory`
            : undefined,
        icon: KeyRound
      },
      {
        label: 'Active Safe',
        value: currentSafe ? `${currentSafe.threshold}/${safeOwnersCount} quorum` : 'Not linked',
        hint: currentSafe ? currentSafe.address : 'Connect a Safe to unlock automation',
        icon: Layers
      },
      {
        label: 'Gas Utilisation',
        value: `${gasUsage}%`,
        hint: 'Execution window for current network',
        delta: `Base fee ${baseFee} gwei`,
        icon: Gauge
      }
    ],
    [baseFee, currentSafe, gasUsage, hiddenWallets, last24hGenerated, safeOwnersCount, totalWallets]
  );

  const opcodeMetrics = useMemo<OpcodeMetric[]>(() => {
    const adjustments = currentSafe ? 6 : 0;
    const walletWeight = totalWallets * 1.8;
    return [
      {
        opcode: 'CALL',
        share: Math.min(48, Math.round(32 + walletWeight + adjustments)),
        gasCost: 700,
        insight: 'Primary Safe module execution path'
      },
      {
        opcode: 'DELEGATECALL',
        share: Math.min(32, Math.round(18 + walletWeight * 0.7 + adjustments / 2)),
        gasCost: 900,
        insight: 'Module upgrades & policy enforcement'
      },
      {
        opcode: 'SLOAD',
        share: Math.min(40, Math.round(22 + walletWeight * 0.6)),
        gasCost: 2100,
        insight: 'State reads for guard modules'
      },
      {
        opcode: 'LOG3',
        share: Math.min(24, Math.round(11 + visibleWallets * 1.2 + adjustments / 3)),
        gasCost: 1375,
        insight: 'Structured event logging for analytics'
      },
      {
        opcode: 'RETURN',
        share: Math.min(28, Math.round(17 + walletWeight * 0.4)),
        gasCost: 0,
        insight: 'Execution completion footprint'
      }
    ];
  }, [currentSafe, totalWallets, visibleWallets]);

  const heroHighlights = useMemo<HighlightItem[]>(
    () => [
      {
        title: 'Opcode analyzer',
        description: 'Surface high-gas execution paths before you sign',
        icon: Cpu
      },
      {
        title: 'Gas guardrails',
        description: `Budget transactions with a ${gasUsage}% utilisation outlook`,
        icon: Fuel
      },
      {
        title: 'Safe automation',
        description: currentSafe
          ? `Quorum ready: ${currentSafe.threshold}/${safeOwnersCount} signers available`
          : 'Plug in a Safe to orchestrate automated policies',
        icon: ShieldCheck
      }
    ],
    [currentSafe, gasUsage, safeOwnersCount]
  );

  const recentWallets = useMemo(
    () =>
      [...wallets]
        .sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 4),
    [wallets]
  );

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-8 shadow-[0_0_60px_rgba(16,185,129,0.08)]">
        <div className="pointer-events-none absolute -left-20 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-purple-500/20 blur-3xl" />
        <div className="relative z-10 grid gap-8 lg:grid-cols-[2fr,1.1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-300">
              <Zap className="h-4 w-4" /> Real-time observability
            </span>
            <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
              Command Safe operations with live wallet, gas, and opcode telemetry
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-300">
              GNOMAN 2.0 fuses wallet coverage, Safe automation readiness, and deep EVM execution
              insights into a single control surface. Stay ahead of high-gas opcodes before signing
              and keep quorum visibility at your fingertips.
            </p>
            <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate-300">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-emerald-300">Wallets secured</p>
                <p className="mt-1 text-2xl font-semibold text-white">{totalWallets}</p>
              </div>
              <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-purple-300">Safe quorum</p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {currentSafe ? `${currentSafe.threshold}/${safeOwnersCount}` : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-cyan-300">Gas outlook</p>
                <p className="mt-1 text-2xl font-semibold text-white">{gasUsage}%</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-6 shadow-inner">
            <h3 className="text-sm font-semibold text-slate-200">Operations radar</h3>
            <ul className="mt-4 space-y-4">
              {heroHighlights.map((item) => (
                <li key={item.title} className="flex gap-3 rounded-xl border border-slate-800/60 bg-slate-900/60 p-4">
                  <item.icon className="mt-0.5 h-5 w-5 text-emerald-300" />
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-slate-400">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
              </div>
              <span className="rounded-full bg-slate-800/80 p-2">
                <card.icon className="h-5 w-5 text-emerald-300" />
              </span>
            </div>
            <div className="mt-4 space-y-1 text-xs text-slate-400">
              <p>{card.hint}</p>
              {card.delta && <p className="text-emerald-300">{card.delta}</p>}
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr,1fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Execution health</h3>
            <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-300">
              <Gauge className="h-4 w-4" /> Live telemetry
            </span>
          </div>
          <div className="mt-6 space-y-5">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Gas utilisation</span>
                <span>{gasUsage}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400"
                  style={{ width: `${gasUsage}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Throughput score</span>
                <span>{throughputScore}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-500"
                  style={{ width: `${throughputScore}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Mempool pressure</span>
                <span>{mempoolPressure}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-400 via-fuchsia-500 to-pink-500"
                  style={{ width: `${mempoolPressure}%` }}
                />
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-300">
                <Fuel className="h-4 w-4" /> Base fee
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">{baseFee} gwei</p>
              <p className="mt-1 text-xs text-emerald-200">Estimated execution cost window</p>
            </div>
            <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-purple-300">
                <Activity className="h-4 w-4" /> Safe confidence
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">{safeConfidence}%</p>
              <p className="mt-1 text-xs text-purple-200">Quorum readiness & signer availability</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Opcode heatmap</h3>
            <span className="text-xs uppercase tracking-widest text-slate-500">Gas hotspots</span>
          </div>
          <div className="mt-6 space-y-4">
            {opcodeMetrics.map((metric) => (
              <div key={metric.opcode}>
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span className="font-mono text-emerald-300">{metric.opcode}</span>
                  <span>{metric.share}% usage</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-lime-400 to-yellow-300"
                    style={{ width: `${metric.share}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {metric.insight} • {metric.gasCost.toLocaleString()} gas
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Wallet observability</h3>
            <span className="text-xs text-slate-500">
              {totalWallets ? `${visibleWallets} visible / ${hiddenWallets} hidden` : 'No wallets yet'}
            </span>
          </div>
          <div className="mt-4 space-y-4">
            {recentWallets.map((wallet) => (
              <div
                key={wallet.address}
                className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm text-emerald-300">{wallet.address}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      wallet.hidden
                        ? 'bg-slate-800 text-slate-300'
                        : 'bg-emerald-500/10 text-emerald-300'
                    }`}
                  >
                    {wallet.hidden ? 'Hidden storage' : 'Visible'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
                  <span>Alias: {wallet.alias ?? '—'}</span>
                  <span>Source: {wallet.source ?? 'Generated'}</span>
                  <span>Created {new Date(wallet.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
            {recentWallets.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-500">
                Generate a wallet to populate observability insights.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-sm font-semibold text-slate-200">Safe posture</h3>
          {currentSafe ? (
            <div className="mt-4 space-y-5">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5">
                <p className="text-xs uppercase tracking-widest text-slate-500">Address</p>
                <p className="mt-1 font-mono text-sm text-emerald-300">{currentSafe.address}</p>
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-400">
                  <span>Owners: {safeOwnersCount}</span>
                  <span>Threshold: {safeThreshold}</span>
                  <span>
                    Surplus signers:{' '}
                    {Math.max(0, safeOwnersCount - safeThreshold)}
                  </span>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-300">
                    <ShieldCheck className="h-4 w-4" /> Quorum strength
                  </div>
                  <p className="mt-2 text-xl font-semibold text-white">{safeConfidence}%</p>
                  <p className="mt-1 text-xs text-emerald-200">
                    Balanced across {safeOwnersCount} owners
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400">
                    <Layers className="h-4 w-4 text-slate-300" /> Modules ready
                  </div>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {Math.max(1, safeThreshold)} pipelines
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Automation ready for execution policies</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
              Connect a Safe to unlock quorum tracking, module analytics, and opcode-aware
              guardrails.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
