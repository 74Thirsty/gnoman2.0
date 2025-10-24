import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface SafeState {
  address: string;
  threshold: number;
  owners: string[];
  modules: string[];
  rpcUrl: string;
}

interface SafeContextValue {
  currentSafe?: SafeState;
  setCurrentSafe: (safe?: SafeState) => void;
}

const SafeContext = createContext<SafeContextValue | undefined>(undefined);

export const SafeProvider = ({ children }: { children: ReactNode }) => {
  const [currentSafe, setCurrentSafe] = useState<SafeState | undefined>();
  const value = useMemo(() => ({ currentSafe, setCurrentSafe }), [currentSafe]);
  return <SafeContext.Provider value={value}>{children}</SafeContext.Provider>;
};

export const useSafe = () => {
  const ctx = useContext(SafeContext);
  if (!ctx) {
    throw new Error('useSafe must be used within SafeProvider');
  }
  return ctx;
};
