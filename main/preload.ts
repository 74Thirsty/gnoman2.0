import { contextBridge, ipcRenderer } from 'electron';

type IpcChannels = 'keyring:list' | 'keyring:add' | 'keyring:get' | 'keyring:delete';

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
