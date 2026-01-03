# PrintMod - Decentralized 3D Print Marketplace

A Web3-powered marketplace connecting people who need 3D prints with printer owners. Buyers upload STL files and deposit ETH into escrow; sellers claim jobs, print them, and receive payment upon delivery confirmation.

## Project Structure

```
mod/
├── frontend/          # Next.js 16 web application
│   ├── app/
│   │   ├── components/    # React components
│   │   ├── types/         # TypeScript interfaces
│   │   └── api/           # API routes (file upload)
│   └── public/            # Static assets & mock data
├── backend/           # Backend services (planned)
├── contracts/         # Solidity smart contracts (Hardhat)
│   ├── src/               # Contract source files
│   └── scripts/           # Deployment scripts
└── uploads/           # Uploaded STL files storage
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone and navigate
cd mod/frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

### Buyer Side
- **File Upload**: Drag & drop STL/OBJ/3MF files
- **Print Configuration**: Select material, color, infill percentage
- **Escrow Deposit**: Set ETH amount for the job
- **Order Tracking**: View status of submitted print requests

### Seller Side
- **Browse Requests**: View all pending print jobs
- **Filter & Sort**: By material type, escrow amount, print time
- **Claim Jobs**: Accept print requests to fulfill
- **Job Management**: Track active and completed jobs

### Shared
- **Wallet Connection**: Unified wallet button across both views
- **View Toggle**: Switch between buyer/seller modes
- **Order Cards**: Consistent display of job details and status

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Smart Contracts | Solidity 0.8.24, Hardhat, EIP-1167 Clones |
| Blockchain | Ethereum / EVM-compatible |

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

**Status Definitions:**
- `pending` - Buyer submitted, awaiting printer claim
- `claimed` - Printer accepted, preparing to print
- `printing` - Currently being printed
- `shipped` - Print complete, in transit to buyer
- `delivered` - Buyer confirmed receipt, escrow released
- `disputed` - Issue raised, requires resolution

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

Update `ARBITER_ADDRESS` in `scripts/deploy.js` with your cold wallet address before production deployment.

## Environment Variables

Create `.env.local` in the frontend directory:

```env
NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_CHAIN_ID=31337
```

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Lint code
npm run lint
```

## API Routes

### POST /api/upload

Upload a 3D model file.

**Request:** `multipart/form-data` with `file` field

**Response:**
```json
{
  "success": true,
  "fileName": "uuid-filename.stl",
  "originalName": "my-model.stl",
  "size": 4200000
}
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Roadmap

- [x] Smart contract development (escrow, dispute resolution)
- [x] Wallet integration (MetaMask)
- [ ] STL file preview/viewer
- [ ] Print cost estimation algorithm
- [ ] Reputation system for printers
- [ ] Shipping oracle integration
- [ ] Multi-chain support
- [ ] WalletConnect support

## License

MIT License - see LICENSE file for details.

