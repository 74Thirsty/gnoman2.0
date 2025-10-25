import { NavLink, Route, Routes } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext';
import { SafeProvider } from './context/SafeContext';
import Dashboard from './pages/Dashboard';
import Wallets from './pages/Wallets';
import Safes from './pages/Safes';
import Sandbox from './pages/Sandbox';
import Keyring from './pages/Keyring';
import Settings from './pages/Settings';
import WikiGuide from './pages/WikiGuide';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/wallets', label: 'Wallets' },
  { path: '/safes', label: 'Safes' },
  { path: '/sandbox', label: 'Sandbox' },
  { path: '/keyring', label: 'Keyring' },
  { path: '/settings', label: 'Settings' },
  { path: '/guide', label: 'Wiki Guide' }
];

const App = () => {
  return (
    <WalletProvider>
      <SafeProvider>
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <header className="border-b border-slate-800">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <h1 className="text-xl font-semibold">SafeVault</h1>
              <nav className="flex gap-4 text-sm">
                {navItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `rounded px-3 py-2 transition ${
                        isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                      }`
                    }
                    end={item.path === '/'}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-8">
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
      </SafeProvider>
    </WalletProvider>
  );
};

export default App;
