# Technical Documentation for AI Agents

This document provides technical context for AI agents working on the PrintMod codebase. It covers architecture decisions, data flows, component patterns, and integration points.

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                      │
├────────────────────────────────────────────────────────────────┤
│  page.tsx                                                       │
│    ├── WalletProvider (context for role-based wallets)         │
│    ├── ViewToggle (buyer/seller switch)                        │
│    ├── ConnectWallet (per-role wallet connection)              │
│    └── BuyerView | SellerView (conditional render)             │
│          └── OrderCard (shared component)                      │
├────────────────────────────────────────────────────────────────┤
│  /hooks/useContract.ts (contract interaction hooks)            │
├────────────────────────────────────────────────────────────────┤
│  /api/upload (file upload endpoint)                            │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    Smart Contracts (Solidity)                   │
│  contracts/src/                                                 │
│    ├── PrintEscrowFactory.sol  - Deploys EIP-1167 clones       │
│    ├── EscrowInstance.sol      - Per-order escrow logic        │
│    └── interfaces/                                              │
│        ├── IEscrowInstance.sol - Escrow interface              │
│        └── IShippingOracle.sol - Oracle hook for delivery      │
└────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
mod/
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Main entry, view state management
│   │   ├── layout.tsx            # Root layout, fonts, metadata, providers
│   │   ├── globals.css           # Global styles, CSS variables
│   │   ├── providers.tsx         # Wagmi + React Query providers
│   │   ├── components/
│   │   │   ├── ViewToggle.tsx    # Buyer/Seller mode switch
│   │   │   ├── ConnectWallet.tsx # Per-role wallet connection UI
│   │   │   ├── BuyerView.tsx     # Buyer-side functionality
│   │   │   ├── SellerView.tsx    # Seller-side functionality
│   │   │   ├── OrderCard.tsx     # Order display component
│   │   │   └── FileUpload.tsx    # Drag-drop file upload
│   │   ├── context/
│   │   │   └── WalletContext.tsx # Role-based wallet state management
│   │   ├── hooks/
│   │   │   └── useContract.ts    # Smart contract interaction hooks
│   │   ├── config/
│   │   │   └── wagmi.ts          # Wagmi chain configuration
│   │   ├── types/
│   │   │   ├── order.ts          # Order interface & types
│   │   │   └── ethereum.d.ts     # Window.ethereum type definitions
│   │   └── api/
│   │       └── upload/
│   │           └── route.ts      # File upload API endpoint
│   └── public/
│       ├── orders.json           # Mock order data
│       └── stl-temp/             # Uploaded file storage
│
├── contracts/                    # Hardhat project
│   ├── src/
│   │   ├── PrintEscrowFactory.sol
│   │   ├── EscrowInstance.sol
│   │   └── interfaces/
│   │       ├── IEscrowInstance.sol
│   │       └── IShippingOracle.sol
│   ├── scripts/
│   │   └── deploy.js
│   ├── hardhat.config.js
│   └── package.json
```

## Smart Contracts

### Contract Architecture

```
PrintEscrowFactory (singleton)
    │
    ├── implementation: EscrowInstance (shared logic)
    │
    └── clones (EIP-1167 minimal proxies, ~45 bytes each)
         ├── Order 0x1a2b... → delegatecall → implementation
         ├── Order 0x3c4d... → delegatecall → implementation
         └── Order 0x5e6f... → delegatecall → implementation
```

### Order Lifecycle

```
Pending → Claimed → Shipped → Arrived → Completed (happy path)
    ↓                           ↓
Cancelled                   InDispute → Settled (negotiation)
                                 ↓
                           ArbiterReview → Settled (arbiter decides)
