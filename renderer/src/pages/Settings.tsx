import { Link } from 'react-router-dom';
import LicenseScreen from '../components/LicenseScreen';

const Settings = () => {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <LicenseScreen />
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
