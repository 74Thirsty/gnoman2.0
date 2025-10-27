const WikiGuide = () => {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
        <h1 className="text-2xl font-semibold text-slate-100">GNOMAN 2.0 Wiki</h1>
        <p className="mt-3 text-sm text-slate-400">
          Welcome to the GNOMAN 2.0 knowledge base. This in-app guide highlights the most common
          workflows so you can remain focused on secure Safe operations without leaving the desktop
          client.
        </p>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-xl font-semibold text-slate-100">Getting Started</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-400">
          <li>
            <span className="font-medium text-slate-200">Connect the backend:</span> Start the
            Express server with <code className="rounded bg-slate-800 px-1 py-0.5">npm run dev:backend</code>{' '}
            to unlock wallet and Safe orchestration APIs.
          </li>
          <li>
            <span className="font-medium text-slate-200">Launch the renderer:</span> Use{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5">npm run dev:renderer</code> to preview
            UI changes in the browser or desktop shell.
          </li>
          <li>
            <span className="font-medium text-slate-200">Authenticate your workspace:</span> Activate
            your offline license from <strong>Settings &gt; Offline License Activation</strong> to enable
            enterprise policy enforcement.
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-xl font-semibold text-slate-100">Wallet Management</h2>
        <p className="mt-3 text-sm text-slate-400">
          Generate or import wallets from the <strong>Wallets</strong> tab. GNOMAN 2.0 encrypts private
          keys using AES-256-GCM before persisting them to disk. Always export encrypted backups after
          onboarding a signing device.
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-400">
          <li>Use vanity search for predictable addresses without exposing seed phrases.</li>
          <li>Store aliases in the AES keyring service via the <strong>Keyring</strong> tab.</li>
          <li>Keep hot wallets isolated by leveraging Safe modules and transaction holds.</li>
        </ul>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-xl font-semibold text-slate-100">Safe Operations</h2>
        <p className="mt-3 text-sm text-slate-400">
          The <strong>Safes</strong> dashboard surfaces owners, module toggles, and pending
          transactions. Enable the 24-hour hold policy to protect high-value actions and require a
          secondary review window.
        </p>
        <p className="mt-3 text-sm text-slate-400">
          Simulate execution flows inside the <strong>Sandbox</strong> to verify calldata before
          requesting signatures. The sandbox proxies <code className="rounded bg-slate-800 px-1 py-0.5">callStatic</code>{' '}
          invocations through the backend for deterministic results.
        </p>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-xl font-semibold text-slate-100">Security Checklist</h2>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-slate-400">
          <li>Verify product registration and license compliance on every new workstation.</li>
          <li>Audit connected RPC endpoints and rotate API keys regularly.</li>
          <li>Enable OS-level full disk encryption so GNOMAN 2.0 secrets remain isolated.</li>
          <li>Keep the Electron shell and backend dependencies patched to the latest releases.</li>
        </ul>
      </section>
    </div>
  );
};

export default WikiGuide;
