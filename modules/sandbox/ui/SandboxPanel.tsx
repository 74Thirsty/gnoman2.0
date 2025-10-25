import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getAddress } from 'ethers';
import ParameterForm from './ParameterForm';
import LogViewer from './LogViewer';
import type { AbiFunctionDescription, AbiMetadata, SandboxLogEntry } from '../types';

interface ForkStatus {
  active: boolean;
  rpcUrl?: string;
  port?: number;
  startedAt?: string;
  blockNumber?: number;
  command?: string;
  pid?: number;
}

interface SimulationResponse {
  success: boolean;
  callData: string;
  decodedReturnData?: unknown;
  returnData?: unknown;
  gasEstimate?: string;
  error?: string;
  revertReason?: string;
  trace?: unknown;
  network?: {
    name: string;
    chainId: number;
  } | null;
}

const initialForkForm = {
  rpcUrl: '',
  blockNumber: '',
  port: '8545',
  command: 'anvil'
};

type ForkFormState = typeof initialForkForm;

const parseParameter = (type: string, value: string) => {
  if (!value) return value;
  if (type.startsWith('uint') || type.startsWith('int')) {
    return value;
  }
  if (type === 'bool') {
    return value === 'true' || value === '1';
  }
  if (type === 'address') {
    return getAddress(value);
  }
  if (type.endsWith('[]')) {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`Invalid array for ${type}: ${(error as Error).message}`);
    }
  }
  return value;
};

