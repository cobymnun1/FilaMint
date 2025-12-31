'use client';

import { useEffect } from 'react';
import ViewToggle, { ViewMode } from './components/ViewToggle';
import ConnectWallet from './components/ConnectWallet';
import BuyerView from './components/BuyerView';
import SellerView from './components/SellerView';
import { WalletProvider, useWalletContext } from './context/WalletContext';
import ordersData from '../public/orders.json';
import { Order } from './types/order';

function HomeContent() {
  const { currentRole, setCurrentRole } = useWalletContext();
  
  // Type assertion for imported JSON
  const orders = ordersData.orders as Order[];

  const handleViewChange = (view: ViewMode) => {
    setCurrentRole(view);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-100 dark:from-gray-950 dark:via-slate-950 dark:to-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 dark:bg-gray-950/70 border-b border-gray-200/50 dark:border-gray-800/50">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo & Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  PrintMod
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Decentralized 3D Printing
                </p>
              </div>
            </div>

            {/* View Toggle */}
            <ViewToggle currentView={currentRole} onViewChange={handleViewChange} />

            {/* Wallet */}
            <ConnectWallet />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            {currentRole === 'buyer' ? 'Order a Print' : 'Print Requests'}
          </h2>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            {currentRole === 'buyer' 
              ? 'Upload your 3D model and find a printer' 
              : 'Browse and claim print jobs to earn ETH'}
          </p>
        </div>

        {/* View Content */}
        {currentRole === 'buyer' ? (
          <BuyerView orders={orders} />
        ) : (
          <SellerView orders={orders} />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-200 dark:border-gray-800 py-8">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            PrintMod - Decentralized 3D Print Marketplace
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Powered by Ethereum Smart Contracts
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <WalletProvider>
      <HomeContent />
    </WalletProvider>
  );
}
