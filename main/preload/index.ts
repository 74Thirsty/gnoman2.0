import { contextBridge, ipcRenderer } from 'electron';
import { validateAndSave, loadToken } from './licenseBridge';
import type { LicenseValidationResult } from './licenseBridge';

type IpcChannels = 'keyring:list' | 'keyring:add' | 'keyring:get' | 'keyring:delete';

type GnomanAPI = {
  invoke: <T = unknown>(channel: IpcChannels, payload?: unknown) => Promise<T>;
};

const gnomanApi: GnomanAPI = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload)
};

contextBridge.exposeInMainWorld('gnoman', gnomanApi);

contextBridge.exposeInMainWorld('safevault', {
  validateLicense: (key: string): LicenseValidationResult => validateAndSave(key),
  loadLicense: (): LicenseValidationResult => {
    const token = loadToken();
    if (!token) {
      return { ok: false, reason: 'none' };
    }
    return validateAndSave(token);
  }
});

declare global {
  interface Window {
    gnoman: GnomanAPI;
    safevault?: {
      validateLicense: (key: string) => LicenseValidationResult;
      loadLicense: () => LicenseValidationResult;
    };
  }
}
