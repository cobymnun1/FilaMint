'use client';

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWalletContext } from '../context/WalletContext';

// Contract addresses - update these after deployment
export const CONTRACT_ADDRESSES = {
  printEscrow: process.env.NEXT_PUBLIC_PRINT_ESCROW_ADDRESS || '',
} as const;

// Placeholder ABI - replace with actual ABI after contract development
// This is a minimal example showing expected contract interface
export const PRINT_ESCROW_ABI = [
  // Create a new print order (buyer calls this)
  'function createOrder(string fileHash, string material, uint256 infill) payable returns (uint256 orderId)',
  // Claim an order (seller calls this)
  'function claimOrder(uint256 orderId) external',
  // Mark order as shipped (seller calls this)
  'function markShipped(uint256 orderId, string trackingInfo) external',
  // Confirm delivery and release escrow (buyer calls this)
  'function confirmDelivery(uint256 orderId) external',
  // Raise a dispute (buyer or seller can call)
  'function raiseDispute(uint256 orderId, string reason) external',
  // View functions
  'function getOrder(uint256 orderId) view returns (tuple(address buyer, address seller, uint256 escrowAmount, uint8 status, string fileHash))',
  'function getOrderCount() view returns (uint256)',
  // Events
  'event OrderCreated(uint256 indexed orderId, address indexed buyer, uint256 escrowAmount)',
  'event OrderClaimed(uint256 indexed orderId, address indexed seller)',
  'event OrderShipped(uint256 indexed orderId, string trackingInfo)',
  'event OrderDelivered(uint256 indexed orderId)',
  'event DisputeRaised(uint256 indexed orderId, address indexed raisedBy, string reason)',
] as const;

interface UseContractOptions {
  requiredRole?: 'buyer' | 'seller';
}

interface ContractCallResult<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

/**
 * Hook to get an ethers provider (read-only blockchain access)
 */
export function useProvider() {
  const getProvider = useCallback(() => {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask not installed');
    }
    return new ethers.BrowserProvider(window.ethereum);
  }, []);

  return { getProvider };
}

/**
 * Hook to get a signer with role verification
 * Ensures the active MetaMask account matches the expected role
 */
export function useSigner() {
  const { roleWallets, currentRole } = useWalletContext();
  const { getProvider } = useProvider();

  const getSigner = useCallback(async (requiredRole?: 'buyer' | 'seller') => {
    const provider = getProvider();
    const signer = await provider.getSigner();
    const signerAddress = (await signer.getAddress()).toLowerCase();

    // If a specific role is required, verify the wallet matches
    const roleToCheck = requiredRole || currentRole;
    const expectedAddress = roleWallets[roleToCheck];

    if (expectedAddress && signerAddress !== expectedAddress) {
      throw new Error(
        `Wrong wallet active. Please switch to your ${roleToCheck} wallet in MetaMask.\n` +
        `Expected: ${expectedAddress.slice(0, 6)}...${expectedAddress.slice(-4)}\n` +
        `Active: ${signerAddress.slice(0, 6)}...${signerAddress.slice(-4)}`
      );
    }

    return signer;
  }, [getProvider, roleWallets, currentRole]);

  return { getSigner };
}

/**
 * Hook to get a contract instance
 */
export function useContractInstance() {
  const { getSigner } = useSigner();
  const { getProvider } = useProvider();

  const getContract = useCallback(async (
    address: string,
    abi: readonly string[],
    options?: UseContractOptions
  ) => {
    // Get signer with role verification
    const signer = await getSigner(options?.requiredRole);
    return new ethers.Contract(address, abi, signer);
  }, [getSigner]);

  const getReadOnlyContract = useCallback((address: string, abi: readonly string[]) => {
    const provider = getProvider();
    return new ethers.Contract(address, abi, provider);
  }, [getProvider]);

  return { getContract, getReadOnlyContract };
}

/**
 * Hook for creating a print order (buyer action)
 */
export function useCreateOrder() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ orderId: string; txHash: string }>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const createOrder = useCallback(async (
    fileHash: string,
    material: string,
    infill: number,
    escrowAmountEth: string
  ) => {
    setState({ data: null, error: null, isLoading: true });

    try {
      const contract = await getContract(
        CONTRACT_ADDRESSES.printEscrow,
        PRINT_ESCROW_ABI,
        { requiredRole: 'buyer' }
      );

      const tx = await contract.createOrder(fileHash, material, infill, {
        value: ethers.parseEther(escrowAmountEth),
      });

      const receipt = await tx.wait();
      
      // Parse OrderCreated event to get orderId
      const event = receipt.logs.find(
        (log: { fragment?: { name: string } }) => log.fragment?.name === 'OrderCreated'
      );
      const orderId = event?.args?.[0]?.toString() || 'unknown';

      setState({
        data: { orderId, txHash: receipt.hash },
        error: null,
        isLoading: false,
      });

      return { orderId, txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { createOrder, ...state };
}

/**
 * Hook for claiming an order (seller action)
 */
export function useClaimOrder() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const claimOrder = useCallback(async (orderId: string) => {
    setState({ data: null, error: null, isLoading: true });

    try {
      const contract = await getContract(
        CONTRACT_ADDRESSES.printEscrow,
        PRINT_ESCROW_ABI,
        { requiredRole: 'seller' }
      );

      const tx = await contract.claimOrder(orderId);
      const receipt = await tx.wait();

      setState({
        data: { txHash: receipt.hash },
        error: null,
        isLoading: false,
      });

      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { claimOrder, ...state };
}

/**
 * Hook for marking order as shipped (seller action)
 */
export function useMarkShipped() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const markShipped = useCallback(async (orderId: string, trackingInfo: string) => {
    setState({ data: null, error: null, isLoading: true });

    try {
      const contract = await getContract(
        CONTRACT_ADDRESSES.printEscrow,
        PRINT_ESCROW_ABI,
        { requiredRole: 'seller' }
      );

      const tx = await contract.markShipped(orderId, trackingInfo);
      const receipt = await tx.wait();

      setState({
        data: { txHash: receipt.hash },
        error: null,
        isLoading: false,
      });

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
 * Hook for confirming delivery (buyer action)
 */
export function useConfirmDelivery() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{ txHash: string }>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const confirmDelivery = useCallback(async (orderId: string) => {
    setState({ data: null, error: null, isLoading: true });

    try {
      const contract = await getContract(
        CONTRACT_ADDRESSES.printEscrow,
        PRINT_ESCROW_ABI,
        { requiredRole: 'buyer' }
      );

      const tx = await contract.confirmDelivery(orderId);
      const receipt = await tx.wait();

      setState({
        data: { txHash: receipt.hash },
        error: null,
        isLoading: false,
      });

      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { confirmDelivery, ...state };
}

/**
 * Hook for reading order data (no wallet required)
 */
export function useReadOrder() {
  const { getReadOnlyContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<{
    buyer: string;
    seller: string;
    escrowAmount: string;
    status: number;
    fileHash: string;
  }>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const readOrder = useCallback(async (orderId: string) => {
    setState({ data: null, error: null, isLoading: true });

    try {
      const contract = getReadOnlyContract(
        CONTRACT_ADDRESSES.printEscrow,
        PRINT_ESCROW_ABI
      );

      const order = await contract.getOrder(orderId);

      const data = {
        buyer: order.buyer,
        seller: order.seller,
        escrowAmount: ethers.formatEther(order.escrowAmount),
        status: Number(order.status),
        fileHash: order.fileHash,
      };

      setState({ data, error: null, isLoading: false });
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to read order';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getReadOnlyContract]);

  return { readOrder, ...state };
}

