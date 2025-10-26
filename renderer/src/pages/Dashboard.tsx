import { useWallets } from '../context/WalletContext';
import { useSafe } from '../context/SafeContext';

const Dashboard = () => {
  const { wallets } = useWallets();
  const { currentSafe } = useSafe();

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold">Overview</h2>
        <p className="mt-2 text-sm text-slate-400">
          GNOMAN 2.0 brings wallet, Safe, and sandbox management into a single secure desktop
          experience.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-medium text-slate-300">Wallets</h3>
          <p className="mt-2 text-2xl font-semibold">{wallets.length}</p>
          <p className="mt-1 text-xs text-slate-500">Managed locally with encrypted secrets.</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-medium text-slate-300">Active Safe</h3>
          {currentSafe ? (
            <div className="mt-2 space-y-1 text-sm text-slate-300">
              <p className="font-semibold">{currentSafe.address}</p>
              <p>Owners: {currentSafe.owners.length}</p>
              <p>Threshold: {currentSafe.threshold}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Connect a Safe to begin management.</p>
          )}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
