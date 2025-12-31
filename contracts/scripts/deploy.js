const hre = require("hardhat");

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION - Update these for production deployment
// ═══════════════════════════════════════════════════════════════════════════

// Arbiter/Owner address - receives ALL fees and resolves disputes
// For testing: Hardhat Account #2
// For production: Replace with your cold wallet address
const ARBITER_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Deploy PrintEscrowFactory
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

  console.log("\n=== Deployment Complete ===");
  console.log("PrintEscrowFactory deployed to:", factoryAddress);
  console.log("Implementation (EscrowInstance):", await factory.implementation());
  console.log("Arbiter/Fee Recipient:", await factory.arbiter());
  console.log("Min order amount:", hre.ethers.formatEther(await factory.minOrderAmount()), "ETH");

  console.log("\n=== Next Steps ===");
  console.log("1. Update frontend/.env.local with:");
  console.log(`   NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS=${factoryAddress}`);
  console.log("2. To change arbiter/fee recipient later: factory.setArbiter(newAddress)");
  console.log("3. Optionally call setShippingOracle() when oracle is ready");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

