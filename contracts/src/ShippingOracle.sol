// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IShippingOracle.sol";

/// @title ShippingOracle - Stores shipping status for escrow orders
/// @notice Backend service calls this when Shippo webhooks report shipping events
/// @dev Only owner (backend wallet) can update shipping status
contract ShippingOracle is IShippingOracle, Ownable {
    struct ShipmentRecord {
        bool shipped;
        bool delivered;
        uint64 shippedAt;
        uint64 deliveredAt;
    }

    mapping(bytes32 => ShipmentRecord) public shipments;

    event Shipped(bytes32 indexed orderId, uint256 timestamp);
    event Delivered(bytes32 indexed orderId, uint256 timestamp);

    constructor() Ownable(msg.sender) {}

    /// @notice Mark order as shipped (called when carrier picks up package)
    /// @param orderId The escrow order ID
    function setShipped(bytes32 orderId) external onlyOwner {
        require(orderId != bytes32(0), "invalid orderId");
        require(!shipments[orderId].shipped, "already shipped");
        
        shipments[orderId].shipped = true;
        shipments[orderId].shippedAt = uint64(block.timestamp);
        
        emit Shipped(orderId, block.timestamp);
    }

    /// @notice Mark order as delivered (called when carrier confirms delivery)
    /// @param orderId The escrow order ID
    /// @param timestamp Unix timestamp of delivery (from carrier, or 0 for current time)
    function setDelivered(bytes32 orderId, uint256 timestamp) external onlyOwner {
        require(orderId != bytes32(0), "invalid orderId");
        require(!shipments[orderId].delivered, "already delivered");
        
        // Use provided timestamp or current block timestamp
        uint64 deliveryTime = timestamp > 0 ? uint64(timestamp) : uint64(block.timestamp);
        
        shipments[orderId].delivered = true;
        shipments[orderId].deliveredAt = deliveryTime;
        
        // Also mark as shipped if not already (edge case: delivery before transit update)
        if (!shipments[orderId].shipped) {
            shipments[orderId].shipped = true;
            shipments[orderId].shippedAt = deliveryTime;
        }
        
        emit Delivered(orderId, deliveryTime);
    }

    /// @notice Check if order has been delivered (implements IShippingOracle)
    /// @param orderId The escrow order ID
    /// @return delivered True if delivered
    /// @return timestamp Unix time of delivery (0 if not delivered)
    function isDelivered(bytes32 orderId) external view override returns (bool delivered, uint256 timestamp) {
        ShipmentRecord memory record = shipments[orderId];
        return (record.delivered, uint256(record.deliveredAt));
    }

    /// @notice Check if order has been shipped
    /// @param orderId The escrow order ID
    /// @return shipped True if shipped
    /// @return timestamp Unix time of shipment (0 if not shipped)
    function isShipped(bytes32 orderId) external view returns (bool shipped, uint256 timestamp) {
        ShipmentRecord memory record = shipments[orderId];
        return (record.shipped, uint256(record.shippedAt));
    }

    /// @notice Get full shipment record
    /// @param orderId The escrow order ID
    function getShipment(bytes32 orderId) external view returns (
        bool shipped,
        bool delivered,
        uint256 shippedAt,
        uint256 deliveredAt
    ) {
        ShipmentRecord memory record = shipments[orderId];
        return (record.shipped, record.delivered, uint256(record.shippedAt), uint256(record.deliveredAt));
    }
}

