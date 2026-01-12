const hre = require("hardhat");

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION - Update these for production deployment
// ═══════════════════════════════════════════════════════════════════════════

// Arbiter/Owner address - receives ALL fees and resolves disputes
// For testing: Hardhat Account #2
// For production: Replace with your cold wallet address
const ARBITER_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

// Helper to wait for network propagation on testnets
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // ═══════════════════════════════════════════════════════════════════════════
  // Deploy ShippingOracle
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n--- Deploying ShippingOracle ---");
  const ShippingOracle = await hre.ethers.getContractFactory("ShippingOracle");
  const oracle = await ShippingOracle.deploy();
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("ShippingOracle deployed to:", oracleAddress);
  
  // Wait for network propagation on testnets
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Waiting for network propagation...");
    await delay(5000);
  }
  
  console.log("Oracle owner (backend wallet):", await oracle.owner());

  // ═══════════════════════════════════════════════════════════════════════════
  // Deploy PrintEscrowFactory
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n--- Deploying PrintEscrowFactory ---");
  // Parameters:
  // - arbiter: Address that receives ALL fees and can resolve disputes (your cold wallet)
  // - minOrderAmount: Minimum order in wei (0.001 ETH = 1e15 wei)
  const PrintEscrowFactory = await hre.ethers.getContractFactory("PrintEscrowFactory");
  const factory = await PrintEscrowFactory.deploy(
    ARBITER_ADDRESS,  // arbiter - receives all fees + resolves disputes (your cold wallet)
    hre.ethers.parseEther("0.001") // minOrderAmount: 0.001 ETH
  );

  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("PrintEscrowFactory deployed to:", factoryAddress);

  // Wait for network propagation on testnets
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Waiting for network propagation...");
    await delay(5000);
  }

  console.log("Implementation (EscrowInstance):", await factory.implementation());
  console.log("Arbiter/Fee Recipient:", await factory.arbiter());
  console.log("Min order amount:", hre.ethers.formatEther(await factory.minOrderAmount()), "ETH");

  // ═══════════════════════════════════════════════════════════════════════════
  // Configure Factory with Oracle
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n--- Configuring Factory ---");
  console.log("Setting ShippingOracle on factory...");
  const setOracleTx = await factory.setShippingOracle(oracleAddress);
  const oracleReceipt = await setOracleTx.wait();
  console.log("Transaction hash:", oracleReceipt.hash);
  
  // Wait for network propagation on testnets
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Waiting for network propagation...");
    await delay(5000);
  }
  
  console.log("ShippingOracle set on factory:", await factory.shippingOracle());

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║               DEPLOYMENT COMPLETE                              ║");
  console.log("╠═══════════════════════════════════════════════════════════════╣");
  console.log(`║ ShippingOracle:      ${oracleAddress} ║`);
  console.log(`║ PrintEscrowFactory:  ${factoryAddress} ║`);
  console.log("╚═══════════════════════════════════════════════════════════════╝");

  // Get network info
  const network = hre.network.name;
  const chainId = hre.network.config.chainId;
  const isBaseSepolia = chainId === 84532;
  const rpcUrl = isBaseSepolia ? "https://sepolia.base.org" : "https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY";

  console.log("\n=== Environment Variables ===");
  console.log(`Network: ${network} (Chain ID: ${chainId})`);
  console.log("Add these to your .env files:\n");
  console.log("# frontend/.env.local");
  console.log(`NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`NEXT_PUBLIC_CHAIN_ID=${chainId}`);
  console.log("");
  console.log("# backend/.env.back");
  console.log(`ORACLE_ADDRESS=${oracleAddress}`);
  console.log(`RPC_URL=${rpcUrl}`);
  console.log(`BACKEND_PRIVATE_KEY=<deployer-private-key>`);
  console.log("");

  console.log("=== Notes ===");
  console.log("1. The deployer account owns the ShippingOracle");
  console.log("2. Only the oracle owner can call setShipped/setDelivered");
  console.log("3. Transfer oracle ownership if using a different backend wallet:");
  console.log("   oracle.transferOwnership(backendWalletAddress)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
