'use client';

import { useState, useEffect, useCallback } from 'react';
import FileUpload from './FileUpload';
import { useWalletContext } from '../context/WalletContext';
import { 
  useCreateOrder, 
  useReadEscrow, 
  useCancel,
  useOpenDispute,
  useSubmitOffer,
  useAcceptOffer,
  useRejectFinalOffer,
  useFinalizeOrder,
  EscrowStatus, 
  STATUS_LABELS,
  EscrowData,
  CONTRACT_ADDRESSES,
  formatTimeRemaining,
} from '../hooks/useContract';

interface PrintEstimate {
  dimensions: { x: number; y: number; z: number };
  volumeCm3: number;
  weightGrams: number;
  isWatertight: boolean;
  material: string;
  color: string;
  infillPercent: number;
  materialCost: number;
  availableMaterials: string[];
  availableColors: string[];
}

interface UploadResponse {
  success: boolean;
  fileName: string;
  originalName: string;
  size: number;
  path: string;
  estimate: PrintEstimate | null;
}

// Order metadata stored in localStorage (not on-chain)
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

// Material densities (g/cm³) and prices ($/kg)
const MATERIAL_DATA: Record<string, { density: number; pricePerKg: number; wasteFactor: number }> = {
  PLA: { density: 1.24, pricePerKg: 20, wasteFactor: 1.05 },
  ABS: { density: 1.04, pricePerKg: 22, wasteFactor: 1.08 },
  PETG: { density: 1.27, pricePerKg: 25, wasteFactor: 1.06 },
  TPU: { density: 1.21, pricePerKg: 35, wasteFactor: 1.10 },
  NYLON: { density: 1.14, pricePerKg: 45, wasteFactor: 1.08 },
  ASA: { density: 1.07, pricePerKg: 30, wasteFactor: 1.07 },
  PC: { density: 1.20, pricePerKg: 40, wasteFactor: 1.10 },
  HIPS: { density: 1.04, pricePerKg: 22, wasteFactor: 1.06 },
  PVA: { density: 1.23, pricePerKg: 60, wasteFactor: 1.12 },
  CF_PLA: { density: 1.30, pricePerKg: 50, wasteFactor: 1.08 },
  WOOD_PLA: { density: 1.15, pricePerKg: 35, wasteFactor: 1.10 },
  RESIN_STANDARD: { density: 1.10, pricePerKg: 35, wasteFactor: 1.15 },
};

// Color modifiers
const COLOR_MODIFIERS: Record<string, number> = {
  White: 1.0, Black: 1.0, Gray: 1.0, Red: 1.0, Blue: 1.0, Green: 1.0, Yellow: 1.0, Orange: 1.0,
  'Ocean Blue': 1.0, 'Forest Green': 1.0, 'Crimson Red': 1.0,
  Silver: 1.15, Gold: 1.15, Bronze: 1.15, Copper: 1.15, Chrome: 1.15,
  'Silk White': 1.20, 'Silk Blue': 1.20, 'Silk Red': 1.20, 'Silk Green': 1.20, 'Silk Gold': 1.20, 'Silk Silver': 1.20,
  'Glow Green': 1.25, 'Glow Blue': 1.25, 'Glow White': 1.25, 'Glow Orange': 1.25,
  Clear: 1.10, 'Transparent Blue': 1.10, 'Transparent Red': 1.10, 'Transparent Green': 1.10,
  'Matte Black': 1.05, 'Matte White': 1.05, 'Matte Gray': 1.05,
  Rainbow: 1.30, Galaxy: 1.30, Marble: 1.30,
};

const SHIPPING_COST = 5.00;
const MIN_COST = 0.50;
const DEPOSIT_MULTIPLIER = 1.025; // 2% gas cushion + 0.5% platform fee

// LocalStorage helpers for order metadata
const ORDERS_STORAGE_KEY = 'filamint_buyer_orders';

