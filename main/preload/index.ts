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
  | 'safe:allowances:discover'
  | 'safe:allowances:revoke'
  | 'safe:tx:execute'
  | 'safe:tx:held'
  | 'safe:hold:get'
  | 'safe:hold:set'
  | 'safe:hold:release'
  | 'safe:hold:policies';

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
