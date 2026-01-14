import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  Cpu,
  KeyRound,
  LayoutDashboard,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Moon,
  Wallet as WalletIcon
} from 'lucide-react';
import LicenseScreen from '../components/LicenseScreen';
import { WalletProvider, useWallets } from './context/WalletContext';
import { SafeProvider } from './context/SafeContext';
import { KeyringProvider, useKeyring } from './context/KeyringContext';
import { useTheme } from './context/ThemeContext';
import Dashboard from './pages/Dashboard';
import Wallets from './pages/Wallets';
import Safes from './pages/Safes';
import Sandbox from './pages/Sandbox';
import Keyring  from './pages/Keyring';
import Settings from './pages/Settings';
import WikiGuide from './pages/WikiGuide';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/wallets', label: 'Wallets', icon: WalletIcon },
  { path: '/safes', label: 'Safes', icon: ShieldCheck },
  { path: '/sandbox', label: 'Sandbox', icon: Cpu },
  { path: '/keyring', label: 'Keyring', icon: KeyRound },
  { path: '/settings', label: 'Settings', icon: SlidersHorizontal },
  { path: '/guide', label: 'Wiki Guide', icon: BookOpen }
];

const ThemeToggleButton = () => {
  const { theme, toggleTheme } = useTheme();
  const Icon = theme === 'dark' ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex items-center gap-2 rounded-full border border-emerald-500/40 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:border-emerald-400 hover:bg-emerald-500/10"
    >
      <Icon className="h-4 w-4" />
      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
    </button>
  );
};

const KeyringStatusBeacon = () => {
  const { summary, loading, error } = useKeyring();

  if (loading) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/50 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
        <Activity className="h-3.5 w-3.5 animate-spin text-emerald-300" /> Loading keyring…
      </span>
    );
  }

  if (error || !summary) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300">
        <Activity className="h-3.5 w-3.5" /> Keyring offline
      </span>
    );
  }

  const activeService = summary.service ?? summary.backend ?? 'unknown';

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
      <KeyRound className="h-3.5 w-3.5" />
      {activeService}
      <span className="text-[10px] uppercase tracking-widest">{summary.backend}</span>
    </span>
  );
};

const WalletPulse = () => {
  const { wallets } = useWallets();
  const visibleWallets = useMemo(() => wallets.filter((wallet) => !wallet.hidden).length, [wallets]);
  const hiddenWallets = wallets.length - visibleWallets;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-3 text-xs text-slate-300">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">Wallet pulse</p>
      <p className="mt-1 font-mono text-sm text-emerald-300">{wallets.length} total</p>
      <p className="mt-1 text-[11px] text-slate-400">{visibleWallets} visible · {hiddenWallets} hidden</p>
    </div>
  );
};

const App: React.FC = () => {
  const { theme } = useTheme();
  const [licenseStatus, setLicenseStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [legacyBridge, setLegacyBridge] = useState(false);

  useEffect(() => {
    const w = window as Window & {
      safevault?: { loadLicense?: () => { ok?: boolean } | null };
      gnoman?: unknown;
    };
    if (!w.safevault?.loadLicense) {
      setLicenseStatus('valid');
      setLegacyBridge(Boolean(w.gnoman));
      return;
    }
    try {
      const result = w.safevault.loadLicense();
      setLicenseStatus(result?.ok ? 'valid' : 'invalid');
    } catch (e) {
      setLicenseStatus('invalid');
    }
    setLegacyBridge(Boolean(w.gnoman));
  }, []);

  const handleLicenseValidated = useCallback(() => {
    setLicenseStatus('valid');
  }, []);

  if (licenseStatus !== 'valid') {
    return <LicenseScreen onLicenseValidated={handleLicenseValidated} />;
  }

  const isDark = theme === 'dark';
  const shellClass = isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900';
  const sidebarClass = isDark ? 'border-slate-800/70 bg-slate-950/80' : 'border-slate-200 bg-white/90 backdrop-blur';
  const navBaseClass = isDark ? 'text-slate-300 hover:bg-slate-900/70 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900';
  const navActiveClass = isDark ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border border-emerald-500/50 bg-emerald-100 text-emerald-700';

  return (
    <WalletProvider>
      <SafeProvider>
        <KeyringProvider>
          <div className={`min-h-screen transition-colors duration-500 ${shellClass}`}>
            <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
              <aside className={`flex flex-col gap-6 border-b px-6 py-8 shadow-lg lg:w-72 lg:border-b-0 lg:border-r ${sidebarClass}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-400">Gnoman</p>
                    <h1 className="text-xl font-semibold">Graphical Control Hub</h1>
                  </div>
                  <ThemeToggleButton />
                </div>

                <nav className="flex flex-col gap-1 text-sm">
                  {navItems.map((item) => {
                    const IconComp = item.icon;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.path === '/'}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-xl px-3 py-2 transition ${isActive ? navActiveClass : navBaseClass}`
                        }
                      >
                        <IconComp className="h-5 w-5" />
                        {item.label}
                      </NavLink>
                    );
                  })}
                </nav>

                <div className="mt-auto space-y-3 text-sm">
                  <KeyringStatusBeacon />
                  <WalletPulse />
                  <div
                    className={`rounded-xl border px-4 py-3 text-xs ${
                      legacyBridge ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-slate-700/40 bg-slate-900/40 text-slate-400'
                    }`}
                  >
                    {legacyBridge ? (
                      <p>Legacy CLI bridge detected. All workflows are now mirrored in the graphical interface.</p>
                    ) : (
                      <p>The CLI is dormant. Use the UI for the full administrative surface.</p>
                    )}
                  </div>
                </div>
              </aside>

              <main className="flex-1 bg-transparent px-6 pb-12 pt-10">
                <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Visual-first operations</p>
                    <h2 className="mt-2 text-2xl font-semibold">All CLI power, now orchestrated in the GUI</h2>
                    <p className="mt-2 max-w-2xl text-sm text-slate-400">
                      Configure keyrings, wallets, networks, and Safe automations without leaving the graphical environment. The
                      CLI remains as a minimal fallback for legacy scripts.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <KeyringStatusBeacon />
                  </div>
                </header>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/wallets" element={<Wallets />} />
                  <Route path="/safes" element={<Safes />} />
                  <Route path="/sandbox" element={<Sandbox />} />
                  <Route path="/keyring" element={<Keyring />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/guide" element={<WikiGuide />} />
                </Routes>
              </main>
            </div>
          </div>
        </KeyringProvider>
      </SafeProvider>
    </WalletProvider>
  );
};

export default App;