```

| Status | Description |
|--------|-------------|
| Pending | Created, awaiting seller claim |
| Claimed | Seller accepted, preparing to print |
| Shipped | Item shipped, awaiting delivery |
| Arrived | Delivered, 7-day dispute window active |
| Completed | Window passed, funds released to seller |
| Cancelled | Buyer cancelled before claim |
| InDispute | Buyer opened dispute, negotiation active |
| ArbiterReview | Negotiation failed, awaiting arbiter |
| Settled | Dispute resolved, funds distributed |

### Fee Structure

All fees go to the **arbiter address** (your cold wallet), which also resolves disputes.

| Fee | Amount | When Applied | Recipient |
|-----|--------|--------------|-----------|
| Platform fee | 0.5% | All transactions | Arbiter |
| Cancellation fee | 5% | Buyer cancels (before claim) | Arbiter |
| Arbitration tax | 10% (5% each) | Only if arbiter decides | Arbiter |
| Gas cushion | 2% | Refundable remainder to buyer | Buyer |

**Deposit Calculation:**
```
Total Deposit = orderAmount × 1.025
              = orderAmount + (2% gas cushion) + (0.5% platform fee)
```

**Changing the fee recipient:** Call `factory.setArbiter(newAddress)` (only factory owner can call). This updates the arbiter for all **new** escrows; existing escrows keep their original arbiter.

### Dispute Negotiation Flow

6 rounds max (3 offers each party), alternating buyer/seller:

| Round | Who Offers | Timeout | On Timeout |
|-------|------------|---------|------------|
| 1 | Buyer | 4 days | Auto-accept buyer's offer |
| 2 | Seller | 2 days | Auto-accept seller's counter |
| 3 | Buyer | 2 days | Auto-accept |
| 4 | Seller | 2 days | Auto-accept |
| 5 | Buyer | 2 days | Auto-accept |
| 6 | Seller | 2 days | Auto-accept |
| Final | Buyer rejects | - | Goes to arbiter (30 day timeout) |

### Contract Functions

**Factory (PrintEscrowFactory.sol):**
```solidity
createOrder(bytes32 fileHash) → (bytes32 orderId, address escrow)
getEscrow(bytes32 orderId) → address
totalOrders() → uint256
setArbiter(address) / setShippingOracle(address)  // arbiter receives all fees + resolves disputes
```

**Escrow (EscrowInstance.sol):**

| Function | Who | Description |
|----------|-----|-------------|
| `cancel()` | Buyer | Cancel before claim (5.5% fee) |
| `claim()` | Seller | Claim order to start fulfillment |
| `markShipped()` | Seller | Mark as shipped |
| `claimDelivery()` | Seller | Claim delivery after 14 days if no oracle |
| `openDispute()` | Buyer | Open dispute within 7 days of arrival |
| `submitOffer(pct)` | Buyer | Submit settlement offer (rounds 1,3,5) |
| `submitCounterOffer(pct)` | Seller | Counter-offer (rounds 2,4,6) |
| `acceptOffer()` | Buyer | Accept seller's counter |
| `acceptBuyerOffer()` | Seller | Accept buyer's offer |
| `rejectFinalOffer()` | Buyer | Escalate to arbiter |
| `finalizeOrder()` | Anyone | Release funds after 7-day window |
| `finalizeOffer()` | Anyone | Auto-accept on timeout |
| `arbiterDecide(pct)` | Arbiter | Final decision (10% tax) |

### Shipping Oracle Hook

Interface for future shipping label integration:

```solidity
interface IShippingOracle {
    function isDelivered(bytes32 orderId) external view returns (bool delivered, uint256 timestamp);
}
```

**Fallback behavior (no oracle):** Seller can claim delivery after 14 days, buyer can dispute.

**To connect oracle:** `factory.setShippingOracle(oracleAddress)`

### Gas Reimbursement

Seller actions are reimbursed from buyer's 2% gas cushion:

| Action | Who Pays Gas | Reimbursed? |
|--------|--------------|-------------|
| createOrder() | Buyer | No |
| claim() | Seller | Yes |
| markShipped() | Seller | Yes |
| openDispute() | Buyer | Yes |
| submitOffer() | Either | Yes |
| finalizeOrder() | Anyone | Yes |

## Core Data Types

### Order Interface (`frontend/app/types/order.ts`)

```typescript
interface Order {
  id: string;
  status: 'pending' | 'claimed' | 'printing' | 'shipped' | 'delivered' | 'disputed';
  
