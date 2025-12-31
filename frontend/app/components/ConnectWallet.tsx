'use client';

import { useWalletContext } from '../context/WalletContext';

interface ConnectWalletProps {
  className?: string;
}

export default function ConnectWallet({ className = '' }: ConnectWalletProps) {
  const { 
    currentRole,
    connectWalletForRole,
    disconnectWalletForRole,
    isConnectedForCurrentRole,
    currentRoleAddress,
    isConnecting,
    error,
  } = useWalletContext();

  const handleConnect = () => {
    connectWalletForRole(currentRole);
  };

  const handleDisconnect = () => {
    disconnectWalletForRole(currentRole);
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const roleLabel = currentRole === 'buyer' ? 'Buyer' : 'Seller';
  const roleColor = currentRole === 'buyer' 
    ? 'text-blue-600 dark:text-blue-400' 
    : 'text-emerald-600 dark:text-emerald-400';

  // Connected for this role
  if (isConnectedForCurrentRole && currentRoleAddress) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={handleDisconnect}
          className={`
            group flex items-center gap-2 px-4 py-2.5 rounded-xl
            bg-gradient-to-r from-emerald-500/10 to-teal-500/10
            border border-emerald-500/30 dark:border-emerald-400/30
            text-emerald-700 dark:text-emerald-300
            hover:from-red-500/10 hover:to-rose-500/10
            hover:border-red-500/30 dark:hover:border-red-400/30
            hover:text-red-700 dark:hover:text-red-300
            transition-all duration-200
            ${className}
          `}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 group-hover:bg-red-500 transition-colors" />
          <span className="font-mono text-sm font-medium">
            <span className="group-hover:hidden">{truncateAddress(currentRoleAddress)}</span>
            <span className="hidden group-hover:inline">Disconnect</span>
          </span>
        </button>
        <p className={`text-xs ${roleColor}`}>
          {roleLabel} Wallet
        </p>
      </div>
    );
  }

  // Not connected for this role
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className={`
          flex items-center gap-2 px-5 py-2.5 rounded-xl
          bg-gradient-to-r from-violet-600 to-indigo-600
          hover:from-violet-700 hover:to-indigo-700
          text-white font-semibold text-sm
          shadow-lg shadow-violet-500/25
          hover:shadow-xl hover:shadow-violet-500/30
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200
          ${className}
        `}
      >
        {isConnecting ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Connecting...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Connect {roleLabel} Wallet
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 max-w-[200px] text-right">
          {error}
        </p>
      )}
    </div>
  );
}
