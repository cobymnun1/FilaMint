'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ViewMode = 'buyer' | 'seller';

interface RoleWallets {
  buyer: string | null;
  seller: string | null;
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
        throw new Error('MetaMask not installed');
      }

      // Request account access - this will prompt MetaMask
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts && accounts.length > 0) {
        const address = accounts[0].toLowerCase();
        setRoleWallets(prev => ({
          ...prev,
          [role]: address,
        }));
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
        setError('Connection rejected');
      } else {
        setError(errorMessage);
      }
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