  // Buyer info
  buyerAddress: string;         // Ethereum address
  
  // File info
  fileName: string;             // Display name
  fileUrl: string;              // Path to uploaded file
  fileSizeMB: number;           // File size in megabytes
  dimensions: string;           // e.g., "80x60x20mm"
  
  // Print specifications
  material: 'PLA' | 'ABS' | 'PETG' | 'TPU' | 'Resin';
  color: string;                // Color name
  infill: number;               // 0-100 percentage
  printTimeHours: number;       // Estimated print duration
  
  // Financial
  escrowAmountEth: number;      // ETH locked in escrow
  
  // Seller info (populated when claimed)
  sellerAddress?: string;       // Printer's Ethereum address
  claimedAt?: string;           // ISO timestamp
  
  // Timestamps
  createdAt: string;            // ISO timestamp
  updatedAt: string;            // ISO timestamp
}
```

## Wallet System

### Role-Based Wallet Architecture

The app supports **separate wallets for buyer and seller roles**. This allows users to use different accounts for buying vs selling.

```
┌─────────────────────────────────────────────────────────────────┐
│                      WalletContext                               │
├─────────────────────────────────────────────────────────────────┤
│  roleWallets: {                                                  │
│    buyer: "0x742d..." | null,                                   │
│    seller: "0x8ba1..." | null                                   │
│  }                                                               │
│                                                                  │
│  currentRole: 'buyer' | 'seller'                                │
│  currentRoleAddress: string | null  (address for active role)   │
├─────────────────────────────────────────────────────────────────┤
│  Methods:                                                        │
│  - connectWalletForRole(role) → prompts MetaMask                │
│  - disconnectWalletForRole(role) → clears only that role        │
└─────────────────────────────────────────────────────────────────┘
```

### Wallet Storage

Wallet addresses are stored in **localStorage** under key `printmod_role_wallets`:

```json
{
  "buyer": "0x742d35cc6634c0532925a3b844bc9e7595f2bd61",
  "seller": "0x8ba1f109551bd432803012645ac136ddd64dba72"
}
```

### Accessing Wallet Addresses

```typescript
import { useWalletContext } from '../context/WalletContext';

function MyComponent() {
  const { 
    roleWallets,           // { buyer: string|null, seller: string|null }
    currentRole,           // 'buyer' | 'seller'
    currentRoleAddress,    // address for active role
    isConnectedForCurrentRole,
    connectWalletForRole,
    disconnectWalletForRole,
  } = useWalletContext();
  
  // Get specific role's address
  const buyerAddress = roleWallets.buyer;
  const sellerAddress = roleWallets.seller;
}
```

## Contract Hooks System

### How Contract Hooks Work

Contract hooks wrap blockchain interactions, providing a clean API for components:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Component                                 │
│   const { createOrder, isLoading, error } = useCreateOrder();   │
│   onClick={() => createOrder(fileHash, material, infill, eth)}  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Contract Hook                                │
│  1. Validates active MetaMask account matches expected role     │
│  2. Gets signer from MetaMask                                   │
│  3. Creates contract instance with signer                       │
│  4. Calls contract method                                       │
│  5. Waits for transaction confirmation                          │
│  6. Returns result + manages loading/error states               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         MetaMask                                │
│  - Prompts user to sign transaction                            │
│  - Broadcasts to blockchain network                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Smart Contract                             │
│  - msg.sender = signer's address                               │
│  - Executes function, updates blockchain state                 │
│  - Emits events                                                │
└─────────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Term | Description |
|------|-------------|
| **Provider** | Read-only connection to blockchain. Can call view functions. |
| **Signer** | Has private key, can sign transactions. Comes from MetaMask. |
| **Contract Instance** | JavaScript object representing deployed contract. |
| **ABI** | Contract interface definition (functions, events, types). |
| **msg.sender** | The address that signed the transaction (signer's address). |

### Contract Configuration

Update contract addresses in `frontend/.env.local`:

```env
NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_CHAIN_ID=31337
```

## Component Patterns

### State Management

- **Local state**: React `useState` for component-specific state
- **Wallet state**: `WalletContext` for role-based wallet management
- **Contract state**: Custom hooks manage loading/error/data per operation

### View Toggle Pattern

The app uses a single-page architecture with view switching:

```typescript
// page.tsx
function HomeContent() {
  const { currentRole, setCurrentRole } = useWalletContext();

  return (
    <>
      <ViewToggle currentView={currentRole} onViewChange={setCurrentRole} />
      {currentRole === 'buyer' ? <BuyerView /> : <SellerView />}
    </>
  );
}
```

## File Upload Flow

```
User drops file
      │
      ▼
