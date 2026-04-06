import type { IpcMain } from 'electron';
import keyringManager from '../../src/core/keyringManager';
import * as walletService from '../../backend/services/walletService';
import { sessionWalletService } from '../../backend/services/sessionWalletService';
import { cancelVanityJob, getVanityJob, listVanityJobs, startVanityJob } from '../../backend/services/vanityService';
import { getSecureSetting, setSecureSetting } from '../../backend/services/secureSettingsService';
import {
  connectToSafe,
  getOwners,
  addOwner,
  removeOwner,
  changeThreshold,
  enableModule,
  disableModule,
  addDelegate,
  removeDelegate,
  updateFallbackHandler,
  updateGuard,
  proposeTransaction,
  executeTransaction,
  getSafeDetails,
  syncSafeState
} from '../../backend/services/safeService';
import { holdService } from '../../backend/services/transactionHoldService';
import { addContract, listContracts, removeContract } from '../../backend/services/contractRegistryService';
import { abiResolver } from '../../backend/utils/abiResolver';
import { getBalance } from '../../backend/services/rpcService';
import { getHistoryEntries } from '../../backend/services/historyService';
import {
  simulateCallStatic,
  simulateContract,
  simulateSafe,
  getHistory,
  clearHistory,
  loadAbi,
  listAbis,
  startFork,
  stopFork,
  forkStatus
} from '../../backend/services/sandboxService';
import { licenseService } from '../../backend/services/licenseService';
import {
  decodePayload,
  discoverContract,
  estimateGasForFunction,
  fetchSourceCode,
  scanSourceCode
} from '../../backend/services/devToolsService';
import { runtimeTelemetry } from '../../backend/services/runtimeTelemetryService';
import { runtimeObservability } from '../../src/utils/runtimeObservability';
import { resolveRpcUrl } from '../../backend/services/rpcService';
import { exportEncryptedWorkspace } from '../../backend/services/exportService';

const HOLD_KEY = 'SAFE_TX_HOLD_ENABLED';

