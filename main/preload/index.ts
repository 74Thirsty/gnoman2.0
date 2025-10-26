import { contextBridge } from "electron";
import { validateAndSave, loadToken } from "./licenseBridge";

contextBridge.exposeInMainWorld("safevault", {
  validateLicense: (key: string) => validateAndSave(key),
  loadLicense: () => {
    const token = loadToken();
    if (!token) return { ok: false, reason: "none" };
    return validateAndSave(token);
  },
});

import { ipcRenderer } from "electron";

type IpcChannels = "keyring:list" | "keyring:add" | "keyring:get" | "keyring:delete";

type GnomanAPI = {
  invoke: <T = unknown>(channel: IpcChannels, payload?: unknown) => Promise<T>;
};

const api: GnomanAPI = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload)
};

contextBridge.exposeInMainWorld("gnoman", api);

declare global {
  interface Window {
    gnoman: GnomanAPI;
  }
}
