import { FormEvent, useState } from 'react';
import SandboxPanel from '../../../modules/sandbox/ui/SandboxPanel';

interface SimulationResult {
  success: boolean;
  result?: unknown;
  error?: string;
  hash?: string;
  status?: number;
}

const SafeSandboxPanel = () => {
  const [callResult, setCallResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCallStatic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setLoading(true);
    try {
      const argsValue = (formData.get('args') as string | null) ?? '[]';
      const parsedArgs = argsValue.length ? JSON.parse(argsValue) : [];
      const response = await fetch('http://localhost:4399/api/sandbox/call-static', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rpcUrl: String(formData.get('rpcUrl') ?? ''),
          contractAddress: String(formData.get('contractAddress') ?? ''),
          abi: String(formData.get('abi') ?? ''),
          method: String(formData.get('method') ?? ''),
          args: parsedArgs,
          value: formData.get('value') || undefined
        })
      });
      const data = (await response.json()) as SimulationResult;
      setCallResult(data);
    } catch (error) {
      setCallResult({ success: false, error: error instanceof Error ? error.message : 'Simulation failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">Safe callStatic Simulation</h2>
        <p className="mt-1 text-sm text-slate-500">Validate Safe-compatible contract interactions without affecting live funds.</p>
        <form className="mt-4 grid gap-3" onSubmit={handleCallStatic}>
          <label className="text-sm text-slate-300">
            RPC URL
            <input
              name="rpcUrl"
              required
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
              placeholder="https://rpc.ankr.com/eth"
            />
          </label>
          <label className="text-sm text-slate-300">
            Contract Address
            <input
              name="contractAddress"
              required
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
            />
          </label>
          <label className="text-sm text-slate-300">
            ABI JSON
            <textarea
              name="abi"
              required
              rows={4}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-xs"
            />
          </label>
          <label className="text-sm text-slate-300">
            Method
            <input
              name="method"
              required
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
            />
          </label>
          <label className="text-sm text-slate-300">
            Arguments (JSON array)
            <input
              name="args"
              placeholder="[]"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-xs"
            />
          </label>
          <label className="text-sm text-slate-300">
            Value (ETH)
            <input name="value" className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2" />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-purple-500 px-4 py-2 text-sm font-semibold text-purple-950 transition hover:bg-purple-400 disabled:opacity-50"
          >
            {loading ? 'Simulating...' : 'Simulate callStatic'}
          </button>
        </form>
      </section>
      {callResult && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-lg font-semibold">Result</h3>
          <pre className="mt-2 overflow-x-auto rounded bg-slate-950/60 p-3 text-xs text-slate-200">
            {JSON.stringify(callResult, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
};

const Sandbox = () => {
  const [activeTab, setActiveTab] = useState<'safe' | 'contract'>('safe');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2">
        <button
          className={`rounded px-3 py-2 text-sm font-semibold transition ${
            activeTab === 'safe' ? 'bg-purple-500 text-purple-950' : 'text-slate-300 hover:text-white'
          }`}
          onClick={() => setActiveTab('safe')}
        >
          Safe Sandbox
        </button>
        <button
          className={`rounded px-3 py-2 text-sm font-semibold transition ${
            activeTab === 'contract' ? 'bg-emerald-500 text-emerald-950' : 'text-slate-300 hover:text-white'
          }`}
          onClick={() => setActiveTab('contract')}
        >
          Contract Sandbox
        </button>
      </div>
      {activeTab === 'safe' ? <SafeSandboxPanel /> : <SandboxPanel />}
    </div>
  );
};

export default Sandbox;
