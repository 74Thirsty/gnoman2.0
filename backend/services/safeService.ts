import { ethers } from 'ethers';
import { holdService } from './transactionHoldService';
import { getBalance, requireRpcUrl } from './rpcService';
import { runtimeTelemetry } from './runtimeTelemetryService';
import { safeConfigRepository, type PersistedSafePayload } from './safeConfigRepository';
import { getDecryptedSigner } from './walletService';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  safeTransactionHash?: string;
  to: string;
  value: string;
  data: string;
  operation: number;
  nonce?: string;
  signatures: Array<{ signer: string; data: string }>;
  approvals: string[];
  createdAt: string;
  meta?: Record<string, unknown>;
  executed: boolean;
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const SAFE_MODULE_PAGE_SIZE = 50;
const SAFE_MODULE_SENTINEL = '0x0000000000000000000000000000000000000001';
const OWNER_SENTINEL = '0x0000000000000000000000000000000000000001';

const SAFE_ABI = [
  // Read
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
  'function getModulesPaginated(address,uint256) view returns (address[] memory, address)',
  'function getFallbackHandler() view returns (address)',
  'function getGuard() view returns (address)',
  'function VERSION() view returns (string)',
  'function masterCopy() view returns (address)',
  'function nonce() view returns (uint256)',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)',
  // Execute
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)',
];

// Management functions encoded into Safe transactions (Safe calls these on itself)
const MANAGEMENT_IFACE = new ethers.Interface([
  'function addOwnerWithThreshold(address owner, uint256 _threshold)',
  'function removeOwner(address prevOwner, address owner, uint256 _threshold)',
  'function changeThreshold(uint256 _threshold)',
  'function enableModule(address module)',
  'function disableModule(address prevModule, address module)',
  'function setFallbackHandler(address handler)',
  'function setGuard(address guard)',
]);

// ─── Store ────────────────────────────────────────────────────────────────────

const safeStore = new Map<string, SafeState>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizeAddress = (value: string) => ethers.getAddress(value);

const normalizeMaybeAddress = (value?: string | null) => {
  if (!value) return undefined;
  try { return normalizeAddress(value); } catch { return undefined; }
};

const normalizeOptionalAddress = (value?: string | null) => {
  if (!value) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  const n = normalizeAddress(t);
  return n === ethers.ZeroAddress ? undefined : n;
};

/** Find the "previous" element in a Safe linked list (owners or modules). */
const findPrev = (list: string[], target: string): string => {
  const norm = ethers.getAddress(target);
  const idx = list.map((a) => ethers.getAddress(a)).indexOf(norm);
  if (idx === -1) throw new Error(`${target} not found in list`);
  return idx === 0 ? OWNER_SENTINEL : list[idx - 1];
};

// ─── On-chain Safe transaction execution ──────────────────────────────────────

/**
 * Build, sign, and broadcast a Safe management transaction.
 * `to` is the target (for management ops it's the Safe itself).
 * `data` is the ABI-encoded function call.
 *
 * For threshold > 1, this will fail unless the caller has accumulated enough
 * signatures externally. In the current UI flow we require threshold = 1
 * or the caller to be the sole required signer.
 */
