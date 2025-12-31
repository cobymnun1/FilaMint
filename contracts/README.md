# PrintMod Escrow Contracts

EIP-1167 minimal proxy escrow system for 3D print marketplace.

## Quick Start

```bash
npm install
npx hardhat compile
npx hardhat node                                    # Terminal 1
npx hardhat run scripts/deploy.js --network localhost  # Terminal 2
```

## Architecture

```
PrintEscrowFactory → deploys → EscrowInstance clones (one per order)
```

## Order Lifecycle

```
Pending → Claimed → Shipped → Arrived → Completed
    ↓                           ↓
Cancelled                   InDispute → Settled / ArbiterReview
```

## Fees

| Fee | Amount | When |
|-----|--------|------|
| Platform | 0.5% | All orders |
| Cancel | 5% | Buyer cancels |
| Arbiter tax | 10% | If arbiter decides |
| Gas cushion | 2% | Refundable |

## Dispute Flow (6 rounds max)

| Round | Who | Timeout |
|-------|-----|---------|
| 1 | Buyer | 4 days |
| 2-6 | Alternating | 2 days |

Timeout = auto-accept. Final rejection → Arbiter (30 day timeout).

## Key Functions

**Factory:**
- `createOrder(fileHash)` → returns orderId, escrow address

**Escrow (Buyer):**
- `cancel()` - Before claim only
- `openDispute()` - Within 7 days of arrival
- `submitOffer(pct)` / `acceptOffer()` / `rejectFinalOffer()`

**Escrow (Seller):**
- `claim()` / `markShipped()` / `claimDelivery()`
- `submitCounterOffer(pct)` / `acceptBuyerOffer()`

**Public:**
- `finalizeOrder()` - After 7-day window
- `finalizeOffer()` - On timeout
- `confirmDeliveryViaOracle()` - If oracle configured

## Oracle Hook

```solidity
interface IShippingOracle {
    function isDelivered(bytes32 orderId) external view returns (bool, uint256);
}
```

Connect via: `factory.setShippingOracle(address)`
