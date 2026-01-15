import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildBackendUrl, onBackendBaseUrlChange } from '../utils/backend';

export interface WalletMetadata {
  address: string;
  alias?: string;
  hidden: boolean;
  createdAt: string;
  source?: string;
  network?: string;
  balance?: string;
}

interface WalletContextValue {
  wallets: WalletMetadata[];
  refresh: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [wallets, setWallets] = useState<WalletMetadata[]>([]);

  const refresh = useCallback(async () => {
    const response = await fetch(buildBackendUrl('/api/wallets'));
    if (!response.ok) {
      throw new Error('Unable to load wallets');
    }
    const data = (await response.json()) as WalletMetadata[];
    setWallets(data);
  }, []);

  useEffect(() => {
    refresh().catch((error) => console.error(error));
  }, [refresh]);

  useEffect(() => onBackendBaseUrlChange(() => refresh().catch((error) => console.error(error))), [refresh]);

  const value = useMemo(() => ({ wallets, refresh }), [wallets]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallets = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallets must be used within WalletProvider');
  }
  return ctx;
};
