import { ethers } from 'ethers';

// ShippingOracle ABI - only the functions we need
const ORACLE_ABI = [
  'function registerEscrow(bytes32 orderId, address escrow) external',
  'function setShipped(bytes32 orderId) external',
  'function setDelivered(bytes32 orderId, uint256 timestamp) external',
  'function isDelivered(bytes32 orderId) external view returns (bool delivered, uint256 timestamp)',
  'function isShipped(bytes32 orderId) external view returns (bool shipped, uint256 timestamp)',
  'function getShipment(bytes32 orderId) external view returns (bool shipped, bool delivered, uint256 shippedAt, uint256 deliveredAt)',
  'function shipments(bytes32 orderId) external view returns (bool shipped, bool delivered, uint64 shippedAt, uint64 deliveredAt, address escrow)',
  'event Shipped(bytes32 indexed orderId, address indexed escrow, uint256 timestamp)',
  'event Delivered(bytes32 indexed orderId, address indexed escrow, uint256 timestamp)',
  'event EscrowRegistered(bytes32 indexed orderId, address indexed escrow)',
];

// Singleton instances
let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;
let oracleContract: ethers.Contract | null = null;

// Nonce management - always fetch latest to avoid sync issues
async function getNextNonce(): Promise<number> {
  const w = getWallet();
  // Always get the latest pending nonce to handle restarts and failed txs
  const nonce = await w.getNonce('pending');
  return nonce;
}

/**
 * Initialize the oracle client
 * Call this once at server startup (after dotenv.config())
 */
export function initOracle(): { provider: ethers.JsonRpcProvider; wallet: ethers.Wallet; contract: ethers.Contract } {
  // Read env vars at runtime (after dotenv has loaded them)
  const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
  const BACKEND_PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY || '';
  const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS || '';

  if (!BACKEND_PRIVATE_KEY) {
    throw new Error('BACKEND_PRIVATE_KEY not set in environment');
  }
  if (!ORACLE_ADDRESS) {
    throw new Error('ORACLE_ADDRESS not set in environment');
  }

  provider = new ethers.JsonRpcProvider(RPC_URL);
  wallet = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);
  oracleContract = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, wallet);

  console.log(`Oracle client initialized:`);
  console.log(`  RPC: ${RPC_URL}`);
  console.log(`  Oracle: ${ORACLE_ADDRESS}`);
  console.log(`  Backend wallet: ${wallet.address}`);

  return { provider, wallet, contract: oracleContract };
}

/**
 * Get the oracle contract instance
 */
export function getOracleContract(): ethers.Contract {
  if (!oracleContract) {
    throw new Error('Oracle not initialized. Call initOracle() first.');
  }
  return oracleContract;
}

/**
 * Get the backend wallet
 */
export function getWallet(): ethers.Wallet {
  if (!wallet) {
    throw new Error('Oracle not initialized. Call initOracle() first.');
  }
  return wallet;
}

/**
 * Register an escrow contract with the oracle
 * This links the orderId to the escrow so shipping updates propagate automatically
 * @param orderId - The escrow order ID (bytes32 hex string)
 * @param escrowAddress - The escrow contract address
 * @returns Transaction receipt
 */
export async function registerEscrowWithOracle(
  orderId: string,
  escrowAddress: string
): Promise<ethers.TransactionReceipt> {
  const contract = getOracleContract();
  
  // Validate orderId format
  if (!orderId.startsWith('0x') || orderId.length !== 66) {
    throw new Error(`Invalid orderId format: ${orderId}. Expected 32-byte hex string.`);
  }
  
  // Validate escrow address
  if (!ethers.isAddress(escrowAddress)) {
    throw new Error(`Invalid escrow address: ${escrowAddress}`);
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/628700ef-ed5a-468b-810b-6b52ce2010d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oracle.ts:registerEscrowWithOracle',message:'Registering escrow',data:{orderId,escrowAddress},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2-escrow-not-registered'})}).catch(()=>{});
  // #endregion

  console.log(`Registering escrow ${escrowAddress} for order ${orderId}...`);
  
  const nonce = await getNextNonce();
  const tx = await contract.registerEscrow(orderId, escrowAddress, { nonce });
  const receipt = await tx.wait();
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/628700ef-ed5a-468b-810b-6b52ce2010d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oracle.ts:registerEscrowWithOracle:post',message:'Registration complete',data:{orderId,escrowAddress,txHash:receipt.hash},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2-escrow-not-registered'})}).catch(()=>{});
  // #endregion

  console.log(`Escrow registered. Tx: ${receipt.hash}`);
  
  return receipt;
}

/**
 * Mark an order as shipped on-chain
 * @param orderId - The escrow order ID (bytes32 hex string)
 * @returns Transaction receipt
 */