const execSafeTx = async (
  safe: SafeState,
  signerWallet: ethers.Wallet,
  to: string,
  data: string,
  value = 0n
): Promise<{ hash: string }> => {
  const provider = new ethers.JsonRpcProvider(safe.rpcUrl);
  const signer = signerWallet.connect(provider);
  const safeContract = new ethers.Contract(safe.address, SAFE_ABI, signer);

  const nonce = (await safeContract.nonce()) as bigint;

  // Compute the Safe transaction hash (EIP-712 style via contract helper)
  const safeTxHash = (await safeContract.getTransactionHash(
    to,
    value,
    data,
    0,                   // operation: CALL
    0n,                  // safeTxGas
    0n,                  // baseGas
    0n,                  // gasPrice
    ethers.ZeroAddress,  // gasToken
    ethers.ZeroAddress,  // refundReceiver
    nonce
  )) as string;

  // Sign the raw hash (no Ethereum prefix) → v = 27 or 28
  const signingKey = new ethers.SigningKey(signer.privateKey);
  const sig = signingKey.sign(ethers.getBytes(safeTxHash));
  // Safe signature format: r (32) || s (32) || v (1) = 65 bytes
  const packedSig = ethers.concat([sig.r, sig.s, ethers.toBeHex(sig.v, 1)]);

  const tx = await (safeContract.execTransaction as (...args: unknown[]) => Promise<ethers.ContractTransactionResponse>)(
    to, value, data,
    0,
    0n, 0n, 0n,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    packedSig
  );

  const receipt = await tx.wait();
  if (!receipt) throw new Error('Transaction receipt not available');
  console.info(JSON.stringify({ event: 'SAFE_TX_EXECUTED', hash: receipt.hash, safeAddress: safe.address }));
  return { hash: receipt.hash };
};

// ─── On-chain state refresh ────────────────────────────────────────────────────

const loadModules = async (contract: ethers.Contract) => {
  const modules: string[] = [];
  let next = SAFE_MODULE_SENTINEL;
  while (true) {
    const [page, nextModule] = (await contract.getModulesPaginated(next, SAFE_MODULE_PAGE_SIZE)) as [string[], string];
    if (!page.length) break;
    modules.push(...page);
    if (nextModule.toLowerCase() === SAFE_MODULE_SENTINEL.toLowerCase()) break;
    next = nextModule;
  }
  return modules.map((m) => ethers.getAddress(m));
};

const loadOptionalSafeConfig = async (contract: ethers.Contract) => {
  let fallbackHandler: string | undefined;
  let guard: string | undefined;
  try { fallbackHandler = normalizeOptionalAddress((await contract.getFallbackHandler()) as string); } catch { /* not all safes have this */ }
  try { guard = normalizeOptionalAddress((await contract.getGuard()) as string); } catch { /* not all safes have this */ }
  return { fallbackHandler, guard };
};

const refreshSafeOnchainState = async (safe: SafeState) => {
  const provider = new ethers.JsonRpcProvider(safe.rpcUrl);
  const contract = new ethers.Contract(safe.address, SAFE_ABI, provider);
  const [owners, threshold, modules, optional] = await Promise.all([
    contract.getOwners() as Promise<string[]>,
    contract.getThreshold() as Promise<bigint>,
    loadModules(contract),
    loadOptionalSafeConfig(contract),
  ]);
  safe.owners = owners.map((o) => ethers.getAddress(o));
  safe.threshold = Number(threshold);
  safe.modules = modules;
  if (optional.fallbackHandler) safe.fallbackHandler = optional.fallbackHandler;
  if (optional.guard) safe.guard = optional.guard;
  try { safe.safeVersion = (await contract.VERSION()) as string; } catch { safe.safeVersion ??= 'unknown'; }
  try { safe.mastercopyAddress = normalizeOptionalAddress((await contract.masterCopy()) as string); } catch { /* ok */ }
};

// ─── Persistence ──────────────────────────────────────────────────────────────

const persistSafes = () => {
  const payload: PersistedSafePayload = {
    version: 1,
    safes: Array.from(safeStore.values()).map((s) => ({
      address: s.address,
      rpcUrl: s.rpcUrl,
      owners: [...s.owners],
      threshold: s.threshold,
      modules: [...s.modules],
      delegates: s.delegates.map((d) => ({ ...d })),
      fallbackHandler: s.fallbackHandler,
      guard: s.guard,
      network: s.network,
      transactions: Array.from(s.transactions.values()).map((tx) => ({ ...tx })),
    })),
  };
  safeConfigRepository.save(payload);
};

