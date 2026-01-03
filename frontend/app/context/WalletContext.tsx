'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ViewMode = 'buyer' | 'seller' | 'arbiter';

interface WalletContextType {
  currentRole: ViewMode;
  setCurrentRole: (role: ViewMode) => void;
  walletAddress: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [currentRole, setCurrentRole] = useState<ViewMode>('buyer');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for account changes in MetaMask
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected from MetaMask
        setWalletAddress(null);
      } else if (walletAddress) {
        // Account changed while connected - update to new account
        setWalletAddress(accounts[0].toLowerCase());
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = window.ethereum as any;
    provider.on('accountsChanged', handleAccountsChanged);

    return () => {
      provider.removeListener('accountsChanged', handleAccountsChanged);
    };
  }, [walletAddress]);

  const connectWallet = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('MetaMask not installed. Please install the MetaMask browser extension.');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = window.ethereum as any;
      
      // Find MetaMask if multiple wallets installed
      let activeProvider = provider;
      if (provider.providers && Array.isArray(provider.providers)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metamaskProvider = provider.providers.find((p: any) => p.isMetaMask);
        if (metamaskProvider) {
          activeProvider = metamaskProvider;
        }
      }

      // First try to revoke existing permissions to force re-approval
      try {
        await activeProvider.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // wallet_revokePermissions may not be supported, continue anyway
      }

      // Now request fresh permissions - should show approval popup
      const permissions = await activeProvider.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      });

      // Extract accounts from permissions response
      const accountsPermission = permissions.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.parentCapability === 'eth_accounts'
      );

      if (accountsPermission?.caveats?.[0]?.value?.length > 0) {
        setWalletAddress(accountsPermission.caveats[0].value[0].toLowerCase());
      } else {
        // Fallback to eth_accounts
        const accounts = await activeProvider.request({
          method: 'eth_accounts',
        });
        if (accounts && accounts.length > 0) {
          setWalletAddress((accounts[0] as string).toLowerCase());
        } else {
          throw new Error('No accounts returned from wallet');
        }
      }
    } catch (err: unknown) {
      console.error('Wallet connection error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('User rejected')) {
        setError('Connection rejected by user');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setWalletAddress(null);
    setError(null);
  };

  return (
    <WalletContext.Provider
      value={{
        currentRole,
        setCurrentRole,
        walletAddress,
        connectWallet,
        disconnectWallet,
        isConnected: walletAddress !== null,
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
