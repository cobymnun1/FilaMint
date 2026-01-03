'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWalletContext } from '../context/WalletContext';
import { 
  useGetAllEscrows,
  useReadEscrow,
  useClaim,
  useMarkShipped,
  useClaimDelivery,
  useSubmitCounterOffer,
  useAcceptBuyerOffer,
  EscrowStatus, 
  STATUS_LABELS,
  EscrowData,
  CONTRACT_ADDRESSES,
  formatTimeRemaining,
} from '../hooks/useContract';
import { getOrderMetadata } from './BuyerView';

type SortOption = 'escrow-high' | 'escrow-low' | 'newest' | 'oldest';
type FilterStatus = 'pending' | 'my-jobs' | 'disputes' | 'all';

// Order metadata stored in localStorage (from BuyerView)
interface OrderMetadata {
  escrowAddress: string;
  fileName: string;
  originalName: string;
  material: string;
  color: string;
  infillPercent: number;
  dimensions: { x: number; y: number; z: number };
  totalCostUsd: number;
  totalCostEth: string;
  createdAt: number;
}

export default function SellerView() {
  const { walletAddress, isConnected } = useWalletContext();
  const { getAllEscrows, isLoading: isLoadingEscrows } = useGetAllEscrows();
  const { readEscrow } = useReadEscrow();
  const { claim, isLoading: isClaiming, error: claimError } = useClaim();
  const { markShipped, isLoading: isShipping } = useMarkShipped();
  const { claimDelivery, isLoading: isClaimingDelivery } = useClaimDelivery();
  const { submitCounterOffer, isLoading: isSubmittingCounterOffer } = useSubmitCounterOffer();
  const { acceptBuyerOffer, isLoading: isAcceptingBuyerOffer } = useAcceptBuyerOffer();
  
  const [sortBy, setSortBy] = useState<SortOption>('escrow-high');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('pending');
  
  const [allOrders, setAllOrders] = useState<(EscrowData & { metadata?: OrderMetadata | null })[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  
  // Counter-offer modal state
  const [counterOfferOrder, setCounterOfferOrder] = useState<(EscrowData & { metadata?: OrderMetadata | null }) | null>(null);
  const [counterOfferPercent, setCounterOfferPercent] = useState(50);

  // Load all orders from the factory
  const loadOrders = useCallback(async () => {
    if (!CONTRACT_ADDRESSES.factory) {
      setError('Factory contract address not configured');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const escrowAddresses = await getAllEscrows();
      const ordersWithData: (EscrowData & { metadata?: OrderMetadata | null })[] = [];
      
      // Read each escrow's data
      for (const address of escrowAddresses) {
        try {
          const escrowData = await readEscrow(address);
          const metadata = getOrderMetadata(address);
          ordersWithData.push({ ...escrowData, metadata });
        } catch (err) {
          console.error(`Failed to read escrow ${address}:`, err);
        }
      }
      
      setAllOrders(ordersWithData);
    } catch (err) {
      console.error('Failed to load orders:', err);
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  }, [getAllEscrows, readEscrow]);

  // Load orders on mount
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Filter and sort orders
  const filteredOrders = allOrders.filter(order => {
    if (filterStatus === 'pending') {
      return order.status === EscrowStatus.Pending;
    }
    if (filterStatus === 'my-jobs') {
      return walletAddress && order.seller.toLowerCase() === walletAddress.toLowerCase();
    }
    if (filterStatus === 'disputes') {
      const isMyJob = walletAddress && order.seller.toLowerCase() === walletAddress.toLowerCase();
      return isMyJob && (order.status === EscrowStatus.InDispute || order.status === EscrowStatus.ArbiterReview);
    }
    return true;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    switch (sortBy) {
      case 'escrow-high':
        return parseFloat(b.orderAmount) - parseFloat(a.orderAmount);
      case 'escrow-low':
        return parseFloat(a.orderAmount) - parseFloat(b.orderAmount);
      case 'newest':
        return b.createdAt - a.createdAt;
      case 'oldest':
        return a.createdAt - b.createdAt;
      default:
        return 0;
    }
  });

  // Calculate stats
  const pendingOrders = allOrders.filter(o => o.status === EscrowStatus.Pending);
  const myJobs = walletAddress 
    ? allOrders.filter(o => o.seller.toLowerCase() === walletAddress.toLowerCase())
    : [];
  const myDisputes = myJobs.filter(j => j.status === EscrowStatus.InDispute || j.status === EscrowStatus.ArbiterReview);
  const totalEscrowValue = pendingOrders.reduce((sum, o) => sum + parseFloat(o.orderAmount), 0);

  // Claim order
  const handleClaim = async (escrowAddress: string) => {
    if (!isConnected) {
      setError('Please connect your wallet first');
      return;
    }
    
    setError(null);
    setSuccessMessage(null);
    setActionInProgress(escrowAddress);
    
    try {
      await claim(escrowAddress);
      setSuccessMessage('Order claimed successfully! Start printing.');
      loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim order');
    } finally {
      setActionInProgress(null);
    }
  };

  // Mark as shipped
  const handleMarkShipped = async (escrowAddress: string) => {
    setError(null);
    setSuccessMessage(null);
    setActionInProgress(escrowAddress);
    
    try {
      await markShipped(escrowAddress);
      setSuccessMessage('Order marked as shipped!');
      loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as shipped');
    } finally {
      setActionInProgress(null);
    }
  };

  // Claim delivery
  const handleClaimDelivery = async (escrowAddress: string) => {
    setError(null);
    setSuccessMessage(null);
    setActionInProgress(escrowAddress);
    
    try {
      await claimDelivery(escrowAddress);
      setSuccessMessage('Delivery claimed! Waiting for buyer confirmation period.');
      loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim delivery');
    } finally {
      setActionInProgress(null);
    }
  };

  // Submit counter-offer in dispute
  const handleSubmitCounterOffer = async () => {
    if (!counterOfferOrder) return;
    
    setActionInProgress(counterOfferOrder.address);
    setError(null);
    try {
      await submitCounterOffer(counterOfferOrder.address, counterOfferPercent);
      setSuccessMessage(`Counter-offer submitted: ${counterOfferPercent}% to buyer, ${100 - counterOfferPercent}% to you`);
      setCounterOfferOrder(null);
      loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit counter-offer');
    } finally {
      setActionInProgress(null);
    }
  };

  // Accept buyer's offer
  const handleAcceptBuyerOffer = async (escrowAddress: string) => {
    setActionInProgress(escrowAddress);
    setError(null);
    try {
      await acceptBuyerOffer(escrowAddress);
      setSuccessMessage('Offer accepted! Funds will be distributed.');
      loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept offer');
    } finally {
      setActionInProgress(null);
    }
  };

  // Get status color
  const getStatusColor = (status: EscrowStatus) => {
    switch (status) {
      case EscrowStatus.Pending: return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case EscrowStatus.Claimed: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case EscrowStatus.Shipped: return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300';
      case EscrowStatus.Arrived: return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case EscrowStatus.Completed: return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
      case EscrowStatus.Cancelled: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
      case EscrowStatus.InDispute: return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      case EscrowStatus.ArbiterReview: return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case EscrowStatus.Settled: return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  // Get action button for order based on status
  const getActionButton = (order: EscrowData & { metadata?: OrderMetadata | null }) => {
    const isMyJob = walletAddress && order.seller.toLowerCase() === walletAddress.toLowerCase();
    const isInProgress = actionInProgress === order.address;
    
    if (order.status === EscrowStatus.Pending) {
      // Can't claim your own order
      if (walletAddress && order.buyer.toLowerCase() === walletAddress.toLowerCase()) {
        return (
          <span className="text-xs text-gray-500 dark:text-gray-400 italic">
            Your order
          </span>
        );
      }
      return (
        <button
          onClick={() => handleClaim(order.address)}
          disabled={isClaiming || isInProgress || !isConnected}
          className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isInProgress ? 'Claiming...' : 'Claim Job'}
        </button>
      );
    }
    
    if (order.status === EscrowStatus.Claimed && isMyJob) {
      return (
        <button
          onClick={() => handleMarkShipped(order.address)}
          disabled={isShipping || isInProgress}
          className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isInProgress ? 'Updating...' : 'Mark Shipped'}
        </button>
      );
    }
    
    if (order.status === EscrowStatus.Shipped && isMyJob) {
      return (
        <button
          onClick={() => handleClaimDelivery(order.address)}
          disabled={isClaimingDelivery || isInProgress}
          className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isInProgress ? 'Updating...' : 'Claim Delivery'}
        </button>
      );
    }
    
    if (order.status === EscrowStatus.InDispute && isMyJob) {
      const buyerMadeOffer = order.lastOfferBy.toLowerCase() !== '0x0000000000000000000000000000000000000000' &&
                             order.lastOfferBy.toLowerCase() === order.buyer.toLowerCase();
      
      return (
        <div className="flex flex-col gap-2">
          {/* Seller can always accept buyer's offer if one exists */}
          {buyerMadeOffer && (
            <button
              onClick={() => handleAcceptBuyerOffer(order.address)}
              disabled={isAcceptingBuyerOffer || isInProgress}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isInProgress ? 'Accepting...' : `Accept ${order.lastOfferBuyerPercent}% (You get ${100 - order.lastOfferBuyerPercent}%)`}
            </button>
          )}
          {/* Seller can make counter-offer when it's their turn */}
          {!order.isBuyerTurn && (
            <button
              onClick={() => {
                setCounterOfferOrder(order);
                setCounterOfferPercent(order.lastOfferBuyerPercent || 50);
              }}
              disabled={isSubmittingCounterOffer || isInProgress}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {buyerMadeOffer ? 'Counter Offer' : 'Make Offer'}
            </button>
          )}
          {order.isBuyerTurn && !buyerMadeOffer && (
            <span className="text-xs text-orange-600 dark:text-orange-400 italic">
              Waiting for buyer...
            </span>
          )}
        </div>
      );
    }
    
    if (order.status === EscrowStatus.ArbiterReview && isMyJob) {
      return (
        <span className="text-xs text-red-600 dark:text-red-400 italic">
          Awaiting arbiter
        </span>
      );
    }
    
    return null;
  };

  return (
    <div className="space-y-8">
      {/* Error/Success Messages */}
      {(error || claimError) && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 dark:bg-red-900/20 dark:border-red-800">
          <p className="text-sm text-red-800 dark:text-red-300 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {error || claimError}
          </p>
        </div>
      )}
      
      {successMessage && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 dark:bg-emerald-900/20 dark:border-emerald-800">
          <p className="text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {successMessage}
          </p>
        </div>
      )}

      {/* Counter-Offer Modal */}
      {counterOfferOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Submit Counter-Offer
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Respond to the buyer&apos;s offer. Escrow: {counterOfferOrder.orderAmount} ETH.
              Round {counterOfferOrder.disputeRound + 1} of 6.
            </p>
            
            {counterOfferOrder.lastOfferBuyerPercent > 0 && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
                <span className="text-blue-600 dark:text-blue-400">Buyer&apos;s last offer:</span>
                <span className="ml-2 font-medium text-gray-900 dark:text-white">
                  {counterOfferOrder.lastOfferBuyerPercent}% to buyer, {100 - counterOfferOrder.lastOfferBuyerPercent}% to you
                </span>
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-blue-600 dark:text-blue-400 font-medium">Buyer: {counterOfferPercent}%</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">You: {100 - counterOfferPercent}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={counterOfferPercent}
                  onChange={(e) => setCounterOfferPercent(Number(e.target.value))}
                  className="w-full accent-orange-600"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Buyer receives:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {(parseFloat(counterOfferOrder.orderAmount) * counterOfferPercent / 100).toFixed(6)} ETH
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">You receive:</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {(parseFloat(counterOfferOrder.orderAmount) * (100 - counterOfferPercent) / 100).toFixed(6)} ETH
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setCounterOfferOrder(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitCounterOffer}
                disabled={isSubmittingCounterOffer}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {isSubmittingCounterOffer ? 'Submitting...' : 'Submit Counter-Offer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Overview */}
      <section className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800/50">
          <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">Available Requests</p>
          <p className="text-2xl font-bold text-amber-900 dark:text-amber-100">{pendingOrders.length}</p>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800/50">
          <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Total Escrow Value</p>
          <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">{totalEscrowValue.toFixed(4)} ETH</p>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200 dark:border-violet-800/50">
          <p className="text-sm text-violet-700 dark:text-violet-300 font-medium">My Active Jobs</p>
          <p className="text-2xl font-bold text-violet-900 dark:text-violet-100">
            {myJobs.filter(j => j.status !== EscrowStatus.Completed && j.status !== EscrowStatus.Cancelled && j.status !== EscrowStatus.Settled).length}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border border-orange-200 dark:border-orange-800/50">
          <p className="text-sm text-orange-700 dark:text-orange-300 font-medium">Active Disputes</p>
          <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{myDisputes.length}</p>
        </div>
      </section>

      {/* Print Requests */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Print Requests
          </h2>
          
          {/* Filters */}
          <div className="flex items-center gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300"
            >
              <option value="pending">Available Jobs</option>
              <option value="my-jobs">My Jobs</option>
              <option value="disputes">My Disputes</option>
              <option value="all">All Orders</option>
            </select>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300"
            >
              <option value="escrow-high">Highest Escrow</option>
              <option value="escrow-low">Lowest Escrow</option>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
            
            <button
              onClick={loadOrders}
              disabled={isLoading || isLoadingEscrows}
              className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50"
            >
              {isLoading || isLoadingEscrows ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Loading State */}
        {(isLoading || isLoadingEscrows) && allOrders.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
            <svg className="animate-spin h-8 w-8 mx-auto text-violet-600 mb-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400">Loading orders from blockchain...</p>
          </div>
        ) : sortedOrders.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400">
              {filterStatus === 'pending' ? 'No available print requests.' : 
               filterStatus === 'my-jobs' ? 'You haven\'t claimed any jobs yet.' :
               filterStatus === 'disputes' ? 'No active disputes.' :
               'No orders found.'}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              {filterStatus === 'pending' ? 'Check back soon for new jobs to claim.' : ''}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedOrders.map((order) => (
              <div
                key={order.address}
                className={`p-4 rounded-xl border bg-white dark:bg-gray-900/50 hover:border-violet-200 dark:hover:border-violet-800 transition-colors ${
                  order.status === EscrowStatus.InDispute || order.status === EscrowStatus.ArbiterReview
                    ? 'border-orange-200 dark:border-orange-800'
                    : 'border-gray-200 dark:border-gray-800'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        {truncateAddress(order.address)}
                      </span>
                    </div>
                    
                    {/* Order Details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block">Escrow</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {parseFloat(order.orderAmount).toFixed(6)} ETH
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block">Buyer</span>
                        <span className="font-mono text-gray-900 dark:text-white">
                          {truncateAddress(order.buyer)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block">Created</span>
                        <span className="text-gray-900 dark:text-white">
                          {new Date(order.createdAt * 1000).toLocaleDateString()}
                        </span>
                      </div>
                      {order.metadata && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 block">Material</span>
                          <span className="text-gray-900 dark:text-white">
                            {order.metadata.material}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Print Specs from Metadata */}
                    {order.metadata && (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                          {order.metadata.originalName}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {order.metadata.color} • {order.metadata.infillPercent}% infill • 
                          {order.metadata.dimensions.x} × {order.metadata.dimensions.y} × {order.metadata.dimensions.z} mm
                        </p>
                      </div>
                    )}
                    
                    {/* Seller info if claimed */}
                    {order.seller && order.seller !== '0x0000000000000000000000000000000000000000' && (
                      <div className="mt-2 text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Seller: </span>
                        <span className="font-mono text-gray-900 dark:text-white">
                          {truncateAddress(order.seller)}
                          {walletAddress && order.seller.toLowerCase() === walletAddress.toLowerCase() && (
                            <span className="ml-2 text-violet-600 dark:text-violet-400">(You)</span>
                          )}
                        </span>
                      </div>
                    )}
                    
                    {/* Dispute Info */}
                    {(order.status === EscrowStatus.InDispute || order.status === EscrowStatus.ArbiterReview) && (
                      <div className="mt-3 pt-3 border-t border-orange-100 dark:border-orange-900/30">
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <div>
                            <span className="text-orange-600 dark:text-orange-400">Round:</span>
                            <span className="ml-1 font-medium text-gray-900 dark:text-white">
                              {order.disputeRound}/6
                            </span>
                          </div>
                          {order.lastOfferBuyerPercent > 0 && (
                            <div>
                              <span className="text-orange-600 dark:text-orange-400">Last Offer:</span>
                              <span className="ml-1 font-medium text-gray-900 dark:text-white">
                                {order.lastOfferBuyerPercent}% to buyer
                              </span>
                            </div>
                          )}
                          <div>
                            <span className="text-orange-600 dark:text-orange-400">Turn:</span>
                            <span className="ml-1 font-medium text-gray-900 dark:text-white">
                              {order.isBuyerTurn ? "Buyer's turn" : 'Your turn'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Time remaining for Arrived status */}
                    {order.status === EscrowStatus.Arrived && order.timeRemaining > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                        <p className="text-sm text-purple-600 dark:text-purple-400">
                          Buyer dispute window: {formatTimeRemaining(order.timeRemaining)} remaining
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {/* Action Button */}
                  <div className="ml-4 flex-shrink-0">
                    {getActionButton(order)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section className="p-6 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Seller Actions
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <button
            className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-violet-300 dark:hover:border-violet-700 transition-colors text-left"
            onClick={() => setFilterStatus('my-jobs')}
          >
            <svg className="w-6 h-6 text-violet-600 dark:text-violet-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="font-medium text-gray-900 dark:text-white">My Active Jobs</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">View and manage claimed orders</p>
          </button>
          <button
            className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-violet-300 dark:hover:border-violet-700 transition-colors text-left"
            onClick={() => setFilterStatus('pending')}
          >
            <svg className="w-6 h-6 text-violet-600 dark:text-violet-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="font-medium text-gray-900 dark:text-white">Browse Jobs</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Find new print requests to claim</p>
          </button>
          <button
            className={`p-4 rounded-lg border bg-white dark:bg-gray-800 hover:border-orange-300 dark:hover:border-orange-700 transition-colors text-left ${
              myDisputes.length > 0 
                ? 'border-orange-200 dark:border-orange-800' 
                : 'border-gray-200 dark:border-gray-700'
            }`}
            onClick={() => setFilterStatus('disputes')}
          >
            <svg className="w-6 h-6 text-orange-600 dark:text-orange-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="font-medium text-gray-900 dark:text-white">
              My Disputes
              {myDisputes.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full">
                  {myDisputes.length}
                </span>
              )}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage active disputes</p>
          </button>
        </div>
      </section>
    </div>
  );
}
