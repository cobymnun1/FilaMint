// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./EscrowInstance.sol";

/// @title PrintEscrowFactory - Deploys EIP-1167 minimal proxy clones for escrow orders
/// @notice Each order gets its own contract address (~45 bytes deployment cost)
contract PrintEscrowFactory is Ownable {
    address public immutable implementation;
    address public platform;
    address public arbiter;
    address public shippingOracle;
    uint256 public minOrderAmount;
    uint256 public orderCount;

    mapping(bytes32 => address) public escrows;
    mapping(address => bytes32) public escrowToOrderId;
    address[] public allEscrows;

    event OrderCreated(bytes32 indexed orderId, address indexed escrow, address indexed buyer, uint256 amount, bytes32 fileHash);
    event PlatformUpdated(address indexed oldPlatform, address indexed newPlatform);
    event ArbiterUpdated(address indexed oldArbiter, address indexed newArbiter);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event MinOrderAmountUpdated(uint256 oldAmount, uint256 newAmount);

    constructor(address _platform, address _arbiter, uint256 _minOrderAmount) Ownable(msg.sender) {
        require(_platform != address(0) && _arbiter != address(0), "addr");
        implementation = address(new EscrowInstance());
        platform = _platform;
        arbiter = _arbiter;
        minOrderAmount = _minOrderAmount;
    }

    /// @notice Create escrow order. Send: orderAmount * 1.025 (includes 2% gas cushion + 0.5% fee)
    function createOrder(bytes32 fileHash) external payable returns (bytes32 orderId, address escrow) {
        require(msg.value >= minOrderAmount && fileHash != bytes32(0), "invalid");

        orderId = keccak256(abi.encodePacked(block.chainid, address(this), msg.sender, orderCount++, block.timestamp));
        escrow = Clones.clone(implementation);

        EscrowInstance(payable(escrow)).initialize{value: msg.value}(msg.sender, orderId, arbiter, platform, shippingOracle);

        escrows[orderId] = escrow;
        escrowToOrderId[escrow] = orderId;
        allEscrows.push(escrow);

        emit OrderCreated(orderId, escrow, msg.sender, msg.value, fileHash);
    }

    /// @notice Create with deterministic address (CREATE2)
    function createOrderDeterministic(bytes32 fileHash, bytes32 salt) external payable returns (bytes32 orderId, address escrow) {
        require(msg.value >= minOrderAmount && fileHash != bytes32(0), "invalid");

        orderId = keccak256(abi.encodePacked(block.chainid, address(this), msg.sender, salt, block.timestamp));
        escrow = Clones.cloneDeterministic(implementation, salt);

        EscrowInstance(payable(escrow)).initialize{value: msg.value}(msg.sender, orderId, arbiter, platform, shippingOracle);

        escrows[orderId] = escrow;
        escrowToOrderId[escrow] = orderId;
        allEscrows.push(escrow);

        emit OrderCreated(orderId, escrow, msg.sender, msg.value, fileHash);
    }

    function predictAddress(bytes32 salt) external view returns (address) {
        return Clones.predictDeterministicAddress(implementation, salt);
    }

    function totalOrders() external view returns (uint256) { return allEscrows.length; }
    function getEscrow(bytes32 orderId) external view returns (address) { return escrows[orderId]; }

    function getEscrows(uint256 offset, uint256 limit) external view returns (address[] memory) {
        uint256 total = allEscrows.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) result[i - offset] = allEscrows[i];
        return result;
    }

    function setPlatform(address _platform) external onlyOwner {
        require(_platform != address(0), "addr");
        emit PlatformUpdated(platform, _platform);
        platform = _platform;
    }

    function setArbiter(address _arbiter) external onlyOwner {
        require(_arbiter != address(0), "addr");
        emit ArbiterUpdated(arbiter, _arbiter);
        arbiter = _arbiter;
    }

    function setShippingOracle(address _oracle) external onlyOwner {
        emit OracleUpdated(shippingOracle, _oracle);
        shippingOracle = _oracle;
    }

    function setMinOrderAmount(uint256 _min) external onlyOwner {
        emit MinOrderAmountUpdated(minOrderAmount, _min);
        minOrderAmount = _min;
    }
}
