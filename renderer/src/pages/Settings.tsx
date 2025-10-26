import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type LicenseResult = {
  ok: boolean;
  reason?: string;
};

const formatStatus = (status: LicenseResult) => {
  if (status.ok) {
    return 'License validated locally.';
  }
  if (status.reason === 'none') {
    return 'No offline license detected yet.';
  }
  if (status.reason === 'invalid_or_expired') {
    return 'Stored token is invalid or expired. Provide a new one below.';
  }
  return 'License validation required.';
};

const Settings = () => {
  const [status, setStatus] = useState<LicenseResult>({ ok: false, reason: 'none' });
  const [licenseToken, setLicenseToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const api = window.safevault;
    if (!api) {
      setStatus({ ok: true });
      return;
    }
    const result = api.loadLicense();
    setStatus(result);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const api = window.safevault;
      if (!api) {
        setStatus({ ok: true });
        setSuccess('License token accepted (development mode).');
        setLicenseToken('');
        return;
      }
      const result = api.validateLicense(licenseToken.trim());
      if (!result.ok) {
        throw new Error('License validation failed.');
      }
      setStatus(result);
      setSuccess('License token validated and stored securely.');
      setLicenseToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'License validation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Offline License Activation</h2>
        <p className="mt-2 text-sm text-slate-400">
          Activate GNOMAN 2.0 by pasting an offline license token. Licenses are signed with Ed25519 and
          verified locally before being stored in encrypted storage.
        </p>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-sm text-slate-400">
            {formatStatus(status)}
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
            {loading ? 'Validating…' : status.ok ? 'Replace license token' : 'Activate license'}
          </button>
        </form>
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
