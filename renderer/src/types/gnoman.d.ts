declare global {
  interface Window {
    gnoman?: {
      invoke: <T = unknown>(channel: 'keyring:list' | 'keyring:add' | 'keyring:get' | 'keyring:delete', payload?: unknown) => Promise<T>;
    };
  }
}

export {};
