'use client';

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWalletContext } from '../context/WalletContext';

// Contract addresses - update these after deployment
export const CONTRACT_ADDRESSES = {
  factory: process.env.NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS || '',
} as const;

// Factory ABI
export const FACTORY_ABI = [
  'function createOrder(bytes32 fileHash) payable returns (bytes32 orderId, address escrow)',
  'function createOrderDeterministic(bytes32 fileHash, bytes32 salt) payable returns (bytes32 orderId, address escrow)',
  'function predictAddress(bytes32 salt) view returns (address)',
  'function getEscrow(bytes32 orderId) view returns (address)',
  'function escrows(bytes32 orderId) view returns (address)',
  'function totalOrders() view returns (uint256)',
  'function getEscrows(uint256 offset, uint256 limit) view returns (address[])',
  'function arbiter() view returns (address)',
  'function minOrderAmount() view returns (uint256)',
  'event OrderCreated(bytes32 indexed orderId, address indexed escrow, address indexed buyer, uint256 amount, bytes32 fileHash)',
] as const;

// Escrow Instance ABI
export const ESCROW_ABI = [
  // View functions
  'function buyer() view returns (address)',
  'function seller() view returns (address)',
  'function status() view returns (uint8)',
  'function orderId() view returns (bytes32)',
  'function orderAmount() view returns (uint256)',
  'function gasCushion() view returns (uint256)',
  'function platformFee() view returns (uint256)',
  'function gasUsed() view returns (uint256)',
  'function createdAt() view returns (uint256)',
  'function claimedAt() view returns (uint256)',
  'function shippedAt() view returns (uint256)',
  'function arrivedAt() view returns (uint256)',
  'function disputeRound() view returns (uint8)',
  'function lastOfferBuyerPercent() view returns (uint8)',
  'function lastOfferAt() view returns (uint256)',
  'function lastOfferBy() view returns (address)',
  'function currentOffer() view returns (uint8 pct, uint256 timestamp, address offerer)',
  'function isBuyerTurn() view returns (bool)',
  'function timeRemaining() view returns (uint256)',
  // Buyer actions
  'function cancel()',
  'function openDispute()',
  'function submitOffer(uint8 pct)',
  'function acceptOffer()',
  'function rejectFinalOffer()',
  // Seller actions
  'function claim()',
  'function markShipped()',
  'function claimDelivery()',
  'function submitCounterOffer(uint8 pct)',
  'function acceptBuyerOffer()',
  // Public actions
  'function confirmDeliveryViaOracle()',
  'function finalizeOrder()',
  'function finalizeOffer()',
  'function finalizeArbiter()',
  // Arbiter action
  'function arbiterDecide(uint8 pct)',
  // Events
  'event OrderClaimed(address indexed seller, uint256 timestamp)',
  'event OrderShipped(uint256 timestamp)',
  'event DeliveryConfirmed(uint256 timestamp, bool byOracle)',
  'event OrderCompleted(uint256 sellerPayout, uint256 buyerRefund)',
  'event OrderCancelled(uint256 buyerRefund, uint256 platformFee)',
  'event DisputeOpened(uint256 timestamp)',
  'event OfferSubmitted(address indexed by, uint8 round, uint8 buyerPercent)',
  'event OfferAccepted(uint8 round, uint8 buyerPercent)',
  'event OfferAutoAccepted(uint8 round, uint8 buyerPercent)',
  'event ArbiterDecision(uint8 buyerPercent, uint8 sellerPercent)',
  'event ArbiterReviewStarted(uint256 timestamp)',
  'event GasReimbursed(address indexed to, uint256 amount)',
] as const;

// Status enum matching contract
export enum EscrowStatus {
  Pending = 0,
  Claimed = 1,
  Shipped = 2,
  Arrived = 3,
  Completed = 4,
  Cancelled = 5,
  InDispute = 6,
  ArbiterReview = 7,
  Settled = 8,
}

export const STATUS_LABELS: Record<EscrowStatus, string> = {
  [EscrowStatus.Pending]: 'Pending',
  [EscrowStatus.Claimed]: 'Claimed',
  [EscrowStatus.Shipped]: 'Shipped',
  [EscrowStatus.Arrived]: 'Arrived',
  [EscrowStatus.Completed]: 'Completed',
  [EscrowStatus.Cancelled]: 'Cancelled',
  [EscrowStatus.InDispute]: 'In Dispute',
  [EscrowStatus.ArbiterReview]: 'Arbiter Review',
  [EscrowStatus.Settled]: 'Settled',
};