function getStoredOrders(walletAddress: string): OrderMetadata[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(`${ORDERS_STORAGE_KEY}_${walletAddress.toLowerCase()}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function storeOrder(walletAddress: string, order: OrderMetadata) {
  if (typeof window === 'undefined') return;
  const orders = getStoredOrders(walletAddress);
  orders.unshift(order); // Add to beginning
  localStorage.setItem(`${ORDERS_STORAGE_KEY}_${walletAddress.toLowerCase()}`, JSON.stringify(orders));
}

// Get metadata for a specific escrow address
function getOrderMetadata(escrowAddress: string): OrderMetadata | null {
  if (typeof window === 'undefined') return null;
  try {
    // Search through all stored orders
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(ORDERS_STORAGE_KEY)) {
        const orders: OrderMetadata[] = JSON.parse(localStorage.getItem(key) || '[]');
        const found = orders.find(o => o.escrowAddress.toLowerCase() === escrowAddress.toLowerCase());
        if (found) return found;
      }
    }
  } catch {
    // Ignore
  }
  return null;
}

// Export for use in SellerView
export { getOrderMetadata };

export default function BuyerView() {
  const { walletAddress, isConnected } = useWalletContext();
  const { createOrder, isLoading: isCreating, error: createError } = useCreateOrder();
  const { readEscrow } = useReadEscrow();
  const { cancel, isLoading: isCancelling } = useCancel();
  const { openDispute, isLoading: isOpeningDispute } = useOpenDispute();
  const { submitOffer, isLoading: isSubmittingOffer } = useSubmitOffer();
  const { acceptOffer, isLoading: isAcceptingOffer } = useAcceptOffer();
  const { rejectFinalOffer, isLoading: isRejectingOffer } = useRejectFinalOffer();
  const { finalizeOrder, isLoading: isFinalizing } = useFinalizeOrder();
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Base volume from initial upload (doesn't change)
  const [baseVolumeCm3, setBaseVolumeCm3] = useState<number>(0);
  
  // Configurable settings
  const [material, setMaterial] = useState('PLA');
  const [color, setColor] = useState('White');
  const [infillPercent, setInfillPercent] = useState(20);
  const [sellerMargin, setSellerMargin] = useState(15);
  
  // Calculated values
  const [estimate, setEstimate] = useState<PrintEstimate | null>(null);
  
  // ETH price from CoinGecko
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  
  // My Orders state
  const [myOrders, setMyOrders] = useState<(EscrowData & { metadata?: OrderMetadata })[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  
  // Dispute modal state
  const [disputeOrder, setDisputeOrder] = useState<(EscrowData & { metadata?: OrderMetadata }) | null>(null);
  const [offerPercent, setOfferPercent] = useState(50);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Fetch ETH price on mount
  useEffect(() => {
    const fetchEthPrice = async () => {
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
        );
        const data = await response.json();
        setEthPrice(data.ethereum.usd);
      } catch (err) {
        console.error('Failed to fetch ETH price:', err);
        setEthPrice(3500); // Fallback
      }
    };
    fetchEthPrice();
    // Refresh every 60 seconds
    const interval = setInterval(fetchEthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // Load my orders when wallet connects
  const loadMyOrders = useCallback(async () => {
    if (!walletAddress || !CONTRACT_ADDRESSES.factory) return;
    
    setIsLoadingOrders(true);
    try {
      const storedOrders = getStoredOrders(walletAddress);
      const ordersWithData: (EscrowData & { metadata?: OrderMetadata })[] = [];
      
      for (const metadata of storedOrders) {
        try {
          const escrowData = await readEscrow(metadata.escrowAddress);
          ordersWithData.push({ ...escrowData, metadata });
        } catch (err) {
          console.error(`Failed to read escrow ${metadata.escrowAddress}:`, err);
        }
      }
      
      setMyOrders(ordersWithData);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [walletAddress, readEscrow]);

  useEffect(() => {
    loadMyOrders();
  }, [loadMyOrders]);

  // Recalculate when settings change
  useEffect(() => {
    if (!estimate || baseVolumeCm3 === 0) return;
    
    const matKey = material.toUpperCase().replace(/\s+/g, '_');
    const matData = MATERIAL_DATA[matKey] || MATERIAL_DATA.PLA;
    const colorMod = COLOR_MODIFIERS[color] ?? 1.0;
    
    const shellRatio = 0.15;
    const effectiveVolume = baseVolumeCm3 * (shellRatio + (1 - shellRatio) * (infillPercent / 100));
    const weightGrams = effectiveVolume * matData.density;
    const pricePerGram = matData.pricePerKg / 1000;
    const rawCost = weightGrams * pricePerGram * colorMod * matData.wasteFactor;
    const materialCost = Math.max(rawCost, MIN_COST);
    
    setEstimate(prev => prev ? {
      ...prev,
      material,
      color,
      infillPercent,
      weightGrams: Math.round(weightGrams * 100) / 100,
      materialCost: Math.round(materialCost * 100) / 100,
    } : null);
  }, [material, color, infillPercent, baseVolumeCm3, estimate]);

  const handleFileSelect = async (file: File) => {
    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);
    setUploadData(null);
    setEstimate(null);
    setBaseVolumeCm3(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data: UploadResponse = await response.json();

      if (!response.ok) {
        throw new Error((data as { error?: string }).error || 'Upload failed');
      }

      setUploadData(data);
      if (data.estimate) {
        setEstimate(data.estimate);
        setBaseVolumeCm3(data.estimate.volumeCm3);
        setMaterial(data.estimate.material);
        setColor(data.estimate.color);
        setInfillPercent(data.estimate.infillPercent);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  // Calculate totals
  const materialCost = estimate?.materialCost ?? 0;
  const marginAmount = (materialCost + SHIPPING_COST) * (sellerMargin / 100);
  const totalCost = materialCost + SHIPPING_COST + marginAmount;
  const depositAmount = totalCost * DEPOSIT_MULTIPLIER;

  // Convert USD to ETH
  const toEth = (usd: number): string => {
    if (!ethPrice) return '...';
    return (usd / ethPrice).toFixed(6);
  };

  const toEthNumber = (usd: number): number => {
    if (!ethPrice) return 0;
    return usd / ethPrice;
  };

  // Handle margin slider
  const handleMarginChange = (value: number) => {
    setSellerMargin(value);
  };

  // Submit order to blockchain
  const handleSubmitOrder = async () => {
    if (!isConnected || !walletAddress) {
      setError('Please connect your wallet first');
      return;
    }
    
    if (sellerMargin < 10) {
      setError('Minimum seller margin is 10%');
      return;
    }
    
    if (!uploadData || !estimate || !ethPrice) {
      setError('Please upload a file first');
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      // Calculate deposit in ETH (total cost * 1.025 for fees)
      const depositEth = toEthNumber(depositAmount).toFixed(8);
      
      // Use file name as hash identifier
      const fileHash = uploadData.fileName;
      
      const result = await createOrder(fileHash, depositEth);
      
      // Store order metadata locally
      const metadata: OrderMetadata = {
        escrowAddress: result.escrowAddress,
        fileName: uploadData.fileName,
        originalName: uploadData.originalName,
        material,
        color,
        infillPercent,
        dimensions: estimate.dimensions,
        totalCostUsd: totalCost,
        totalCostEth: toEth(totalCost),
        createdAt: Date.now(),
      };
      
      storeOrder(walletAddress, metadata);
      
      setSuccessMessage(`Order created! Escrow: ${result.escrowAddress.slice(0, 10)}...`);
      
      // Reset form
      setUploadData(null);
      setEstimate(null);
      setBaseVolumeCm3(0);
      
      // Reload orders
      loadMyOrders();
    } catch (err) {
      console.error('Order creation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to create order');
    }
  };

  // Cancel order
  const handleCancelOrder = async (escrowAddress: string) => {
    if (!confirm('Are you sure you want to cancel this order? You will lose 5.5% as fees.')) {
      return;
    }
    
    setActionInProgress(escrowAddress);
    try {
      await cancel(escrowAddress);
      setSuccessMessage('Order cancelled successfully');
      loadMyOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel order');
    } finally {
      setActionInProgress(null);
    }
  };

  // Open dispute
  const handleOpenDispute = async (escrowAddress: string) => {
    setActionInProgress(escrowAddress);
    setError(null);
    try {
      await openDispute(escrowAddress);
      setSuccessMessage('Dispute opened! You can now negotiate with the seller.');
      loadMyOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open dispute');
    } finally {
      setActionInProgress(null);
    }
  };

  // Submit offer in dispute
  const handleSubmitOffer = async () => {
    if (!disputeOrder) return;
    
    setActionInProgress(disputeOrder.address);
    setError(null);
    try {
      await submitOffer(disputeOrder.address, offerPercent);
      setSuccessMessage(`Offer submitted: ${offerPercent}% to you, ${100 - offerPercent}% to seller`);
      setDisputeOrder(null);
      loadMyOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit offer');
    } finally {
      setActionInProgress(null);
    }
  };

  // Accept seller's offer
  const handleAcceptOffer = async (escrowAddress: string) => {
    setActionInProgress(escrowAddress);
    setError(null);
    try {
      await acceptOffer(escrowAddress);
      setSuccessMessage('Offer accepted! Funds will be distributed.');
      loadMyOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept offer');
    } finally {
      setActionInProgress(null);
    }
  };

  // Reject final offer and escalate to arbiter
  const handleRejectFinalOffer = async (escrowAddress: string) => {
    if (!confirm('Are you sure you want to escalate to arbiter? A 10% arbitration fee will apply.')) {
      return;
    }
    
    setActionInProgress(escrowAddress);
    setError(null);
    try {
      await rejectFinalOffer(escrowAddress);
      setSuccessMessage('Escalated to arbiter. They will review and decide.');
      loadMyOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to escalate to arbiter');
    } finally {
      setActionInProgress(null);
    }
  };

  // Finalize order after 7-day window
  const handleFinalizeOrder = async (escrowAddress: string) => {
    setActionInProgress(escrowAddress);
    setError(null);
    try {
      await finalizeOrder(escrowAddress);
      setSuccessMessage('Order finalized! Funds released to seller.');
      loadMyOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize order');
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

  // Get action buttons for order based on status
  const getOrderActions = (order: EscrowData & { metadata?: OrderMetadata }) => {
    const isInProgress = actionInProgress === order.address;
    
    switch (order.status) {
      case EscrowStatus.Pending:
        return (
          <button
            onClick={() => handleCancelOrder(order.address)}
            disabled={isCancelling || isInProgress}
            className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
          >
            {isInProgress ? '...' : 'Cancel'}
          </button>
        );
      
      case EscrowStatus.Arrived:
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleOpenDispute(order.address)}
              disabled={isOpeningDispute || isInProgress}
              className="px-3 py-1.5 text-sm font-medium text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-50"
            >
              {isInProgress ? '...' : 'Open Dispute'}
            </button>
            {order.timeRemaining === 0 && (
              <button
                onClick={() => handleFinalizeOrder(order.address)}
                disabled={isFinalizing || isInProgress}
                className="px-3 py-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50"
              >
                {isInProgress ? '...' : 'Finalize'}
              </button>
            )}
          </div>
        );
      
      case EscrowStatus.InDispute: {
        const sellerMadeOffer = order.lastOfferBy.toLowerCase() !== '0x0000000000000000000000000000000000000000' &&
                                order.lastOfferBy.toLowerCase() === order.seller.toLowerCase();
        
        return (
          <div className="flex flex-col gap-2">
            {/* Buyer can always accept seller's offer if one exists */}
            {sellerMadeOffer && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleAcceptOffer(order.address)}
                  disabled={isAcceptingOffer || isInProgress}
                  className="px-3 py-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50"
                >
                  {isInProgress ? '...' : `Accept ${order.lastOfferBuyerPercent}%`}
                </button>
                {order.disputeRound === 6 && (
                  <button
                    onClick={() => handleRejectFinalOffer(order.address)}
                    disabled={isRejectingOffer || isInProgress}
                    className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                  >
                    {isInProgress ? '...' : 'Escalate'}
                  </button>
                )}
              </div>
            )}
            {/* Buyer can make offer when it's their turn */}
            {order.isBuyerTurn && (
              <button
                onClick={() => {
                  setDisputeOrder(order);
                  setOfferPercent(order.lastOfferBuyerPercent || 50);
                }}
                disabled={isSubmittingOffer || isInProgress}
                className="px-3 py-1.5 text-sm font-medium text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-50"
              >
                {sellerMadeOffer ? 'Counter Offer' : 'Make Offer'}
              </button>
            )}
            {!order.isBuyerTurn && !sellerMadeOffer && (
              <span className="text-xs text-orange-600 dark:text-orange-400 italic">
                Waiting for seller...
              </span>
            )}
          </div>
        );
      }
      
      case EscrowStatus.ArbiterReview:
        return (
          <span className="text-xs text-gray-500 dark:text-gray-400 italic">
            Awaiting arbiter decision
          </span>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      {/* Error/Success Messages */}
      {(error || createError) && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 dark:bg-red-900/20 dark:border-red-800">
          <p className="text-sm text-red-800 dark:text-red-300 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {error || createError}
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

      {/* Dispute Modal */}
      {disputeOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Make Settlement Offer
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Propose how the escrowed funds ({disputeOrder.orderAmount} ETH) should be split.
              Round {disputeOrder.disputeRound + 1} of 6.
            </p>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-blue-600 dark:text-blue-400 font-medium">You: {offerPercent}%</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Seller: {100 - offerPercent}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={offerPercent}
                  onChange={(e) => setOfferPercent(Number(e.target.value))}
                  className="w-full accent-orange-600"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Your refund:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {(parseFloat(disputeOrder.orderAmount) * offerPercent / 100).toFixed(6)} ETH
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Seller receives:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {(parseFloat(disputeOrder.orderAmount) * (100 - offerPercent) / 100).toFixed(6)} ETH
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDisputeOrder(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitOffer}
                disabled={isSubmittingOffer}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {isSubmittingOffer ? 'Submitting...' : 'Submit Offer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Section */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Upload Your 3D Model
        </h2>
        <FileUpload onFileSelect={handleFileSelect} isUploading={isUploading} />
      </section>

      {/* Model Analysis & Configuration */}
      {uploadData && estimate && (
        <section className="p-6 rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/50">
          {/* Success Banner */}
          <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 p-4 dark:bg-emerald-900/20 dark:border-emerald-800">
            <p className="text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              File uploaded: {uploadData.originalName}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Left Column - Model Info */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Model Analysis
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Dimensions</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {estimate.dimensions.x} × {estimate.dimensions.y} × {estimate.dimensions.z} mm
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Volume</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {baseVolumeCm3} cm³
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Est. Weight</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {estimate.weightGrams}g
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600 dark:text-gray-400">Watertight</span>
                  <span className={`font-medium ${estimate.isWatertight ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {estimate.isWatertight ? 'Yes ✓' : 'No ⚠'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column - Print Settings */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Print Settings
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Material
                  </label>
                  <select 
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  >
                    {estimate.availableMaterials.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Color
                  </label>
                  <select 
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  >
                    {estimate.availableColors.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Infill: {infillPercent}%
                  </label>
                  <input 
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={infillPercent}
                    onChange={(e) => setInfillPercent(Number(e.target.value))}
                    className="w-full accent-violet-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Light (10%)</span>
                    <span>Solid (100%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Cost Estimate
              </h3>
              {ethPrice && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ETH: ${ethPrice.toLocaleString()}
                </span>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-gray-600 dark:text-gray-400">Material Cost</span>
                <div className="text-right">
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${materialCost.toFixed(2)}
                  </span>
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    ({toEth(materialCost)} ETH)
                  </span>
                </div>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-gray-600 dark:text-gray-400">Shipping</span>
                <div className="text-right">
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${SHIPPING_COST.toFixed(2)}
                  </span>
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    ({toEth(SHIPPING_COST)} ETH)
                  </span>
                </div>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-gray-600 dark:text-gray-400">
                  Seller Margin ({sellerMargin}%)
                </span>
                <div className="text-right">
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${marginAmount.toFixed(2)}
                  </span>
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    ({toEth(marginAmount)} ETH)
                  </span>
                </div>
              </div>
            </div>

            {/* Seller Margin Slider */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Seller Margin: {sellerMargin}%
                {sellerMargin < 10 && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400 text-xs">
                    (min 10% required)
                  </span>
                )}
              </label>
              <input 
                type="range"
                min={0}
                max={100}
                step={5}
                value={sellerMargin}
                onChange={(e) => handleMarginChange(Number(e.target.value))}
                className="w-full accent-violet-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0%</span>
                <span>100%</span>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                Higher margins attract more sellers and lead to faster fulfillment of your order. Material cost has a $0.50 minimum.
              </p>
            </div>

            {/* Total Cost */}
            <div className="mt-6 flex justify-between items-center py-3 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 rounded-lg px-4">
              <span className="font-semibold text-gray-900 dark:text-white">Total Cost</span>
              <div className="text-right">
                <span className="font-bold text-xl text-violet-600 dark:text-violet-400">
                  ${totalCost.toFixed(2)}
                </span>
                <span className="ml-2 text-sm text-violet-500 dark:text-violet-300">
                  ({toEth(totalCost)} ETH)
                </span>
              </div>
            </div>

            {/* Deposit Info */}
            <div className="mt-3 flex justify-between items-center py-2 px-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                Deposit (incl. 2.5% escrow fees)
              </span>
              <div className="text-right">
                <span className="font-medium text-gray-900 dark:text-white">
                  {toEth(depositAmount)} ETH
                </span>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            className="mt-8 w-full rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-lg transition-all hover:from-violet-700 hover:to-indigo-700 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSubmitOrder}
            disabled={sellerMargin < 10 || isCreating || !isConnected}
          >
            {!isConnected ? (
              'Connect Wallet to Submit'
            ) : isCreating ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating Order...
              </span>
            ) : sellerMargin < 10 ? (
              'Set margin to at least 10%'
            ) : (
              `Submit Print Request (${toEth(depositAmount)} ETH)`
            )}
          </button>
        </section>
      )}

      {/* My Orders Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            My Print Orders
          </h2>
          {isConnected && (
            <button
              onClick={loadMyOrders}
              disabled={isLoadingOrders}
              className="text-sm text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50"
            >
              {isLoadingOrders ? 'Loading...' : 'Refresh'}
            </button>
          )}
        </div>
        
        {!isConnected ? (
          <div className="text-center py-12 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400">Connect your wallet to see your orders</p>
          </div>
        ) : isLoadingOrders ? (
          <div className="text-center py-12 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
            <svg className="animate-spin h-8 w-8 mx-auto text-violet-600 mb-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400">Loading orders...</p>
          </div>
        ) : myOrders.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400">No orders yet. Upload a model to get started!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {myOrders.map((order) => (
              <div
                key={order.address}
                className={`p-4 rounded-xl border bg-white dark:bg-gray-900/50 ${
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
                    
                    {order.metadata && (
                      <div className="mb-3">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {order.metadata.originalName}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {order.metadata.material} • {order.metadata.color} • {order.metadata.infillPercent}% infill
                        </p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Escrow Amount:</span>
                        <span className="ml-2 font-medium text-gray-900 dark:text-white">
                          {parseFloat(order.orderAmount).toFixed(6)} ETH
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Created:</span>
                        <span className="ml-2 font-medium text-gray-900 dark:text-white">
                          {new Date(order.createdAt * 1000).toLocaleDateString()}
                        </span>
                      </div>
                      {order.seller && order.seller !== '0x0000000000000000000000000000000000000000' && (
                        <div className="col-span-2">
                          <span className="text-gray-500 dark:text-gray-400">Seller:</span>
                          <span className="ml-2 font-medium text-gray-900 dark:text-white font-mono">
                            {truncateAddress(order.seller)}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Dispute Info */}
                    {(order.status === EscrowStatus.InDispute || order.status === EscrowStatus.ArbiterReview) && (
                      <div className="mt-3 pt-3 border-t border-orange-100 dark:border-orange-900/30">
                        <div className="flex items-center gap-4 text-sm">
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
                              {order.isBuyerTurn ? 'Your turn' : "Seller's turn"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Time remaining for Arrived status */}
                    {order.status === EscrowStatus.Arrived && order.timeRemaining > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                        <p className="text-sm text-purple-600 dark:text-purple-400">
                          Dispute window: {formatTimeRemaining(order.timeRemaining)} remaining
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="ml-4 flex-shrink-0">
                    {getOrderActions(order)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
