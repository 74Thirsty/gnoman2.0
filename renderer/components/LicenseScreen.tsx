import React, { useEffect, useMemo, useState } from 'react';

type SafevaultValidationResult = { ok: boolean; reason?: string };
type SafevaultAPI = {
  validateLicense: (key: string) => SafevaultValidationResult;
  loadLicense: () => SafevaultValidationResult;
};

type LicenseScreenProps = {
  onLicenseValidated: () => void;
};

type StatusState =
  | { variant: 'checking'; message: string }
  | { variant: 'valid'; message: string }
  | { variant: 'invalid'; message: string }
  | { variant: 'error'; message: string };

const buildStatus = (variant: StatusState['variant'], message: string): StatusState => ({ variant, message });

const statusColorMap: Record<StatusState['variant'], string> = {
  checking: 'text-amber-300 bg-amber-500/10 border-amber-500/40',
  valid: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/40',
  invalid: 'text-red-300 bg-red-500/10 border-red-500/40',
  error: 'text-red-300 bg-red-500/10 border-red-500/40'
};

const LicenseScreen: React.FC<LicenseScreenProps> = ({ onLicenseValidated }) => {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<StatusState>(buildStatus('checking', 'Checking license…'));

  useEffect(() => {
    const safevault = (window as Window & { safevault?: SafevaultAPI }).safevault;

    if (!safevault) {
      setStatus(buildStatus('error', '⚠️ License service unavailable.'));
      return;
    }

    try {
      const result = safevault.loadLicense();

      if (result.ok) {
        setStatus(buildStatus('valid', '✅ License valid.'));
        onLicenseValidated();
        return;
      }

      const reason = result.reason ? ` (${result.reason})` : '';
      setStatus(buildStatus('invalid', `🔒 Not activated${reason}.`));
    } catch (error) {
      console.error('Failed to check stored license:', error);
      setStatus(buildStatus('error', '⚠️ Unable to check license.'));
    }
  }, [onLicenseValidated]);

  const handleValidate = () => {
    const safevault = (window as Window & { safevault?: SafevaultAPI }).safevault;

    if (!safevault) {
      setStatus(buildStatus('error', '⚠️ Unable to validate — license service unavailable.'));
      return;
    }

    const trimmed = input.trim();

    if (!trimmed) {
      setStatus(buildStatus('invalid', '❌ Please enter a license key.'));
      return;
    }

    const result = safevault.validateLicense(trimmed);

    if (result.ok) {
      setStatus(buildStatus('valid', '✅ License valid and saved.')); 
      onLicenseValidated();
      return;
    }

    const reason = result.reason ? ` (${result.reason})` : '';
    setStatus(buildStatus('invalid', `❌ Invalid key${reason}.`));
  };

  const statusClasses = useMemo(
    () => `mt-4 rounded-lg border px-4 py-3 text-sm font-medium ${statusColorMap[status.variant]}`,
    [status.variant]
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-800/60 bg-slate-900/80 p-8 shadow-xl backdrop-blur">
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Gnoman</p>
          <h1 className="text-2xl font-semibold text-white">Activate your workspace</h1>
          <p className="text-sm text-slate-400">
            Enter the offline activation token provisioned by your Safe administrator to unlock the desktop client.
          </p>
        </header>

        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-[0.25em] text-slate-400" htmlFor="license-input">
            License token
          </label>
          <input
            id="license-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="eg. GNOMAN-XXXX-XXXX"
            className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-4 py-3 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={handleValidate}
            className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
          >
            Validate license
          </button>
        </div>

        <p className={statusClasses}>{status.message}</p>

        <p className="text-center text-xs text-slate-500">
          Need help? Contact your Safe operations lead to request or reset your offline activation token.
        </p>
      </div>
    </div>
  );
};

export default LicenseScreen;
