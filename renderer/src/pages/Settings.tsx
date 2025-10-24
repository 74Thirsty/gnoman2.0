import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RegistrationStatus } from '../types/registration';

const Settings = () => {
  const [status, setStatus] = useState<RegistrationStatus>({ registered: false });
  const [email, setEmail] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('http://localhost:4399/api/registration');
        if (!response.ok) {
          throw new Error('Unable to load registration status.');
        }
        const data: RegistrationStatus = await response.json();
        setStatus(data);
        if (data.email) {
          setEmail(data.email);
        }
      } catch (err) {
        console.error(err);
      }
    };

    void fetchStatus();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('http://localhost:4399/api/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, licenseKey })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? 'Registration failed.');
      }

      setStatus(payload);
      setSuccess('Product registration saved securely.');
      if (!status.registered) {
        setLicenseKey('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Product Registration</h2>
        <p className="mt-2 text-sm text-slate-400">
          Secure your SafeVault deployment by pairing it with a licensed product key. Keys are
          encrypted using strong key-derivation before being stored locally.
        </p>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-sm text-slate-400">
            {status.registered ? (
              <span>
                Registered to <span className="font-medium text-slate-200">{status.email}</span> on{' '}
                <span className="font-medium text-slate-200">
                  {status.registeredAt ? new Date(status.registeredAt).toLocaleString() : 'N/A'}
                </span>
              </span>
            ) : (
              'No product registration found yet.'
            )}
          </p>
        </div>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="registration-email">
              Registration email
            </label>
            <input
              id="registration-email"
              type="email"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="registration-license">
              License key
            </label>
            <input
              id="registration-license"
              type="text"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm uppercase tracking-[0.2em] text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={licenseKey}
              onChange={(event) => setLicenseKey(event.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              pattern="[A-Z0-9]{4}(-[A-Z0-9]{4}){3}"
              disabled={status.registered}
              required={!status.registered}
            />
            <p className="mt-1 text-xs text-slate-500">
              Product keys stay encrypted locally – no network transmission occurs beyond this device.
            </p>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-emerald-400">{success}</p>}
          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900"
            disabled={loading}
          >
            {loading ? 'Saving…' : status.registered ? 'Update registration email' : 'Register product'}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Developer Sandbox</h2>
        <p className="mt-2 text-sm text-slate-500">
          Use Hardhat or anvil to fork a live network for Safe testing. Configure RPC credentials in
          an upcoming release.
        </p>
      </section>
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Knowledge Base</h2>
        <p className="mt-1 text-sm text-slate-500">
          Visit the in-app wiki for onboarding tips, security practices, and SafeVault walkthroughs.
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
