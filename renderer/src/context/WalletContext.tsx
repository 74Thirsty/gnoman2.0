import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ipc } from '../utils/ipc';

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
    const data = await ipc<WalletMetadata[]>('wallet:list');
    setWallets(data);
  }, []);

  useEffect(() => {
    refresh().catch((error) => console.error(error));
  }, [refresh]);

  const value = useMemo(() => ({ wallets, refresh }), [wallets, refresh]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallets = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallets must be used within WalletProvider');
  return ctx;
};
