/**
 * Contract Hooks Test File
 * 
 * This file contains test scenarios for the contract hooks.
 * To run these tests, you need:
 * 1. Hardhat node running: `npx hardhat node`
 * 2. Contract deployed to local network
 * 3. MetaMask connected to Hardhat network (Chain ID: 31337)
 * 
 * These are manual integration tests - run them in a React component
 * or use a testing framework like Jest with React Testing Library.
 */

// ============================================================================
// TEST SCENARIOS
// ============================================================================

/**
 * Test 1: Wallet Context - Role-based wallet storage
 * 
 * Expected behavior:
 * - Connect as buyer → address saved to roleWallets.buyer
 * - Switch to seller view → shows "Connect Seller Wallet"
 * - Connect different account → address saved to roleWallets.seller
 * - Disconnect buyer → only buyer address cleared, seller remains
 * - Refresh page → both addresses restored from localStorage
 */

/**
 * Test 2: Role Verification
 * 
 * Setup:
 * - Connect wallet A as buyer
 * - Connect wallet B as seller
 * - Switch to buyer view
 * - Change MetaMask to wallet B (seller's wallet)
 * 
 * Expected:
 * - useSigner() with requiredRole: 'buyer' should throw error:
 *   "Wrong wallet active. Please switch to your buyer wallet in MetaMask."
 */

/**
 * Test 3: Create Order Hook (Buyer action)
 * 
 * Prerequisites:
 * - Contract deployed
 * - Buyer wallet connected and has ETH
 * 
 * Test:
 * ```typescript
 * const { createOrder, isLoading, error, data } = useCreateOrder();
 * await createOrder('QmFileHash123', 'PLA', 20, '0.025');
 * ```
 * 
 * Expected:
 * - isLoading: true during transaction
 * - MetaMask popup to confirm transaction
 * - On success: data = { orderId: '1', txHash: '0x...' }
 * - On failure: error = 'Error message'
 */

/**
 * Test 4: Claim Order Hook (Seller action)
 * 
 * Prerequisites:
 * - Order exists in 'pending' status
 * - Seller wallet connected
 * 
 * Test:
 * ```typescript
 * const { claimOrder, isLoading, error, data } = useClaimOrder();
 * await claimOrder('1');
 * ```
 * 
 * Expected:
 * - Transaction submitted
 * - Order status changes to 'claimed'
 * - data = { txHash: '0x...' }
 */

/**
 * Test 5: Read Order Hook (No wallet required)
 * 
 * Test:
 * ```typescript
 * const { readOrder, isLoading, error, data } = useReadOrder();
 * await readOrder('1');
 * ```
 * 
 * Expected:
 * - No MetaMask popup (read-only)
 * - data = { buyer, seller, escrowAmount, status, fileHash }
 */

// ============================================================================
// REACT COMPONENT FOR MANUAL TESTING
// ============================================================================

