import { contextBridge, ipcRenderer } from 'electron';

type IpcChannels = 'keyring:list' | 'keyring:add' | 'keyring:get' | 'keyring:delete';

type SafeVaultAPI = {
  invoke: <T = unknown>(channel: IpcChannels, payload?: unknown) => Promise<T>;
};

const api: SafeVaultAPI = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload)
};

contextBridge.exposeInMainWorld('safevault', api);

declare global {
  interface Window {
    safevault: SafeVaultAPI;
  }
}
