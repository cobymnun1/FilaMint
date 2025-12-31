'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ViewMode = 'buyer' | 'seller' | 'arbiter';

interface RoleWallets {
  buyer: string | null;
  seller: string | null;
  arbiter: string | null;
}

interface WalletContextType {
  roleWallets: RoleWallets;
  currentRole: ViewMode;
  setCurrentRole: (role: ViewMode) => void;
  connectWalletForRole: (role: ViewMode) => Promise<void>;
  disconnectWalletForRole: (role: ViewMode) => void;
  isConnectedForCurrentRole: boolean;
  currentRoleAddress: string | null;
  isConnecting: boolean;
  error: string | null;
}

const WalletContext = createContext<WalletContextType | null>(null);

const STORAGE_KEY = 'printmod_role_wallets';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [currentRole, setCurrentRole] = useState<ViewMode>('buyer');
  const [roleWallets, setRoleWallets] = useState<RoleWallets>({
    buyer: null,
    seller: null,
    arbiter: null,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setRoleWallets(parsed);
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, []);

  // Save to localStorage when roleWallets changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roleWallets));
  }, [roleWallets]);

  const connectWalletForRole = async (role: ViewMode) => {
    setIsConnecting(true);
    setError(null);

    try {
      // Check if MetaMask is available
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('MetaMask not installed. Please install the MetaMask browser extension.');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = window.ethereum as any;
      
      // Handle case where multiple wallets are installed
      if (provider.providers && Array.isArray(provider.providers)) {
        // Find MetaMask among multiple providers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metamaskProvider = provider.providers.find((p: any) => p.isMetaMask);
        if (metamaskProvider) {
          const accounts = await metamaskProvider.request({
            method: 'eth_requestAccounts',
          });
          if (accounts && Array.isArray(accounts) && accounts.length > 0) {
            const address = (accounts[0] as string).toLowerCase();
            setRoleWallets(prev => ({
              ...prev,
              [role]: address,
            }));
            return;
          }
        }
      }

      // Standard single provider case
      const accounts = await provider.request({
        method: 'eth_requestAccounts',
      });

      if (accounts && Array.isArray(accounts) && accounts.length > 0) {
        const address = (accounts[0] as string).toLowerCase();
        setRoleWallets(prev => ({
          ...prev,
          [role]: address,
        }));
      } else {
        throw new Error('No accounts returned from wallet');
      }
    } catch (err: unknown) {
      console.error('Wallet connection error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('User rejected')) {
        setError('Connection rejected by user');
      } else if (errorMessage.includes('Unexpected error')) {
        setError('Wallet extension error. Try refreshing the page or disabling other wallet extensions.');
      } else {
        setError(errorMessage);
      }
      throw err; // Re-throw so the calling code can catch it
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWalletForRole = (role: ViewMode) => {
    setRoleWallets(prev => ({
      ...prev,
      [role]: null,
    }));
    setError(null);
  };

  const currentRoleAddress = roleWallets[currentRole];
  const isConnectedForCurrentRole = currentRoleAddress !== null;

  return (
    <WalletContext.Provider
      value={{
        roleWallets,
        currentRole,
        setCurrentRole,
        connectWalletForRole,
        disconnectWalletForRole,
        isConnectedForCurrentRole,
        currentRoleAddress,
        isConnecting,
        error,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWalletContext must be used within a WalletProvider');
  }
  return context;
}
