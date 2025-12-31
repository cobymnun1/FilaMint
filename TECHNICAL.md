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
├────────────────────────────────────────────────────────────────┤
│  /public/orders.json (mock data - replace with contract calls) │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    Smart Contracts (Planned)                    │
│  - PrintEscrow.sol: Escrow management                          │
│  - OrderRegistry.sol: Order state machine                      │
│  - DisputeResolution.sol: Conflict handling                    │
└────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
frontend/
├── app/
│   ├── page.tsx              # Main entry, view state management
│   ├── layout.tsx            # Root layout, fonts, metadata, providers
│   ├── globals.css           # Global styles, CSS variables
│   ├── providers.tsx         # Wagmi + React Query providers
│   ├── components/
│   │   ├── ViewToggle.tsx    # Buyer/Seller mode switch
│   │   ├── ConnectWallet.tsx # Per-role wallet connection UI
│   │   ├── BuyerView.tsx     # Buyer-side functionality
│   │   ├── SellerView.tsx    # Seller-side functionality
│   │   ├── OrderCard.tsx     # Order display component
│   │   └── FileUpload.tsx    # Drag-drop file upload
│   ├── context/
│   │   └── WalletContext.tsx # Role-based wallet state management
│   ├── hooks/
│   │   └── useContract.ts    # Smart contract interaction hooks
│   ├── config/
│   │   └── wagmi.ts          # Wagmi chain configuration
│   ├── types/
│   │   ├── order.ts          # Order interface & types
│   │   └── ethereum.d.ts     # Window.ethereum type definitions
│   └── api/
│       └── upload/
│           └── route.ts      # File upload API endpoint
└── public/
    ├── orders.json           # Mock order data
    └── stl-temp/             # Uploaded file storage
```

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

### Available Hooks (`frontend/app/hooks/useContract.ts`)

```typescript
// Low-level hooks
useProvider()           // Get ethers provider (read-only)
useSigner()             // Get signer with role verification
useContractInstance()   // Get contract instance

// Action hooks (write operations)
useCreateOrder()        // Buyer: Create order with escrow
useClaimOrder()         // Seller: Claim a pending order
useMarkShipped()        // Seller: Mark order as shipped
useConfirmDelivery()    // Buyer: Confirm receipt, release escrow

// Read hooks
useReadOrder()          // Read order data (no wallet needed)
```

### Hook Usage Example

```typescript
import { useCreateOrder } from '../hooks/useContract';

function BuyerView() {
  const { createOrder, isLoading, error, data } = useCreateOrder();

  const handleSubmit = async () => {
    try {
      const result = await createOrder(
        fileHash,           // IPFS hash of STL file
        'PLA',              // material
        20,                 // infill percentage
        '0.025'             // escrow amount in ETH
      );
      console.log('Order created:', result.orderId);
    } catch (err) {
      // Error already captured in hook's error state
    }
  };

  return (
    <button onClick={handleSubmit} disabled={isLoading}>
      {isLoading ? 'Creating...' : 'Submit Order'}
    </button>
  );
}
```

### Role Verification

Hooks automatically verify the active MetaMask account matches the expected role:

```typescript
// In useCreateOrder hook:
const contract = await getContract(
  CONTRACT_ADDRESS,
  ABI,
  { requiredRole: 'buyer' }  // Will throw if wrong wallet active
);
```

If the user's active MetaMask account doesn't match their saved buyer wallet, the hook throws:
```
Wrong wallet active. Please switch to your buyer wallet in MetaMask.
Expected: 0x742d...2bD61
Active: 0x8ba1...BA72
```

### Contract Configuration

Update contract addresses in `frontend/app/hooks/useContract.ts`:

```typescript
export const CONTRACT_ADDRESSES = {
  printEscrow: process.env.NEXT_PUBLIC_PRINT_ESCROW_ADDRESS || '',
} as const;
```

Or set in `.env.local`:
```
NEXT_PUBLIC_PRINT_ESCROW_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
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

### Component Props Pattern

Components receive typed props with clear interfaces:

```typescript
interface OrderCardProps {
  order: Order;
  viewMode: 'buyer' | 'seller';
  onClaim?: (orderId: string) => void;  // Only for seller view
}
```

## Data Flow

### Current (Mock Data)

```
orders.json ──▶ page.tsx ──▶ BuyerView/SellerView ──▶ OrderCard
```

### Future (Smart Contract Integration)

