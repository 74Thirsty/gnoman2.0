import { ethers } from 'ethers';
import { holdService } from './transactionHoldService';
import { getBalance, requireRpcUrl } from './rpcService';
import { runtimeTelemetry } from './runtimeTelemetryService';
import { listContracts, type ContractRecord } from './contractRegistryService';
import { safeConfigRepository, type PersistedSafePayload } from './safeConfigRepository';

export interface SafeDelegate {
  address: string;
  label: string;
  since: string;
}

interface SafeState {
  address: string;
  rpcUrl: string;
  owners: string[];
  threshold: number;
  modules: string[];
  delegates: SafeDelegate[];
  fallbackHandler?: string;
  guard?: string;
  network?: string;
  safeVersion?: string;
  mastercopyAddress?: string;
  transactions: Map<string, SafeTransaction>;
}

export interface SafeTransaction {
  hash: string;
  payload: unknown;
  approvals: string[];
  createdAt: string;
  meta?: Record<string, unknown>;
  executed: boolean;
}

export interface SafeExecutionCall {
  target: string;
  data: string;
  value: string;
}

export interface SafeBatchPayload {
  kind: 'batch';
  calls: SafeExecutionCall[];
  value: string;
  operation: number;
  methodSignature: string;
}

export interface DiscoveredAllowance {
  token: string;
  spender: string;
  allowance: string;
}

export interface AllowanceDiscoveryOptions {
  whitelist?: string[];
  minimumAllowance?: string;
  chunkSize?: number;
}

export interface AllowanceDiscoveryResult {
  approvals: DiscoveredAllowance[];
  unsupported: { token: string; spender?: string; reason: string }[];
}

export interface AllowanceRevokeBatch {
  txHash: string;
  calls: SafeExecutionCall[];
  existing: boolean;
}

export interface AllowanceRevokeProposalResult extends AllowanceDiscoveryResult {
  batches: AllowanceRevokeBatch[];
}

const safeStore = new Map<string, SafeState>();

const SAFE_MODULE_PAGE_SIZE = 50;
const SAFE_MODULE_SENTINEL = '0x0000000000000000000000000000000000000001';

const SAFE_ABI = [
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
  'function getModulesPaginated(address,uint256) view returns (address[] memory, address)',
  'function getFallbackHandler() view returns (address)',
  'function getGuard() view returns (address)',
  'function VERSION() view returns (string)',
  'function masterCopy() view returns (address)'
];

const ERC20_ALLOWANCE_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

const ERC20_ALLOWANCE_INTERFACE = new ethers.Interface(ERC20_ALLOWANCE_ABI);
const APPROVE_SELECTOR = ERC20_ALLOWANCE_INTERFACE.getFunction('approve')?.selector ?? '0x095ea7b3';
const DEFAULT_REVOKE_BATCH_SIZE = 50;
const MAX_REVOKE_BATCH_SIZE = 200;
const BATCH_METHOD_SIGNATURE = 'batch((address target,bytes data,uint256 value)[] calls)';

const loadModules = async (contract: ethers.Contract) => {
  const modules: string[] = [];
  let next = SAFE_MODULE_SENTINEL;
  while (true) {
    const [page, nextModule] = (await contract.getModulesPaginated(
      next,
      SAFE_MODULE_PAGE_SIZE
    )) as [string[], string];
    if (!page.length) {
      break;
    }
    modules.push(...page);
    if (nextModule.toLowerCase() === SAFE_MODULE_SENTINEL.toLowerCase()) {
      break;
    }
    next = nextModule;
  }
  return modules.map((module) => ethers.getAddress(module));
};

const normalizeAddress = (value: string) => ethers.getAddress(value);

const normalizeMaybeAddress = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  try {
    return normalizeAddress(value);
  } catch (error) {
    console.error(JSON.stringify({ event: 'SAFE_NORMALIZE_ADDRESS_FAILED', reason: 'invalid-address', value }));
    return undefined;
  }
};

