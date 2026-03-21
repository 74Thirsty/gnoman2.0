import type { IpcMain } from 'electron';
import keyringManager from '../../src/core/keyringManager';
import { runtimeObservability } from '../../src/utils/runtimeObservability';
import * as walletService from '../../backend/services/walletService';
import { addContract, listContracts, removeContract } from '../../backend/services/contractRegistryService';
import { getBalance } from '../../backend/services/rpcService';
import { abiResolver } from '../../backend/utils/abiResolver';
import { getSecureSetting, setSecureSetting } from '../../backend/services/secureSettingsService';
import { runtimeTelemetry } from '../../backend/services/runtimeTelemetryService';
import { getHistoryEntries } from '../../backend/services/historyService';
import {
  addDelegate,
  addOwner,
  changeThreshold,
  connectToSafe,
  disableModule,
  enableModule,
  executeTransaction,
  getSafeDetails,
  proposeTransaction,
  removeDelegate,
  removeOwner,
  syncSafeState,
  updateFallbackHandler,
  updateGuard
} from '../../backend/services/safeService';
import { holdService } from '../../backend/services/transactionHoldService';
import { cancelVanityJob, listVanityJobs, startVanityJob } from '../../backend/services/vanityService';
import { licenseService } from '../../backend/services/licenseService';
import {
  getRobinhoodCryptoConfigStatus,
  purchaseRobinhoodCryptoWithCash,
  setRobinhoodCryptoConfig,
  validateRobinhoodCryptoAuth
} from '../../backend/services/robinhood/integrationService';
import {
  decodePayload,
  discoverContract,
  estimateGasForFunction,
  fetchSourceCode,
  scanSourceCode
} from '../../backend/services/devToolsService';
import {
  getHistory as getSandboxHistory,
  clearHistory as clearSandboxHistory,
  forkStatus,
  listAbis,
  loadAbi,
  simulateCallStatic,
  simulateContract,
  startFork,
  stopFork
} from '../../backend/services/sandboxService';

const createIpcError = (message: string, code: number, extra?: Record<string, unknown>) =>
  Object.assign(new Error(message), { code, ...extra });

const HOLD_KEY = 'SAFE_TX_HOLD_ENABLED';
const SUPPORTED_KEYRING_BACKENDS = ['system', 'file', 'memory'] as const;

const isKeyringBackend = (value: unknown): value is (typeof SUPPORTED_KEYRING_BACKENDS)[number] =>
  typeof value === 'string' && SUPPORTED_KEYRING_BACKENDS.includes(value as never);

const parseChainId = (value: unknown) => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
};

