# FilaMint - Decentralized 3D Print Marketplace

A Web3-powered marketplace connecting people who need 3D prints with printer owners. Buyers upload STL files, get instant cost estimates, and deposit ETH into escrow; sellers claim jobs, print them, and receive payment upon delivery confirmation.

## Project Structure

```
mod/
├── frontend/          # Next.js 16 web application
│   ├── app/
│   │   ├── components/    # React components
│   │   ├── context/       # Wallet context provider
│   │   ├── types/         # TypeScript interfaces
│   │   └── api/           # API routes (file upload + pricing)
│   └── public/            # Static assets
├── backend/           # Backend services
│   ├── pricing/           # STL analysis & cost estimation
│   │   ├── index.ts       # Main pricing API
│   │   └── materials.json # Material pricing database
│   └── shipping/          # Shipping types & mock data
├── contracts/         # Solidity smart contracts (Hardhat)
│   ├── src/               # Contract source files
│   └── scripts/           # Deployment scripts
└── tests/             # Test files & benchmarks
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- MetaMask browser extension

### Installation

```bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install

# Start frontend development server
cd ../frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

### Buyer Side
- **File Upload**: Drag & drop STL files with instant analysis
- **Cost Estimation**: Real-time pricing based on volume, material, color, and infill
- **Print Configuration**: Select from 12+ materials and 35+ colors
- **Seller Margin Slider**: Set profit margin (10-100%) to attract printers
- **Order Tracking**: View status of submitted print requests

### Seller Side
- **Browse Requests**: View all pending print jobs
- **Filter & Sort**: By material type, escrow amount, print time
- **Claim Jobs**: Accept print requests to fulfill
- **Job Management**: Track active and completed jobs

### Pricing System
- **Automatic STL Analysis**: Volume, dimensions, weight calculation using `node-stl`
- **Material Database**: 12 materials with accurate densities and pricing
- **Color Modifiers**: Standard, metallic, silk, glow-in-dark, transparent options
- **Infill Calculation**: Shell + infill volume estimation
- **$0.50 Minimum**: Floor price for small prints

### Shared
- **Wallet Connection**: MetaMask integration with account selection
- **View Toggle**: Switch between buyer/seller modes
- **Order Cards**: Consistent display of job details and status

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Pricing | node-stl, custom material database |
| Smart Contracts | Solidity 0.8.24, Hardhat, EIP-1167 Clones |
| Blockchain | Ethereum / EVM-compatible |

## Pricing API

### Backend Usage

```typescript
import { getEstimate } from './pricing/index.ts';

const estimate = getEstimate('./model.stl', 'PLA', 'White', 20);
// Returns: { dimensions, volumeCm3, weightGrams, materialCost, ... }
```

### Supported Materials

| Material | Density | Price/kg |
|----------|---------|----------|
| PLA | 1.24 g/cm³ | $20 |
| ABS | 1.04 g/cm³ | $22 |
| PETG | 1.27 g/cm³ | $25 |
| TPU | 1.21 g/cm³ | $35 |
| Nylon | 1.14 g/cm³ | $45 |
| ASA | 1.07 g/cm³ | $30 |
| PC | 1.20 g/cm³ | $40 |
| Carbon Fiber PLA | 1.30 g/cm³ | $50 |

### Color Modifiers

- **Standard** (1.0x): White, Black, Gray, Red, Blue, Green, etc.
- **Metallic** (1.15x): Silver, Gold, Bronze, Copper
- **Silk** (1.20x): Silk White, Silk Blue, Silk Gold, etc.
- **Glow-in-Dark** (1.25x): Glow Green, Glow Blue, etc.
- **Transparent** (1.10x): Clear, Transparent Blue, etc.
- **Rainbow** (1.30x): Rainbow, Galaxy, Marble

## Order Lifecycle

```
┌─────────┐    ┌─────────┐    ┌──────────┐    ┌─────────┐    ┌───────────┐
│ Pending │───▶│ Claimed │───▶│ Printing │───▶│ Shipped │───▶│ Delivered │
└─────────┘    └─────────┘    └──────────┘    └─────────┘    └───────────┘
     │                                                             │
     │                        ┌──────────┐                         │
     └───────────────────────▶│ Disputed │◀────────────────────────┘
                              └──────────┘
```

## Smart Contracts

### Fee Structure

All fees go to the **arbiter address** (platform owner's cold wallet):

| Fee | Amount | When |
|-----|--------|------|
| Platform fee | 0.5% | Every completed order |
| Cancel fee | 5% | Buyer cancels before claim |
| Arbiter tax | 10% | Dispute resolved by arbiter |
| Gas cushion | 2% | Refundable to buyer |

### Deployment

```bash
cd contracts
npx hardhat node                                      # Terminal 1
npx hardhat run scripts/deploy.js --network localhost # Terminal 2
```

## Environment Variables

Create `.env.local` in the frontend directory:

```env
NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_CHAIN_ID=31337
```

## Development

```bash
# Frontend dev server
cd frontend
npm run dev

# Test pricing API
cd backend
npx ts-node --esm pricing/test.ts ../tests/files/Geekko.stl PLA White 20

# Run pricing benchmark
npm run benchmark
```

## API Routes

### POST /api/upload

Upload a 3D model file and get instant cost estimate.

**Request:** `multipart/form-data` with `file` field

**Response:**
```json
{
  "success": true,
  "fileName": "uuid-filename.stl",
  "originalName": "my-model.stl",
  "size": 4200000,
  "estimate": {
    "dimensions": { "x": 80, "y": 60, "z": 20 },
    "volumeCm3": 9.25,
    "weightGrams": 3.67,
    "materialCost": 0.50,
    "availableMaterials": ["PLA", "ABS", "PETG", ...],
    "availableColors": ["White", "Black", "Silver", ...]
  }
}
```

## Roadmap

- [x] Smart contract development (escrow, dispute resolution)
- [x] Wallet integration (MetaMask)
- [x] Print cost estimation algorithm
- [x] Material pricing database
- [ ] STL file preview/viewer
- [ ] Reputation system for printers
- [ ] Shipping oracle integration
- [ ] Multi-chain support
- [ ] WalletConnect support

## License

MIT License - see LICENSE file for details.