export const registerIpcHandlers = (ipcMain: IpcMain) => {

  // --- Keyring ---
  ipcMain.handle('keyring:list', async () => {
    const secrets = await keyringManager.list();
    return Object.keys(secrets).map((key) => ({ alias: key }));
  });
  ipcMain.handle('keyring:add', async (_e, payload: { alias: string; secret: string }) => {
    await keyringManager.set(payload.alias, payload.secret);
    return true;
  });
  ipcMain.handle('keyring:get', async (_e, payload: { alias: string }) => keyringManager.get(payload.alias));
  ipcMain.handle('keyring:delete', async (_e, payload: { alias: string }) => {
    await keyringManager.delete(payload.alias);
    return true;
  });
  ipcMain.handle('keyring:backends', async () => keyringManager.probeAvailableBackends());
  ipcMain.handle('keyring:switch', async (_e, { name }: { name: string }) => {
    await keyringManager.switchToBackend(name as 'system' | 'file' | 'memory');
    const secrets = await keyringManager.list();
    return { active: keyringManager.currentBackend(), secrets: Object.keys(secrets).map((k) => ({ alias: k })) };
  });

  // --- Wallets ---
  ipcMain.handle('wallet:list', async () => walletService.listWalletMetadata());
  ipcMain.handle('wallet:details', async (_e, { address }: { address: string }) =>
    walletService.getWalletDetails(address)
  );
  ipcMain.handle('wallet:generate', async (_e, payload: { alias?: string; password?: string; hidden?: boolean; wordCount?: 12 | 24 }) =>
    walletService.createRandomWallet({ ...payload, hidden: Boolean(payload.hidden) })
  );
  ipcMain.handle('wallet:import:mnemonic', async (_e, payload: {
    mnemonic: string; alias?: string; password?: string; derivationPath?: string; hidden?: boolean
  }) => walletService.importWalletFromMnemonic({ ...payload, hidden: Boolean(payload.hidden) }));
  ipcMain.handle('wallet:import:privatekey', async (_e, payload: {
    privateKey: string; alias?: string; password?: string; hidden?: boolean
  }) => walletService.importWalletFromPrivateKey({ ...payload, hidden: Boolean(payload.hidden) }));
  ipcMain.handle('wallet:send', async (_e, payload: {
    address: string; password: string; to: string; value?: string; data?: string
  }) => walletService.sendWalletTransaction(payload));
  ipcMain.handle('wallet:remove', async (_e, { address }: { address: string }) =>
    walletService.removeWallet(address)
  );
  ipcMain.handle('wallet:export', async (_e, { address, password }: { address: string; password: string }) =>
    walletService.exportWallet(address, password)
  );

  // Vanity
  ipcMain.handle('wallet:vanity:start', async (_e, payload) => startVanityJob(payload));
  ipcMain.handle('wallet:vanity:list', async () => listVanityJobs());
  ipcMain.handle('wallet:vanity:poll', async (_e, { id }: { id: string }) => getVanityJob(id) ?? null);
  ipcMain.handle('wallet:vanity:cancel', async (_e, { id }: { id: string }) => cancelVanityJob(id) ?? null);

  // Hold settings (wallet-level)
  ipcMain.handle('wallet:hold:get', async () => getSecureSetting(HOLD_KEY, { enabled: true, holdHours: 24 }));
  ipcMain.handle('wallet:hold:set', async (_e, payload: { enabled: boolean; holdHours?: number }) => {
    const hours = Math.max(1, Math.min(Math.round(Number(payload.holdHours ?? 24)), 24 * 14));
    const data = { enabled: payload.enabled, holdHours: hours };
    await setSecureSetting(HOLD_KEY, data);
    return data;
  });

  // --- Safes ---
  ipcMain.handle('safe:load', async (_e, { address, rpcUrl }: { address: string; rpcUrl?: string }) =>
    connectToSafe(address, rpcUrl)
  );
  ipcMain.handle('safe:details', async (_e, { address }: { address: string }) => getSafeDetails(address));
  ipcMain.handle('safe:sync', async (_e, { address }: { address: string }) => {
    const safe = await syncSafeState(address);
    const profile = await getSafeDetails(address);
    return { ...safe, balance: profile.balance };
  });
  ipcMain.handle('safe:owners:list', async (_e, { address }: { address: string }) => getOwners(address));
  ipcMain.handle('safe:owners:add', async (_e, { address, owner, threshold, signerAddress, signerPassword }: { address: string; owner: string; threshold: number; signerAddress: string; signerPassword?: string }) =>
    addOwner(address, owner, threshold, signerAddress, signerPassword)
  );
  ipcMain.handle('safe:owners:remove', async (_e, { address, ownerAddress, threshold, signerAddress, signerPassword }: { address: string; ownerAddress: string; threshold: number; signerAddress: string; signerPassword?: string }) =>
    removeOwner(address, ownerAddress, threshold, signerAddress, signerPassword)
  );
  ipcMain.handle('safe:threshold:set', async (_e, { address, threshold, signerAddress, signerPassword }: { address: string; threshold: number; signerAddress: string; signerPassword?: string }) =>
    changeThreshold(address, threshold, signerAddress, signerPassword)
  );
  ipcMain.handle('safe:modules:enable', async (_e, { address, module, signerAddress, signerPassword }: { address: string; module: string; signerAddress: string; signerPassword?: string }) =>
    enableModule(address, module, signerAddress, signerPassword)
  );
  ipcMain.handle('safe:modules:disable', async (_e, { address, moduleAddress, signerAddress, signerPassword }: { address: string; moduleAddress: string; signerAddress: string; signerPassword?: string }) =>
    disableModule(address, moduleAddress, signerAddress, signerPassword)
  );
  ipcMain.handle('safe:delegates:add', async (_e, { address, delegateAddress, label }: { address: string; delegateAddress: string; label?: string }) =>
    addDelegate(address, { address: delegateAddress, label: label?.trim() || 'Proposer', since: new Date().toISOString() })
  );
  ipcMain.handle('safe:delegates:remove', async (_e, { address, delegateAddress }: { address: string; delegateAddress: string }) =>
    removeDelegate(address, delegateAddress)
  );
  ipcMain.handle('safe:fallback:set', async (_e, { address, handler, signerAddress, signerPassword }: { address: string; handler?: string; signerAddress: string; signerPassword?: string }) =>
    updateFallbackHandler(address, handler, signerAddress, signerPassword)
  );
  ipcMain.handle('safe:guard:set', async (_e, { address, guard, signerAddress, signerPassword }: { address: string; guard?: string; signerAddress: string; signerPassword?: string }) =>
    updateGuard(address, guard, signerAddress, signerPassword)
  );
  ipcMain.handle('safe:tx:propose', async (_e, { address, tx, meta, signerAddress, signerPassword }: { address: string; tx: { to: string; value?: string; data?: string; operation?: number }; meta?: Record<string, unknown>; signerAddress?: string; signerPassword?: string }) =>
    proposeTransaction(address, tx, meta, signerAddress, signerPassword)
  );
  ipcMain.handle('safe:tx:execute', async (_e, { address, txHash, signerAddress, signerPassword }: { address: string; txHash: string; signerAddress?: string; signerPassword?: string }) =>
    executeTransaction(address, txHash, signerAddress, signerPassword)
  );
  ipcMain.handle('safe:tx:held:list', async (_e, { address }: { address: string }) => {
    const [records, summary, effective] = await Promise.all([
      holdService.listHolds(address),
      Promise.resolve(holdService.summarize(address)),
      holdService.getEffectivePolicy(address)
    ]);
    return { records, summary, effective };
  });
  ipcMain.handle('safe:tx:held:release', async (_e, { txHash }: { txHash: string }) =>
    holdService.releaseNow(txHash) ?? { txHash, released: true }
  );
  ipcMain.handle('safe:hold:get', async (_e, { address }: { address: string }) => {
    const [policy, summary, effective] = await Promise.all([
      Promise.resolve(holdService.getHoldState(address)),
      Promise.resolve(holdService.summarize(address)),
      holdService.getEffectivePolicy(address)
    ]);
    return { policy, summary, effective };
  });
  ipcMain.handle('safe:hold:set', async (_e, { address, enabled, holdHours = 24 }: { address: string; enabled: boolean; holdHours?: number }) => {
    const policy = await holdService.setHoldState(address, enabled, holdHours);
    const summary = holdService.summarize(address);
    const effective = await holdService.getEffectivePolicy(address);
    return { policy, summary, effective };
  });
  ipcMain.handle('safe:policies:list', async () => holdService.listHoldPolicies());

  // --- Contracts ---
  ipcMain.handle('contract:list', async () => {
    const records = listContracts();
    const balances = await Promise.all(records.map((r) => getBalance(r.address)));
    return records.map((r, i) => ({ ...r, balance: balances[i] }));
  });
  ipcMain.handle('contract:add', async (_e, payload) => addContract(payload));
  ipcMain.handle('contract:remove', async (_e, { id }: { id: string }) => removeContract(id));
  ipcMain.handle('contract:abi:resolve', async (_e, { chainId, address, contractName }: { chainId?: number; address: string; contractName?: string }) =>
    abiResolver.resolve(Number(chainId) || 1, address, contractName)
  );

  // --- History ---
  ipcMain.handle('history:list', async () => getHistoryEntries());

  // --- Sandbox ---
  ipcMain.handle('sandbox:callstatic', async (_e, payload) => simulateCallStatic(payload));
  ipcMain.handle('sandbox:simulate', async (_e, payload) => simulateContract(payload));
  ipcMain.handle('sandbox:safe:simulate', async (_e, payload) => simulateSafe(payload));
  ipcMain.handle('sandbox:abi:load', async (_e, payload) => loadAbi(payload));
  ipcMain.handle('sandbox:abi:list', async () => listAbis());
  ipcMain.handle('sandbox:history:get', async () => getHistory());
  ipcMain.handle('sandbox:history:clear', async () => { clearHistory(); return null; });
  ipcMain.handle('sandbox:fork:start', async (_e, { rpcUrl, blockNumber, port, command }: {
    rpcUrl: string; blockNumber?: number; port?: number; command?: string
  }) => startFork(rpcUrl, blockNumber, port, command));
  ipcMain.handle('sandbox:fork:stop', async () => stopFork());
  ipcMain.handle('sandbox:fork:status', async () => forkStatus());

  // --- Settings ---
  ipcMain.handle('settings:hold:get', async () => getSecureSetting(HOLD_KEY, { enabled: true, holdHours: 24 }));
  ipcMain.handle('settings:hold:set', async (_e, payload: { enabled: boolean; holdHours?: number }) => {
    const hours = Math.max(1, Math.min(Math.round(Number(payload.holdHours ?? 24)), 24 * 14));
    const data = { enabled: payload.enabled, holdHours: hours };
    await setSecureSetting(HOLD_KEY, data);
    return data;
  });
  ipcMain.handle('settings:runtime:observability', async () => runtimeObservability.snapshot());

  ipcMain.handle('settings:export', async (_e, { password }: { password: string }) => {
    const bundle = await exportEncryptedWorkspace(password);
    return {
      filename: `gnoman-export-${bundle.createdAt.replace(/[:.]/g, '-')}.json`,
      bundle
    };
  });

  // --- License ---
  ipcMain.handle('license:get', async () => licenseService.getStatus());
  ipcMain.handle('license:apply', async (_e, { token }: { token: string }) => licenseService.applyLicense(token));

  // --- Dev Tools ---
  ipcMain.handle('devtools:discover', async (_e, { address, chainId }: { address: string; chainId?: number }) =>
    discoverContract(address, chainId)
  );
  ipcMain.handle('devtools:gas:estimate', async (_e, payload: {
    address: string; chainId?: number; functionSignature: string; args?: string[]; from?: string; value?: string
  }) => estimateGasForFunction({ ...payload, args: Array.isArray(payload.args) ? payload.args : [] }));
  ipcMain.handle('devtools:scan', async (_e, { address, chainId, sourceCode }: { address?: string; chainId?: number; sourceCode?: string }) => {
    let source = sourceCode?.trim() ?? '';
    let sourceName = 'manual';
    if (!source && address?.trim()) {
      const fetched = await fetchSourceCode(address, chainId);
      source = fetched.sourceCode;
      sourceName = fetched.contractName;
    }
    const report = scanSourceCode(source);
    return { sourceName, findings: report.findings, overallRiskScore: report.overallRiskScore };
  });
  ipcMain.handle('devtools:decode', async (_e, payload) => decodePayload(payload));

  // --- Robinhood ---
  ipcMain.handle('robinhood:credentials:get', async () => {
    const { getRobinhoodCryptoConfigStatus, validateRobinhoodCryptoAuth } = await import('../../backend/services/robinhood/integrationService');
    const [status, auth] = await Promise.all([getRobinhoodCryptoConfigStatus(), validateRobinhoodCryptoAuth()]);
    return { ...status, auth };
  });
  ipcMain.handle('robinhood:credentials:set', async (_e, { apiKey, privateKey }: { apiKey: string; privateKey: string }) => {
    const { setRobinhoodCryptoConfig } = await import('../../backend/services/robinhood/integrationService');
    return setRobinhoodCryptoConfig(apiKey, privateKey);
  });
  ipcMain.handle('robinhood:order:buy', async (_e, { symbol, cashAmount }: { symbol: string; cashAmount: number }) => {
    const { purchaseRobinhoodCryptoWithCash } = await import('../../backend/services/robinhood/integrationService');
    return purchaseRobinhoodCryptoWithCash(symbol, cashAmount);
  });
  ipcMain.handle('robinhood:order:status', async (_e, { orderId }: { orderId: string }) => {
    const { getRobinhoodCryptoOrderStatus } = await import('../../backend/services/robinhood/integrationService');
    return getRobinhoodCryptoOrderStatus(orderId);
  });
  ipcMain.handle('robinhood:order:cancel', async (_e, { orderId }: { orderId: string }) => {
    const { cancelRobinhoodCryptoOrder } = await import('../../backend/services/robinhood/integrationService');
    return cancelRobinhoodCryptoOrder(orderId);
  });
  ipcMain.handle('robinhood:accounts:get', async () => {
    const { getRobinhoodCryptoAccounts } = await import('../../backend/services/robinhood/integrationService');
    return getRobinhoodCryptoAccounts();
  });
  ipcMain.handle('robinhood:market:get', async (_e, { symbol }: { symbol: string }) => {
    const { getRobinhoodCryptoMarketData } = await import('../../backend/services/robinhood/integrationService');
    return getRobinhoodCryptoMarketData(symbol);
  });

  // --- Session (ephemeral) wallets ---
  ipcMain.handle('wallet:session:generate', async (_e, { label }: { label?: string }) =>
    sessionWalletService.generate(label)
  );
  ipcMain.handle('wallet:session:import:privatekey', async (_e, { privateKey, label }: { privateKey: string; label?: string }) =>
    sessionWalletService.importByPrivateKey(privateKey, label)
  );
  ipcMain.handle('wallet:session:import:mnemonic', async (_e, { mnemonic, derivationPath, label }: { mnemonic: string; derivationPath?: string; label?: string }) =>
    sessionWalletService.importByMnemonic(mnemonic, derivationPath, label)
  );
  ipcMain.handle('wallet:session:list', async () => sessionWalletService.list());
  ipcMain.handle('wallet:session:delete', async (_e, { id }: { id: string }) => sessionWalletService.delete(id));
  ipcMain.handle('wallet:session:rotate', async (_e, { id }: { id: string }) => sessionWalletService.rotate(id));
  ipcMain.handle('wallet:session:clear', async () => { sessionWalletService.clearAll(); return null; });

  // --- Runtime ---
  ipcMain.handle('runtime:telemetry', async () => {
    // Eagerly probe known RPC secrets so the diagnostics panel shows their status even
    // before any operation that would resolve them has been triggered.
    await resolveRpcUrl().catch(() => undefined);
    return runtimeTelemetry.getSnapshot();
  });
  ipcMain.handle('runtime:capabilities', async () => ({
    safe: { enabled: true, reason: 'ok' },
    etherscan: {
      enabled: process.env.ETHERSCAN_ENABLED !== 'false' && Boolean(process.env.ETHERSCAN_API_KEY?.trim()),
      reason: process.env.ETHERSCAN_ENABLED === 'false' ? 'disabled_flag' : process.env.ETHERSCAN_API_KEY?.trim() ? 'ok' : 'missing_key'
    },
    robinhood: { enabled: false, reason: 'disabled' }
  }));
};
