import { contextBridge, ipcRenderer } from 'electron';
import { validateAndSave, loadToken } from './licenseBridge';

contextBridge.exposeInMainWorld('safevault', {
  validateLicense: (key: string) => validateAndSave(key),
  loadLicense: () => {
    const token = loadToken();
    if (!token) return { ok: false, reason: 'none' };
    return validateAndSave(token);
  }
});

type IpcChannels =
  | 'keyring:list'
  | 'keyring:add'
  | 'keyring:get'
  | 'keyring:delete'
  | 'keyring:secrets:list'
  | 'keyring:secrets:set'
  | 'keyring:secrets:get'
  | 'keyring:secrets:delete'
  | 'keyring:backend:get'
  | 'keyring:backend:switch'
  | 'wallet:list'
  | 'wallet:details'
  | 'wallet:generate'
  | 'wallet:import:mnemonic'
  | 'wallet:import:privateKey'
  | 'wallet:send'
  | 'wallet:remove'
  | 'wallet:vanity:list'
  | 'wallet:vanity:start'
  | 'wallet:vanity:cancel'
  | 'contract:list'
  | 'contract:add'
  | 'contract:remove'
  | 'contract:abi:resolve'
  | 'safe:load'
  | 'safe:details'
  | 'safe:sync'
  | 'safe:owners:add'
  | 'safe:owners:remove'
  | 'safe:threshold'
  | 'safe:modules:enable'
  | 'safe:modules:disable'
  | 'safe:delegates:add'
  | 'safe:delegates:remove'
  | 'safe:fallback'
  | 'safe:guard'
  | 'safe:tx:propose'
  | 'safe:tx:execute'
  | 'safe:tx:held'
  | 'safe:hold:get'
  | 'safe:hold:set'
  | 'safe:hold:release'
  | 'safe:hold:policies'
  | 'history:list'
  | 'license:get'
  | 'license:apply'
  | 'settings:transactionHold:get'
  | 'settings:transactionHold:set'
  | 'runtime:telemetry'
  | 'runtime:capabilities'
  | 'runtime:observability'
  | 'robinhood:credentials:get'
  | 'robinhood:credentials:set'
  | 'robinhood:orders:create'
  | 'devtools:discover'
  | 'devtools:gas:estimate'
  | 'devtools:scanner:scan'
  | 'devtools:decoder:decode'
  | 'sandbox:call-static'
  | 'sandbox:contract:abi'
  | 'sandbox:contract:abis'
  | 'sandbox:contract:simulate'
  | 'sandbox:contract:history:list'
  | 'sandbox:contract:history:clear'
  | 'sandbox:fork:start'
  | 'sandbox:fork:stop'
  | 'sandbox:fork:status';

type GnomanAPI = {
  invoke: <T = unknown>(channel: IpcChannels, payload?: unknown) => Promise<T>;
};

const api: GnomanAPI = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload)
};

contextBridge.exposeInMainWorld('gnoman', api);

declare global {
  interface Window {
    gnoman: GnomanAPI;
  }
}