// Options interface kept for API compatibility but role verification removed
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface UseContractOptions {
  // Role verification removed - single wallet can act as any role
}

interface ContractCallResult<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

export interface EscrowData {
  address: string;
  buyer: string;
  seller: string;
  status: EscrowStatus;
  orderId: string;
  orderAmount: string;
  gasCushion: string;
  platformFee: string;
  gasUsed: string;
  createdAt: number;
  claimedAt: number;
  shippedAt: number;
  arrivedAt: number;
  disputeRound: number;
  lastOfferBuyerPercent: number;
  lastOfferAt: number;
  lastOfferBy: string;
  isBuyerTurn: boolean;
  timeRemaining: number;
}

/**
 * Helper to get MetaMask provider specifically, avoiding other wallet extensions
 */
function getMetaMaskProvider() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No wallet detected');
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ethereum = window.ethereum as any;
  
  // If multiple providers, find MetaMask specifically
  if (ethereum.providers && Array.isArray(ethereum.providers)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metamask = ethereum.providers.find((p: any) => p.isMetaMask && !p.isBraveWallet);
    if (metamask) return metamask;
  }
  
  // Single provider - check if it's MetaMask
  if (ethereum.isMetaMask) {
    return ethereum;
  }
  
  // Fallback to whatever is available
  return ethereum;
}

/**
 * Hook to get an ethers provider (read-only blockchain access)
 */
export function useProvider() {
  const getProvider = useCallback(() => {
    const provider = getMetaMaskProvider();
    return new ethers.BrowserProvider(provider);
  }, []);

  return { getProvider };
}

/**
 * Hook to get a signer (uses currently connected wallet)
 * In single-wallet mode, the same wallet can act as buyer or seller in different transactions
 */
export function useSigner() {
  const { walletAddress, isConnected } = useWalletContext();
  const { getProvider } = useProvider();

  const getSigner = useCallback(async () => {
    if (!isConnected || !walletAddress) {
      throw new Error('Please connect your wallet first');
    }
    
    const provider = getProvider();
    const signer = await provider.getSigner();
    return signer;
  }, [getProvider, walletAddress, isConnected]);

  return { getSigner };
}

/**
 * Hook to get contract instances
 */
