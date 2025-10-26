declare global {
  interface Window {
    gnoman?: {
      invoke: <T = unknown>(channel: 'keyring:list' | 'keyring:add' | 'keyring:get' | 'keyring:delete', payload?: unknown) => Promise<T>;
    };
    safevault?: {
      validateLicense: (key: string) => { ok: boolean; reason?: string };
      loadLicense: () => { ok: boolean; reason?: string };
    };
  }
}

export {};
