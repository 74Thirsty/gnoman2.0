declare global {
  interface Window {
    gnoman?: {
      invoke: <T = unknown>(channel: string, payload?: unknown) => Promise<T>;
    };
  }
}

export {};