export const TestComponentCode = `
'use client';

import { useState } from 'react';
import { useWalletContext } from '../app/context/WalletContext';
import { 
  useCreateOrder, 
  useClaimOrder, 
  useReadOrder,
  useMarkShipped,
  useConfirmDelivery 
} from '../app/hooks/useContract';

export default function HookTestPage() {
  const [orderId, setOrderId] = useState('1');
  const [logs, setLogs] = useState<string[]>([]);
  
  const { 
    roleWallets, 
    currentRole, 
    currentRoleAddress,
    isConnectedForCurrentRole 
  } = useWalletContext();
  
  const { createOrder, isLoading: createLoading, error: createError } = useCreateOrder();
  const { claimOrder, isLoading: claimLoading, error: claimError } = useClaimOrder();
  const { readOrder, isLoading: readLoading, error: readError, data: orderData } = useReadOrder();
  const { markShipped, isLoading: shipLoading, error: shipError } = useMarkShipped();
  const { confirmDelivery, isLoading: confirmLoading, error: confirmError } = useConfirmDelivery();

  const log = (message: string) => {
    setLogs(prev => [...prev, \`[\${new Date().toLocaleTimeString()}] \${message}\`]);
  };

  const testCreateOrder = async () => {
    log('Testing createOrder...');
    try {
      const result = await createOrder('QmTestHash123', 'PLA', 20, '0.01');
      log(\`SUCCESS: Order created! ID: \${result.orderId}, TX: \${result.txHash}\`);
    } catch (err) {
      log(\`ERROR: \${err instanceof Error ? err.message : 'Unknown error'}\`);
    }
  };

  const testClaimOrder = async () => {
    log(\`Testing claimOrder for order \${orderId}...\`);
    try {
      const result = await claimOrder(orderId);
      log(\`SUCCESS: Order claimed! TX: \${result.txHash}\`);
    } catch (err) {
      log(\`ERROR: \${err instanceof Error ? err.message : 'Unknown error'}\`);
    }
  };

  const testReadOrder = async () => {
    log(\`Testing readOrder for order \${orderId}...\`);
    try {
      const result = await readOrder(orderId);
      log(\`SUCCESS: Order data: \${JSON.stringify(result)}\`);
    } catch (err) {
      log(\`ERROR: \${err instanceof Error ? err.message : 'Unknown error'}\`);
    }
  };

  const testMarkShipped = async () => {
    log(\`Testing markShipped for order \${orderId}...\`);
    try {
      const result = await markShipped(orderId, 'TRACK123456');
      log(\`SUCCESS: Order marked shipped! TX: \${result.txHash}\`);
    } catch (err) {
      log(\`ERROR: \${err instanceof Error ? err.message : 'Unknown error'}\`);
    }
  };

  const testConfirmDelivery = async () => {
    log(\`Testing confirmDelivery for order \${orderId}...\`);
    try {
      const result = await confirmDelivery(orderId);
      log(\`SUCCESS: Delivery confirmed! TX: \${result.txHash}\`);
    } catch (err) {
      log(\`ERROR: \${err instanceof Error ? err.message : 'Unknown error'}\`);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Contract Hooks Test Page</h1>
      
      {/* Wallet Status */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <h2 className="font-semibold mb-2">Wallet Status</h2>
        <p>Current Role: <span className="font-mono">{currentRole}</span></p>
        <p>Connected: <span className="font-mono">{isConnectedForCurrentRole ? 'Yes' : 'No'}</span></p>
        <p>Current Address: <span className="font-mono">{currentRoleAddress || 'Not connected'}</span></p>
        <p>Buyer Wallet: <span className="font-mono">{roleWallets.buyer || 'Not set'}</span></p>
        <p>Seller Wallet: <span className="font-mono">{roleWallets.seller || 'Not set'}</span></p>
      </div>

      {/* Order ID Input */}
      <div className="mb-6">
        <label className="block mb-2">Order ID for tests:</label>
        <input
          type="text"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          className="border px-3 py-2 rounded w-32"
        />
      </div>

      {/* Test Buttons */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={testCreateOrder}
          disabled={createLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {createLoading ? 'Creating...' : 'Test Create Order (Buyer)'}
        </button>
        
        <button
          onClick={testClaimOrder}
          disabled={claimLoading}
          className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
        >
          {claimLoading ? 'Claiming...' : 'Test Claim Order (Seller)'}
        </button>
        
        <button
          onClick={testReadOrder}
          disabled={readLoading}
          className="px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50"
        >
          {readLoading ? 'Reading...' : 'Test Read Order (No wallet)'}
        </button>
        
        <button
          onClick={testMarkShipped}
          disabled={shipLoading}
          className="px-4 py-2 bg-cyan-600 text-white rounded disabled:opacity-50"
        >
          {shipLoading ? 'Marking...' : 'Test Mark Shipped (Seller)'}
        </button>
        
        <button
          onClick={testConfirmDelivery}
          disabled={confirmLoading}
          className="px-4 py-2 bg-emerald-600 text-white rounded disabled:opacity-50"
        >
          {confirmLoading ? 'Confirming...' : 'Test Confirm Delivery (Buyer)'}
        </button>
        
        <button
          onClick={() => setLogs([])}
          className="px-4 py-2 bg-gray-600 text-white rounded"
        >
          Clear Logs
        </button>
      </div>

      {/* Error Display */}
      {(createError || claimError || readError || shipError || confirmError) && (
        <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded">
          <h3 className="font-semibold text-red-800">Errors:</h3>
          {createError && <p className="text-red-700">Create: {createError}</p>}
          {claimError && <p className="text-red-700">Claim: {claimError}</p>}
          {readError && <p className="text-red-700">Read: {readError}</p>}
          {shipError && <p className="text-red-700">Ship: {shipError}</p>}
          {confirmError && <p className="text-red-700">Confirm: {confirmError}</p>}
        </div>
      )}

      {/* Order Data Display */}
      {orderData && (
        <div className="mb-6 p-4 bg-green-100 border border-green-300 rounded">
          <h3 className="font-semibold text-green-800">Order Data:</h3>
          <pre className="text-sm">{JSON.stringify(orderData, null, 2)}</pre>
        </div>
      )}

      {/* Logs */}
      <div className="p-4 bg-black text-green-400 rounded font-mono text-sm h-64 overflow-y-auto">
        <h3 className="text-white mb-2">Test Logs:</h3>
        {logs.length === 0 ? (
          <p className="text-gray-500">No logs yet. Click a test button to start.</p>
        ) : (
          logs.map((log, i) => <p key={i}>{log}</p>)
        )}
      </div>
    </div>
  );
}
`;