export function useContractInstance() {
  const { getSigner } = useSigner();
  const { getProvider } = useProvider();

  const getContract = useCallback(async (
    address: string,
    abi: readonly string[],
    _options?: UseContractOptions
  ) => {
    const signer = await getSigner();
    return new ethers.Contract(address, abi, signer);
  }, [getSigner]);

  const getReadOnlyContract = useCallback((address: string, abi: readonly string[]) => {
    const provider = getProvider();
    return new ethers.Contract(address, abi, provider);
  }, [getProvider]);

  return { getContract, getReadOnlyContract };
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook for creating a print order (buyer action)
 */
export function useCreateOrder() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ orderId: string; escrowAddress: string; txHash: string }>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const createOrder = useCallback(async (fileHash: string, totalAmountEth: string) => {
    setState({ data: null, error: null, isLoading: true });

    try {
      const contract = await getContract(
        CONTRACT_ADDRESSES.factory,
        FACTORY_ABI
      );

      // Convert file hash to bytes32 if it's not already
      const hashBytes = fileHash.startsWith('0x') 
        ? fileHash 
        : ethers.keccak256(ethers.toUtf8Bytes(fileHash));

      const tx = await contract.createOrder(hashBytes, {
        value: ethers.parseEther(totalAmountEth),
      });

      const receipt = await tx.wait();
      
      const event = receipt.logs.find(
        (log: { fragment?: { name: string } }) => log.fragment?.name === 'OrderCreated'
      );
      
      const orderId = event?.args?.orderId || 'unknown';
      const escrowAddress = event?.args?.escrow || 'unknown';

      setState({
        data: { orderId, escrowAddress, txHash: receipt.hash },
        error: null,
        isLoading: false,
      });

      return { orderId, escrowAddress, txHash: receipt.hash };
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      // Parse common errors for better UX
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('INSUFFICIENT_FUNDS')) {
        errorMessage = 'Insufficient funds. Make sure your wallet has enough ETH and is connected to the correct network (Hardhat localhost:8545).';
      } else if (errorMessage.includes('user rejected') || errorMessage.includes('User denied')) {
        errorMessage = 'Transaction rejected by user.';
      }
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { createOrder, ...state };
}

/**
 * Hook for reading factory info
 */
export function useFactoryInfo() {
  const { getReadOnlyContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{
    totalOrders: number;
    arbiter: string;
    minOrderAmount: string;
  }>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const readFactoryInfo = useCallback(async () => {
    setState({ data: null, error: null, isLoading: true });

    try {
      const contract = getReadOnlyContract(CONTRACT_ADDRESSES.factory, FACTORY_ABI);

      const [totalOrders, arbiter, minOrderAmount] = await Promise.all([
        contract.totalOrders(),
        contract.arbiter(),
        contract.minOrderAmount(),
      ]);

      const data = {
        totalOrders: Number(totalOrders),
        arbiter,
        minOrderAmount: ethers.formatEther(minOrderAmount),
      };

      setState({ data, error: null, isLoading: false });
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to read factory';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getReadOnlyContract]);

  return { readFactoryInfo, ...state };
}

// ═══════════════════════════════════════════════════════════════════════════
// ESCROW READ HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook for reading escrow data
 */
export function useReadEscrow() {
  const { getReadOnlyContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<EscrowData>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const readEscrow = useCallback(async (escrowAddress: string) => {
    setState({ data: null, error: null, isLoading: true });

    try {
      const contract = getReadOnlyContract(escrowAddress, ESCROW_ABI);

      const [
        buyer, seller, status, orderId, orderAmount, gasCushion,
        platformFee, gasUsed, createdAt, claimedAt, shippedAt, arrivedAt,
        disputeRound, lastOfferBuyerPercent, lastOfferAt, lastOfferBy,
        isBuyerTurn, timeRemaining
      ] = await Promise.all([
        contract.buyer(),
        contract.seller(),
        contract.status(),
        contract.orderId(),
        contract.orderAmount(),
        contract.gasCushion(),
        contract.platformFee(),
        contract.gasUsed(),
        contract.createdAt(),
        contract.claimedAt(),
        contract.shippedAt(),
        contract.arrivedAt(),
        contract.disputeRound(),
        contract.lastOfferBuyerPercent(),
        contract.lastOfferAt(),
        contract.lastOfferBy(),
        contract.isBuyerTurn(),
        contract.timeRemaining(),
      ]);

      const data: EscrowData = {
        address: escrowAddress,
        buyer,
        seller,
        status: Number(status) as EscrowStatus,
        orderId,
        orderAmount: ethers.formatEther(orderAmount),
        gasCushion: ethers.formatEther(gasCushion),
        platformFee: ethers.formatEther(platformFee),
        gasUsed: ethers.formatEther(gasUsed),
        createdAt: Number(createdAt),
        claimedAt: Number(claimedAt),
        shippedAt: Number(shippedAt),
        arrivedAt: Number(arrivedAt),
        disputeRound: Number(disputeRound),
        lastOfferBuyerPercent: Number(lastOfferBuyerPercent),
        lastOfferAt: Number(lastOfferAt),
        lastOfferBy,
        isBuyerTurn,
        timeRemaining: Number(timeRemaining),
      };

      setState({ data, error: null, isLoading: false });
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to read escrow';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getReadOnlyContract]);

  return { readEscrow, ...state };
}

// ═══════════════════════════════════════════════════════════════════════════
// BUYER ACTION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook for cancelling order (buyer action, before claim)
 */
export function useCancel() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const cancel = useCallback(async (escrowAddress: string) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.cancel();
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { cancel, ...state };
}

/**
 * Hook for opening dispute (buyer action)
 */
export function useOpenDispute() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const openDispute = useCallback(async (escrowAddress: string) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.openDispute();
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { openDispute, ...state };
}

/**
 * Hook for submitting offer (buyer action)
 */
export function useSubmitOffer() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const submitOffer = useCallback(async (escrowAddress: string, buyerPercent: number) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.submitOffer(buyerPercent);
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { submitOffer, ...state };
}

/**
 * Hook for accepting seller's offer (buyer action)
 */
export function useAcceptOffer() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const acceptOffer = useCallback(async (escrowAddress: string) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.acceptOffer();
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { acceptOffer, ...state };
}

/**
 * Hook for rejecting final offer and escalating to arbiter (buyer action)
 */
export function useRejectFinalOffer() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const rejectFinalOffer = useCallback(async (escrowAddress: string) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.rejectFinalOffer();
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { rejectFinalOffer, ...state };
}

// ═══════════════════════════════════════════════════════════════════════════
// SELLER ACTION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook for claiming order (seller action)
 */
export function useClaim() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const claim = useCallback(async (escrowAddress: string) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.claim();
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { claim, ...state };
}

/**
 * Hook for marking shipped (seller action)
 */
export function useMarkShipped() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const markShipped = useCallback(async (escrowAddress: string) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.markShipped();
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { markShipped, ...state };
}

/**
 * Hook for claiming delivery (seller action)
 */
export function useClaimDelivery() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const claimDelivery = useCallback(async (escrowAddress: string) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.claimDelivery();
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { claimDelivery, ...state };
}

/**
 * Hook for submitting counter-offer (seller action)
 */
export function useSubmitCounterOffer() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const submitCounterOffer = useCallback(async (escrowAddress: string, buyerPercent: number) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.submitCounterOffer(buyerPercent);
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { submitCounterOffer, ...state };
}

/**
 * Hook for accepting buyer's offer (seller action)
 */
export function useAcceptBuyerOffer() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const acceptBuyerOffer = useCallback(async (escrowAddress: string) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.acceptBuyerOffer();
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { acceptBuyerOffer, ...state };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC ACTION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook for finalizing order (anyone can call after 7 days)
 */
export function useFinalizeOrder() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const finalizeOrder = useCallback(async (escrowAddress: string) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.finalizeOrder();
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { finalizeOrder, ...state };
}

/**
 * Hook for finalizing offer on timeout (anyone can call)
 */
export function useFinalizeOffer() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const finalizeOffer = useCallback(async (escrowAddress: string) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.finalizeOffer();
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { finalizeOffer, ...state };
}

/**
 * Hook for finalizing arbiter timeout (anyone can call after 30 days)
 */
export function useFinalizeArbiter() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const finalizeArbiter = useCallback(async (escrowAddress: string) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.finalizeArbiter();
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { finalizeArbiter, ...state };
}

// ═══════════════════════════════════════════════════════════════════════════
// ARBITER ACTION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook for arbiter decision
 */
export function useArbiterDecide() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null, error: null, isLoading: false,
  });

  const arbiterDecide = useCallback(async (escrowAddress: string, buyerPercent: number) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(escrowAddress, ESCROW_ABI);
      const tx = await contract.arbiterDecide(buyerPercent);
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { arbiterDecide, ...state };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook to lookup escrow address by order ID
 */
export function useLookupEscrow() {
  const { getReadOnlyContract } = useContractInstance();

  const lookupEscrow = useCallback(async (orderId: string) => {
    const contract = getReadOnlyContract(CONTRACT_ADDRESSES.factory, FACTORY_ABI);
    return await contract.getEscrow(orderId);
  }, [getReadOnlyContract]);

  return { lookupEscrow };
}

/**
 * Hook to fetch all escrow addresses from the factory
 */
export function useGetAllEscrows() {
  const { getReadOnlyContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<string[]>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const getAllEscrows = useCallback(async () => {
    setState({ data: null, error: null, isLoading: true });

    try {
      const contract = getReadOnlyContract(CONTRACT_ADDRESSES.factory, FACTORY_ABI);
      const totalOrders = await contract.totalOrders();
      const total = Number(totalOrders);
      
      if (total === 0) {
        setState({ data: [], error: null, isLoading: false });
        return [];
      }

      // Fetch all escrows in batches of 50
      const batchSize = 50;
      const allEscrows: string[] = [];
      
      for (let offset = 0; offset < total; offset += batchSize) {
        const limit = Math.min(batchSize, total - offset);
        const escrows = await contract.getEscrows(offset, limit);
        allEscrows.push(...escrows);
      }

      setState({ data: allEscrows, error: null, isLoading: false });
      return allEscrows;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch escrows';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getReadOnlyContract]);

  return { getAllEscrows, ...state };
}

/**
 * Format time remaining as human readable
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
