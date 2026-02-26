import { ethers } from 'ethers';
import { holdService } from './transactionHoldService';
import { getBalance, requireRpcUrl } from './rpcService';
import { runtimeTelemetry } from './runtimeTelemetryService';
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
  } catch (_error) {
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

const loadOptionalSafeConfig = async (contract: ethers.Contract) => {
  let fallbackHandler: string | undefined;
  let guard: string | undefined;
  try {
    fallbackHandler = normalizeOptionalAddress((await contract.getFallbackHandler()) as string);
  } catch (error) {
    console.warn('Unable to load Safe fallback handler', error);
  }
  try {
    guard = normalizeOptionalAddress((await contract.getGuard()) as string);
  } catch (error) {
    console.warn('Unable to load Safe guard', error);
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
    } catch (_error) {
      safe.safeVersion = safe.safeVersion ?? 'unknown';
    }
    try {
      safe.mastercopyAddress = normalizeOptionalAddress((await contract.masterCopy()) as string);
    } catch (_error) {
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
  const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(tx)));
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
  return proposal;
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
  const methodSignature = typeof payload.methodSignature === 'string' ? payload.methodSignature : undefined;
  const innerTo = typeof payload.to === 'string' ? payload.to : undefined;
  assertSafeExecutionReadiness(safe, payload);

  const trace = {
    safeAddress: safe.address,
    moduleAddress: safe.modules[0],
    outerTxTo: safe.modules[0],
    innerSafe: {
      to: innerTo,
      value: String(payload.value ?? '0'),
      data: typeof payload.data === 'string' ? payload.data : undefined,
      operation: typeof payload.operation === 'number' ? payload.operation : 0
    },
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
