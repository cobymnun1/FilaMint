'use client';

import { useState, useEffect } from 'react';
import { WalletProvider, useWalletContext } from '../context/WalletContext';
import { 
  useCreateOrder,
  useReadEscrow,
  useFactoryInfo,
  useClaim,
  useMarkShipped,
  useClaimDelivery,
  useCancel,
  useOpenDispute,
  useSubmitOffer,
  useSubmitCounterOffer,
  useAcceptOffer,
  useAcceptBuyerOffer,
  useRejectFinalOffer,
  useFinalizeOrder,
  useFinalizeOffer,
  useFinalizeArbiter,
  useArbiterDecide,
  EscrowStatus,
  STATUS_LABELS,
  EscrowData,
  formatTimeRemaining,
  CONTRACT_ADDRESSES,
} from '../hooks/useContract';

function EscrowTestContent() {
  const [escrowAddress, setEscrowAddress] = useState('');
  const [fileHash, setFileHash] = useState('test-model.stl');
  const [orderAmount, setOrderAmount] = useState('0.01');
  const [offerPercent, setOfferPercent] = useState(50);
  const [escrowData, setEscrowData] = useState<EscrowData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  const { 
    roleWallets, 
    currentRole, 
    currentRoleAddress,
    isConnectedForCurrentRole,
    connectWalletForRole,
    disconnectWalletForRole,
    setCurrentRole,
    isConnecting,
    error: walletError,
  } = useWalletContext();

  // Factory hooks
  const { createOrder, isLoading: createLoading, error: createError } = useCreateOrder();
  const { readFactoryInfo, data: factoryData, isLoading: factoryLoading } = useFactoryInfo();
  
  // Escrow read hook
  const { readEscrow, isLoading: readLoading, error: readError } = useReadEscrow();
  
  // Buyer action hooks
  const { cancel, isLoading: cancelLoading } = useCancel();
  const { openDispute, isLoading: disputeLoading } = useOpenDispute();
  const { submitOffer, isLoading: offerLoading } = useSubmitOffer();
  const { acceptOffer, isLoading: acceptLoading } = useAcceptOffer();
  const { rejectFinalOffer, isLoading: rejectLoading } = useRejectFinalOffer();
  
  // Seller action hooks
  const { claim, isLoading: claimLoading } = useClaim();
  const { markShipped, isLoading: shipLoading } = useMarkShipped();
  const { claimDelivery, isLoading: deliveryLoading } = useClaimDelivery();
  const { submitCounterOffer, isLoading: counterLoading } = useSubmitCounterOffer();
  const { acceptBuyerOffer, isLoading: acceptBuyerLoading } = useAcceptBuyerOffer();
  
  // Public action hooks
  const { finalizeOrder, isLoading: finalizeOrderLoading } = useFinalizeOrder();
  const { finalizeOffer, isLoading: finalizeOfferLoading } = useFinalizeOffer();
  const { finalizeArbiter, isLoading: finalizeArbiterLoading } = useFinalizeArbiter();
  
  // Arbiter hook
  const { arbiterDecide, isLoading: arbiterLoading } = useArbiterDecide();

  const log = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // Load factory info on mount
  useEffect(() => {
    if (CONTRACT_ADDRESSES.factory) {
      readFactoryInfo().catch(() => {});
    }
  }, [readFactoryInfo]);

  // Refresh escrow data
  const refreshEscrow = async () => {
    if (!escrowAddress) return;
    try {
      const data = await readEscrow(escrowAddress);
      setEscrowData(data);
      log(`Refreshed escrow data: Status=${STATUS_LABELS[data.status]}`);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Failed to read escrow'}`);
    }
  };

  // Check for MetaMask
  const checkMetaMask = () => {
    if (typeof window === 'undefined') return false;
    if (!window.ethereum) {
      log('ERROR: MetaMask not detected. Please install MetaMask extension.');
      return false;
    }
    return true;
  };

  // Wallet actions
  const testConnectBuyer = async () => {
    if (!checkMetaMask()) return;
    log('Connecting buyer wallet...');
    try {
      await connectWalletForRole('buyer');
      // Check if it actually connected (context updates async)
      setTimeout(() => {
        if (roleWallets.buyer) {
          log(`SUCCESS: Buyer wallet connected: ${roleWallets.buyer}`);
        } else {
          log('WARN: Connection may have been rejected or timed out');
        }
      }, 500);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testConnectSeller = async () => {
    if (!checkMetaMask()) return;
    log('Connecting seller wallet...');
    try {
      await connectWalletForRole('seller');
      setTimeout(() => {
        if (roleWallets.seller) {
          log(`SUCCESS: Seller wallet connected: ${roleWallets.seller}`);
        } else {
          log('WARN: Connection may have been rejected or timed out');
        }
      }, 500);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testConnectArbiter = async () => {
    if (!checkMetaMask()) return;
    log('Connecting arbiter wallet...');
    try {
      await connectWalletForRole('arbiter');
      setTimeout(() => {
        if (roleWallets.arbiter) {
          log(`SUCCESS: Arbiter wallet connected: ${roleWallets.arbiter}`);
        } else {
          log('WARN: Connection may have been rejected or timed out');
        }
      }, 500);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Factory actions
  const testCreateOrder = async () => {
    log(`Creating order: ${fileHash} for ${orderAmount} ETH...`);
    try {
      // Total = orderAmount * 1.025 (includes 2% gas cushion + 0.5% platform fee)
      const total = (parseFloat(orderAmount) * 1.025).toFixed(6);
      const result = await createOrder(fileHash, total);
      setEscrowAddress(result.escrowAddress);
      log(`SUCCESS: Order created!`);
      log(`  Order ID: ${result.orderId}`);
      log(`  Escrow: ${result.escrowAddress}`);
      log(`  TX: ${result.txHash}`);
      // Auto-refresh
      setTimeout(() => readEscrow(result.escrowAddress).then(setEscrowData), 1000);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Buyer actions
  const testCancel = async () => {
    log('Cancelling order...');
    try {
      const result = await cancel(escrowAddress);
      log(`SUCCESS: Order cancelled! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testOpenDispute = async () => {
    log('Opening dispute...');
    try {
      const result = await openDispute(escrowAddress);
      log(`SUCCESS: Dispute opened! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testSubmitOffer = async () => {
    log(`Submitting offer: ${offerPercent}% to buyer...`);
    try {
      const result = await submitOffer(escrowAddress, offerPercent);
      log(`SUCCESS: Offer submitted! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testAcceptOffer = async () => {
    log('Accepting seller offer...');
    try {
      const result = await acceptOffer(escrowAddress);
      log(`SUCCESS: Offer accepted! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testRejectFinal = async () => {
    log('Rejecting final offer, escalating to arbiter...');
    try {
      const result = await rejectFinalOffer(escrowAddress);
      log(`SUCCESS: Escalated to arbiter! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Seller actions
  const testClaim = async () => {
    log('Claiming order...');
    try {
      const result = await claim(escrowAddress);
      log(`SUCCESS: Order claimed! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testMarkShipped = async () => {
    log('Marking as shipped...');
    try {
      const result = await markShipped(escrowAddress);
      log(`SUCCESS: Marked shipped! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testClaimDelivery = async () => {
    log('Claiming delivery...');
    try {
      const result = await claimDelivery(escrowAddress);
      log(`SUCCESS: Delivery claimed! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testSubmitCounter = async () => {
    log(`Submitting counter-offer: ${offerPercent}% to buyer...`);
    try {
      const result = await submitCounterOffer(escrowAddress, offerPercent);
      log(`SUCCESS: Counter-offer submitted! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testAcceptBuyer = async () => {
    log('Accepting buyer offer...');
    try {
      const result = await acceptBuyerOffer(escrowAddress);
      log(`SUCCESS: Buyer offer accepted! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Public actions
  const testFinalizeOrder = async () => {
    log('Finalizing order...');
    try {
      const result = await finalizeOrder(escrowAddress);
      log(`SUCCESS: Order finalized! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testFinalizeOffer = async () => {
    log('Finalizing offer (auto-accept on timeout)...');
    try {
      const result = await finalizeOffer(escrowAddress);
      log(`SUCCESS: Offer finalized! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const testFinalizeArbiter = async () => {
    log('Finalizing arbiter timeout...');
    try {
      const result = await finalizeArbiter(escrowAddress);
      log(`SUCCESS: Arbiter timeout finalized! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Arbiter action
  const testArbiterDecide = async () => {
    log(`Arbiter deciding: ${offerPercent}% to buyer...`);
    try {
      const result = await arbiterDecide(escrowAddress, offerPercent);
      log(`SUCCESS: Arbiter decided! TX: ${result.txHash}`);
      refreshEscrow();
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const truncate = (addr: string | null) => {
    if (!addr) return 'Not set';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const getStatusColor = (status: EscrowStatus) => {
    switch (status) {
      case EscrowStatus.Pending: return 'text-yellow-400';
      case EscrowStatus.Claimed: return 'text-blue-400';
      case EscrowStatus.Shipped: return 'text-cyan-400';
      case EscrowStatus.Arrived: return 'text-purple-400';
      case EscrowStatus.Completed: return 'text-emerald-400';
      case EscrowStatus.Cancelled: return 'text-gray-400';
      case EscrowStatus.InDispute: return 'text-orange-400';
      case EscrowStatus.ArbiterReview: return 'text-red-400';
      case EscrowStatus.Settled: return 'text-emerald-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Escrow Contract Test Panel</h1>
        <p className="text-gray-400 mb-8">Test the PrintMod escrow system</p>
        
        {/* Factory Info */}
        <div className="mb-6 p-4 bg-gray-800 rounded-xl border border-gray-700">
          <h2 className="text-lg font-semibold mb-2 text-violet-400">Factory Info</h2>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-400">Address</p>
              <p className="font-mono text-xs">{truncate(CONTRACT_ADDRESSES.factory) || 'Not configured'}</p>
            </div>
            <div>
              <p className="text-gray-400">Total Orders</p>
              <p className="font-mono">{factoryData?.totalOrders ?? '-'}</p>
            </div>
            <div>
              <p className="text-gray-400">Min Order</p>
              <p className="font-mono">{factoryData?.minOrderAmount ?? '-'} ETH</p>
            </div>
            <div>
              <p className="text-gray-400">Arbiter</p>
              <p className="font-mono text-xs">{truncate(factoryData?.arbiter ?? null)}</p>
            </div>
          </div>
        </div>

        {/* Wallet Status */}
        <div className="mb-6 p-4 bg-gray-800 rounded-xl border border-gray-700">
          <h2 className="text-lg font-semibold mb-3 text-blue-400">Wallet Status</h2>
          {walletError && (
            <div className="mb-3 p-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
              {walletError}
            </div>
          )}
          <div className="grid grid-cols-5 gap-4 text-sm mb-4">
            <div>
              <p className="text-gray-400">Current Role</p>
              <p className="font-mono text-lg">{currentRole}</p>
            </div>
            <div>
              <p className="text-gray-400">Connected</p>
              <p className={`font-mono ${isConnectedForCurrentRole ? 'text-emerald-400' : 'text-red-400'}`}>
                {isConnecting ? 'Connecting...' : isConnectedForCurrentRole ? 'Yes' : 'No'}
              </p>
            </div>
            <div>
              <p className="text-gray-400">Buyer</p>
              <p className={`font-mono text-xs ${roleWallets.buyer ? 'text-blue-400' : 'text-gray-500'}`}>
                {truncate(roleWallets.buyer)}
              </p>
            </div>
            <div>
              <p className="text-gray-400">Seller</p>
              <p className={`font-mono text-xs ${roleWallets.seller ? 'text-emerald-400' : 'text-gray-500'}`}>
                {truncate(roleWallets.seller)}
              </p>
            </div>
            <div>
              <p className="text-gray-400">Arbiter</p>
              <p className={`font-mono text-xs ${roleWallets.arbiter ? 'text-red-400' : 'text-gray-500'}`}>
                {truncate(roleWallets.arbiter)}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setCurrentRole('buyer')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                currentRole === 'buyer' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}>Buyer Mode</button>
            <button onClick={() => setCurrentRole('seller')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                currentRole === 'seller' ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}>Seller Mode</button>
            <button onClick={() => setCurrentRole('arbiter')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                currentRole === 'arbiter' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}>Arbiter Mode</button>
          </div>
          <div className="flex gap-2 flex-wrap mt-2">
            <button onClick={testConnectBuyer} disabled={isConnecting}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
              {isConnecting ? '...' : 'Connect Buyer'}
            </button>
            <button onClick={testConnectSeller} disabled={isConnecting}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
              {isConnecting ? '...' : 'Connect Seller'}
            </button>
            <button onClick={testConnectArbiter} disabled={isConnecting}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
              {isConnecting ? '...' : 'Connect Arbiter'}
            </button>
            <button onClick={() => { disconnectWalletForRole('buyer'); log('Buyer disconnected'); }}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium transition">
              Disc. Buyer
            </button>
            <button onClick={() => { disconnectWalletForRole('seller'); log('Seller disconnected'); }}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium transition">
              Disc. Seller
            </button>
            <button onClick={() => { disconnectWalletForRole('arbiter'); log('Arbiter disconnected'); }}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium transition">
              Disc. Arbiter
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Tip: Use different Hardhat accounts for each role. Account #0 = Buyer, #1 = Seller, #2 = Arbiter.
            Switch accounts in MetaMask before connecting each role.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left Column - Actions */}
          <div className="space-y-6">
            {/* Create Order */}
            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
              <h2 className="text-lg font-semibold mb-3 text-blue-400">Create Order (Buyer)</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">File Hash</label>
                  <input type="text" value={fileHash} onChange={(e) => setFileHash(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 px-3 py-2 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Order Amount (ETH)</label>
                  <input type="text" value={orderAmount} onChange={(e) => setOrderAmount(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 px-3 py-2 rounded-lg text-sm" />
                  <p className="text-gray-500 text-xs mt-1">Total: {(parseFloat(orderAmount || '0') * 1.025).toFixed(6)} ETH (incl. fees)</p>
                </div>
                <button onClick={testCreateOrder} disabled={createLoading}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition">
                  {createLoading ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </div>

            {/* Escrow Address Input */}
            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
              <h2 className="text-lg font-semibold mb-3 text-violet-400">Escrow Instance</h2>
              <div className="flex gap-2">
                <input type="text" value={escrowAddress} onChange={(e) => setEscrowAddress(e.target.value)}
                  placeholder="0x..."
                  className="flex-1 bg-gray-700 border border-gray-600 px-3 py-2 rounded-lg text-sm font-mono" />
                <button onClick={refreshEscrow} disabled={readLoading || !escrowAddress}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg font-medium transition">
                  {readLoading ? '...' : 'Load'}
                </button>
              </div>
            </div>

            {/* Buyer Actions */}
            <div className="p-4 bg-gray-800 rounded-xl border border-blue-700/50">
              <h2 className="text-lg font-semibold mb-3 text-blue-400">Buyer Actions</h2>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={testCancel} disabled={cancelLoading || !escrowAddress}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {cancelLoading ? '...' : 'Cancel Order'}
                </button>
                <button onClick={testOpenDispute} disabled={disputeLoading || !escrowAddress}
                  className="px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {disputeLoading ? '...' : 'Open Dispute'}
                </button>
                <button onClick={testSubmitOffer} disabled={offerLoading || !escrowAddress}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {offerLoading ? '...' : 'Submit Offer'}
                </button>
                <button onClick={testAcceptOffer} disabled={acceptLoading || !escrowAddress}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {acceptLoading ? '...' : 'Accept Seller Offer'}
                </button>
                <button onClick={testRejectFinal} disabled={rejectLoading || !escrowAddress}
                  className="col-span-2 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {rejectLoading ? '...' : 'Reject Final → Arbiter'}
                </button>
              </div>
            </div>

            {/* Seller Actions */}
            <div className="p-4 bg-gray-800 rounded-xl border border-emerald-700/50">
              <h2 className="text-lg font-semibold mb-3 text-emerald-400">Seller Actions</h2>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={testClaim} disabled={claimLoading || !escrowAddress}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {claimLoading ? '...' : 'Claim Order'}
                </button>
                <button onClick={testMarkShipped} disabled={shipLoading || !escrowAddress}
                  className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {shipLoading ? '...' : 'Mark Shipped'}
                </button>
                <button onClick={testClaimDelivery} disabled={deliveryLoading || !escrowAddress}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {deliveryLoading ? '...' : 'Claim Delivery'}
                </button>
                <button onClick={testSubmitCounter} disabled={counterLoading || !escrowAddress}
                  className="px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {counterLoading ? '...' : 'Counter-Offer'}
                </button>
                <button onClick={testAcceptBuyer} disabled={acceptBuyerLoading || !escrowAddress}
                  className="col-span-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {acceptBuyerLoading ? '...' : 'Accept Buyer Offer'}
                </button>
              </div>
            </div>

            {/* Public & Arbiter Actions */}
            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
              <h2 className="text-lg font-semibold mb-3 text-gray-400">Public / Arbiter Actions</h2>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={testFinalizeOrder} disabled={finalizeOrderLoading || !escrowAddress}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {finalizeOrderLoading ? '...' : 'Finalize Order'}
                </button>
                <button onClick={testFinalizeOffer} disabled={finalizeOfferLoading || !escrowAddress}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {finalizeOfferLoading ? '...' : 'Finalize Offer'}
                </button>
                <button onClick={testFinalizeArbiter} disabled={finalizeArbiterLoading || !escrowAddress}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {finalizeArbiterLoading ? '...' : 'Finalize Arbiter'}
                </button>
                <button onClick={testArbiterDecide} disabled={arbiterLoading || !escrowAddress}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {arbiterLoading ? '...' : 'Arbiter Decide'}
                </button>
              </div>
            </div>

            {/* Offer Slider */}
            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
              <h2 className="text-lg font-semibold mb-3 text-amber-400">Offer Amount</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-400">Buyer: {offerPercent}%</span>
                  <span className="text-emerald-400">Seller: {100 - offerPercent}%</span>
                </div>
                <input type="range" min="0" max="100" value={offerPercent}
                  onChange={(e) => setOfferPercent(Number(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                <p className="text-gray-500 text-xs text-center">
                  Used for Submit Offer, Counter-Offer, and Arbiter Decide
                </p>
              </div>
            </div>
          </div>

          {/* Right Column - State & Logs */}
          <div className="space-y-6">
            {/* Escrow State */}
            {escrowData && (
              <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-semibold text-violet-400">Escrow State</h2>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(escrowData.status)} bg-gray-700`}>
                    {STATUS_LABELS[escrowData.status]}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-gray-400">Order Amount</p>
                    <p className="font-mono">{escrowData.orderAmount} ETH</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Gas Cushion</p>
                    <p className="font-mono">{escrowData.gasCushion} ETH</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Buyer</p>
                    <p className="font-mono text-xs text-blue-400">{truncate(escrowData.buyer)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Seller</p>
                    <p className="font-mono text-xs text-emerald-400">{truncate(escrowData.seller)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Gas Used</p>
                    <p className="font-mono">{escrowData.gasUsed} ETH</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Platform Fee</p>
                    <p className="font-mono">{escrowData.platformFee} ETH</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Time Remaining</p>
                    <p className="font-mono">{formatTimeRemaining(escrowData.timeRemaining)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Whose Turn</p>
                    <p className={`font-mono ${escrowData.isBuyerTurn ? 'text-blue-400' : 'text-emerald-400'}`}>
                      {escrowData.isBuyerTurn ? 'Buyer' : 'Seller'}
                    </p>
                  </div>
                </div>
                
                {/* Dispute Info */}
                {(escrowData.status === EscrowStatus.InDispute || escrowData.status === EscrowStatus.ArbiterReview) && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <h3 className="text-sm font-semibold text-orange-400 mb-2">Dispute Info</h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <p className="text-gray-400">Round</p>
                        <p className="font-mono">{escrowData.disputeRound} / 6</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Last Offer</p>
                        <p className="font-mono">{escrowData.lastOfferBuyerPercent}% to buyer</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-gray-400">Last Offer By</p>
                        <p className="font-mono text-xs">{truncate(escrowData.lastOfferBy)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Timestamps */}
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">Timestamps</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Created:</span>
                      <span className="font-mono">{escrowData.createdAt ? new Date(escrowData.createdAt * 1000).toLocaleString() : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Claimed:</span>
                      <span className="font-mono">{escrowData.claimedAt ? new Date(escrowData.claimedAt * 1000).toLocaleString() : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Shipped:</span>
                      <span className="font-mono">{escrowData.shippedAt ? new Date(escrowData.shippedAt * 1000).toLocaleString() : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Arrived:</span>
                      <span className="font-mono">{escrowData.arrivedAt ? new Date(escrowData.arrivedAt * 1000).toLocaleString() : '-'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Logs */}
            <div className="p-4 bg-black rounded-xl border border-gray-700 font-mono text-xs">
              <div className="flex justify-between items-center mb-2 sticky top-0 bg-black">
                <h3 className="text-gray-400">Test Logs</h3>
                <button onClick={() => setLogs([])} className="text-gray-500 hover:text-gray-300">Clear</button>
              </div>
              <div className="h-80 overflow-y-auto space-y-1">
                {logs.length === 0 ? (
                  <p className="text-gray-600">No logs yet. Click a button to start.</p>
                ) : (
                  logs.map((logEntry, i) => (
                    <p key={i} className={
                      logEntry.includes('SUCCESS') ? 'text-emerald-400' :
                      logEntry.includes('ERROR') ? 'text-red-400' :
                      logEntry.startsWith('  ') ? 'text-gray-500' :
                      'text-gray-300'
                    }>{logEntry}</p>
                  ))
                )}
              </div>
            </div>

            {/* Instructions */}
            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
              <h2 className="text-lg font-semibold mb-3 text-amber-400">Testing Instructions</h2>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-300">
                <li>Start Hardhat node: <code className="text-violet-400">npx hardhat node</code></li>
                <li>Deploy contracts: <code className="text-violet-400">npx hardhat run scripts/deploy.js --network localhost</code></li>
                <li>Set <code className="text-violet-400">NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS</code> in .env.local</li>
                <li>Import Hardhat accounts into MetaMask (localhost:8545)</li>
                <li>Connect <span className="text-blue-400">Buyer</span> and <span className="text-emerald-400">Seller</span> wallets</li>
                <li>Create order as buyer, then claim as seller</li>
                <li>Use Hardhat console to advance time for testing timeouts</li>
              </ol>
              <div className="mt-3 p-2 bg-gray-900 rounded text-xs font-mono text-gray-400">
                // Advance time in Hardhat console:<br/>
                await ethers.provider.send("evm_increaseTime", [604800]); // 7 days<br/>
                await ethers.provider.send("evm_mine");
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EscrowTestPage() {
  return (
    <WalletProvider>
      <EscrowTestContent />
    </WalletProvider>
  );
}
