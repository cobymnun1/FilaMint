// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IShippingOracle - Hook for shipping delivery confirmation
/// @dev Implement this interface when connecting a shipping label provider
interface IShippingOracle {
    /// @notice Check if order has been delivered
    /// @return delivered True if delivered, timestamp Unix time of delivery (0 if not)
    function isDelivered(bytes32 orderId) external view returns (bool delivered, uint256 timestamp);
}
