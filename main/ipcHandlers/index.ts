import type { IpcMain } from 'electron';
import keyringManager from '../../src/core/keyringManager';
import * as walletService from '../../backend/services/walletService';
import { addContract, listContracts, removeContract } from '../../backend/services/contractRegistryService';
import { getBalance } from '../../backend/services/rpcService';
import { abiResolver } from '../../backend/utils/abiResolver';
import {
  addDelegate,
  addOwner,
  changeThreshold,
  connectToSafe,
  disableModule,
  discoverAllowanceRevocations,
  enableModule,
  executeTransaction,
  getSafeDetails,
  proposeAllowanceRevocations,
  proposeTransaction,
  removeDelegate,
  removeOwner,
  syncSafeState,
  updateFallbackHandler,
  updateGuard
} from '../../backend/services/safeService';
import { holdService } from '../../backend/services/transactionHoldService';
import { cancelVanityJob, listVanityJobs, startVanityJob } from '../../backend/services/vanityService';

const createIpcError = (message: string, code: number, extra?: Record<string, unknown>) =>
  Object.assign(new Error(message), { code, ...extra });

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
    'safe:allowances:discover',
    async (
      _event,
      payload: { address: string; whitelist?: string[]; minimumAllowance?: string; chunkSize?: number }
    ) => {
      return discoverAllowanceRevocations(payload.address, payload);
    }
  );

  ipcMain.handle(
    'safe:allowances:revoke',
    async (
      _event,
      payload: { address: string; whitelist?: string[]; minimumAllowance?: string; chunkSize?: number }
    ) => {
      return proposeAllowanceRevocations(payload.address, payload);
    }
  );

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
};