const loadSafes = () => {
  try {
    const payload = safeConfigRepository.load();
    safeStore.clear();
    for (const safe of payload.safes) {
      try {
        const addr = normalizeAddress(safe.address);
        const transactions = new Map(
          (safe.transactions ?? []).flatMap((tx) => {
            if (!tx?.hash) return [];
            const t: SafeTransaction = {
              hash: tx.hash,
              safeTransactionHash: (tx as unknown as SafeTransaction).safeTransactionHash,
              to: (tx as unknown as SafeTransaction).to ?? '',
              value: (tx as unknown as SafeTransaction).value ?? '0',
              data: (tx as unknown as SafeTransaction).data ?? '0x',
              operation: (tx as unknown as SafeTransaction).operation ?? 0,
              nonce: (tx as unknown as SafeTransaction).nonce,
              signatures: (tx as unknown as SafeTransaction).signatures ?? [],
              approvals: (tx as unknown as SafeTransaction).approvals ?? [],
              createdAt: tx.createdAt ?? new Date().toISOString(),
              meta: tx.meta,
              executed: Boolean(tx.executed),
            };
            return [[t.hash, t]];
          })
        );
        safeStore.set(addr.toLowerCase(), {
          address: addr,
          rpcUrl: safe.rpcUrl,
          owners: (safe.owners ?? []).flatMap((o) => { const n = normalizeMaybeAddress(o); return n ? [n] : []; }),
          threshold: safe.threshold ?? 1,
          modules: (safe.modules ?? []).flatMap((m) => { const n = normalizeMaybeAddress(m); return n ? [n] : []; }),
          delegates: (safe.delegates ?? []).flatMap((d) => {
            const a = normalizeMaybeAddress(d?.address);
            return a ? [{ address: a, label: d.label ?? 'Delegate', since: d.since ?? new Date(0).toISOString() }] : [];
          }),
          fallbackHandler: normalizeMaybeAddress(safe.fallbackHandler),
          guard: normalizeMaybeAddress(safe.guard),
          network: safe.network,
          transactions,
        });
      } catch (e) { console.error('Skipping invalid safe entry', e); }
    }
  } catch (e) { console.error('Failed to load safes', e); }
};

loadSafes();

const getOrCreateSafe = (address: string, rpcUrl: string): SafeState => {
  const key = normalizeAddress(address).toLowerCase();
  let safe = safeStore.get(key);
  if (!safe) {
    safe = { address: normalizeAddress(address), rpcUrl, owners: [], threshold: 1, modules: [], delegates: [], transactions: new Map() };
    safeStore.set(key, safe);
    persistSafes();
  } else if (safe.rpcUrl !== rpcUrl) {
    safe.rpcUrl = rpcUrl;
    persistSafes();
  }
  return safe;
};

// ─── Signer helper ────────────────────────────────────────────────────────────

const getSigner = (signerAddress: string, signerPassword?: string): ethers.Wallet => {
  return getDecryptedSigner(signerAddress, signerPassword);
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const connectToSafe = async (address: string, rpcUrl?: string) => {
  const norm = normalizeAddress(address);
  const cached = safeStore.get(norm.toLowerCase());
  const resolvedRpcUrl = await requireRpcUrl(rpcUrl ?? cached?.rpcUrl);
  const provider = new ethers.JsonRpcProvider(resolvedRpcUrl);
  const network = await provider.getNetwork();
  const safe = getOrCreateSafe(norm, resolvedRpcUrl);
  await refreshSafeOnchainState(safe);
  safe.network = network.name ?? String(network.chainId);
  persistSafes();
  const balance = await getBalance(safe.address, safe.rpcUrl);
  runtimeTelemetry.setSafeRuntime({
    version: safe.safeVersion ?? 'unknown',
    mastercopyAddress: safe.mastercopyAddress,
    moduleEnabled: safe.modules.length > 0,
  });
  return { address: safe.address, threshold: safe.threshold, owners: safe.owners, modules: safe.modules, rpcUrl: safe.rpcUrl, delegates: safe.delegates, fallbackHandler: safe.fallbackHandler, guard: safe.guard, network: safe.network, balance };
};

export const getOwners = async (address: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');
  return safe.owners;
};

export const addOwner = async (
  address: string,
  owner: string,
  threshold: number,
  signerAddress: string,
  signerPassword?: string
) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');
  const signerWallet = getSigner(signerAddress, signerPassword);
  const data = MANAGEMENT_IFACE.encodeFunctionData('addOwnerWithThreshold', [
    ethers.getAddress(owner),
    BigInt(threshold),
  ]);
  const receipt = await execSafeTx(safe, signerWallet, safe.address, data);
  await refreshSafeOnchainState(safe);
  persistSafes();
  return { txHash: receipt.hash, owners: safe.owners, threshold: safe.threshold };
};