```
Smart Contract ──▶ Contract Hooks ──▶ Components
     │
     └──▶ Events ──▶ Real-time Updates
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

## Error Handling

Current approach:
- Try/catch in async functions
- Local error state displayed in UI
- Console logging for debugging
- Contract hooks expose `error` state

Future improvements:
- Toast notifications for user feedback
- Error boundaries for component failures
- Sentry/similar for production monitoring

## Testing Considerations

Not yet implemented. Recommended approach:
- Jest + React Testing Library for components
- Hardhat for contract testing
- Cypress/Playwright for E2E

## Performance Notes

- Images: Use Next.js `<Image>` component
- Data: Implement pagination for order lists
- Caching: Use SWR/React Query for contract data
- Bundle: Monitor with `next build --analyze`

## Security Considerations

### Frontend
- Sanitize file names on upload
- Validate file types server-side
- Never trust client-side validation alone
- Verify wallet address matches expected role before transactions

### Smart Contracts (Future)
- Reentrancy guards on escrow functions
- Access control for admin functions
- Timelock for dispute resolution
- Audit before mainnet deployment

## Common Tasks for AI Agents

### Adding a New Order Status

1. Update `OrderStatus` type in `frontend/app/types/order.ts`
2. Add status config in `OrderCard.tsx` (`statusConfig` object)
3. Update filtering logic in `SellerView.tsx` if needed
4. Add mock orders with new status in `orders.json`

### Adding a New Material Type

1. Update `PrintMaterial` type in `frontend/app/types/order.ts`
2. Add color config in `OrderCard.tsx` (`materialColors` object)
3. Add to select options in `BuyerView.tsx` and `SellerView.tsx`
4. Add mock orders with new material in `orders.json`

### Adding a New Contract Hook

1. Define the hook in `frontend/app/hooks/useContract.ts`
2. Specify `requiredRole` if it's a role-specific action
3. Handle loading/error/success states
4. Export from the hooks file
5. Use in components

Example:
```typescript
export function useNewAction() {
  const { getContract } = useContractInstance();
  const [state, setState] = useState<ContractCallResult<ResultType>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const performAction = useCallback(async (params) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const contract = await getContract(ADDRESS, ABI, { requiredRole: 'buyer' });
      const tx = await contract.someMethod(params);
      const receipt = await tx.wait();
      setState({ data: { txHash: receipt.hash }, error: null, isLoading: false });
      return { txHash: receipt.hash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed';
      setState({ data: null, error: errorMessage, isLoading: false });
      throw err;
    }
  }, [getContract]);

  return { performAction, ...state };
}
```

### Integrating Contract with Component

1. Import the hook
2. Destructure the action function and state
3. Call action on user interaction
4. Display loading/error states in UI

```typescript
function MyComponent() {
  const { performAction, isLoading, error } = useNewAction();

  return (
    <>
      <button onClick={() => performAction(data)} disabled={isLoading}>
        {isLoading ? 'Processing...' : 'Do Action'}
      </button>
      {error && <p className="text-red-500">{error}</p>}
    </>
  );
}
```

## Environment Setup

```bash
# Development
npm run dev          # Start dev server on :3000

# Production
npm run build        # Build for production
npm start            # Run production build

# Linting
npm run lint         # Run ESLint

# Hardhat (for local blockchain)
npx hardhat node     # Start local node on :8545
```

## Environment Variables

Create `frontend/.env.local`:

```env
# Contract addresses (update after deployment)
NEXT_PUBLIC_PRINT_ESCROW_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

# Chain configuration
NEXT_PUBLIC_CHAIN_ID=31337
```

## Troubleshooting

### "Module not found" errors
- Check import paths (use `@/` alias or relative)
- Ensure file exists and is properly exported

### Styling not applying
- Check Tailwind class names for typos
- Ensure `globals.css` is imported in layout
- Clear `.next` cache: `rm -rf .next && npm run dev`

### Type errors
- Run `npm run build` to see all TypeScript errors
- Check that JSON imports match interface definitions

### Wallet connection issues
- Ensure MetaMask is installed
- Check that Hardhat network is added to MetaMask (Chain ID: 31337)
- Verify Hardhat node is running if testing locally

### "Wrong wallet active" error
- The active MetaMask account doesn't match the saved address for the current role
- Switch accounts in MetaMask to the expected address
- Or disconnect and reconnect with the correct account
