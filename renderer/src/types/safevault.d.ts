declare global {
  interface Window {
    safevault?: {
      invoke: <T = unknown>(channel: 'keyring:list' | 'keyring:add' | 'keyring:get' | 'keyring:delete', payload?: unknown) => Promise<T>;
    };
  }
}

export {};