// ============================================================================
// UNIT TEST EXAMPLES (for Jest)
// ============================================================================

export const JestTestExamples = `
import { renderHook, act } from '@testing-library/react';
import { useWalletContext, WalletProvider } from '../app/context/WalletContext';

// Mock window.ethereum
const mockEthereum = {
  request: jest.fn(),
};

beforeEach(() => {
  (window as any).ethereum = mockEthereum;
  localStorage.clear();
});

describe('WalletContext', () => {
  it('should store buyer and seller addresses separately', async () => {
    const wrapper = ({ children }) => <WalletProvider>{children}</WalletProvider>;
    const { result } = renderHook(() => useWalletContext(), { wrapper });

    // Connect buyer
    mockEthereum.request.mockResolvedValueOnce(['0xBuyerAddress']);
    await act(async () => {
      await result.current.connectWalletForRole('buyer');
    });
    expect(result.current.roleWallets.buyer).toBe('0xbuyeraddress');
    expect(result.current.roleWallets.seller).toBeNull();

    // Connect seller
    mockEthereum.request.mockResolvedValueOnce(['0xSellerAddress']);
    await act(async () => {
      await result.current.connectWalletForRole('seller');
    });
    expect(result.current.roleWallets.buyer).toBe('0xbuyeraddress');
    expect(result.current.roleWallets.seller).toBe('0xselleraddress');
  });

  it('should disconnect only the specified role', () => {
    const wrapper = ({ children }) => <WalletProvider>{children}</WalletProvider>;
    const { result } = renderHook(() => useWalletContext(), { wrapper });

    // Setup both wallets
    act(() => {
      result.current.saveWalletForRole('buyer', '0xBuyer');
      result.current.saveWalletForRole('seller', '0xSeller');
    });

    // Disconnect buyer only
    act(() => {
      result.current.disconnectWalletForRole('buyer');
    });

    expect(result.current.roleWallets.buyer).toBeNull();
    expect(result.current.roleWallets.seller).toBe('0xseller');
  });

  it('should persist wallets to localStorage', () => {
    const wrapper = ({ children }) => <WalletProvider>{children}</WalletProvider>;
    const { result } = renderHook(() => useWalletContext(), { wrapper });

    act(() => {
      result.current.saveWalletForRole('buyer', '0xBuyer');
    });

    const stored = JSON.parse(localStorage.getItem('printmod_role_wallets') || '{}');
    expect(stored.buyer).toBe('0xbuyer');
  });
});
`;

// ============================================================================
// INSTRUCTIONS
// ============================================================================

export const Instructions = `
# How to Test the Hooks

## Option 1: Manual Testing with Test Page

1. Copy the TestComponentCode above into a new file:
   frontend/app/test/page.tsx

2. Start the dev server:
   cd frontend && npm run dev

3. Navigate to http://localhost:3000/test

4. Connect wallets for buyer and seller roles

5. Click the test buttons and observe the logs

## Option 2: Unit Tests with Jest

1. Install testing dependencies:
   npm install --save-dev @testing-library/react @testing-library/jest-dom jest

2. Create test file:
   frontend/__tests__/hooks.test.tsx

3. Copy the JestTestExamples code

4. Run tests:
   npm test

## Prerequisites for Contract Tests

1. Deploy contracts to Hardhat local network
2. Update CONTRACT_ADDRESSES in useContract.ts
3. Ensure MetaMask is connected to Hardhat (Chain ID: 31337)
4. Import Hardhat test accounts into MetaMask

## Expected Test Results

| Test | Expected Outcome |
|------|------------------|
| Connect buyer wallet | Address saved to roleWallets.buyer |
| Connect seller wallet | Address saved to roleWallets.seller |
| Disconnect buyer | Only buyer cleared, seller remains |
| Create order (buyer) | TX submitted, orderId returned |
| Create order (wrong wallet) | Error: "Wrong wallet active" |
| Claim order (seller) | TX submitted, order status updated |
| Read order | Order data returned (no TX needed) |
`;

console.log('Hook test file created. See Instructions export for how to run tests.');

