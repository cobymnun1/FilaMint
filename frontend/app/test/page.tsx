'use client';

import { useState } from 'react';
import { WalletProvider, useWalletContext } from '../context/WalletContext';
import { 
  useCreateOrder, 
  useClaimOrder, 
  useReadOrder,
  useMarkShipped,
  useConfirmDelivery 
} from '../hooks/useContract';

function HookTestContent() {
  const [orderId, setOrderId] = useState('1');
  const [logs, setLogs] = useState<string[]>([]);
  
  const { 
    roleWallets, 
    currentRole, 
    currentRoleAddress,
    isConnectedForCurrentRole,
    connectWalletForRole,
    disconnectWalletForRole,
    setCurrentRole,
  } = useWalletContext();
  
  const { createOrder, isLoading: createLoading, error: createError } = useCreateOrder();
  const { claimOrder, isLoading: claimLoading, error: claimError } = useClaimOrder();
  const { readOrder, isLoading: readLoading, error: readError, data: orderData } = useReadOrder();
  const { markShipped, isLoading: shipLoading, error: shipError } = useMarkShipped();
  const { confirmDelivery, isLoading: confirmLoading, error: confirmError } = useConfirmDelivery();

  const log = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // Wallet Tests
  const testConnectBuyer = async () => {
    log('Testing connect buyer wallet...');
    try {
      await connectWalletForRole('buyer');
      log(`SUCCESS: Buyer wallet connected`);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testConnectSeller = async () => {
    log('Testing connect seller wallet...');
    try {
      await connectWalletForRole('seller');
      log(`SUCCESS: Seller wallet connected`);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testDisconnectBuyer = () => {
    log('Disconnecting buyer wallet...');
    disconnectWalletForRole('buyer');
    log('SUCCESS: Buyer wallet disconnected');
  };

  const testDisconnectSeller = () => {
    log('Disconnecting seller wallet...');
    disconnectWalletForRole('seller');
    log('SUCCESS: Seller wallet disconnected');
  };

  // Contract Tests
  const testCreateOrder = async () => {
    log('Testing createOrder (requires buyer wallet)...');
    try {
      const result = await createOrder('QmTestHash123', 'PLA', 20, '0.01');
      log(`SUCCESS: Order created! ID: ${result.orderId}, TX: ${result.txHash}`);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testClaimOrder = async () => {
    log(`Testing claimOrder for order ${orderId} (requires seller wallet)...`);
    try {
      const result = await claimOrder(orderId);
      log(`SUCCESS: Order claimed! TX: ${result.txHash}`);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testReadOrder = async () => {
    log(`Testing readOrder for order ${orderId} (no wallet required)...`);
    try {
      const result = await readOrder(orderId);
      log(`SUCCESS: Order data: ${JSON.stringify(result)}`);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testMarkShipped = async () => {
    log(`Testing markShipped for order ${orderId} (requires seller wallet)...`);
    try {
      const result = await markShipped(orderId, 'TRACK123456');
      log(`SUCCESS: Order marked shipped! TX: ${result.txHash}`);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testConfirmDelivery = async () => {
    log(`Testing confirmDelivery for order ${orderId} (requires buyer wallet)...`);
    try {
      const result = await confirmDelivery(orderId);
      log(`SUCCESS: Delivery confirmed! TX: ${result.txHash}`);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const truncate = (addr: string | null) => {
    if (!addr) return 'Not set';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Contract Hooks Test Page</h1>
        <p className="text-gray-400 mb-8">Test the wallet context and contract interaction hooks</p>
        
        {/* Wallet Status */}
        <div className="mb-8 p-6 bg-gray-800 rounded-xl border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-violet-400">Wallet Status</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-gray-400 text-sm">Current Role</p>
              <p className="font-mono text-lg">{currentRole}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Connected for Role</p>
              <p className={`font-mono text-lg ${isConnectedForCurrentRole ? 'text-emerald-400' : 'text-red-400'}`}>
                {isConnectedForCurrentRole ? 'Yes' : 'No'}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Buyer Wallet</p>
              <p className={`font-mono ${roleWallets.buyer ? 'text-blue-400' : 'text-gray-500'}`}>
                {truncate(roleWallets.buyer)}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Seller Wallet</p>
              <p className={`font-mono ${roleWallets.seller ? 'text-emerald-400' : 'text-gray-500'}`}>
                {truncate(roleWallets.seller)}
              </p>
            </div>
          </div>
          
          {/* Role Toggle */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setCurrentRole('buyer')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                currentRole === 'buyer' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Buyer Mode
            </button>
            <button
              onClick={() => setCurrentRole('seller')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                currentRole === 'seller' 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Seller Mode
            </button>
          </div>
        </div>

        {/* Wallet Tests */}
        <div className="mb-8 p-6 bg-gray-800 rounded-xl border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-blue-400">Wallet Connection Tests</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={testConnectBuyer}
              className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
              Connect Buyer Wallet
            </button>
            <button
              onClick={testConnectSeller}
              className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition"
            >
              Connect Seller Wallet
            </button>
            <button
              onClick={testDisconnectBuyer}
              className="px-4 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium transition"
            >
              Disconnect Buyer
            </button>
            <button
              onClick={testDisconnectSeller}
              className="px-4 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium transition"
            >
              Disconnect Seller
            </button>
          </div>
        </div>

        {/* Contract Tests */}
        <div className="mb-8 p-6 bg-gray-800 rounded-xl border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-violet-400">Contract Interaction Tests</h2>
          <p className="text-gray-400 text-sm mb-4">
            Note: These require a deployed contract and correct wallet active in MetaMask
          </p>
          
          {/* Order ID Input */}
          <div className="mb-4">
            <label className="block text-gray-400 text-sm mb-1">Order ID for tests:</label>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="bg-gray-700 border border-gray-600 px-3 py-2 rounded-lg w-32 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={testCreateOrder}
              disabled={createLoading}
              className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition"
            >
              {createLoading ? 'Creating...' : 'Create Order (Buyer)'}
            </button>
            
            <button
              onClick={testClaimOrder}
              disabled={claimLoading}
              className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition"
            >
              {claimLoading ? 'Claiming...' : 'Claim Order (Seller)'}
            </button>
            
            <button
              onClick={testReadOrder}
              disabled={readLoading}
              className="px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition"
            >
              {readLoading ? 'Reading...' : 'Read Order (No wallet)'}
            </button>
            
            <button
              onClick={testMarkShipped}
              disabled={shipLoading}
              className="px-4 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition"
            >
              {shipLoading ? 'Marking...' : 'Mark Shipped (Seller)'}
            </button>
            
            <button
              onClick={testConfirmDelivery}
              disabled={confirmLoading}
              className="px-4 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition"
            >
              {confirmLoading ? 'Confirming...' : 'Confirm Delivery (Buyer)'}
            </button>
            
            <button
              onClick={() => setLogs([])}
              className="px-4 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium transition"
            >
              Clear Logs
            </button>
          </div>
        </div>

        {/* Error Display */}
        {(createError || claimError || readError || shipError || confirmError) && (
          <div className="mb-8 p-4 bg-red-900/30 border border-red-700 rounded-xl">
            <h3 className="font-semibold text-red-400 mb-2">Active Errors:</h3>
            {createError && <p className="text-red-300 text-sm">Create: {createError}</p>}
            {claimError && <p className="text-red-300 text-sm">Claim: {claimError}</p>}
            {readError && <p className="text-red-300 text-sm">Read: {readError}</p>}
            {shipError && <p className="text-red-300 text-sm">Ship: {shipError}</p>}
            {confirmError && <p className="text-red-300 text-sm">Confirm: {confirmError}</p>}
          </div>
        )}

        {/* Order Data Display */}
        {orderData && (
          <div className="mb-8 p-4 bg-emerald-900/30 border border-emerald-700 rounded-xl">
            <h3 className="font-semibold text-emerald-400 mb-2">Last Read Order Data:</h3>
            <pre className="text-sm text-emerald-200 overflow-x-auto">{JSON.stringify(orderData, null, 2)}</pre>
          </div>
        )}

        {/* Logs */}
        <div className="p-4 bg-black rounded-xl border border-gray-700 font-mono text-sm h-80 overflow-y-auto">
          <h3 className="text-gray-400 mb-3 sticky top-0 bg-black">Test Logs:</h3>
          {logs.length === 0 ? (
            <p className="text-gray-600">No logs yet. Click a test button to start.</p>
          ) : (
            logs.map((logEntry, i) => (
              <p 
                key={i} 
                className={
                  logEntry.includes('SUCCESS') ? 'text-emerald-400' :
                  logEntry.includes('ERROR') ? 'text-red-400' :
                  'text-gray-300'
                }
              >
                {logEntry}
              </p>
            ))
          )}
        </div>

        {/* Instructions */}
        <div className="mt-8 p-6 bg-gray-800 rounded-xl border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-amber-400">How to Test</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>Connect a <span className="text-blue-400">Buyer Wallet</span> using MetaMask</li>
            <li>Switch MetaMask to a different account</li>
            <li>Connect a <span className="text-emerald-400">Seller Wallet</span></li>
            <li>Toggle between Buyer/Seller modes - each should show its own address</li>
            <li>Test disconnect - should only affect that role</li>
            <li className="text-amber-400">For contract tests: Deploy contract first and update CONTRACT_ADDRESSES</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

// Wrap with WalletProvider since this is a separate route
export default function HookTestPage() {
  return (
    <WalletProvider>
      <HookTestContent />
    </WalletProvider>
  );
}