export const removeOwner = async (
  address: string,
  owner: string,
  threshold: number,
  signerAddress: string,
  signerPassword?: string
) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');
  const prevOwner = findPrev(safe.owners, owner);
  const signerWallet = getSigner(signerAddress, signerPassword);
  const data = MANAGEMENT_IFACE.encodeFunctionData('removeOwner', [
    prevOwner,
    ethers.getAddress(owner),
    BigInt(threshold),
  ]);
  const receipt = await execSafeTx(safe, signerWallet, safe.address, data);
  await refreshSafeOnchainState(safe);
  persistSafes();
  return { txHash: receipt.hash, owners: safe.owners, threshold: safe.threshold };
};

export const changeThreshold = async (
  address: string,
  threshold: number,
  signerAddress: string,
  signerPassword?: string
) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');
  const signerWallet = getSigner(signerAddress, signerPassword);
  const data = MANAGEMENT_IFACE.encodeFunctionData('changeThreshold', [BigInt(threshold)]);
  const receipt = await execSafeTx(safe, signerWallet, safe.address, data);
  await refreshSafeOnchainState(safe);
  persistSafes();
  return { txHash: receipt.hash, threshold: safe.threshold };
};

export const enableModule = async (
  address: string,
  moduleAddress: string,
  signerAddress: string,
  signerPassword?: string
) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');
  const signerWallet = getSigner(signerAddress, signerPassword);
  const data = MANAGEMENT_IFACE.encodeFunctionData('enableModule', [ethers.getAddress(moduleAddress)]);
  const receipt = await execSafeTx(safe, signerWallet, safe.address, data);
  await refreshSafeOnchainState(safe);
  persistSafes();
  return { txHash: receipt.hash, modules: safe.modules };
};

export const disableModule = async (
  address: string,
  moduleAddress: string,
  signerAddress: string,
  signerPassword?: string
) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');
  const prevModule = findPrev(safe.modules, moduleAddress);
  const signerWallet = getSigner(signerAddress, signerPassword);
  const data = MANAGEMENT_IFACE.encodeFunctionData('disableModule', [
    prevModule,
    ethers.getAddress(moduleAddress),
  ]);
  const receipt = await execSafeTx(safe, signerWallet, safe.address, data);
  await refreshSafeOnchainState(safe);
  persistSafes();
  return { txHash: receipt.hash, modules: safe.modules };
};

export const addDelegate = async (address: string, delegate: SafeDelegate) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');
  const norm = normalizeAddress(delegate.address);
  const existing = safe.delegates.find((d) => d.address.toLowerCase() === norm.toLowerCase());
  if (existing) {
    existing.label = delegate.label;
  } else {
    safe.delegates.push({ address: norm, label: delegate.label, since: delegate.since });
  }
  persistSafes();
  return safe.delegates;
};

export const removeDelegate = async (address: string, delegateAddress: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');
  const norm = normalizeAddress(delegateAddress);
  safe.delegates = safe.delegates.filter((d) => d.address.toLowerCase() !== norm.toLowerCase());
  persistSafes();
  return safe.delegates;
};

