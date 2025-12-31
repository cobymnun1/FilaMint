const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Deploy PrintEscrowFactory
  // Parameters:
  // - platform: Address to receive platform fees (using deployer for testing)
  // - arbiter: Address that can resolve disputes (using deployer for testing)
  // - minOrderAmount: Minimum order in wei (0.001 ETH = 1e15 wei)
  const PrintEscrowFactory = await hre.ethers.getContractFactory("PrintEscrowFactory");
  const factory = await PrintEscrowFactory.deploy(
    deployer.address, // platform - change in production
    deployer.address, // arbiter - change in production
    hre.ethers.parseEther("0.001") // minOrderAmount: 0.001 ETH
  );

  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();

  console.log("\n=== Deployment Complete ===");
  console.log("PrintEscrowFactory deployed to:", factoryAddress);
  console.log("Implementation (EscrowInstance):", await factory.implementation());
  console.log("Platform address:", await factory.platform());
  console.log("Arbiter address:", await factory.arbiter());
  console.log("Min order amount:", hre.ethers.formatEther(await factory.minOrderAmount()), "ETH");

  console.log("\n=== Next Steps ===");
  console.log("1. Update frontend/.env.local with:");
  console.log(`   NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS=${factoryAddress}`);
  console.log("2. In production, call setPlatform() and setArbiter() with proper addresses");
  console.log("3. Optionally call setShippingOracle() when oracle is ready");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

