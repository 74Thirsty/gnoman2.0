import { contextBridge, ipcRenderer } from "electron";

const api = {
  invoke: <T = unknown>(channel: string, payload?: unknown): Promise<T> =>
    ipcRenderer.invoke(channel, payload) as Promise<T>
};

contextBridge.exposeInMainWorld("gnoman", api);

declare global {
  interface Window {
    gnoman: typeof api;
  }
}

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { validateAndSave, loadToken } = require("./licenseBridge") as typeof import("./licenseBridge");
  contextBridge.exposeInMainWorld("safevault", {
    validateLicense: (key: string) => validateAndSave(key),
    loadLicense: () => {
      const token = loadToken();
      if (!token) return { ok: false, reason: "none" };
      return validateAndSave(token);
    },
  });
} catch {
  console.warn("safevault bridge unavailable");
}