export const updateFallbackHandler = async (
  address: string,
  handler: string | undefined,
  signerAddress: string,
  signerPassword?: string
) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');
  const signerWallet = getSigner(signerAddress, signerPassword);
  const target = normalizeOptionalAddress(handler) ?? ethers.ZeroAddress;
  const data = MANAGEMENT_IFACE.encodeFunctionData('setFallbackHandler', [target]);
  const receipt = await execSafeTx(safe, signerWallet, safe.address, data);
  await refreshSafeOnchainState(safe);
  persistSafes();
  return { txHash: receipt.hash, fallbackHandler: safe.fallbackHandler };
};

export const updateGuard = async (
  address: string,
  guard: string | undefined,
  signerAddress: string,
  signerPassword?: string
) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');
  const signerWallet = getSigner(signerAddress, signerPassword);
  const target = normalizeOptionalAddress(guard) ?? ethers.ZeroAddress;
  const data = MANAGEMENT_IFACE.encodeFunctionData('setGuard', [target]);
  const receipt = await execSafeTx(safe, signerWallet, safe.address, data);
  await refreshSafeOnchainState(safe);
  persistSafes();
  return { txHash: receipt.hash, guard: safe.guard };
};

/**
 * Propose a Safe transaction — signs it immediately with the provided signer.
 * If threshold = 1 and signer is an owner, executes on-chain immediately.
 * If threshold > 1, stores the proposal and first signature locally.
 */
export const proposeTransaction = async (
  address: string,
  tx: { to: string; value?: string; data?: string; operation?: number },
  meta?: Record<string, unknown>,
  signerAddress?: string,
  signerPassword?: string
) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');

  const to = ethers.getAddress(tx.to);
  const value = tx.value ? ethers.parseEther(tx.value) : 0n;
  const data = tx.data || '0x';
  const operation = tx.operation ?? 0;

  // If a signer is provided and threshold = 1, execute immediately
  if (signerAddress && safe.threshold === 1) {
    const signerWallet = getSigner(signerAddress, signerPassword);
    const receipt = await execSafeTx(safe, signerWallet, to, data, value);
    const proposal: SafeTransaction = {
      hash: receipt.hash,
      safeTransactionHash: receipt.hash,
      to,
      value: value.toString(),
      data,
      operation,
      signatures: [{ signer: signerAddress, data: receipt.hash }],
      approvals: [signerAddress],
      createdAt: new Date().toISOString(),
      meta,
      executed: true,
    };
    safe.transactions.set(receipt.hash, proposal);
    await holdService.createHold(receipt.hash, safe.address);
    await holdService.markExecuted(receipt.hash);
    persistSafes();
    return proposal;
  }

  // Multi-sig or no signer: store locally and collect signatures
  const provider = new ethers.JsonRpcProvider(safe.rpcUrl);
  const safeContract = new ethers.Contract(safe.address, SAFE_ABI, provider);
  const nonce = (await safeContract.nonce()) as bigint;
  const safeTxHash = (await safeContract.getTransactionHash(
    to, value, data, operation, 0n, 0n, 0n, ethers.ZeroAddress, ethers.ZeroAddress, nonce
  )) as string;

  const proposal: SafeTransaction = {
    hash: safeTxHash,
    safeTransactionHash: safeTxHash,
    to,
    value: value.toString(),
    data,
    operation,
    nonce: nonce.toString(),
    signatures: [],
    approvals: [],
    createdAt: new Date().toISOString(),
    meta,
    executed: false,
  };

  if (signerAddress) {
    const signerWallet = getSigner(signerAddress, signerPassword);
    const signingKey = new ethers.SigningKey(signerWallet.privateKey);
    const sig = signingKey.sign(ethers.getBytes(safeTxHash));
    const packed = ethers.concat([sig.r, sig.s, ethers.toBeHex(sig.v, 1)]);
    proposal.signatures.push({ signer: signerAddress, data: ethers.hexlify(packed) });
    proposal.approvals.push(signerAddress);
  }

  safe.transactions.set(safeTxHash, proposal);
  await holdService.createHold(safeTxHash, safe.address);
  persistSafes();
  return proposal;
};