const maskValue = (value: string | null) => {
  if (!value) {
    return null;
  }
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

const getRuntimeCapabilities = async () => {
  const safeEnabled = true;
  const etherscanEnabled =
    process.env.ETHERSCAN_ENABLED !== 'false' && Boolean(process.env.ETHERSCAN_API_KEY?.trim());
  const robinhoodStatus = await getRobinhoodCryptoConfigStatus();
  return {
    safe: { enabled: safeEnabled, reason: safeEnabled ? 'ok' : 'disabled' },
    etherscan: {
      enabled: etherscanEnabled,
      reason:
        process.env.ETHERSCAN_ENABLED === 'false'
          ? 'disabled_flag'
          : process.env.ETHERSCAN_API_KEY?.trim()
            ? 'ok'
            : 'missing_key'
    },
    robinhood: {
      enabled: robinhoodStatus.enabled && robinhoodStatus.configured,
      reason:
        process.env.ENABLE_ROBINHOOD_CRYPTO !== 'true'
          ? 'disabled'
          : robinhoodStatus.configured
            ? 'ok'
            : 'missing_creds'
    }
  };
};

export const registerIpcHandlers = (ipcMain: IpcMain) => {
  ipcMain.handle('keyring:list', async () => {
    const secrets = await keyringManager.list();
    return Object.keys(secrets).map((key) => ({ alias: key }));
  });

  ipcMain.handle('keyring:add', async (_event, payload: { alias: string; secret: string }) => {
    await keyringManager.set(payload.alias, payload.secret);
    return true;
  });

  ipcMain.handle('keyring:get', async (_event, payload: { alias: string }) => {
    return keyringManager.get(payload.alias);
  });

  ipcMain.handle('keyring:delete', async (_event, payload: { alias: string }) => {
    await keyringManager.delete(payload.alias);
    return true;
  });

  ipcMain.handle('keyring:secrets:list', async (_event, payload?: { service?: string }) => {
    if (payload?.service !== undefined) {
      if (!isKeyringBackend(payload.service)) {
        throw createIpcError('Unsupported backend. Use system, file, or memory.', 400);
      }
      await keyringManager.switchBackend(payload.service);
    }
    const backend = keyringManager.currentBackend();
    const secrets = await keyringManager.list();
    return {
      service: backend,
      backend,
      secrets: Object.entries(secrets).map(([key, value]) => ({
        key,
        maskedValue: maskValue(value)
      }))
    };
  });

  ipcMain.handle('keyring:secrets:set', async (_event, payload: { key?: string; value?: string; service?: string }) => {
    if (payload.service !== undefined) {
      if (!isKeyringBackend(payload.service)) {
        throw createIpcError('Unsupported backend. Use system, file, or memory.', 400);
      }
      await keyringManager.switchBackend(payload.service);
    }
    if (typeof payload.key !== 'string' || payload.key.trim() === '') {
      throw createIpcError('key is required', 400);
    }
    if (typeof payload.value !== 'string') {
      throw createIpcError('value must be a string', 400);
    }
    await keyringManager.set(payload.key, payload.value);
    const backend = keyringManager.currentBackend();
    return { key: payload.key, backend, service: backend, maskedValue: maskValue(payload.value) };
  });

  ipcMain.handle('keyring:secrets:get', async (_event, payload: { key?: string; service?: string }) => {
    if (payload.service !== undefined) {
      if (!isKeyringBackend(payload.service)) {
        throw createIpcError('Unsupported backend. Use system, file, or memory.', 400);
      }
      await keyringManager.switchBackend(payload.service);
    }
    if (typeof payload.key !== 'string' || payload.key.trim() === '') {
      throw createIpcError('key is required', 400);
    }
    const value = await keyringManager.get(payload.key);
    if (value === null) {
      throw createIpcError('Secret not found', 404);
    }
    const backend = keyringManager.currentBackend();
    return { key: payload.key, value, backend, service: backend };
  });

  ipcMain.handle('keyring:secrets:delete', async (_event, payload: { key?: string; service?: string }) => {
    if (payload.service !== undefined) {
      if (!isKeyringBackend(payload.service)) {
        throw createIpcError('Unsupported backend. Use system, file, or memory.', 400);
      }
      await keyringManager.switchBackend(payload.service);
    }
    if (typeof payload.key !== 'string' || payload.key.trim() === '') {
      throw createIpcError('key is required', 400);
    }
    await keyringManager.delete(payload.key);
    const backend = keyringManager.currentBackend();
    return { key: payload.key, backend, service: backend, deleted: true };
  });

  ipcMain.handle('keyring:backend:get', async () => {
    const active = keyringManager.currentBackend();
    return { active, service: active, backend: active, available: [...SUPPORTED_KEYRING_BACKENDS] };
  });

  ipcMain.handle('keyring:backend:switch', async (_event, payload: { service?: string }) => {
    if (!isKeyringBackend(payload.service)) {
      throw createIpcError('Unsupported backend. Use system, file, or memory.', 400);
    }
    await keyringManager.switchBackend(payload.service);
    const active = keyringManager.currentBackend();
    return { active, service: active, backend: active, available: [...SUPPORTED_KEYRING_BACKENDS] };
  });

  ipcMain.handle('wallet:list', async () => walletService.listWalletMetadata());

  ipcMain.handle('wallet:details', async (_event, payload: { address: string }) => {
    return walletService.getWalletDetails(payload.address);
  });

  ipcMain.handle(
    'wallet:generate',
    async (_event, payload: { alias?: string; password?: string; hidden?: boolean } = {}) => {
      return walletService.createRandomWallet({
        alias: payload.alias,
        password: payload.password,
        hidden: Boolean(payload.hidden)
      });
    }
  );

  ipcMain.handle(
    'wallet:import:mnemonic',
    async (
      _event,
      payload: {
        mnemonic: string;
        derivationPath?: string;
        alias?: string;
        password?: string;
        hidden?: boolean;
      }
    ) => {
      return walletService.importWalletFromMnemonic({
        mnemonic: payload.mnemonic,
        derivationPath: payload.derivationPath,
        alias: payload.alias,
        password: payload.password,
        hidden: Boolean(payload.hidden)
      });
    }
  );

  ipcMain.handle(
    'wallet:import:privateKey',
    async (
      _event,
      payload: { privateKey: string; alias?: string; password?: string; hidden?: boolean }
    ) => {
      return walletService.importWalletFromPrivateKey({
        privateKey: payload.privateKey,
        alias: payload.alias,
        password: payload.password,
        hidden: Boolean(payload.hidden)
      });
    }
  );

  ipcMain.handle(
    'wallet:send',
    async (
      _event,
      payload: { address: string; password: string; to: string; value?: string; data?: string }
    ) => {
      return walletService.sendWalletTransaction(payload);
    }
  );

  ipcMain.handle('wallet:remove', async (_event, payload: { address: string }) => {
    return walletService.removeWallet(payload.address);
  });

  ipcMain.handle('wallet:vanity:list', async () => {
    return listVanityJobs();
  });

  ipcMain.handle(
    'wallet:vanity:start',
    async (
      _event,
      payload: {
        prefix?: string;
        suffix?: string;
        regex?: string;
        derivationPath?: string;
        maxAttempts?: number;
        label?: string;
      }
    ) => {
      return startVanityJob(payload);
    }
  );

  ipcMain.handle('wallet:vanity:cancel', async (_event, payload: { id: string }) => {
    const job = cancelVanityJob(payload.id);
    if (!job) {
      throw createIpcError('Vanity job not found', 404);
    }
    return job;
  });

  ipcMain.handle('contract:list', async () => {
    const records = listContracts();
    const balances = await Promise.all(records.map((record) => getBalance(record.address)));
    return records.map((record, index) => ({
      ...record,
      balance: balances[index]
    }));
  });

  ipcMain.handle(
    'contract:add',
    async (
      _event,
      payload: { address: string; name?: string; network?: string; tags?: string[]; type?: string; abi?: string }
    ) => {
      return addContract(payload);
    }
  );

  ipcMain.handle('contract:remove', async (_event, payload: { id: string }) => {
    const removed = removeContract(payload.id);
    if (!removed) {
      throw createIpcError('Contract not found', 404);
    }
    return removed;
  });

  ipcMain.handle(
    'contract:abi:resolve',
    async (_event, payload: { chainId?: number; address: string; contractName?: string }) => {
      return abiResolver.resolve(payload.chainId || 1, payload.address, payload.contractName);
    }
  );

  ipcMain.handle('safe:load', async (_event, payload: { address: string; rpcUrl?: string }) => {
    return connectToSafe(payload.address, payload.rpcUrl);
  });

  ipcMain.handle('safe:details', async (_event, payload: { address: string }) => {
    return getSafeDetails(payload.address);
  });

  ipcMain.handle('safe:sync', async (_event, payload: { address: string }) => {
    const safe = await syncSafeState(payload.address);
    const details = await getSafeDetails(payload.address);
    return {
      address: safe.address,
      threshold: safe.threshold,
      owners: safe.owners,
      modules: safe.modules,
      delegates: safe.delegates,
      fallbackHandler: safe.fallbackHandler,
      guard: safe.guard,
      rpcUrl: safe.rpcUrl,
      network: safe.network,
      balance: details.balance
    };
  });

  ipcMain.handle('safe:owners:add', async (_event, payload: { address: string; owner: string; threshold: number }) => {
    return addOwner(payload.address, payload.owner, payload.threshold);
  });

  ipcMain.handle(
    'safe:owners:remove',
    async (_event, payload: { address: string; ownerAddress: string; threshold: number }) => {
      return removeOwner(payload.address, payload.ownerAddress, payload.threshold);
    }
  );

  ipcMain.handle('safe:threshold', async (_event, payload: { address: string; threshold: number }) => {
    return changeThreshold(payload.address, payload.threshold);
  });

  ipcMain.handle('safe:modules:enable', async (_event, payload: { address: string; module: string }) => {
    return enableModule(payload.address, payload.module);
  });

  ipcMain.handle(
    'safe:modules:disable',
    async (_event, payload: { address: string; moduleAddress: string }) => {
      return disableModule(payload.address, payload.moduleAddress);
    }
  );

  ipcMain.handle(
    'safe:delegates:add',
    async (_event, payload: { address: string; delegateAddress: string; label?: string }) => {
      return addDelegate(payload.address, {
        address: payload.delegateAddress,
        label: payload.label?.trim() || 'Proposer',
        since: new Date().toISOString()
      });
    }
  );

  ipcMain.handle(
    'safe:delegates:remove',
    async (_event, payload: { address: string; delegateAddress: string }) => {
      return removeDelegate(payload.address, payload.delegateAddress);
    }
  );

  ipcMain.handle('safe:fallback', async (_event, payload: { address: string; handler?: string }) => {
    return updateFallbackHandler(payload.address, payload.handler);
  });

  ipcMain.handle('safe:guard', async (_event, payload: { address: string; guard?: string }) => {
    return updateGuard(payload.address, payload.guard);
  });

  ipcMain.handle('safe:tx:propose', async (_event, payload: { address: string; tx: unknown; meta?: Record<string, unknown> }) => {
    return proposeTransaction(payload.address, payload.tx, payload.meta);
  });

  ipcMain.handle(
    'safe:tx:execute',
    async (_event, payload: { address: string; txHash: string; password?: string }) => {
      const hold = holdService.getHold(payload.txHash);
      if (hold && !holdService.canExecute(hold)) {
        throw createIpcError('Transaction is still in hold period', 423, { hold });
      }
      const execution = await executeTransaction(payload.address, payload.txHash, payload.password);
      if (hold) {
        holdService.markExecuted(payload.txHash);
      }
      return execution;
    }
  );

  ipcMain.handle('safe:tx:held', async (_event, payload: { address: string }) => {
    const [records, effective] = await Promise.all([
      Promise.resolve(holdService.listHolds(payload.address)),
      holdService.getEffectivePolicy(payload.address)
    ]);
    const summary = holdService.summarize(payload.address);
    return { records, summary, effective };
  });

  ipcMain.handle('safe:hold:get', async (_event, payload: { address: string }) => {
    const [effective] = await Promise.all([holdService.getEffectivePolicy(payload.address)]);
    const policy = holdService.getHoldState(payload.address);
    const summary = holdService.summarize(payload.address);
    return { policy, summary, effective };
  });

  ipcMain.handle(
    'safe:hold:set',
    async (_event, payload: { address: string; enabled: boolean; holdHours: number }) => {
      const policy = await holdService.setHoldState(payload.address, payload.enabled, payload.holdHours);
      const [effective] = await Promise.all([holdService.getEffectivePolicy(payload.address)]);
      const summary = holdService.summarize(payload.address);
      return { policy, summary, effective };
    }
  );

  ipcMain.handle('safe:hold:release', async (_event, payload: { address: string; txHash: string }) => {
    return holdService.releaseNow(payload.txHash) ?? { txHash: payload.txHash, released: true };
  });

  ipcMain.handle('safe:hold:policies', async () => {
    return holdService.listHoldPolicies();
  });

  ipcMain.handle('history:list', async () => {
    return getHistoryEntries();
  });

  ipcMain.handle('license:get', async () => {
    return licenseService.getStatus();
  });

  ipcMain.handle('license:apply', async (_event, payload: { token?: string }) => {
    if (!payload.token?.trim()) {
      throw createIpcError('A license token is required.', 400);
    }
    try {
      return licenseService.applyLicense(payload.token);
    } catch (error) {
      throw createIpcError(
        error instanceof Error ? error.message : 'Unable to apply license token.',
        400
      );
    }
  });

  ipcMain.handle('settings:transactionHold:get', async () => {
    return getSecureSetting(HOLD_KEY, { enabled: true, holdHours: 24 });
  });

  ipcMain.handle(
    'settings:transactionHold:set',
    async (_event, payload: { enabled?: boolean; holdHours?: number }) => {
      if (typeof payload.enabled !== 'boolean') {
        throw createIpcError('enabled must be a boolean', 400);
      }
      const numericHours = Number(payload.holdHours ?? 24);
      if (!Number.isFinite(numericHours)) {
        throw createIpcError('holdHours must be a number', 400);
      }
      const normalizedHours = Math.max(1, Math.min(Math.round(numericHours), 24 * 14));
      const nextPolicy = { enabled: payload.enabled, holdHours: normalizedHours };
      await setSecureSetting(HOLD_KEY, nextPolicy);
      return nextPolicy;
    }
  );

  ipcMain.handle('runtime:telemetry', async () => {
    return runtimeTelemetry.getSnapshot();
  });

  ipcMain.handle('runtime:capabilities', async () => {
    return getRuntimeCapabilities();
  });

  ipcMain.handle('runtime:observability', async () => {
    return runtimeObservability.snapshot();
  });

  ipcMain.handle('robinhood:credentials:get', async () => {
    const [status, auth] = await Promise.all([
      getRobinhoodCryptoConfigStatus(),
      validateRobinhoodCryptoAuth()
    ]);
    return { ...status, auth };
  });

  ipcMain.handle(
    'robinhood:credentials:set',
    async (_event, payload: { apiKey?: string; privateKey?: string }) => {
      if (!payload.apiKey?.trim()) {
        throw createIpcError('apiKey is required.', 400);
      }
      if (!payload.privateKey?.trim()) {
        throw createIpcError('privateKey is required.', 400);
      }
      const status = await setRobinhoodCryptoConfig(payload.apiKey, payload.privateKey);
      const auth = await validateRobinhoodCryptoAuth();
      return { ...status, auth };
    }
  );

  ipcMain.handle('robinhood:orders:create', async (_event, payload: { symbol?: string; cashAmount?: number }) => {
    if (!payload.symbol?.trim()) {
      throw createIpcError('symbol is required.', 400);
    }
    const cashAmount = Number(payload.cashAmount);
    if (!Number.isFinite(cashAmount) || cashAmount <= 0) {
      throw createIpcError('cashAmount must be a positive number.', 400);
    }
    if (cashAmount < 2000) {
      throw createIpcError('cashAmount must be at least 2000.', 400);
    }
    return purchaseRobinhoodCryptoWithCash(payload.symbol, cashAmount);
  });

  ipcMain.handle('devtools:discover', async (_event, payload: { address?: string; chainId?: number }) => {
    if (!payload.address?.trim()) {
      throw createIpcError('address is required.', 400);
    }
    return discoverContract(payload.address, payload.chainId);
  });

  ipcMain.handle(
    'devtools:gas:estimate',
    async (
      _event,
      payload: {
        address?: string;
        chainId?: number;
        functionSignature?: string;
        args?: string[];
        from?: string;
        value?: string;
      }
    ) => {
      if (!payload.address?.trim() || !payload.functionSignature?.trim()) {
        throw createIpcError('address and functionSignature are required.', 400);
      }
      return estimateGasForFunction({
        address: payload.address,
        chainId: payload.chainId,
        functionSignature: payload.functionSignature,
        args: Array.isArray(payload.args) ? payload.args : [],
        from: payload.from,
        value: payload.value
      });
    }
  );

  ipcMain.handle(
    'devtools:scanner:scan',
    async (_event, payload: { address?: string; chainId?: number | string; sourceCode?: string }) => {
      let finalSource = payload.sourceCode?.trim() ?? '';
      let sourceName = 'manual';
      if (!finalSource && payload.address?.trim()) {
        const fetched = await fetchSourceCode(payload.address, parseChainId(payload.chainId));
        finalSource = fetched.sourceCode;
        sourceName = fetched.contractName;
      }
      if (!finalSource) {
        throw createIpcError('Either address or sourceCode must be provided.', 400);
      }
      const report = scanSourceCode(finalSource);
      return {
        sourceName,
        findings: report.findings,
        overallRiskScore: report.overallRiskScore
      };
    }
  );

  ipcMain.handle(
    'devtools:decoder:decode',
    async (
      _event,
      payload: {
        mode?: 'txHash' | 'rawCalldata' | 'eventLog';
        chainId?: number;
        txHash?: string;
        address?: string;
        calldata?: string;
        topics?: string[];
        eventData?: string;
      }
    ) => {
      if (!payload.mode) {
        throw createIpcError('mode is required.', 400);
      }
      return decodePayload(payload as never);
    }
  );

  ipcMain.handle('sandbox:call-static', async (_event, payload) => {
    return simulateCallStatic(payload as never);
  });

  ipcMain.handle('sandbox:contract:abi', async (_event, payload: { abi?: string; name?: string }) => {
    if (!payload.abi?.trim()) {
      throw createIpcError('abi is required', 400);
    }
    return loadAbi({ abi: payload.abi, name: payload.name });
  });

  ipcMain.handle('sandbox:contract:abis', async () => {
    return listAbis();
  });

  ipcMain.handle('sandbox:contract:simulate', async (_event, payload) => {
    return simulateContract(payload as never);
  });

  ipcMain.handle('sandbox:contract:history:list', async () => {
    return getSandboxHistory();
  });

  ipcMain.handle('sandbox:contract:history:clear', async () => {
    clearSandboxHistory();
    return true;
  });

  ipcMain.handle(
    'sandbox:fork:start',
    async (_event, payload: { rpcUrl: string; blockNumber?: number; port?: number; command?: string }) => {
      return startFork(payload.rpcUrl, payload.blockNumber, payload.port, payload.command);
    }
  );

  ipcMain.handle('sandbox:fork:stop', async () => {
    return stopFork();
  });

  ipcMain.handle('sandbox:fork:status', async () => {
    return forkStatus();
  });
};
