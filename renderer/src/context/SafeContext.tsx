import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react';

export interface SafeDelegate {
  address: string;
  label: string;
  since: string;
}

export interface NestedSafe {
  address: string;
  isOwner: boolean;
  threshold?: number;
  ownerCount?: number;
}

export interface OwnerInfo {
  address: string;
  isContract: boolean;
  isSafe: boolean;
  nestedSafeInfo?: NestedSafe;
}

export interface SafeState {
  address: string;
  threshold: number;
  owners: string[];
  modules: string[];
  rpcUrl: string;
  delegates?: SafeDelegate[];
  network?: string;
  nonce?: number;
  ownerDetails?: OwnerInfo[];
  nestedSafes?: NestedSafe[];
}

interface SafeContextValue {
  currentSafe?: SafeState;
  setCurrentSafe: Dispatch<SetStateAction<SafeState | undefined>>;
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
