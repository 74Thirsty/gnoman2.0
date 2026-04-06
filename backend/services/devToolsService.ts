import { Interface, ethers } from 'ethers';
import { abiResolver } from '../utils/abiResolver';
import { createRpcProvider } from './rpcService';
import { http } from '../utils/http';
import { secretsResolver } from '../utils/secretsResolver';

const normalizeChainId = (chainId?: number) => {
  const parsed = Number(chainId ?? process.env.ETHERSCAN_CHAIN_ID ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
};

type AbiFragment = Record<string, unknown>;

type ScanFinding = {
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  vulnerability: string;
  location: string;
  description: string;
  fixRecommendation: string;
};

const getProvider = async (chainId?: number) => createRpcProvider({ chainId });

export const discoverContract = async (address: string, chainId?: number) => {
  const resolved = await abiResolver.resolve(normalizeChainId(chainId), address);
  const functions = resolved.abi
    .filter((entry): entry is AbiFragment => Boolean(entry && typeof entry === 'object' && (entry as { type?: string }).type === 'function'))
    .map((entry) => ({
      name: String(entry.name ?? 'unknown'),
      signature: `${String(entry.name ?? 'unknown')}(${Array.isArray(entry.inputs) ? entry.inputs.map((input) => (input as { type?: string }).type ?? '').join(',') : ''})`,
      stateMutability: String(entry.stateMutability ?? 'nonpayable'),
      inputs: Array.isArray(entry.inputs) ? entry.inputs : []
    }));
  const events = resolved.abi
    .filter((entry): entry is AbiFragment => Boolean(entry && typeof entry === 'object' && (entry as { type?: string }).type === 'event'))
    .map((entry) => ({
      name: String(entry.name ?? 'unknown'),
      signature: `${String(entry.name ?? 'unknown')}(${Array.isArray(entry.inputs) ? entry.inputs.map((input) => (input as { type?: string }).type ?? '').join(',') : ''})`,
      inputs: Array.isArray(entry.inputs) ? entry.inputs : []
    }));

  return {
    address,
    chainId: normalizeChainId(chainId),
    contractName: resolved.contractName,
    verified: resolved.verified,
    source: resolved.source,
    abi: resolved.abi,
    functions,
    events
  };
};

const coerceArg = (type: string, value: string): unknown => {
  if (type.endsWith('[]')) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => coerceArg(type.slice(0, -2), item));
  }
  if (type.startsWith('uint') || type.startsWith('int')) {
    return BigInt(value);
  }
  if (type === 'bool') {
    return value === 'true' || value === '1';
  }
  if (type === 'bytes' || type.startsWith('bytes')) {
    return value;
  }
  return value;
};

export const estimateGasForFunction = async (params: {
  chainId?: number;
  address: string;
  functionSignature: string;
  args: string[];
  from?: string;
  value?: string;
}) => {
  const chainId = normalizeChainId(params.chainId);
  const contractInfo = await discoverContract(params.address, chainId);
  const provider = await getProvider(chainId);
  const iface = new Interface(contractInfo.abi as ethers.InterfaceAbi);
  const fragment = iface.getFunction(params.functionSignature);
  if (!fragment) {
    throw new Error(`Function not found in ABI: ${params.functionSignature}`);
  }
  const typedArgs = fragment.inputs.map((input, idx) => coerceArg(input.type, params.args[idx] ?? ''));
  const data = iface.encodeFunctionData(fragment, typedArgs);

  const tx = {
    to: ethers.getAddress(params.address),
    data,
    from: params.from ? ethers.getAddress(params.from) : undefined,
    value: params.value ? BigInt(params.value) : undefined
  };

  const [estimate, feeData, block] = await Promise.all([
    provider.estimateGas(tx),
    provider.getFeeData(),
    provider.getBlock('latest')
  ]);

  const feeHistory = await (provider.send('eth_feeHistory', ['0x5', 'latest', [10, 50, 90]]) as Promise<{ baseFeePerGas: string[]; reward: string[][] }>)
    .catch(() => ({ baseFeePerGas: [], reward: [] }));

  const priorityFee = feeData.maxPriorityFeePerGas ?? (feeHistory.reward?.at(-1)?.[1] ? BigInt(feeHistory.reward.at(-1)![1]) : 1_500_000_000n);
  const latestBaseFee = feeHistory.baseFeePerGas?.at(-1) ? BigInt(feeHistory.baseFeePerGas.at(-1)!) : null;
  const baseFee = latestBaseFee ?? block?.baseFeePerGas ?? feeData.gasPrice ?? 0n;
  const maxFee = feeData.maxFeePerGas ?? baseFee + priorityFee;
  const totalWei = estimate * maxFee;

  return {
    functionSignature: params.functionSignature,
    encodedData: data,
    estimateGasLimit: estimate.toString(),
    baseFeePerGasWei: baseFee.toString(),
    priorityFeePerGasWei: priorityFee.toString(),
    maxFeePerGasWei: maxFee.toString(),
    estimatedCostWei: totalWei.toString(),
    estimatedCostEth: ethers.formatEther(totalWei),
    estimatedCostUsd: null,
    feeHistory
  };
};