export async function markShippedOnChain(orderId: string): Promise<ethers.TransactionReceipt> {
  const contract = getOracleContract();
  
  // Validate orderId format
  if (!orderId.startsWith('0x') || orderId.length !== 66) {
    throw new Error(`Invalid orderId format: ${orderId}. Expected 32-byte hex string.`);
  }

  // Check if already shipped
  const [isShipped] = await contract.isShipped(orderId);
  if (isShipped) {
    throw new Error(`Order ${orderId} is already marked as shipped`);
  }

  // #region agent log
  // Debug: Check shipment state before marking shipped
  const shipment = await contract.getShipment(orderId);
  fetch('http://127.0.0.1:7242/ingest/628700ef-ed5a-468b-810b-6b52ce2010d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oracle.ts:markShippedOnChain',message:'Pre-ship check',data:{orderId,shipped:shipment[0],delivered:shipment[1],shippedAt:shipment[2]?.toString(),deliveredAt:shipment[3]?.toString()},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2-escrow-not-registered'})}).catch(()=>{});
  // #endregion

  console.log(`Marking order ${orderId} as shipped...`);
  
  // Get next nonce from our manual counter
  const nonce = await getNextNonce();
  const tx = await contract.setShipped(orderId, { nonce });
  const receipt = await tx.wait();
  
  // #region agent log
  // Debug: Log transaction result
  fetch('http://127.0.0.1:7242/ingest/628700ef-ed5a-468b-810b-6b52ce2010d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oracle.ts:markShippedOnChain:post',message:'Ship tx complete',data:{orderId,txHash:receipt.hash,gasUsed:receipt.gasUsed?.toString()},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5-silent-fail'})}).catch(()=>{});
  // #endregion

  console.log(`Order ${orderId} marked as shipped. Tx: ${receipt.hash}`);
  
  return receipt;
}

/**
 * Mark an order as delivered on-chain
 * @param orderId - The escrow order ID (bytes32 hex string)
 * @param timestamp - Unix timestamp of delivery (0 to use current block time)
 * @returns Transaction receipt
 */
export async function markDeliveredOnChain(
  orderId: string,
  timestamp: number = 0
): Promise<ethers.TransactionReceipt> {
  const contract = getOracleContract();
  
  // Validate orderId format
  if (!orderId.startsWith('0x') || orderId.length !== 66) {
    throw new Error(`Invalid orderId format: ${orderId}. Expected 32-byte hex string.`);
  }

  // Check if already delivered
  const [isDelivered] = await contract.isDelivered(orderId);
  if (isDelivered) {
    throw new Error(`Order ${orderId} is already marked as delivered`);
  }

  console.log(`Marking order ${orderId} as delivered (timestamp: ${timestamp || 'now'})...`);
  
  // Get next nonce from our manual counter
  const nonce = await getNextNonce();
  const tx = await contract.setDelivered(orderId, timestamp, { nonce });
  const receipt = await tx.wait();
  
  console.log(`Order ${orderId} marked as delivered. Tx: ${receipt.hash}`);
  
  return receipt;
}

/**
 * Check if an order is shipped
 * @param orderId - The escrow order ID
 * @returns { shipped: boolean, timestamp: number }
 */
export async function checkShipped(orderId: string): Promise<{ shipped: boolean; timestamp: number }> {
  const contract = getOracleContract();
  const [shipped, timestamp] = await contract.isShipped(orderId);
  return { shipped, timestamp: Number(timestamp) };
}

/**
 * Check if an order is delivered
 * @param orderId - The escrow order ID
 * @returns { delivered: boolean, timestamp: number }
 */
export async function checkDelivered(orderId: string): Promise<{ delivered: boolean; timestamp: number }> {
  const contract = getOracleContract();
  const [delivered, timestamp] = await contract.isDelivered(orderId);
  return { delivered, timestamp: Number(timestamp) };
}

/**
 * Get full shipment record from oracle (including registered escrow)
 * @param orderId - The escrow order ID
 */
export async function getShipmentRecord(orderId: string): Promise<{
  shipped: boolean;
  delivered: boolean;
  shippedAt: number;
  deliveredAt: number;
  escrow: string;
}> {
  const contract = getOracleContract();
  // Use the public mapping directly to get all fields including escrow
  const [shipped, delivered, shippedAt, deliveredAt, escrow] = await contract.shipments(orderId);
  return {
    shipped,
    delivered,
    shippedAt: Number(shippedAt),
    deliveredAt: Number(deliveredAt),
    escrow,
  };
}

/**
 * Estimate gas cost for shipping oracle operations
 * @returns Gas estimates in wei and ETH
 */
export async function estimateGasCosts(): Promise<{
  setShipped: { gas: bigint; costWei: bigint; costEth: string };
  setDelivered: { gas: bigint; costWei: bigint; costEth: string };
  total: { costWei: bigint; costEth: string };
}> {
  const contract = getOracleContract();
  const prov = provider!;
  
  // Use a dummy orderId for estimation
  const dummyOrderId = '0x' + '1'.repeat(64);
  
  const feeData = await prov.getFeeData();
  const gasPrice = feeData.gasPrice || BigInt(30e9); // fallback 30 gwei
  
  // Estimate gas for setShipped (cold storage write ~45k gas)
  const shippedGas = BigInt(50000);
  const shippedCost = shippedGas * gasPrice;
  
  // Estimate gas for setDelivered (~45k gas)
  const deliveredGas = BigInt(50000);
  const deliveredCost = deliveredGas * gasPrice;
  
  const totalCost = shippedCost + deliveredCost;
  
  return {
    setShipped: {
      gas: shippedGas,
      costWei: shippedCost,
      costEth: ethers.formatEther(shippedCost),
    },
    setDelivered: {
      gas: deliveredGas,
      costWei: deliveredCost,
      costEth: ethers.formatEther(deliveredCost),
    },
    total: {
      costWei: totalCost,
      costEth: ethers.formatEther(totalCost),
    },
  };
}

/**
 * Get backend wallet balance
 */
export async function getWalletBalance(): Promise<{ wei: bigint; eth: string }> {
  const w = getWallet();
  const balance = await provider!.getBalance(w.address);
  return {
    wei: balance,
    eth: ethers.formatEther(balance),
  };
}