FileUpload.tsx validates extension (.stl, .obj, .3mf)
      │
      ▼
POST /api/upload with FormData
      │
      ▼
route.ts saves to /public/stl-temp/
      │
      ▼
Returns { fileName, originalName, size }
      │
      ▼
Future: Upload to IPFS, store hash on-chain
```

## Styling Conventions

- **Tailwind CSS 4**: Utility-first styling
- **Dark Mode**: Uses `dark:` variants, respects system preference
- **Color Palette**: 
  - Primary: Violet/Indigo gradients
  - Success: Emerald/Teal
  - Warning: Amber/Orange
  - Error: Red/Rose
  - Buyer role: Blue
  - Seller role: Emerald
- **Spacing**: 4px base unit (Tailwind default)
- **Border Radius**: `rounded-lg` (8px) for cards, `rounded-xl` (12px) for buttons

## Environment Setup

```bash
# Frontend
cd frontend
npm install
npm run dev          # Start dev server on :3000

# Contracts
cd contracts
npm install
npx hardhat compile  # Compile contracts
npx hardhat node     # Start local node on :8545 (Terminal 1)
npx hardhat run scripts/deploy.js --network localhost  # Deploy (Terminal 2)
```

## Environment Variables

Create `frontend/.env.local`:

```env
# Contract addresses (update after deployment)
NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

# Chain configuration
NEXT_PUBLIC_CHAIN_ID=31337
```

## Common Tasks for AI Agents

### Deploying Contracts

```bash
cd contracts
npx hardhat node                                    # Terminal 1
npx hardhat run scripts/deploy.js --network localhost  # Terminal 2
```

Copy the factory address to `frontend/.env.local`.

### Adding a New Order Status

1. Update `OrderStatus` type in `frontend/app/types/order.ts`
2. Add status config in `OrderCard.tsx` (`statusConfig` object)
3. Update filtering logic in `SellerView.tsx` if needed

### Adding a New Contract Hook

1. Define the hook in `frontend/app/hooks/useContract.ts`
2. Specify `requiredRole` if it's a role-specific action
3. Handle loading/error/success states
4. Export from the hooks file

Example:
```typescript
export function useClaimOrder() {
  const [state, setState] = useState({ data: null, error: null, isLoading: false });

  const claimOrder = useCallback(async (escrowAddress: string) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const signer = await getSigner();
      const escrow = new Contract(escrowAddress, EscrowInstanceABI, signer);
      const tx = await escrow.claim();
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return receipt;
    } catch (err) {
      setState({ data: null, error: err.message, isLoading: false });
      throw err;
    }
  }, []);

  return { claimOrder, ...state };
}
```

## Troubleshooting

### Contract compilation errors
- Run `npx hardhat clean` then `npx hardhat compile`
- Check Solidity version matches in `hardhat.config.js`

### "Nothing to compile"
- Contracts are in `contracts/src/`, config uses `sources: "./src"`

### Wallet connection issues
- Ensure MetaMask is installed
- Check that Hardhat network is added to MetaMask (Chain ID: 31337)
- Verify Hardhat node is running if testing locally

### "Wrong wallet active" error
- The active MetaMask account doesn't match the saved address for the current role
- Switch accounts in MetaMask to the expected address
- Or disconnect and reconnect with the correct account