const getEtherscanApiKey = async () => secretsResolver.resolve('ETHERSCAN_API_KEY', { required: false, failClosed: false });

export const fetchSourceCode = async (address: string, chainId?: number) => {
  const key = await getEtherscanApiKey();
  if (!key) {
    throw new Error('ETHERSCAN_API_KEY required for source retrieval by address.');
  }
  const response = await http.get<{ result?: Array<{ SourceCode?: string; ContractName?: string }> }>('', {
    params: {
      module: 'contract',
      action: 'getsourcecode',
      address: ethers.getAddress(address),
      chainid: normalizeChainId(chainId),
      apikey: key
    }
  });
  const sourceCode = response.data?.result?.[0]?.SourceCode;
  if (!sourceCode?.trim()) {
    throw new Error('Verified source code unavailable for contract address.');
  }
  return {
    sourceCode,
    contractName: response.data?.result?.[0]?.ContractName || 'Unknown'
  };
};

const scanPatterns: Array<{ regex: RegExp; finding: Omit<ScanFinding, 'location'> }> = [
  { regex: /\.call\s*\{/g, finding: { severity: 'High', vulnerability: 'Unchecked external call', description: 'Low-level call detected; return value/error handling may be unsafe.', fixRecommendation: 'Validate call success and prefer structured interfaces.' } },
  { regex: /delegatecall\s*\(/g, finding: { severity: 'Critical', vulnerability: 'Delegatecall usage', description: 'delegatecall can corrupt storage context and bypass access boundaries.', fixRecommendation: 'Restrict delegatecall targets via immutable allowlist and strict auth.' } },
  { regex: /tx\.origin/g, finding: { severity: 'High', vulnerability: 'tx.origin authentication', description: 'tx.origin authorization is phishable and unsafe.', fixRecommendation: 'Use msg.sender with robust role-based access control.' } },
  { regex: /selfdestruct\s*\(/g, finding: { severity: 'Critical', vulnerability: 'Selfdestruct exposure', description: 'selfdestruct path may allow irreversible code/account state changes.', fixRecommendation: 'Remove selfdestruct or gate permanently with governance timelocks.' } },
  { regex: /block\.timestamp/g, finding: { severity: 'Low', vulnerability: 'Timestamp dependency', description: 'Miner/validator-influenced timestamps used in logic.', fixRecommendation: 'Use bounded windows and avoid exact-time assumptions.' } },
  { regex: /reentranc/i, finding: { severity: 'Info', vulnerability: 'Reentrancy marker', description: 'Reentrancy-related code path detected; review CEI and mutex patterns.', fixRecommendation: 'Apply CEI + reentrancy guard around external calls.' } },
  { regex: /unchecked\s*\{/g, finding: { severity: 'Medium', vulnerability: 'Unchecked arithmetic block', description: 'Unchecked block bypasses overflow checks.', fixRecommendation: 'Use unchecked only with proven bounds and comments/invariants.' } },
  { regex: /onlyOwner|Ownable/g, finding: { severity: 'Info', vulnerability: 'Centralized access-control primitive', description: 'Privileged owner path present; ensure key management + timelock.', fixRecommendation: 'Prefer multi-sig/timelock for privileged operations.' } },
  { regex: /upgradeTo|upgradeToAndCall|UUPS|TransparentUpgradeableProxy/g, finding: { severity: 'Medium', vulnerability: 'Upgradeable pattern detected', description: 'Upgradeable architecture introduces storage collision/init risks.', fixRecommendation: 'Validate initializer guards and storage slot compatibility.' } },
  { regex: /mapping\s*\(.*=>\s*address\)/g, finding: { severity: 'Low', vulnerability: 'Potential uninitialized storage/mapping usage', description: 'State mappings require explicit invariant checks for zero-value defaults.', fixRecommendation: 'Validate sentinel values and initialization assumptions.' } }
];

export const scanSourceCode = (sourceCode: string) => {
  const findings: ScanFinding[] = [];
  const lines = sourceCode.split('\n');
  for (const rule of scanPatterns) {
    for (let i = 0; i < lines.length; i += 1) {
      if (rule.regex.test(lines[i])) {
        findings.push({ ...rule.finding, location: `line ${i + 1}` });
      }
      rule.regex.lastIndex = 0;
    }
  }

  const riskWeights: Record<ScanFinding['severity'], number> = { Critical: 25, High: 15, Medium: 8, Low: 3, Info: 1 };
  const total = findings.reduce((acc, item) => acc + riskWeights[item.severity], 0);
  const overallRiskScore = Math.min(100, total);

  return {
    findings,
    overallRiskScore
  };
};

export const decodePayload = async (params: {
  mode: 'txHash' | 'rawCalldata' | 'eventLog';
  chainId?: number;
  txHash?: string;
  address?: string;
  calldata?: string;
  topics?: string[];
  eventData?: string;
}) => {
  const provider = await getProvider(params.chainId);

  if (params.mode === 'txHash') {
    if (!params.txHash) {
      throw new Error('txHash is required for txHash mode.');
    }
    const tx = await provider.getTransaction(params.txHash);
    if (!tx || !tx.to || !tx.data) {
      throw new Error('Transaction not found or missing calldata.');
    }
    const contract = await discoverContract(tx.to, params.chainId);
    const iface = new Interface(contract.abi as ethers.InterfaceAbi);
    const parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
    if (!parsed) {
      throw new Error('Unable to decode transaction calldata with resolved ABI.');
    }
    return {
      contractAddress: tx.to,
      functionCalled: parsed.signature,
      decodedParameters: parsed.fragment.inputs.map((input, idx) => ({ name: input.name || `arg${idx}`, type: input.type, value: parsed.args[idx]?.toString?.() ?? String(parsed.args[idx]) }))
    };
  }

  if (!params.address) {
    throw new Error('address is required.');
  }

  const contract = await discoverContract(params.address, params.chainId);
  const iface = new Interface(contract.abi as ethers.InterfaceAbi);

  if (params.mode === 'rawCalldata') {
    if (!params.calldata) {
      throw new Error('calldata is required for rawCalldata mode.');
    }
    const parsed = iface.parseTransaction({ data: params.calldata });
    if (!parsed) {
      throw new Error('Unable to decode calldata with resolved ABI.');
    }
    return {
      contractAddress: params.address,
      functionCalled: parsed.signature,
      decodedParameters: parsed.fragment.inputs.map((input, idx) => ({ name: input.name || `arg${idx}`, type: input.type, value: parsed.args[idx]?.toString?.() ?? String(parsed.args[idx]) }))
    };
  }

  if (!params.topics || !params.eventData) {
    throw new Error('topics and eventData are required for eventLog mode.');
  }
  const parsedLog = iface.parseLog({ topics: params.topics, data: params.eventData });
  return {
    contractAddress: params.address,
    eventName: parsedLog?.name,
    decodedParameters: parsedLog?.fragment.inputs.map((input, idx) => ({ name: input.name || `arg${idx}`, type: input.type, value: parsedLog.args[idx]?.toString?.() ?? String(parsedLog.args[idx]) })) ?? []
  };
};
