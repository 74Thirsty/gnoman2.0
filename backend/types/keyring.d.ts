declare module 'keyring' {
  interface KeyringApi {
    load(ondone?: () => void): KeyringApi;
    save(ondone?: () => void): KeyringApi;
    store(key: string, value: string): KeyringApi;
    storeEncrypted(key: string, value: string): KeyringApi;
    retrieve(key: string): string | null;
    retrieveEncrypted(key: string): string | null;
    db?: Record<string, unknown>;
  }

  interface KeyringModule {
    ALGORITHM: string;
    instance(encryptionKey: string, keyringDatabase?: string): KeyringApi;
  }

  const api: KeyringModule;
  export = api;
}
