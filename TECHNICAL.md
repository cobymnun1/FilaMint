# Technical Documentation for AI Agents

This document provides technical context for AI agents working on the FilaMint codebase. It covers architecture decisions, data flows, component patterns, and integration points.

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                      │
├────────────────────────────────────────────────────────────────┤
│  page.tsx                                                       │
│    ├── WalletProvider (single wallet per session)              │
│    ├── ViewToggle (buyer/seller switch)                        │
│    ├── ConnectWallet (MetaMask connection)                     │
│    └── BuyerView | SellerView (conditional render)             │
├────────────────────────────────────────────────────────────────┤
│  /api/upload (file upload + STL analysis)                      │
│    └── node-stl → PrintEstimate                                │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    Backend (Node.js/TypeScript)                 │
│  backend/pricing/                                               │
│    ├── index.ts        - STL analysis & cost calculation       │
│    └── materials.json  - Material pricing database             │
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
│   │   │   ├── ConnectWallet.tsx # MetaMask wallet connection UI
│   │   │   ├── BuyerView.tsx     # Buyer-side: upload, configure, pricing
│   │   │   ├── SellerView.tsx    # Seller-side: browse & claim jobs
│   │   │   ├── OrderCard.tsx     # Order display component
│   │   │   └── FileUpload.tsx    # Drag-drop file upload
│   │   ├── context/
│   │   │   └── WalletContext.tsx # Single wallet state management
│   │   ├── hooks/
│   │   │   └── useContract.ts    # Smart contract interaction hooks
│   │   ├── config/
│   │   │   └── wagmi.ts          # Wagmi chain configuration
│   │   ├── types/
│   │   │   ├── order.ts          # Order interface & types
│   │   │   └── ethereum.d.ts     # Window.ethereum type definitions
│   │   └── api/
│   │       └── upload/
│   │           └── route.ts      # File upload + STL analysis endpoint
│   └── public/
│       ├── orders.json           # Order data (empty by default)
│       └── stl-temp/             # Uploaded file storage
│
├── backend/
│   ├── pricing/
│   │   ├── index.ts              # Main pricing API (getEstimate)
│   │   ├── materials.json        # Material database (12 materials, 35+ colors)
│   │   └── test.ts               # CLI test script
│   ├── shipping/
│   │   ├── types.ts              # Shipping data types
│   │   ├── mockOrder.json        # Sample order data
│   │   └── mockShippingData.json # Sample shipping data
│   ├── package.json
│   └── tsconfig.json
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
│
└── tests/                        # Test files (gitignored)
    ├── pricing/
    │   ├── runBenchmark.ts       # Batch pricing test
    │   └── results.html          # Generated benchmark report
    └── files/                    # Test STL files
```

## Pricing System

### Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│  STL File   │────▶│   node-stl   │────▶│  PrintEstimate │
└─────────────┘     └──────────────┘     └────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ materials.json│
                    │  - densities  │
                    │  - prices     │
                    │  - colors     │
                    └──────────────┘
```

### PrintEstimate Interface

```typescript
interface PrintEstimate {
  // Model info
  dimensions: { x: number; y: number; z: number };  // mm
  volumeCm3: number;
  weightGrams: number;
  isWatertight: boolean;
  
  // Print settings
  material: string;
  color: string;
  infillPercent: number;
  
  // Cost
  materialCost: number;  // USD, minimum $0.50
  
  // Available options (for dropdowns)
  availableMaterials: string[];
  availableColors: string[];
}
```

### Cost Calculation

```
Volume (cm³) = node-stl.volume

Effective Volume = Volume × (15% shell + 85% × infill%)

Weight (g) = Effective Volume × Material Density

Base Cost = Weight × (Price per kg / 1000)

Material Cost = max(Base Cost × Color Modifier × Waste Factor, $0.50)

Total Cost = Material Cost + Shipping ($5) + Seller Margin (10-100%)
```

### Material Database Structure

```json
{
  "materials": {
    "PLA": {
      "name": "PLA",
      "density": 1.24,
      "pricePerKg": 20.00,
      "wasteFactor": 1.05
    }
  },
  "colorModifiers": {
    "standard": { "modifier": 1.0 },
    "metallic": { "modifier": 1.15 },
    "silk": { "modifier": 1.20 },
    "glow": { "modifier": 1.25 }
  },
  "colorLookup": {
    "White": "standard",
    "Silver": "metallic",
    "Glow Green": "glow"
  }
}
```

### Using the Pricing API

**Backend (Node.js):**
```typescript
import { getEstimate } from './pricing/index.ts';

const estimate = getEstimate('./model.stl', 'PLA', 'White', 20);
console.log(estimate.materialCost);  // $0.50
```

**Frontend (via API route):**
```typescript
const formData = new FormData();
formData.append('file', file);

const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData,
});

const { estimate } = await response.json();
// estimate contains PrintEstimate data
```