const SandboxPanel = () => {
  const [abiInput, setAbiInput] = useState('');
  const [metadata, setMetadata] = useState<AbiMetadata | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<string>('');
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [simulationResult, setSimulationResult] = useState<SimulationResponse | null>(null);
  const [contractAddress, setContractAddress] = useState('');
  const [rpcUrl, setRpcUrl] = useState('');
  const [value, setValue] = useState('');
  const [from, setFrom] = useState('');
  const [gasLimit, setGasLimit] = useState('');
  const [fork, setFork] = useState(false);
  const [forkStatus, setForkStatus] = useState<ForkStatus>({ active: false });
  const [forkForm, setForkForm] = useState<ForkFormState>(initialForkForm);
  const [logs, setLogs] = useState<SandboxLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedFn: AbiFunctionDescription | undefined = useMemo(
    () => metadata?.functions.find((fn) => fn.name === selectedFunction),
    [metadata, selectedFunction]
  );

  const fetchHistory = async () => {
    const response = await fetch('http://localhost:4399/api/sandbox/contract/history');
    if (response.ok) {
      const data = (await response.json()) as SandboxLogEntry[];
      setLogs(data);
    }
  };

  const fetchForkStatus = async () => {
    const response = await fetch('http://localhost:4399/api/sandbox/fork/status');
    if (response.ok) {
      const data = (await response.json()) as ForkStatus;
      setForkStatus(data);
    }
  };

  useEffect(() => {
    void fetchHistory();
    void fetchForkStatus();
  }, []);

  const handleFileUpload = async (event: FormEvent<HTMLInputElement>) => {
    const file = (event.currentTarget.files ?? [])[0];
    if (!file) return;
    const text = await file.text();
    setAbiInput(text);
  };

  const handleLoadAbi = async () => {
    const response = await fetch('http://localhost:4399/api/sandbox/contract/abi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ abi: abiInput })
    });
    if (!response.ok) {
      setError('Failed to parse ABI');
      return;
    }
    const metadataResponse = (await response.json()) as AbiMetadata;
    setMetadata(metadataResponse);
    setSelectedFunction(metadataResponse.functions[0]?.name ?? '');
    setParameterValues({});
    setError(null);
  };

  const handleParameterChange = useCallback((name: string, value: string) => {
    setParameterValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const serializeParameters = () => {
    if (!selectedFn) return {};
    const output: Record<string, unknown> = {};
    selectedFn.inputs.forEach((input, index) => {
      const fallbackKey = `arg_${index}`;
      const key = input.name || fallbackKey;
      const rawValue = parameterValues[key];
      if (rawValue === undefined) {
        return;
      }
      try {
        output[key] = parseParameter(input.type, rawValue);
      } catch (err) {
        throw new Error(`Parameter ${key}: ${(err as Error).message}`);
      }
    });
    return output;
  };

  const handleSimulate = async () => {
    if (!metadata) {
      setError('Load an ABI first');
      return;
    }
    try {
      const sanitizedAddress = getAddress(contractAddress);
      setError(null);
      setLoading(true);
      const response = await fetch('http://localhost:4399/api/sandbox/contract/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abi: JSON.stringify(metadata.abi),
          rpcUrl,
          contractAddress: sanitizedAddress,
          functionName: selectedFunction,
          parameters: serializeParameters(),
          value: value || undefined,
          gasLimit: gasLimit || undefined,
          from: from || undefined,
          fork
        })
      });
      const data = (await response.json()) as SimulationResponse;
      setSimulationResult(data);
      void fetchHistory();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleReplay = async (entry: SandboxLogEntry) => {
    setContractAddress(entry.contractAddress);
    setSelectedFunction(entry.functionName);
    setGasLimit(entry.gasLimit ?? '');
    setFork(entry.forkMode);
    setRpcUrl(entry.rpcUrl ?? '');
    setValue(entry.value ?? '');
    const params = Object.entries(entry.parameters ?? {}).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = typeof value === 'string' ? value : JSON.stringify(value);
      return acc;
    }, {});
    setParameterValues(params);
    setSimulationResult(null);
  };

  const handleStartFork = async () => {
    const response = await fetch('http://localhost:4399/api/sandbox/fork/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rpcUrl: forkForm.rpcUrl,
        blockNumber: forkForm.blockNumber ? Number(forkForm.blockNumber) : undefined,
        port: forkForm.port ? Number(forkForm.port) : undefined,
        command: forkForm.command || undefined
      })
    });
    if (response.ok) {
      setForkStatus((await response.json()) as ForkStatus);
    }
  };

  const handleStopFork = async () => {
    const response = await fetch('http://localhost:4399/api/sandbox/fork/stop', {
      method: 'POST'
    });
    if (response.ok) {
      setForkStatus((await response.json()) as ForkStatus);
    }
  };

  const updateForkForm = (key: keyof ForkFormState, value: string) => {
    setForkForm((prev) => ({ ...prev, [key]: value }));
  };

  const traceData = simulationResult?.trace;
  const hasTraceData = traceData !== undefined && traceData !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold">1. Contract ABI</h2>
          <p className="mt-1 text-sm text-slate-500">Upload or paste contract ABI JSON.</p>
          <div className="mt-3 space-y-3">
            <textarea
              value={abiInput}
              onChange={(event) => setAbiInput(event.target.value)}
              rows={6}
              className="w-full rounded border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200"
              placeholder='[{ "inputs": [], "name": "foo" }]'
            />
            <input type="file" accept="application/json" onChange={handleFileUpload} />
            <button
              className="rounded bg-purple-500 px-3 py-2 text-sm font-semibold text-purple-950 hover:bg-purple-400"
              onClick={handleLoadAbi}
            >
              Load ABI
            </button>
          </div>
        </section>
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold">2. Function &amp; Parameters</h2>
          <div className="mt-3 space-y-3">
            <label className="text-sm text-slate-300">
              Contract Address
              <input
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                value={contractAddress}
                onChange={(event) => setContractAddress(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <label className="text-sm text-slate-300">
              RPC URL
              <input
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                value={rpcUrl}
                onChange={(event) => setRpcUrl(event.target.value)}
                placeholder="https://rpc.ankr.com/eth"
              />
            </label>
            <label className="text-sm text-slate-300">
              Function
              <select
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                value={selectedFunction}
                onChange={(event) => setSelectedFunction(event.target.value)}
              >
                {metadata?.functions.map((fn) => (
                  <option key={fn.name} value={fn.name}>
                    {fn.name} ({fn.stateMutability})
                  </option>
                ))}
              </select>
            </label>
            <ParameterForm fn={selectedFn} values={parameterValues} onChange={handleParameterChange} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-300">
                Value (wei or hex)
                <input
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="text-sm text-slate-300">
                Gas Limit
                <input
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                  value={gasLimit}
                  onChange={(event) => setGasLimit(event.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label className="text-sm text-slate-300">
                From Address (optional)
                <input
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  placeholder="0x..."
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={fork} onChange={(event) => setFork(event.target.checked)} />
                Run in Fork
              </label>
            </div>
            <button
              className="rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
              onClick={handleSimulate}
              disabled={loading}
            >
              {loading ? 'Simulating…' : 'Run Simulation'}
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </section>
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold">3. Local Fork</h2>
          <p className="mt-1 text-sm text-slate-500">Spawn an ephemeral fork for safe replay testing.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-300">
              Fork RPC URL
              <input
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                value={forkForm.rpcUrl}
                onChange={(event) => updateForkForm('rpcUrl', event.target.value)}
                placeholder="https://rpc.ankr.com/eth"
              />
            </label>
            <label className="text-sm text-slate-300">
              Block Number
              <input
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                value={forkForm.blockNumber}
                onChange={(event) => updateForkForm('blockNumber', event.target.value)}
                placeholder="Latest"
              />
            </label>
            <label className="text-sm text-slate-300">
              Port
              <input
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                value={forkForm.port}
                onChange={(event) => updateForkForm('port', event.target.value)}
              />
            </label>
            <label className="text-sm text-slate-300">
              Command
              <input
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                value={forkForm.command}
                onChange={(event) => updateForkForm('command', event.target.value)}
                placeholder="anvil"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              className="rounded bg-purple-500 px-3 py-2 text-sm font-semibold text-purple-950 hover:bg-purple-400"
              onClick={handleStartFork}
            >
              Start Fork
            </button>
            <button
              className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-600"
              onClick={handleStopFork}
            >
              Stop Fork
            </button>
            <span className="text-sm text-slate-400">
              Status: {forkStatus.active ? `Active at ${forkStatus.rpcUrl}` : 'Stopped'}
            </span>
          </div>
        </section>
      </div>
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold">Results</h2>
          {simulationResult ? (
            <div className="mt-3 space-y-3 text-sm text-slate-200">
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
                <span>Network: {simulationResult.network ? `${simulationResult.network.name} (#${simulationResult.network.chainId})` : 'Unknown'}</span>
                <span>Gas Estimate: {simulationResult.gasEstimate ?? 'n/a'}</span>
              </div>
              {simulationResult.error && <p className="text-sm text-red-400">{simulationResult.error}</p>}
              {simulationResult.revertReason && (
                <p className="text-sm text-orange-400">Revert: {simulationResult.revertReason}</p>
              )}
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Decoded Return</h3>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950/50 p-3 text-xs">
                  {JSON.stringify(simulationResult.decodedReturnData, null, 2)}
                </pre>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Raw Return</h3>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950/50 p-3 text-xs">
                  {JSON.stringify(simulationResult.returnData, null, 2)}
                </pre>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Calldata</h3>
                <pre className="mt-2 overflow-auto rounded bg-slate-950/50 p-3 text-xs">{simulationResult.callData}</pre>
              </div>
              {hasTraceData && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Trace</h3>
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950/50 p-3 text-xs">
                    {JSON.stringify(traceData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Run a simulation to view results.</p>
          )}
        </section>
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold">Sandbox History</h2>
          <LogViewer logs={logs} onReplay={handleReplay} />
        </section>
      </div>
    </div>
  );
};

export default SandboxPanel;
