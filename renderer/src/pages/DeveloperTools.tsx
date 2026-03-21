import { FormEvent, useMemo, useState } from 'react';

type AbiInput = { name?: string; type: string; indexed?: boolean };
type FunctionOption = { name: string; signature: string; stateMutability: string; inputs: AbiInput[] };
type EventOption = { name: string; signature: string; inputs: AbiInput[] };

type DiscoveryPayload = {
  contractName: string;
  functions: FunctionOption[];
  events: EventOption[];
};

const NETWORKS = [
  { label: 'Ethereum Mainnet (1)', value: 1 },
  { label: 'Sepolia (11155111)', value: 11155111 },
  { label: 'Base (8453)', value: 8453 },
  { label: 'Arbitrum One (42161)', value: 42161 }
];

const DeveloperTools = () => {
  const [tab, setTab] = useState<'gas' | 'scanner' | 'decoder'>('gas');
  const [network, setNetwork] = useState(1);

  const [gasAddress, setGasAddress] = useState('');
  const [discovery, setDiscovery] = useState<DiscoveryPayload | null>(null);
  const [selectedFunction, setSelectedFunction] = useState('');
  const [gasArgs, setGasArgs] = useState<Record<string, string>>({});
  const [gasResult, setGasResult] = useState<Record<string, unknown> | null>(null);
  const [gasError, setGasError] = useState<string>('');

  const [scanAddress, setScanAddress] = useState('');
  const [scanSource, setScanSource] = useState('');
  const [scanResult, setScanResult] = useState<{ findings: Array<Record<string, string>>; overallRiskScore: number } | null>(null);
  const [scanError, setScanError] = useState('');

  const [decodeMode, setDecodeMode] = useState<'txHash' | 'rawCalldata' | 'eventLog'>('txHash');
  const [decodeTxHash, setDecodeTxHash] = useState('');
  const [decodeAddress, setDecodeAddress] = useState('');
  const [decodeCalldata, setDecodeCalldata] = useState('');
  const [decodeEventData, setDecodeEventData] = useState('');
  const [decodeTopics, setDecodeTopics] = useState('');
  const [decodeResult, setDecodeResult] = useState<Record<string, unknown> | null>(null);
  const [decodeError, setDecodeError] = useState('');

  const selectedFn = useMemo(
    () => discovery?.functions.find((fn) => fn.signature === selectedFunction),
    [discovery, selectedFunction]
  );

  const loadContractDiscovery = async () => {
    setGasError('');
    const discovered = await window.gnoman.invoke<DiscoveryPayload>('devtools:discover', {
      address: gasAddress,
      chainId: network
    });
    setDiscovery(discovered);
    setSelectedFunction(discovered.functions[0]?.signature || '');
    setGasArgs({});
  };

  const estimateGas = async (event: FormEvent) => {
    event.preventDefault();
    setGasError('');
    setGasResult(null);
    if (!selectedFn) {
      setGasError('Select a function first.');
      return;
    }
    try {
      const payload = await window.gnoman.invoke<Record<string, unknown>>('devtools:gas:estimate', {
        address: gasAddress,
        chainId: network,
        functionSignature: selectedFn.signature,
        args: selectedFn.inputs.map((input, idx) => gasArgs[`${input.name || `arg${idx}`}:${idx}`] || '')
      });
      setGasResult(payload);
    } catch (error) {
      setGasError(error instanceof Error ? error.message : 'Gas estimation failed');
    }
  };

  const runScanner = async () => {
    setScanError('');
    setScanResult(null);
    try {
      const payload = await window.gnoman.invoke<{
        findings: Array<Record<string, string>>;
        overallRiskScore: number;
      }>('devtools:scanner:scan', {
        chainId: network,
        address: scanAddress || undefined,
        sourceCode: scanSource || undefined
      });
      setScanResult(payload);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Scan failed');
    }
  };

  const runDecode = async () => {
    setDecodeError('');
    setDecodeResult(null);
    try {
      const payload = await window.gnoman.invoke<Record<string, unknown>>('devtools:decoder:decode', {
        mode: decodeMode,
        chainId: network,
        txHash: decodeMode === 'txHash' ? decodeTxHash : undefined,
        address: decodeMode !== 'txHash' ? decodeAddress : undefined,
        calldata: decodeMode === 'rawCalldata' ? decodeCalldata : undefined,
        eventData: decodeMode === 'eventLog' ? decodeEventData : undefined,
        topics:
          decodeMode === 'eventLog'
            ? decodeTopics.split(',').map((item) => item.trim()).filter(Boolean)
            : undefined
      });
      setDecodeResult(payload);
    } catch (error) {
      setDecodeError(error instanceof Error ? error.message : 'Decode failed');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-emerald-400">Developer Tools</p>
        <h2 className="mt-2 text-xl font-semibold">GUI-driven contract tooling</h2>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {(['gas', 'scanner', 'decoder'] as const).map((tool) => (
            <button
              key={tool}
              type="button"
              onClick={() => setTab(tool)}
              className={`rounded px-3 py-1 ${tab === tool ? 'bg-emerald-500 text-emerald-950' : 'border border-slate-700 text-slate-200'}`}
            >
              {tool === 'gas' ? 'Gas Estimator' : tool === 'scanner' ? 'Contract Scanner' : 'ABI Decoder'}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm">
          <span className="text-slate-300">Network</span>
          <select value={network} onChange={(e) => setNetwork(Number(e.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2">
            {NETWORKS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
      </section>

      {tab === 'gas' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm">
          <h3 className="text-lg font-semibold">Gas Fee Estimator</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr,auto]">
            <input value={gasAddress} onChange={(e) => setGasAddress(e.target.value)} className="rounded border border-slate-700 bg-slate-900 p-2" placeholder="Contract Address" />
            <button type="button" onClick={() => loadContractDiscovery().catch((err) => setGasError(err.message))} className="rounded bg-emerald-500 px-4 py-2 font-semibold text-emerald-950">Load Contract</button>
          </div>
          {discovery && (
            <form className="mt-4 space-y-3" onSubmit={estimateGas}>
              <label className="block">
                <span className="text-slate-300">Function</span>
                <select value={selectedFunction} onChange={(e) => setSelectedFunction(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2">
                  {discovery.functions.map((fn) => <option key={fn.signature} value={fn.signature}>{fn.signature}</option>)}
                </select>
              </label>
              {selectedFn?.inputs.map((input, idx) => {
                const key = `${input.name || `arg${idx}`}:${idx}`;
                return (
                  <label key={key} className="block">
                    <span className="text-slate-300">{input.name || `arg${idx}`} ({input.type})</span>
                    <input value={gasArgs[key] || ''} onChange={(e) => setGasArgs((prev) => ({ ...prev, [key]: e.target.value }))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2" />
                  </label>
                );
              })}
              <button type="submit" className="rounded bg-blue-500 px-4 py-2 font-semibold text-blue-950">Estimate Gas</button>
            </form>
          )}
          {gasError && <p className="mt-3 text-red-400">{gasError}</p>}
          {gasResult && (
            <div className="mt-4 grid gap-2 rounded border border-slate-800 bg-slate-950/60 p-3 text-xs">
              <p>Estimated Gas Limit: {String(gasResult.estimateGasLimit)}</p>
              <p>Base Fee (wei): {String(gasResult.baseFeePerGasWei)}</p>
              <p>Priority Fee (wei): {String(gasResult.priorityFeePerGasWei)}</p>
              <p>Max Fee (wei): {String(gasResult.maxFeePerGasWei)}</p>
              <p>Estimated Cost (ETH): {String(gasResult.estimatedCostEth)}</p>
              <p>Estimated Cost (USD): {gasResult.estimatedCostUsd ? String(gasResult.estimatedCostUsd) : 'N/A'}</p>
            </div>
          )}
        </section>
      )}

      {tab === 'scanner' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm">
          <h3 className="text-lg font-semibold">Smart Contract Vulnerability Scanner</h3>
          <input value={scanAddress} onChange={(e) => setScanAddress(e.target.value)} className="mt-3 w-full rounded border border-slate-700 bg-slate-900 p-2" placeholder="Contract Address (optional if source pasted)" />
          <textarea value={scanSource} onChange={(e) => setScanSource(e.target.value)} className="mt-3 w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-xs" rows={8} placeholder="Paste Solidity Source (optional if contract address set)" />
          <button type="button" onClick={() => runScanner().catch(() => undefined)} className="mt-3 rounded bg-emerald-500 px-4 py-2 font-semibold text-emerald-950">Scan Contract</button>
          {scanError && <p className="mt-3 text-red-400">{scanError}</p>}
          {scanResult && (
            <div className="mt-4 overflow-x-auto">
              <p className="mb-2 text-xs text-emerald-300">Overall Risk Score: {scanResult.overallRiskScore}</p>
              <table className="w-full text-left text-xs">
                <thead><tr className="text-slate-300"><th>Severity</th><th>Vulnerability</th><th>Location</th><th>Description</th><th>Fix Recommendation</th></tr></thead>
                <tbody>
                  {scanResult.findings.map((finding, idx) => (
                    <tr key={`${finding.vulnerability}-${idx}`} className="border-t border-slate-800">
                      <td className="py-2">{finding.severity}</td><td>{finding.vulnerability}</td><td>{finding.location}</td><td>{finding.description}</td><td>{finding.fixRecommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'decoder' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm">
          <h3 className="text-lg font-semibold">ABI Decoder</h3>
          <label className="block">
            <span className="text-slate-300">Decode Mode</span>
            <select value={decodeMode} onChange={(e) => setDecodeMode(e.target.value as 'txHash' | 'rawCalldata' | 'eventLog')} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2">
              <option value="txHash">Transaction Hash</option>
              <option value="rawCalldata">Raw Calldata</option>
              <option value="eventLog">Event Log</option>
            </select>
          </label>
          {decodeMode === 'txHash' && <input value={decodeTxHash} onChange={(e) => setDecodeTxHash(e.target.value)} className="mt-3 w-full rounded border border-slate-700 bg-slate-900 p-2" placeholder="Transaction Hash" />}
          {decodeMode === 'rawCalldata' && (
            <>
              <input value={decodeAddress} onChange={(e) => setDecodeAddress(e.target.value)} className="mt-3 w-full rounded border border-slate-700 bg-slate-900 p-2" placeholder="Contract Address" />
              <textarea value={decodeCalldata} onChange={(e) => setDecodeCalldata(e.target.value)} className="mt-3 w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-xs" rows={5} placeholder="Calldata" />
            </>
          )}
          {decodeMode === 'eventLog' && (
            <>
              <input value={decodeAddress} onChange={(e) => setDecodeAddress(e.target.value)} className="mt-3 w-full rounded border border-slate-700 bg-slate-900 p-2" placeholder="Contract Address" />
              <textarea value={decodeEventData} onChange={(e) => setDecodeEventData(e.target.value)} className="mt-3 w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-xs" rows={3} placeholder="Event data" />
              <input value={decodeTopics} onChange={(e) => setDecodeTopics(e.target.value)} className="mt-3 w-full rounded border border-slate-700 bg-slate-900 p-2" placeholder="Topics (comma separated)" />
            </>
          )}
          <button type="button" onClick={() => runDecode().catch(() => undefined)} className="mt-3 rounded bg-emerald-500 px-4 py-2 font-semibold text-emerald-950">Decode</button>
          {decodeError && <p className="mt-3 text-red-400">{decodeError}</p>}
          {decodeResult && <pre className="mt-4 overflow-x-auto rounded border border-slate-800 bg-slate-950/60 p-3 text-xs">{JSON.stringify(decodeResult, null, 2)}</pre>}
        </section>
      )}
    </div>
  );
};

export default DeveloperTools;
