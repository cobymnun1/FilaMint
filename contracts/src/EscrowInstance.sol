// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IShippingOracle.sol";
import "./interfaces/IEscrowInstance.sol";

/// @title EscrowInstance - Individual escrow for a print order (deployed as EIP-1167 clone)
/// @notice Lifecycle: Pending→Claimed→Shipped→Arrived→Completed OR →InDispute→Settled
/// @dev Fees: 0.5% platform, 5% cancel, 10% arbiter tax, 2% gas cushion (refundable)
contract EscrowInstance is IEscrowInstance, ReentrancyGuard {
    // Constants: fees in basis points (1 bp = 0.01%)
    uint256 constant PLATFORM_FEE_BPS = 50;     // 0.5%
    uint256 constant CANCEL_FEE_BPS = 500;      // 5%
    uint256 constant ARBITER_TAX_BPS = 500;     // 5% each party = 10% total
    uint256 constant GAS_CUSHION_BPS = 200;     // 2%
    uint256 constant BPS = 10000;

    // Timeouts
    uint256 constant DISPUTE_WINDOW = 7 days;
    uint256 constant DELIVERY_CLAIM_DELAY = 14 days;
    uint256 constant ARBITER_TIMEOUT = 30 days;
    uint256 constant FIRST_OFFER_TIMEOUT = 4 days;
    uint256 constant OFFER_TIMEOUT = 2 days;
    uint8 constant MAX_ROUNDS = 6;

    // Set once by factory
    address public factory;
    address public arbiter;  // Also receives all platform fees
    address public shippingOracle;

    // Order state
    address public buyer;
    address public seller;
    Status public status;
    bytes32 public orderId;
    uint256 public orderAmount;
    uint256 public gasCushion;
    uint256 public platformFee;
    uint256 public gasUsed;

    // Timestamps
    uint256 public createdAt;
    uint256 public claimedAt;
    uint256 public shippedAt;
    uint256 public arrivedAt;

    // Dispute state
    uint8 public disputeRound;
    uint8 public lastOfferBuyerPercent;
    uint256 public lastOfferAt;
    address public lastOfferBy;
    uint256 public arbiterReviewStartedAt;

    modifier onlyBuyer() { require(msg.sender == buyer, "!buyer"); _; }
    modifier onlySeller() { require(msg.sender == seller, "!seller"); _; }
    modifier onlyArbiter() { require(msg.sender == arbiter, "!arbiter"); _; }
    modifier inStatus(Status s) { require(status == s, "!status"); _; }
    modifier reimburseGas() { uint256 g = gasleft(); _; _reimburse(msg.sender, g); }

    /// @notice Initialize escrow (called once by factory)
    function initialize(
        address _buyer, bytes32 _orderId, address _arbiter, address _oracle
    ) external payable {
        require(factory == address(0), "init");
        require(_buyer != address(0) && _arbiter != address(0), "addr");
        require(msg.value > 0, "eth");

        factory = msg.sender;
        buyer = _buyer;
        orderId = _orderId;
        arbiter = _arbiter;
        shippingOracle = _oracle;

        // Split deposit: total = orderAmount * 1.025 (order + 2% gas + 0.5% fee)
        orderAmount = (msg.value * BPS) / (BPS + GAS_CUSHION_BPS + PLATFORM_FEE_BPS);
        platformFee = (orderAmount * PLATFORM_FEE_BPS) / BPS;
        gasCushion = msg.value - orderAmount - platformFee;

        status = Status.Pending;
        createdAt = block.timestamp;
    }

    // ═══════════════════════════════════════════════════════════════════
    // BUYER ACTIONS
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Cancel before seller claims (loses 5.5%: 5% cancel + 0.5% platform)
    function cancel() external onlyBuyer inStatus(Status.Pending) nonReentrant {
        status = Status.Cancelled;
        uint256 cancelFee = (orderAmount * CANCEL_FEE_BPS) / BPS;
        uint256 fees = cancelFee + platformFee;
        _send(arbiter, fees);
        _send(buyer, orderAmount + gasCushion - cancelFee);
        emit OrderCancelled(orderAmount + gasCushion - cancelFee, fees);
    }

    /// @notice Open dispute within 7 days of arrival
    function openDispute() external onlyBuyer inStatus(Status.Arrived) reimburseGas nonReentrant {
        require(block.timestamp <= arrivedAt + DISPUTE_WINDOW, "window");
        status = Status.InDispute;
        disputeRound = 0;
        emit DisputeOpened(block.timestamp);
    }

    /// @notice Submit offer (buyer's turn: rounds 1,3,5)
    function submitOffer(uint8 pct) external onlyBuyer inStatus(Status.InDispute) reimburseGas nonReentrant {
        require(pct <= 100 && _isBuyerTurn() && disputeRound < MAX_ROUNDS, "invalid");
        disputeRound++;
        lastOfferBuyerPercent = pct;
        lastOfferAt = block.timestamp;
        lastOfferBy = buyer;
        emit OfferSubmitted(buyer, disputeRound, pct);
    }

    /// @notice Accept seller's counter-offer
    function acceptOffer() external onlyBuyer inStatus(Status.InDispute) reimburseGas nonReentrant {
        require(lastOfferBy == seller, "no offer");
        _settle(lastOfferBuyerPercent, false);
    }

    /// @notice Reject final offer → escalate to arbiter
    function rejectFinalOffer() external onlyBuyer inStatus(Status.InDispute) reimburseGas nonReentrant {
        require(disputeRound == MAX_ROUNDS && lastOfferBy == seller, "!final");
        status = Status.ArbiterReview;
        arbiterReviewStartedAt = block.timestamp;
        emit ArbiterReviewStarted(block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════
    // SELLER ACTIONS
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Claim order to start fulfillment
    function claim() external inStatus(Status.Pending) reimburseGas nonReentrant {
        require(msg.sender != buyer, "buyer");
        seller = msg.sender;
        status = Status.Claimed;
        claimedAt = block.timestamp;
        emit OrderClaimed(seller, claimedAt);
    }

    /// @notice Mark as shipped
    function markShipped() external onlySeller inStatus(Status.Claimed) reimburseGas nonReentrant {
        status = Status.Shipped;
        shippedAt = block.timestamp;
        emit OrderShipped(shippedAt);
    }

    /// @notice Claim delivery (after 14 days if no oracle, or immediately if no oracle configured)
    function claimDelivery() external onlySeller inStatus(Status.Shipped) reimburseGas nonReentrant {
        require(shippingOracle == address(0) || block.timestamp >= shippedAt + DELIVERY_CLAIM_DELAY, "wait");
        status = Status.Arrived;
        arrivedAt = block.timestamp;
        emit DeliveryConfirmed(arrivedAt, false);
    }

    /// @notice Counter-offer (seller's turn: rounds 2,4,6)
    function submitCounterOffer(uint8 pct) external onlySeller inStatus(Status.InDispute) reimburseGas nonReentrant {
        require(pct <= 100 && !_isBuyerTurn() && disputeRound < MAX_ROUNDS, "invalid");
        disputeRound++;
        lastOfferBuyerPercent = pct;
        lastOfferAt = block.timestamp;
        lastOfferBy = seller;
        emit OfferSubmitted(seller, disputeRound, pct);
    }

    /// @notice Accept buyer's offer
    function acceptBuyerOffer() external onlySeller inStatus(Status.InDispute) reimburseGas nonReentrant {
        require(lastOfferBy == buyer, "no offer");
        _settle(lastOfferBuyerPercent, false);
    }

    // ═══════════════════════════════════════════════════════════════════
    // PUBLIC ACTIONS (anyone can trigger)
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Confirm delivery via oracle
    function confirmDeliveryViaOracle() external inStatus(Status.Shipped) reimburseGas nonReentrant {
        require(shippingOracle != address(0), "!oracle");
        (bool delivered, uint256 ts) = IShippingOracle(shippingOracle).isDelivered(orderId);
        require(delivered, "!delivered");
        status = Status.Arrived;
        arrivedAt = ts > 0 ? ts : block.timestamp;
        emit DeliveryConfirmed(arrivedAt, true);
    }

    /// @notice Finalize after 7-day window (release to seller)
    function finalizeOrder() external inStatus(Status.Arrived) reimburseGas nonReentrant {
        require(block.timestamp > arrivedAt + DISPUTE_WINDOW, "window");
        status = Status.Completed;
        uint256 buyerRefund = gasCushion > gasUsed ? gasCushion - gasUsed : 0;
        _send(arbiter, platformFee);
        _send(seller, orderAmount);  // Seller gets full orderAmount (gas came from cushion)
        if (buyerRefund > 0) _send(buyer, buyerRefund);
        emit OrderCompleted(orderAmount, buyerRefund);
    }

    /// @notice Auto-accept on timeout
    function finalizeOffer() external inStatus(Status.InDispute) reimburseGas nonReentrant {
        require(lastOfferAt > 0, "no offer");
        uint256 timeout = disputeRound == 1 ? FIRST_OFFER_TIMEOUT : OFFER_TIMEOUT;
        require(block.timestamp > lastOfferAt + timeout, "wait");
        emit OfferAutoAccepted(disputeRound, lastOfferBuyerPercent);
        _settle(lastOfferBuyerPercent, false);
    }

    /// @notice Auto-refund if arbiter times out (30 days)
    function finalizeArbiter() external inStatus(Status.ArbiterReview) reimburseGas nonReentrant {
        require(block.timestamp > arbiterReviewStartedAt + ARBITER_TIMEOUT, "wait");
        _settle(100, true); // Full refund to buyer with tax
    }

    // ═══════════════════════════════════════════════════════════════════
    // ARBITER
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Arbiter decides split (10% tax applied)
    function arbiterDecide(uint8 pct) external onlyArbiter inStatus(Status.ArbiterReview) nonReentrant {
        require(pct <= 100, "pct");
        emit ArbiterDecision(pct, 100 - pct);
        _settle(pct, true);
    }

    // ═══════════════════════════════════════════════════════════════════
    // VIEW
    // ═══════════════════════════════════════════════════════════════════

    function currentOffer() external view returns (uint8, uint256, address) {
        return (lastOfferBuyerPercent, lastOfferAt, lastOfferBy);
    }

    function isBuyerTurn() external view returns (bool) { return _isBuyerTurn(); }

    function timeRemaining() external view returns (uint256) {
        if (status == Status.Arrived) return _remaining(arrivedAt + DISPUTE_WINDOW);
        if (status == Status.InDispute && lastOfferAt > 0) {
            return _remaining(lastOfferAt + (disputeRound == 1 ? FIRST_OFFER_TIMEOUT : OFFER_TIMEOUT));
        }
        if (status == Status.ArbiterReview) return _remaining(arbiterReviewStartedAt + ARBITER_TIMEOUT);
        return 0;
    }

    // ═══════════════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════════════

    function _isBuyerTurn() internal view returns (bool) {
        return disputeRound == 0 || disputeRound % 2 == 0;
    }

    function _remaining(uint256 deadline) internal view returns (uint256) {
        return block.timestamp >= deadline ? 0 : deadline - block.timestamp;
    }

    function _settle(uint8 buyerPct, bool withTax) internal {
        status = Status.Settled;
        uint256 pool = orderAmount;
        uint256 tax = 0;

        if (withTax) {
            tax = (pool * ARBITER_TAX_BPS * 2) / BPS; // 10% total
            pool -= tax;
        }

        uint256 buyerShare = (pool * buyerPct) / 100;
        uint256 sellerShare = pool - buyerShare;
        uint256 cushionLeft = gasCushion > gasUsed ? gasCushion - gasUsed : 0;

        _send(arbiter, platformFee + tax);
        if (buyerShare + cushionLeft > 0) _send(buyer, buyerShare + cushionLeft);
        if (sellerShare > 0) _send(seller, sellerShare);

        emit OfferAccepted(disputeRound, buyerPct);
    }

    function _reimburse(address to, uint256 startGas) internal {
        uint256 cost = (startGas - gasleft() + 21000) * tx.gasprice;
        uint256 avail = gasCushion > gasUsed ? gasCushion - gasUsed : 0;
        uint256 amt = cost > avail ? avail : cost;
        if (amt > 0) {
            gasUsed += amt;
            _send(to, amt);
            emit GasReimbursed(to, amt);
        }
    }

    function _send(address to, uint256 amt) internal {
        (bool ok,) = to.call{value: amt, gas: 10000}("");
        require(ok, "send");
    }

    receive() external payable { revert("factory"); }
}
