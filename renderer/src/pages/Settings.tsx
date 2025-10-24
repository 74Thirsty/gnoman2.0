const Settings = () => {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Developer Sandbox</h2>
        <p className="mt-2 text-sm text-slate-500">
          Use Hardhat or anvil to fork a live network for Safe testing. Configure RPC credentials in
          an upcoming release.
        </p>
      </section>
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Theme</h2>
        <p className="mt-1 text-sm text-slate-500">Light/dark theme toggles coming soon.</p>
      </section>
    </div>
  );
};

export default Settings;
