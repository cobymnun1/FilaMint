// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEscrowInstance - Interface for escrow clone instances
interface IEscrowInstance {
    enum Status { Pending, Claimed, Shipped, Arrived, Completed, Cancelled, InDispute, ArbiterReview, Settled }

    event OrderClaimed(address indexed seller, uint256 timestamp);
    event OrderShipped(uint256 timestamp);
    event DeliveryConfirmed(uint256 timestamp, bool byOracle);
    event OrderCompleted(uint256 sellerPayout, uint256 buyerRefund);
    event OrderCancelled(uint256 buyerRefund, uint256 platformFee);
    event DisputeOpened(uint256 timestamp);
    event OfferSubmitted(address indexed by, uint8 round, uint8 buyerPercent);
    event OfferAccepted(uint8 round, uint8 buyerPercent);
    event OfferAutoAccepted(uint8 round, uint8 buyerPercent);
    event ArbiterDecision(uint8 buyerPercent, uint8 sellerPercent);
    event GasReimbursed(address indexed to, uint256 amount);

    function buyer() external view returns (address);
    function seller() external view returns (address);
    function status() external view returns (Status);
    function orderAmount() external view returns (uint256);
    function gasCushion() external view returns (uint256);
    function arrivedAt() external view returns (uint256);
    function disputeRound() external view returns (uint8);
    function currentOffer() external view returns (uint8, uint256, address);
    function isBuyerTurn() external view returns (bool);
    function timeRemaining() external view returns (uint256);

    function cancel() external;
    function openDispute() external;
    function submitOffer(uint8 buyerPercent) external;
    function acceptOffer() external;
    function rejectFinalOffer() external;

    function claim() external;
    function markShipped() external;
    function claimDelivery() external;
    function submitCounterOffer(uint8 buyerPercent) external;
    function acceptBuyerOffer() external;

    function confirmDeliveryViaOracle() external;
    function finalizeOrder() external;
    function finalizeOffer() external;
    function finalizeArbiter() external;

    function arbiterDecide(uint8 buyerPercent) external;
}