const normalizeOptionalAddress = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = normalizeAddress(trimmed);
  if (normalized === ethers.ZeroAddress) {
    return undefined;
  }
  return normalized;
};

const stableAddressSort = (left: string, right: string) => left.toLowerCase().localeCompare(right.toLowerCase());

const normalizeBatchSize = (value?: number) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_REVOKE_BATCH_SIZE;
  }
  return Math.max(1, Math.min(Math.trunc(value as number), MAX_REVOKE_BATCH_SIZE));
};

const isRegisteredTokenContract = (contract: ContractRecord) => {
  const type = contract.type?.toLowerCase();
  const tags = (contract.tags ?? []).map((tag) => tag.toLowerCase());
  if (type === 'token' || type === 'erc20' || tags.includes('token') || tags.includes('erc20')) {
    return true;
  }
  const signatures = new Set((contract.abiFunctions ?? []).map((fn) => fn.signature.replace(/\s+/g, '')));
  return signatures.has('allowance(address,address)') && signatures.has('approve(address,uint256)');
};

const extractCallsFromPayload = (payload: unknown): SafeExecutionCall[] => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const record = payload as Record<string, unknown>;
  if (record.kind === 'batch' && Array.isArray(record.calls)) {
    return record.calls.flatMap((call) => {
      if (!call || typeof call !== 'object') {
        return [];
      }
      const target = typeof (call as Record<string, unknown>).target === 'string' ? normalizeMaybeAddress((call as Record<string, unknown>).target as string) : undefined;
      const data = typeof (call as Record<string, unknown>).data === 'string' ? (call as Record<string, unknown>).data as string : undefined;
      const value = (call as Record<string, unknown>).value;
      if (!target || !data) {
        return [];
      }
      return [{ target, data, value: typeof value === 'string' ? value : String(value ?? '0') } satisfies SafeExecutionCall];
    });
  }
  const target = typeof record.to === 'string' ? normalizeMaybeAddress(record.to) : undefined;
  const data = typeof record.data === 'string' ? record.data : undefined;
  const value = record.value;
  if (!target || !data) {
    return [];
  }
  return [{ target, data, value: typeof value === 'string' ? value : String(value ?? '0') } satisfies SafeExecutionCall];
};

const decodeApproveCall = (call: SafeExecutionCall) => {
  if (!call.data.startsWith(APPROVE_SELECTOR)) {
    return undefined;
  }
  try {
    const [spender] = ERC20_ALLOWANCE_INTERFACE.decodeFunctionData('approve', call.data);
    return {
      token: call.target,
      spender: normalizeAddress(spender)
    };
  } catch (error) {
    console.error(JSON.stringify({ event: 'SAFE_DECODE_APPROVE_FAILED', target: call.target, reason: String(error) }));
    return undefined;
  }
};

const collectHistoricalApprovals = (safe: SafeState) => {
  const approvals: { token: string; spender: string }[] = [];
  for (const transaction of safe.transactions.values()) {
    const calls = extractCallsFromPayload(transaction.payload);
    for (const call of calls) {
      const decoded = decodeApproveCall(call);
      if (decoded) {
        approvals.push(decoded);
      }
    }
  }
  return approvals.sort((left, right) => {
    const tokenCmp = stableAddressSort(left.token, right.token);
    if (tokenCmp !== 0) {
      return tokenCmp;
    }
    return stableAddressSort(left.spender, right.spender);
  });
};