/**
 * Execute a stored proposal. Collects the stored signatures; if enough, broadcasts.
 * Optionally adds one more signature from signerAddress before executing.
 */
export const executeTransaction = async (
  address: string,
  txHash: string,
  signerAddress?: string,
  signerPassword?: string
) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');
  const tx = safe.transactions.get(txHash);
  if (!tx) throw new Error('Transaction not found');

  const hold = await holdService.getHold(txHash);
  if (hold && !holdService.canExecute(hold)) throw new Error('Transaction is still in hold period');

  // Add a new signature if a signer is provided
  if (signerAddress) {
    const signerWallet = getSigner(signerAddress, signerPassword);
    const safeTxHash = tx.safeTransactionHash ?? txHash;
    const signingKey = new ethers.SigningKey(signerWallet.privateKey);
    const sig = signingKey.sign(ethers.getBytes(safeTxHash));
    const packed = ethers.concat([sig.r, sig.s, ethers.toBeHex(sig.v, 1)]);
    const norm = ethers.getAddress(signerAddress);
    if (!tx.approvals.includes(norm)) {
      tx.signatures.push({ signer: norm, data: ethers.hexlify(packed) });
      tx.approvals.push(norm);
    }
  }

  if (tx.signatures.length < safe.threshold) {
    throw new Error(
      `Need ${safe.threshold} signatures, have ${tx.signatures.length}. Share the Safe tx hash (${tx.safeTransactionHash}) with other owners.`
    );
  }

  // Sort signatures by signer address (Safe requires this)
  const sorted = [...tx.signatures].sort((a, b) =>
    a.signer.toLowerCase() < b.signer.toLowerCase() ? -1 : 1
  );
  const combinedSig = ethers.concat(sorted.map((s) => s.data));

  const provider = new ethers.JsonRpcProvider(safe.rpcUrl);
  // Use first signer's wallet to pay gas (or any owner)
  const payerWallet = getSigner(sorted[0].signer, signerPassword).connect(provider);
  const safeContract = new ethers.Contract(safe.address, SAFE_ABI, payerWallet);

  const etherValue = BigInt(tx.value ?? '0');
  const broadcastTx = await (safeContract.execTransaction as (...args: unknown[]) => Promise<ethers.ContractTransactionResponse>)(
    tx.to, etherValue, tx.data, tx.operation ?? 0,
    0n, 0n, 0n, ethers.ZeroAddress, ethers.ZeroAddress,
    combinedSig
  );
  const receipt = await broadcastTx.wait();
  if (!receipt) throw new Error('No receipt');

  tx.executed = true;
  tx.meta = { ...(tx.meta ?? {}), executionTxHash: receipt.hash };
  if (hold) await holdService.markExecuted(txHash);
  persistSafes();
  return { hash: receipt.hash, executed: true };
};

export const getSafeDetails = async (address: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');
  const balance = await getBalance(safe.address, safe.rpcUrl);
  const [policy, summary, effective] = await Promise.all([
    Promise.resolve(holdService.getHoldState(address)),
    Promise.resolve(holdService.summarize(address)),
    holdService.getEffectivePolicy(address),
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
    effectiveHold: effective,
  };
};

export const syncSafeState = async (address: string) => {
  const safe = safeStore.get(address.toLowerCase());
  if (!safe) throw new Error('Safe not loaded');
  await refreshSafeOnchainState(safe);
  persistSafes();
  return safe;
};

export const listSafeTransactions = () =>
  Array.from(safeStore.values()).flatMap((safe) =>
    Array.from(safe.transactions.values()).map((tx) => ({ safeAddress: safe.address, transaction: tx }))
  );