**CLI Testing:**
```bash
cd backend
npx ts-node --esm pricing/test.ts ../tests/files/Geekko.stl PETG Silver 30
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

All fees go to the **arbiter address** (hardcoded cold wallet), which also resolves disputes.

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

### Contract Functions

**Factory (PrintEscrowFactory.sol):**
```solidity
createOrder(bytes32 fileHash) → (bytes32 orderId, address escrow)
getEscrow(bytes32 orderId) → address
totalOrders() → uint256
setArbiter(address) / setShippingOracle(address)
```

**Escrow (EscrowInstance.sol):**

| Function | Who | Description |
|----------|-----|-------------|
| `cancel()` | Buyer | Cancel before claim (5.5% fee) |
| `claim()` | Seller | Claim order to start fulfillment |
| `markShipped()` | Seller | Mark as shipped |
| `openDispute()` | Buyer | Open dispute within 7 days of arrival |
| `finalizeOrder()` | Anyone | Release funds after 7-day window |
| `arbiterDecide(pct)` | Arbiter | Final decision (10% tax) |

## Wallet System

### Single Wallet Architecture

The app uses a **single wallet per session** that persists across buyer/seller views.

```typescript
interface WalletContextType {
  currentRole: 'buyer' | 'seller';
  setCurrentRole: (role: ViewMode) => void;
  walletAddress: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}
```

### Connection Flow

1. User clicks "Connect Wallet"
2. `wallet_revokePermissions` clears previous permissions (if supported)
3. `wallet_requestPermissions` shows MetaMask account picker
4. Selected account address is stored in state
5. Account persists until user disconnects or page refresh

### Listening for Account Changes

```typescript
useEffect(() => {
  window.ethereum.on('accountsChanged', (accounts) => {
    if (accounts.length === 0) {
      setWalletAddress(null);  // Disconnected
    } else if (walletAddress) {
      setWalletAddress(accounts[0]);  // Switched accounts
    }
  });
}, [walletAddress]);
```

## File Upload Flow

```
User drops STL file
      │
      ▼
FileUpload.tsx validates extension (.stl, .obj, .3mf)
      │
      ▼
POST /api/upload with FormData
      │
      ▼
route.ts:
  1. Saves file to /public/stl-temp/
  2. Calls getEstimateFromBuffer() for STL files
  3. Returns file info + PrintEstimate
      │
      ▼
BuyerView.tsx displays:
  - Model dimensions, volume, weight
  - Material/color/infill selectors
  - Cost breakdown with seller margin slider
  - Total cost
```

## Frontend Cost Recalculation

When user changes material, color, or infill, cost is recalculated client-side:

```typescript
useEffect(() => {
  if (!estimate || baseVolumeCm3 === 0) return;
  
  const matData = MATERIAL_DATA[material];
  const colorMod = COLOR_MODIFIERS[color] ?? 1.0;
  
  const shellRatio = 0.15;
  const effectiveVolume = baseVolumeCm3 * (shellRatio + (1 - shellRatio) * (infillPercent / 100));
  const weightGrams = effectiveVolume * matData.density;
  const rawCost = weightGrams * (matData.pricePerKg / 1000) * colorMod * matData.wasteFactor;
  const materialCost = Math.max(rawCost, 0.50);  // $0.50 minimum
  
  setEstimate({ ...estimate, materialCost });
}, [material, color, infillPercent, baseVolumeCm3]);
```

## Styling Conventions

- **Tailwind CSS 4**: Utility-first styling
- **Dark Mode**: Uses `dark:` variants, respects system preference
- **Color Palette**: 
  - Primary: Violet/Indigo gradients
  - Success: Emerald/Teal
  - Warning: Amber/Orange
  - Error: Red/Rose

## Environment Setup

```bash
# Frontend
cd frontend
npm install
npm run dev          # Start dev server on :3000

# Backend
cd backend
npm install

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
NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_CHAIN_ID=31337
```

## Common Tasks for AI Agents

### Testing Pricing

```bash
cd backend
npx ts-node --esm pricing/test.ts [file] [material] [color] [infill]

# Examples:
npx ts-node --esm pricing/test.ts ../tests/files/Geekko.stl PLA White 20
npx ts-node --esm pricing/test.ts --help  # Show available materials/colors
```

### Running Benchmark

```bash
cd backend
npm run benchmark
# Opens tests/pricing/results.html with cost vs weight graphs
```

### Adding a New Material

1. Add to `backend/pricing/materials.json`:
```json
"NEW_MATERIAL": {
  "name": "New Material",
  "fullName": "Full Material Name",
  "density": 1.20,
  "pricePerKg": 30.00,
  "wasteFactor": 1.08,
  "supportFactor": 1.20,
  "properties": { ... }
}
```

2. Add to `MATERIAL_DATA` in `frontend/app/components/BuyerView.tsx`

### Adding a New Color

1. Add color category to `colorModifiers` in `materials.json`
2. Add color name to `colorLookup` mapping
3. Add to `COLOR_MODIFIERS` in `BuyerView.tsx`

## Troubleshooting

### "Module not found: node-stl"
```bash
cd frontend
npm install  # Installs node-stl dependency
```

### Pricing returns $0.50 for everything
- Check that `node-stl` returns volume in cm³ (not mm³)
- Verify material key matches (case-insensitive, spaces → underscores)

### MetaMask auto-connects without prompt
- This is expected if site was previously authorized
- Use `wallet_revokePermissions` before `wallet_requestPermissions`
- Or manually disconnect site from MetaMask settings

### Contract compilation errors
- Run `npx hardhat clean` then `npx hardhat compile`
- Check Solidity version matches in `hardhat.config.js`