const buildAllowanceCandidateSets = (safe: SafeState, whitelist?: string[]) => {
  const historicalApprovals = collectHistoricalApprovals(safe);
  const contracts = listContracts();
  const registeredTokens = contracts.filter(isRegisteredTokenContract).map((contract) => normalizeAddress(contract.address));
  const registeredSpenders = contracts
    .filter((contract) => !isRegisteredTokenContract(contract))
    .map((contract) => normalizeAddress(contract.address));
  const tokenSet = new Set<string>(registeredTokens);
  const spenderSet = new Set<string>(registeredSpenders);
  const tokenToSpenders = new Map<string, Set<string>>();

  for (const approval of historicalApprovals) {
    tokenSet.add(approval.token);
    spenderSet.add(approval.spender);
    const existing = tokenToSpenders.get(approval.token) ?? new Set<string>();
    existing.add(approval.spender);
    tokenToSpenders.set(approval.token, existing);
  }

  const normalizedWhitelist = whitelist?.map((entry) => normalizeAddress(entry)).sort(stableAddressSort);
  const whitelistSet = normalizedWhitelist ? new Set(normalizedWhitelist) : undefined;
  const spenderCandidates = Array.from(spenderSet).filter((spender) => !whitelistSet || whitelistSet.has(spender)).sort(stableAddressSort);

  return {
    tokens: Array.from(tokenSet).sort(stableAddressSort),
    spenderCandidates,
    tokenToSpenders,
    whitelistSet
  };
};

const readAllowance = async (provider: ethers.JsonRpcProvider, token: string, owner: string, spender: string) => {
  const result = await provider.call({
    to: token,
    data: ERC20_ALLOWANCE_INTERFACE.encodeFunctionData('allowance', [owner, spender])
  });
  const [allowance] = ERC20_ALLOWANCE_INTERFACE.decodeFunctionResult('allowance', result);
  return allowance as bigint;
};

const validateApproveZero = async (provider: ethers.JsonRpcProvider, token: string, owner: string, spender: string) => {
  await provider.call({
    to: token,
    from: owner,
    data: ERC20_ALLOWANCE_INTERFACE.encodeFunctionData('approve', [spender, 0n])
  });
};

const buildRevokeCall = ({ token, spender }: Pick<DiscoveredAllowance, 'token' | 'spender'>): SafeExecutionCall => ({
  target: token,
  data: ERC20_ALLOWANCE_INTERFACE.encodeFunctionData('approve', [spender, 0n]),
  value: '0'
});

const chunkExecutionCalls = (calls: SafeExecutionCall[], size: number) => {
  const chunks: SafeExecutionCall[][] = [];
  for (let start = 0; start < calls.length; start += size) {
    chunks.push(calls.slice(start, start + size));
  }
  return chunks;
};

const createOrReuseProposal = async (
  safe: SafeState,
  tx: unknown,
  meta?: Record<string, unknown>
) => {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(tx)));
  const existing = safe.transactions.get(hash);
  if (existing) {
    if (meta) {
      existing.meta = { ...(existing.meta ?? {}), ...meta };
      persistSafes();
    }
    return { proposal: existing, existing: true };
  }

  const proposal: SafeTransaction = {
    hash,
    payload: tx,
    approvals: [],
    createdAt: new Date().toISOString(),
    executed: false,
    meta
  };
  safe.transactions.set(hash, proposal);
  await holdService.createHold(hash, safe.address);
  persistSafes();
  return { proposal, existing: false };
};

const loadOptionalSafeConfig = async (contract: ethers.Contract) => {
  let fallbackHandler: string | undefined;
  let guard: string | undefined;
  try {
    fallbackHandler = normalizeOptionalAddress((await contract.getFallbackHandler()) as string);
  } catch (error) {
    console.error(JSON.stringify({ event: 'SAFE_OPTIONAL_CONFIG_READ_FAILED', fn: 'getFallbackHandler', reason: String(error) }));
  }
  try {
    guard = normalizeOptionalAddress((await contract.getGuard()) as string);
  } catch (error) {
    console.error(JSON.stringify({ event: 'SAFE_OPTIONAL_CONFIG_READ_FAILED', fn: 'getGuard', reason: String(error) }));
  }
  return { fallbackHandler, guard };
};

