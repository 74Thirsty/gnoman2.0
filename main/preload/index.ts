import { contextBridge, ipcRenderer } from 'electron';
import { loadToken, validateAndSave } from './licenseBridge';

type IpcChannels = 'keyring:list' | 'keyring:add' | 'keyring:get' | 'keyring:delete';

type GnomanAPI = {
  invoke: <T = unknown>(channel: IpcChannels, payload?: unknown) => Promise<T>;
};

const api: GnomanAPI = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload)
};

contextBridge.exposeInMainWorld('gnoman', api);

contextBridge.exposeInMainWorld('safevault', {
  validateLicense: (key: string) => validateAndSave(key),
  loadLicense: () => {
    const token = loadToken();
    if (!token) return { ok: false, reason: 'none' } as const;
    return validateAndSave(token);
  }
});