const refreshSafeOnchainState = async (safe: SafeState) => {
  try {
    const provider = new ethers.JsonRpcProvider(safe.rpcUrl);
    const contract = new ethers.Contract(safe.address, SAFE_ABI, provider);
    const [owners, threshold, modules, optionalConfig] = await Promise.all([
      contract.getOwners() as Promise<string[]>,
      contract.getThreshold() as Promise<bigint>,
      loadModules(contract),
      loadOptionalSafeConfig(contract)
    ]);
    safe.owners = owners.map((owner) => ethers.getAddress(owner));
    safe.threshold = Number(threshold);
    safe.modules = modules;
    safe.fallbackHandler = optionalConfig.fallbackHandler ?? safe.fallbackHandler;
    safe.guard = optionalConfig.guard ?? safe.guard;
    try {
      safe.safeVersion = (await contract.VERSION()) as string;
    } catch (error) {
      console.error(JSON.stringify({ event: 'SAFE_VERSION_READ_FAILED', reason: String(error) }));
      safe.safeVersion = safe.safeVersion ?? 'unknown';
    }
    try {
      safe.mastercopyAddress = normalizeOptionalAddress((await contract.masterCopy()) as string);
    } catch (error) {
      console.error(JSON.stringify({ event: 'SAFE_MASTERCOPY_READ_FAILED', reason: String(error) }));
      safe.mastercopyAddress = safe.mastercopyAddress;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to load Safe onchain state: ${message}`);
  }
};

const loadSafes = () => {
  console.info(JSON.stringify({ event: 'TRACE enter fn=loadSafes' }));
  try {
    const payload = safeConfigRepository.load();
    const safes = payload.safes;
    safeStore.clear();
    for (const safe of safes) {
      try {
        const normalizedSafeAddress = normalizeAddress(safe.address);
        const transactions = new Map(
          (safe.transactions ?? []).flatMap((tx) => {
            if (!tx?.hash) {
              console.error(JSON.stringify({ event: 'CONFIG_EARLY_RETURN', fn: 'loadSafes.transaction', reason: 'missing_hash', safeAddress: safe.address }));
              return [];
            }
            return [[tx.hash, { ...tx } satisfies SafeTransaction]];
          })
        );
        const normalizedOwners = (safe.owners ?? [])
          .map((owner) => normalizeMaybeAddress(owner))
          .filter((owner): owner is string => Boolean(owner));
        const normalizedModules = (safe.modules ?? [])
          .map((module) => normalizeMaybeAddress(module))
          .filter((module): module is string => Boolean(module));
        const normalizedDelegates = (safe.delegates ?? [])
          .map((delegate) => {
            const normalizedDelegateAddress = normalizeMaybeAddress(delegate?.address);
            if (!normalizedDelegateAddress) {
              console.error(JSON.stringify({ event: 'CONFIG_EARLY_RETURN', fn: 'loadSafes.delegate', reason: 'invalid_delegate_address', safeAddress: safe.address }));
              return undefined;
            }
            return {
              address: normalizedDelegateAddress,
              label: delegate.label ?? 'Delegate',
              since: delegate.since ?? new Date(0).toISOString()
            };
          })
          .filter((delegate): delegate is SafeDelegate => Boolean(delegate));

        safeStore.set(normalizedSafeAddress.toLowerCase(), {
          address: normalizedSafeAddress,
          rpcUrl: safe.rpcUrl,
          owners: normalizedOwners,
          threshold: safe.threshold ?? 1,
          modules: normalizedModules,
          delegates: normalizedDelegates,
          fallbackHandler: normalizeMaybeAddress(safe.fallbackHandler),
          guard: normalizeMaybeAddress(safe.guard),
          network: safe.network,
          transactions
        });
      } catch (entryError) {
        console.error('Skipping invalid persisted safe entry', entryError);
      }
    }
    console.info(JSON.stringify({ event: 'TRACE exit fn=loadSafes ok=true', loadedSafes: safeStore.size }));
  } catch (error) {
    console.error('Failed to load safes from disk', error);
    console.error(JSON.stringify({ event: 'TRACE exit fn=loadSafes ok=false', reason: error instanceof Error ? error.message : String(error) }));
  }
};

const persistSafes = () => {
  console.info(JSON.stringify({ event: 'TRACE enter fn=persistSafes', safeCount: safeStore.size }));
  try {
    const payload: PersistedSafePayload = {
      version: 1,
      safes: Array.from(safeStore.values()).map((safe) => ({
        address: safe.address,
        rpcUrl: safe.rpcUrl,
        owners: [...safe.owners],
        threshold: safe.threshold,
        modules: [...safe.modules],
        delegates: safe.delegates.map((delegate) => ({ ...delegate })),
        fallbackHandler: safe.fallbackHandler,
        guard: safe.guard,
        network: safe.network,
        transactions: Array.from(safe.transactions.values()).map((tx) => ({ ...tx }))
      }))
    };
    safeConfigRepository.save(payload);
    console.info(JSON.stringify({ event: 'TRACE exit fn=persistSafes ok=true' }));
  } catch (error) {
    console.error('Failed to persist safes', error);
    console.error(JSON.stringify({ event: 'TRACE exit fn=persistSafes ok=false', reason: error instanceof Error ? error.message : String(error) }));
  }
};

loadSafes();

const getOrCreateSafe = (address: string, rpcUrl: string): SafeState => {
  const normalizedAddress = normalizeAddress(address);
  const key = normalizedAddress.toLowerCase();
  let safe = safeStore.get(key);
  if (!safe) {
    safe = {
      address: normalizedAddress,
      rpcUrl,
      owners: [],
      threshold: 1,
      modules: [],
      delegates: [],
      fallbackHandler: undefined,
      guard: undefined,
      transactions: new Map()
    };
    safeStore.set(key, safe);
    persistSafes();
  } else if (safe.rpcUrl !== rpcUrl) {
    safe.rpcUrl = rpcUrl;
    persistSafes();
  }
  return safe;
};

export const connectToSafe = async (address: string, rpcUrl?: string) => {
  const normalizedAddress = normalizeAddress(address);
  const cachedSafe = safeStore.get(normalizedAddress.toLowerCase());
  const cachedRpcUrl = cachedSafe?.rpcUrl;
  const resolvedRpcUrl = await requireRpcUrl(rpcUrl ?? cachedRpcUrl);
  const provider = new ethers.JsonRpcProvider(resolvedRpcUrl);
  const network = await provider.getNetwork();
  const safe = getOrCreateSafe(normalizedAddress, resolvedRpcUrl);
  await refreshSafeOnchainState(safe);
  safe.network = network.name ?? `${network.chainId}`;
  persistSafes();
  const balance = await getBalance(safe.address, safe.rpcUrl);
  runtimeTelemetry.setSafeRuntime({
    version: safe.threshold ? '1.3.x-compatible' : 'unknown',
    mastercopyAddress: safe.fallbackHandler,
    moduleEnabled: safe.modules.length > 0
  });
  return {
    address: safe.address,
    threshold: safe.threshold,
    owners: safe.owners,
    modules: safe.modules,
    rpcUrl: safe.rpcUrl,
    delegates: safe.delegates,
    fallbackHandler: safe.fallbackHandler,
    guard: safe.guard,
    network: safe.network,
    balance
  };
};

export const getOwners = async (address: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  return safe.owners;
};

export const addOwner = async (address: string, owner: string, threshold: number) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  const normalizedOwner = normalizeAddress(owner);
  if (!safe.owners.some((existing) => existing.toLowerCase() === normalizedOwner.toLowerCase())) {
    safe.owners.push(normalizedOwner);
  }
  safe.threshold = threshold;
  persistSafes();
  return { owners: safe.owners, threshold: safe.threshold };
};

export const removeOwner = async (address: string, owner: string, threshold: number) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  const normalizedOwner = normalizeAddress(owner);
  safe.owners = safe.owners.filter(
    (existing) => existing.toLowerCase() !== normalizedOwner.toLowerCase()
  );
  safe.threshold = threshold;
  persistSafes();
  return { owners: safe.owners, threshold: safe.threshold };
};

export const changeThreshold = async (address: string, threshold: number) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  safe.threshold = threshold;
  persistSafes();
  return { threshold: safe.threshold };
};

export const enableModule = async (address: string, moduleAddress: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  const normalizedModule = normalizeAddress(moduleAddress);
  if (!safe.modules.some((module) => module.toLowerCase() === normalizedModule.toLowerCase())) {
    safe.modules.push(normalizedModule);
  }
  persistSafes();
  return { modules: safe.modules };
};

export const disableModule = async (address: string, moduleAddress: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  const normalizedModule = normalizeAddress(moduleAddress);
  safe.modules = safe.modules.filter(
    (module) => module.toLowerCase() !== normalizedModule.toLowerCase()
  );
  persistSafes();
  return { modules: safe.modules };
};

export const addDelegate = async (address: string, delegate: SafeDelegate) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  const normalizedDelegate = normalizeAddress(delegate.address);
  const existing = safe.delegates.find(
    (entry) => entry.address.toLowerCase() === normalizedDelegate.toLowerCase()
  );
  if (existing) {
    existing.label = delegate.label;
  } else {
    safe.delegates.push({
      address: normalizedDelegate,
      label: delegate.label,
      since: delegate.since
    });
  }
  persistSafes();
  return safe.delegates;
};

export const removeDelegate = async (address: string, delegateAddress: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  const normalizedDelegate = normalizeAddress(delegateAddress);
  safe.delegates = safe.delegates.filter(
    (delegate) => delegate.address.toLowerCase() !== normalizedDelegate.toLowerCase()
  );
  persistSafes();
  return safe.delegates;
};

export const updateFallbackHandler = async (address: string, handler?: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  safe.fallbackHandler = normalizeOptionalAddress(handler);
  persistSafes();
  return { fallbackHandler: safe.fallbackHandler };
};

export const updateGuard = async (address: string, guard?: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  safe.guard = normalizeOptionalAddress(guard);
  persistSafes();
  return { guard: safe.guard };
};

export const proposeTransaction = async (
  address: string,
  tx: unknown,
  meta?: Record<string, unknown>
) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  const { proposal } = await createOrReuseProposal(safe, tx, meta);
  return proposal;
};

export const discoverAllowanceRevocations = async (
  address: string,
  options: AllowanceDiscoveryOptions = {}
): Promise<AllowanceDiscoveryResult> => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }

  const provider = new ethers.JsonRpcProvider(safe.rpcUrl);
  const minimumAllowance = options.minimumAllowance ? BigInt(options.minimumAllowance) : 0n;
  const { tokens, spenderCandidates, tokenToSpenders } = buildAllowanceCandidateSets(safe, options.whitelist);
  const approvals: DiscoveredAllowance[] = [];
  const unsupported: { token: string; spender?: string; reason: string }[] = [];

  for (const token of tokens) {
    const code = await provider.getCode(token);
    if (code === '0x') {
      unsupported.push({ token, reason: 'missing-bytecode' });
      continue;
    }

    const tokenSpecificSpenders = tokenToSpenders.get(token);
    const spenders = (tokenSpecificSpenders ? Array.from(new Set([...tokenSpecificSpenders, ...spenderCandidates])) : [...spenderCandidates]).sort(stableAddressSort);
    let allowanceMethodSupported = false;

    for (const spender of spenders) {
      try {
        const allowance = await readAllowance(provider, token, safe.address, spender);
        allowanceMethodSupported = true;
        if (allowance === 0n || allowance <= minimumAllowance) {
          continue;
        }
        try {
          await validateApproveZero(provider, token, safe.address, spender);
        } catch (error) {
          unsupported.push({ token, spender, reason: `approve-zero-reverted:${error instanceof Error ? error.message : String(error)}` });
          continue;
        }
        approvals.push({ token, spender, allowance: allowance.toString() });
      } catch (error) {
        if (!allowanceMethodSupported) {
          unsupported.push({ token, spender, reason: `allowance-read-failed:${error instanceof Error ? error.message : String(error)}` });
          break;
        }
      }
    }
  }

  approvals.sort((left, right) => {
    const tokenCmp = stableAddressSort(left.token, right.token);
    if (tokenCmp !== 0) {
      return tokenCmp;
    }
    return stableAddressSort(left.spender, right.spender);
  });

  unsupported.sort((left, right) => {
    const tokenCmp = stableAddressSort(left.token, right.token);
    if (tokenCmp !== 0) {
      return tokenCmp;
    }
    return stableAddressSort(left.spender ?? ethers.ZeroAddress, right.spender ?? ethers.ZeroAddress);
  });

  return { approvals, unsupported };
};

export const proposeAllowanceRevocations = async (
  address: string,
  options: AllowanceDiscoveryOptions = {}
): Promise<AllowanceRevokeProposalResult> => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }

  const discovery = await discoverAllowanceRevocations(address, options);
  const calls = discovery.approvals.map(buildRevokeCall);
  const batchSize = normalizeBatchSize(options.chunkSize);
  const batches: AllowanceRevokeBatch[] = [];

  for (const chunk of chunkExecutionCalls(calls, batchSize)) {
    const payload: SafeBatchPayload = {
      kind: 'batch',
      calls: chunk,
      value: '0',
      operation: 0,
      methodSignature: BATCH_METHOD_SIGNATURE
    };
    const { proposal, existing } = await createOrReuseProposal(safe, payload, {
      createdBy: 'native-revoke-engine',
      directive: 'erc20-allowance-revoke',
      callCount: chunk.length,
      approvals: discovery.approvals
        .filter((approval) => chunk.some((call) => call.target === approval.token && call.data === buildRevokeCall(approval).data))
        .map((approval) => ({ ...approval }))
    });
    batches.push({ txHash: proposal.hash, calls: chunk, existing });
  }

  return {
    approvals: discovery.approvals,
    unsupported: discovery.unsupported,
    batches
  };
};

const assertSafeExecutionReadiness = (safe: SafeState, payload: Record<string, unknown>) => {
  const safeModeEnabled = true;
  const safeAddressValid = Boolean(normalizeMaybeAddress(safe.address));
  const moduleTarget = safe.modules[0];
  const hasOwnersAndThreshold = safe.owners.length > 0 && safe.threshold > 0;
  const txTarget = typeof payload.to === 'string' ? payload.to : undefined;

  console.info(
    JSON.stringify({
      event: 'SAFE_RUNTIME_BOOT',
      safeMode: safeModeEnabled ? 'enabled' : 'disabled',
      safeAddress: safe.address,
      owners: safe.owners.length,
      threshold: safe.threshold,
      txSubmissionMode: 'safe-module-simulated',
      chainId: safe.network,
      rpcUrlHash: ethers.keccak256(ethers.toUtf8Bytes(safe.rpcUrl)).slice(0, 12)
    })
  );

  if (safeModeEnabled) {
    if (!safeAddressValid || !moduleTarget || !hasOwnersAndThreshold) {
      throw new Error(
        `SAFE_BROADCAST_ASSERTION_FAILED safeAddressValid=${safeAddressValid} moduleTarget=${Boolean(moduleTarget)} hasOwnersAndThreshold=${hasOwnersAndThreshold}`
      );
    }
    console.info(
      JSON.stringify({
        event: 'SAFE_BROADCAST_ASSERTION_OK',
        safeAddress: safe.address,
        moduleTarget,
        txTarget,
        owners: safe.owners.length,
        threshold: safe.threshold
      })
    );
  }
};
export const executeTransaction = async (address: string, txHash: string, _password?: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  const tx = safe.transactions.get(txHash);
  if (!tx) {
    throw new Error('Transaction not found');
  }

  const payload = (tx.payload && typeof tx.payload === 'object' ? tx.payload : {}) as Record<string, unknown>;
  const effective = safeConfigRepository.getEffectiveSafeConfig();
  if (effective.enabled) {
    const assertions = {
      safeAddressValid: Boolean(safe.address && ethers.isAddress(safe.address)),
      modulePathPresent: Boolean(safe.modules[0]),
      ownersLoaded: safe.owners.length > 0,
      thresholdLoaded: Number.isInteger(safe.threshold) && safe.threshold > 0
    };
    if (!assertions.safeAddressValid || !assertions.modulePathPresent || !assertions.ownersLoaded || !assertions.thresholdLoaded) {
      console.error(JSON.stringify({ event: 'SAFE_BROADCAST_ASSERTION_FAILED', assertions, safeAddress: safe.address, safeMode: effective.enabled }));
      throw new Error('Safe mode assertion failed. Refusing EOA fallback broadcast.');
    }
    console.info(JSON.stringify({ event: 'SAFE_BROADCAST_ASSERTIONS_PASSED', assertions, safeAddress: safe.address, txSubmissionMode: effective.txSubmissionMode }));
  }
  const methodSignature = typeof payload.methodSignature === 'string' ? payload.methodSignature : undefined;
  const batchCalls = extractCallsFromPayload(payload).map((call) => ({ ...call }));
  const innerTo = typeof payload.to === 'string' ? payload.to : batchCalls[0]?.target;
  assertSafeExecutionReadiness(safe, payload);

  const trace = {
    safeAddress: safe.address,
    moduleAddress: safe.modules[0],
    outerTxTo: safe.modules[0],
    innerSafe: {
      to: innerTo,
      value: String(payload.value ?? batchCalls[0]?.value ?? '0'),
      data: typeof payload.data === 'string' ? payload.data : batchCalls[0]?.data,
      operation: typeof payload.operation === 'number' ? payload.operation : 0
    },
    batchCalls: batchCalls.length > 1 || (payload.kind === 'batch' && batchCalls.length > 0) ? batchCalls : undefined,
    finalTargetAddress: innerTo,
    methodSignature,
    noBroadcastReason: 'BROADCAST_GATE_BLOCKED: execution pipeline currently simulates only',
    createdAt: new Date().toISOString()
  };
  console.info(JSON.stringify({ event: 'NO_BROADCAST_REASON', predicate: trace.noBroadcastReason }));
  runtimeTelemetry.recordSafeTrace(trace);

  tx.executed = true;
  tx.meta = { ...(tx.meta ?? {}), executionTrace: trace };
  persistSafes();
  return { hash: tx.hash, executed: true, trace };
};

export const getSafeDetails = async (address: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  const balance = await getBalance(safe.address, safe.rpcUrl);
  const [policy, summary, effective] = await Promise.all([
    Promise.resolve(holdService.getHoldState(address)),
    Promise.resolve(holdService.summarize(address)),
    holdService.getEffectivePolicy(address)
  ]);
  return {
    address: safe.address,
    threshold: safe.threshold,
    owners: safe.owners,
    delegates: safe.delegates,
    modules: safe.modules,
    fallbackHandler: safe.fallbackHandler,
    guard: safe.guard,
    rpcUrl: safe.rpcUrl,
    network: safe.network,
    safeVersion: safe.safeVersion,
    mastercopyAddress: safe.mastercopyAddress,
    moduleEnabled: safe.modules.length > 0,
    balance,
    holdPolicy: policy,
    holdSummary: summary,
    effectiveHold: effective
  };
};

export const syncSafeState = async (address: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) {
    throw new Error('Safe not loaded');
  }
  await refreshSafeOnchainState(safe);
  persistSafes();
  return safe;
};

export const listSafeTransactions = () => {
  return Array.from(safeStore.values()).flatMap((safe) =>
    Array.from(safe.transactions.values()).map((transaction) => ({
      safeAddress: safe.address,
      transaction
    }))
  );
};
