const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PrintMod Escrow System", function () {
  let factory, escrow;
  let deployer, platform, arbiter, buyer, seller, other;
  const fileHash = ethers.keccak256(ethers.toUtf8Bytes("test-model.stl"));
  
  // Helper to create order and get escrow instance
  async function createTestOrder(value = "1.025") {
    const tx = await factory.connect(buyer).createOrder(fileHash, {
      value: ethers.parseEther(value)
    });
    const receipt = await tx.wait();
    const event = receipt.logs.find(l => l.fragment?.name === "OrderCreated");
    const Escrow = await ethers.getContractFactory("EscrowInstance");
    return Escrow.attach(event.args.escrow);
  }

  // Helper to advance time
  async function advanceTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
  }

  const DAY = 24 * 60 * 60;

  beforeEach(async function () {
    [deployer, platform, arbiter, buyer, seller, other] = await ethers.getSigners();
    
    const Factory = await ethers.getContractFactory("PrintEscrowFactory");
    factory = await Factory.deploy(
      platform.address,
      arbiter.address,
      ethers.parseEther("0.001") // minOrderAmount
    );
    await factory.waitForDeployment();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FACTORY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Factory", function () {
    it("should deploy with correct initial state", async function () {
      expect(await factory.platform()).to.equal(platform.address);
      expect(await factory.arbiter()).to.equal(arbiter.address);
      expect(await factory.minOrderAmount()).to.equal(ethers.parseEther("0.001"));
      expect(await factory.implementation()).to.not.equal(ethers.ZeroAddress);
    });

    it("should create order and emit event", async function () {
      await expect(
        factory.connect(buyer).createOrder(fileHash, { value: ethers.parseEther("1.025") })
      ).to.emit(factory, "OrderCreated");
    });

    it("should reject order below minimum", async function () {
      await expect(
        factory.connect(buyer).createOrder(fileHash, { value: ethers.parseEther("0.0001") })
      ).to.be.revertedWith("invalid");
    });

    it("should reject empty file hash", async function () {
      await expect(
        factory.connect(buyer).createOrder(ethers.ZeroHash, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("invalid");
    });

    it("should track orders correctly", async function () {
      await createTestOrder();
      await createTestOrder();
      expect(await factory.totalOrders()).to.equal(2);
    });

    it("should allow owner to update settings", async function () {
      await factory.connect(deployer).setPlatform(other.address);
      expect(await factory.platform()).to.equal(other.address);
      
      await factory.connect(deployer).setArbiter(other.address);
      expect(await factory.arbiter()).to.equal(other.address);
      
      await factory.connect(deployer).setMinOrderAmount(ethers.parseEther("0.01"));
      expect(await factory.minOrderAmount()).to.equal(ethers.parseEther("0.01"));
    });

    it("should reject non-owner settings changes", async function () {
      await expect(
        factory.connect(other).setPlatform(other.address)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("should create deterministic order with salt", async function () {
      const salt = ethers.keccak256(ethers.toUtf8Bytes("unique-salt"));
      const predictedAddr = await factory.predictAddress(salt);
      
      const tx = await factory.connect(buyer).createOrderDeterministic(fileHash, salt, {
        value: ethers.parseEther("1.025")
      });
      const receipt = await tx.wait();
      const event = receipt.logs.find(l => l.fragment?.name === "OrderCreated");
      
      expect(event.args.escrow).to.equal(predictedAddr);
    });

    it("should paginate escrows correctly", async function () {
      await createTestOrder();
      await createTestOrder();
      await createTestOrder();
      
      const page1 = await factory.getEscrows(0, 2);
      expect(page1.length).to.equal(2);
      
      const page2 = await factory.getEscrows(2, 2);
      expect(page2.length).to.equal(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Happy Path - Full Order Lifecycle", function () {
    beforeEach(async function () {
      escrow = await createTestOrder();
    });

    it("should initialize with correct values", async function () {
      expect(await escrow.buyer()).to.equal(buyer.address);
      expect(await escrow.status()).to.equal(0); // Pending
      
      // Check fee split: 1.025 ETH total
      // orderAmount = 1.025 * 10000 / 10250 ≈ 1 ETH
      const orderAmount = await escrow.orderAmount();
      expect(orderAmount).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.001"));
    });

    it("should complete full lifecycle", async function () {
      // 1. Seller claims
      await expect(escrow.connect(seller).claim())
        .to.emit(escrow, "OrderClaimed");
      expect(await escrow.status()).to.equal(1); // Claimed
      expect(await escrow.seller()).to.equal(seller.address);

      // 2. Seller ships
      await expect(escrow.connect(seller).markShipped())
        .to.emit(escrow, "OrderShipped");
      expect(await escrow.status()).to.equal(2); // Shipped

      // 3. Seller claims delivery (no oracle)
      await expect(escrow.connect(seller).claimDelivery())
        .to.emit(escrow, "DeliveryConfirmed");
      expect(await escrow.status()).to.equal(3); // Arrived

      // 4. Wait 7 days
      await advanceTime(7 * DAY + 1);

      // 5. Finalize
      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const platformBefore = await ethers.provider.getBalance(platform.address);
      
      await escrow.connect(other).finalizeOrder(); // Anyone can call
      
      expect(await escrow.status()).to.equal(4); // Completed

      // Verify payouts
      const sellerAfter = await ethers.provider.getBalance(seller.address);
      const platformAfter = await ethers.provider.getBalance(platform.address);
      
      // Seller should get ~1 ETH (orderAmount)
      expect(sellerAfter - sellerBefore).to.be.closeTo(
        ethers.parseEther("1"),
        ethers.parseEther("0.01")
      );
      
      // Platform should get ~0.005 ETH (0.5%)
      expect(platformAfter - platformBefore).to.be.closeTo(
        ethers.parseEther("0.005"),
        ethers.parseEther("0.001")
      );
    });

    it("should store timestamps correctly", async function () {
      const createdAt = await escrow.createdAt();
      expect(createdAt).to.be.greaterThan(0);

      await escrow.connect(seller).claim();
      const claimedAt = await escrow.claimedAt();
      expect(claimedAt).to.be.greaterThanOrEqual(createdAt);

      await escrow.connect(seller).markShipped();
      const shippedAt = await escrow.shippedAt();
      expect(shippedAt).to.be.greaterThanOrEqual(claimedAt);

      await escrow.connect(seller).claimDelivery();
      const arrivedAt = await escrow.arrivedAt();
      expect(arrivedAt).to.be.greaterThanOrEqual(shippedAt);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CANCELLATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Cancellation", function () {
    beforeEach(async function () {
      escrow = await createTestOrder();
    });

    it("should allow buyer to cancel before claim", async function () {
      const platformBefore = await ethers.provider.getBalance(platform.address);

      await expect(escrow.connect(buyer).cancel())
        .to.emit(escrow, "OrderCancelled");

      expect(await escrow.status()).to.equal(5); // Cancelled

      const platformAfter = await ethers.provider.getBalance(platform.address);

      // Platform should get ~5.5% (5% cancel + 0.5% platform fee)
      expect(platformAfter - platformBefore).to.be.closeTo(
        ethers.parseEther("0.055"),
        ethers.parseEther("0.005")
      );
    });

    it("should reject cancel from non-buyer", async function () {
      await expect(escrow.connect(seller).cancel()).to.be.revertedWith("!buyer");
      await expect(escrow.connect(other).cancel()).to.be.revertedWith("!buyer");
    });

    it("should reject cancel after claim", async function () {
      await escrow.connect(seller).claim();
      await expect(escrow.connect(buyer).cancel()).to.be.revertedWith("!status");
    });

    it("should reject cancel after shipped", async function () {
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      await expect(escrow.connect(buyer).cancel()).to.be.revertedWith("!status");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DISPUTE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Dispute - Negotiation", function () {
    beforeEach(async function () {
      escrow = await createTestOrder();
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      await escrow.connect(seller).claimDelivery();
    });

    it("should allow buyer to open dispute within 7 days", async function () {
      await expect(escrow.connect(buyer).openDispute())
        .to.emit(escrow, "DisputeOpened");
      expect(await escrow.status()).to.equal(6); // InDispute
    });

    it("should reject dispute from seller", async function () {
      await expect(escrow.connect(seller).openDispute()).to.be.revertedWith("!buyer");
    });

    it("should reject dispute after 7 days", async function () {
      await advanceTime(7 * DAY + 1);
      await expect(escrow.connect(buyer).openDispute()).to.be.revertedWith("window");
    });

    it("should allow full negotiation rounds", async function () {
      await escrow.connect(buyer).openDispute();

      // Round 1: Buyer offers 70%
      expect(await escrow.isBuyerTurn()).to.be.true;
      await expect(escrow.connect(buyer).submitOffer(70))
        .to.emit(escrow, "OfferSubmitted")
        .withArgs(buyer.address, 1, 70);
      expect(await escrow.disputeRound()).to.equal(1);

      // Round 2: Seller counters with 40%
      expect(await escrow.isBuyerTurn()).to.be.false;
      await expect(escrow.connect(seller).submitCounterOffer(40))
        .to.emit(escrow, "OfferSubmitted")
        .withArgs(seller.address, 2, 40);
      expect(await escrow.disputeRound()).to.equal(2);

      // Round 3: Buyer counters with 60%
      expect(await escrow.isBuyerTurn()).to.be.true;
      await escrow.connect(buyer).submitOffer(60);
      expect(await escrow.disputeRound()).to.equal(3);

      // Round 4: Seller counters with 50%
      await escrow.connect(seller).submitCounterOffer(50);
      expect(await escrow.disputeRound()).to.equal(4);

      // Round 5: Buyer counters with 55%
      await escrow.connect(buyer).submitOffer(55);
      expect(await escrow.disputeRound()).to.equal(5);

      // Round 6: Seller counters with 52%
      await escrow.connect(seller).submitCounterOffer(52);
      expect(await escrow.disputeRound()).to.equal(6);
    });

    it("should settle when seller accepts buyer offer", async function () {
      await escrow.connect(buyer).openDispute();
      await escrow.connect(buyer).submitOffer(60); // Buyer wants 60%

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      const sellerBefore = await ethers.provider.getBalance(seller.address);

      await expect(escrow.connect(seller).acceptBuyerOffer())
        .to.emit(escrow, "OfferAccepted");

      expect(await escrow.status()).to.equal(8); // Settled

      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      const sellerAfter = await ethers.provider.getBalance(seller.address);

      // Seller should get ~40% of orderAmount
      expect(sellerAfter - sellerBefore).to.be.closeTo(
        ethers.parseEther("0.4"),
        ethers.parseEther("0.05")
      );
    });

    it("should settle when buyer accepts seller counter", async function () {
      await escrow.connect(buyer).openDispute();
      await escrow.connect(buyer).submitOffer(70);
      await escrow.connect(seller).submitCounterOffer(30); // Seller offers buyer 30%

      await expect(escrow.connect(buyer).acceptOffer())
        .to.emit(escrow, "OfferAccepted");

      expect(await escrow.status()).to.equal(8); // Settled
    });

    it("should reject wrong turn offers", async function () {
      await escrow.connect(buyer).openDispute();
      
      // Seller can't go first
      await expect(escrow.connect(seller).submitCounterOffer(50)).to.be.revertedWith("invalid");
      
      await escrow.connect(buyer).submitOffer(70);
      
      // Buyer can't go twice
      await expect(escrow.connect(buyer).submitOffer(60)).to.be.revertedWith("invalid");
    });

    it("should track currentOffer correctly", async function () {
      await escrow.connect(buyer).openDispute();
      await escrow.connect(buyer).submitOffer(75);

      const [pct, timestamp, offerer] = await escrow.currentOffer();
      expect(pct).to.equal(75);
      expect(timestamp).to.be.greaterThan(0);
      expect(offerer).to.equal(buyer.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIMEOUT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Dispute - Timeouts", function () {
    beforeEach(async function () {
      escrow = await createTestOrder();
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      await escrow.connect(seller).claimDelivery();
      await escrow.connect(buyer).openDispute();
    });

    it("should auto-accept after first offer timeout (4 days)", async function () {
      await escrow.connect(buyer).submitOffer(80);

      // Can't finalize before timeout
      await expect(escrow.finalizeOffer()).to.be.revertedWith("wait");

      // Advance 4 days
      await advanceTime(4 * DAY + 1);

      await expect(escrow.finalizeOffer())
        .to.emit(escrow, "OfferAutoAccepted")
        .withArgs(1, 80);

      expect(await escrow.status()).to.equal(8); // Settled
    });

    it("should auto-accept after subsequent offer timeout (2 days)", async function () {
      await escrow.connect(buyer).submitOffer(70);
      await escrow.connect(seller).submitCounterOffer(30);

      // Can't finalize before 2 days
      await advanceTime(1 * DAY);
      await expect(escrow.finalizeOffer()).to.be.revertedWith("wait");

      // Advance to 2 days
      await advanceTime(1 * DAY + 1);

      await expect(escrow.finalizeOffer())
        .to.emit(escrow, "OfferAutoAccepted")
        .withArgs(2, 30);
        
      expect(await escrow.status()).to.equal(8); // Settled
    });

    it("should report timeRemaining correctly", async function () {
      await escrow.connect(buyer).submitOffer(70);
      
      const remaining = await escrow.timeRemaining();
      // Should be close to 4 days
      expect(remaining).to.be.closeTo(4 * DAY, 60);

      await advanceTime(2 * DAY);
      const remaining2 = await escrow.timeRemaining();
      expect(remaining2).to.be.closeTo(2 * DAY, 60);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ARBITER TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Arbiter Review", function () {
    beforeEach(async function () {
      escrow = await createTestOrder();
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      await escrow.connect(seller).claimDelivery();
      await escrow.connect(buyer).openDispute();

      // Go through all 6 rounds
      await escrow.connect(buyer).submitOffer(90);   // Round 1
      await escrow.connect(seller).submitCounterOffer(10); // Round 2
      await escrow.connect(buyer).submitOffer(80);   // Round 3
      await escrow.connect(seller).submitCounterOffer(20); // Round 4
      await escrow.connect(buyer).submitOffer(70);   // Round 5
      await escrow.connect(seller).submitCounterOffer(30); // Round 6
    });

    it("should escalate to arbiter after buyer rejects final offer", async function () {
      await expect(escrow.connect(buyer).rejectFinalOffer())
        .to.emit(escrow, "ArbiterReviewStarted");
      expect(await escrow.status()).to.equal(7); // ArbiterReview
    });

    it("should reject early rejectFinalOffer", async function () {
      // Create fresh escrow and don't complete all rounds
      const escrow2 = await createTestOrder();
      await escrow2.connect(seller).claim();
      await escrow2.connect(seller).markShipped();
      await escrow2.connect(seller).claimDelivery();
      await escrow2.connect(buyer).openDispute();
      await escrow2.connect(buyer).submitOffer(70);
      
      await expect(escrow2.connect(buyer).rejectFinalOffer()).to.be.revertedWith("!final");
    });

    it("should allow arbiter to decide with 10% tax", async function () {
      await escrow.connect(buyer).rejectFinalOffer();

      const platformBefore = await ethers.provider.getBalance(platform.address);
      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      const sellerBefore = await ethers.provider.getBalance(seller.address);

      await expect(escrow.connect(arbiter).arbiterDecide(50))
        .to.emit(escrow, "ArbiterDecision")
        .withArgs(50, 50);

      expect(await escrow.status()).to.equal(8); // Settled

      const platformAfter = await ethers.provider.getBalance(platform.address);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      const sellerAfter = await ethers.provider.getBalance(seller.address);
      
      // Platform should get 0.5% fee + 10% arbiter tax ≈ 0.105 ETH
      expect(platformAfter - platformBefore).to.be.closeTo(
        ethers.parseEther("0.105"),
        ethers.parseEther("0.01")
      );

      // Each party gets 45% of 90% (after tax) = 40.5% each
      // Buyer also gets cushion remainder
    });

    it("should allow arbiter to give 100% to buyer", async function () {
      await escrow.connect(buyer).rejectFinalOffer();

      await escrow.connect(arbiter).arbiterDecide(100);
      expect(await escrow.status()).to.equal(8);
    });

    it("should allow arbiter to give 100% to seller", async function () {
      await escrow.connect(buyer).rejectFinalOffer();

      await escrow.connect(arbiter).arbiterDecide(0);
      expect(await escrow.status()).to.equal(8);
    });

    it("should auto-refund buyer if arbiter times out (30 days)", async function () {
      await escrow.connect(buyer).rejectFinalOffer();

      // Can't finalize before timeout
      await expect(escrow.finalizeArbiter()).to.be.revertedWith("wait");

      // Advance 30 days
      await advanceTime(30 * DAY + 1);

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      
      await escrow.finalizeArbiter();
      
      expect(await escrow.status()).to.equal(8); // Settled

      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      // Buyer should get 90% of orderAmount (100% - 10% tax) + cushion
      expect(buyerAfter - buyerBefore).to.be.closeTo(
        ethers.parseEther("0.9"),
        ethers.parseEther("0.05")
      );
    });

    it("should reject arbiter decision from non-arbiter", async function () {
      await escrow.connect(buyer).rejectFinalOffer();
      await expect(escrow.connect(other).arbiterDecide(50)).to.be.revertedWith("!arbiter");
      await expect(escrow.connect(buyer).arbiterDecide(50)).to.be.revertedWith("!arbiter");
      await expect(escrow.connect(seller).arbiterDecide(50)).to.be.revertedWith("!arbiter");
    });

    it("should reject invalid arbiter percentage", async function () {
      await escrow.connect(buyer).rejectFinalOffer();
      await expect(escrow.connect(arbiter).arbiterDecide(101)).to.be.revertedWith("pct");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESS CONTROL TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Access Control", function () {
    beforeEach(async function () {
      escrow = await createTestOrder();
    });

    it("should prevent buyer from claiming own order", async function () {
      await expect(escrow.connect(buyer).claim()).to.be.revertedWith("buyer");
    });

    it("should prevent non-seller from shipping", async function () {
      await escrow.connect(seller).claim();
      await expect(escrow.connect(other).markShipped()).to.be.revertedWith("!seller");
      await expect(escrow.connect(buyer).markShipped()).to.be.revertedWith("!seller");
    });

    it("should prevent non-seller from claiming delivery", async function () {
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      await expect(escrow.connect(other).claimDelivery()).to.be.revertedWith("!seller");
    });

    it("should prevent double initialization", async function () {
      await expect(
        escrow.initialize(
          other.address,
          ethers.randomBytes(32),
          arbiter.address,
          platform.address,
          ethers.ZeroAddress,
          { value: ethers.parseEther("1") }
        )
      ).to.be.revertedWith("init");
    });

    it("should reject direct ETH transfers", async function () {
      await expect(
        buyer.sendTransaction({ to: await escrow.getAddress(), value: ethers.parseEther("1") })
      ).to.be.revertedWith("factory");
    });

    it("should prevent wrong status transitions", async function () {
      // Can't ship before claim
      await expect(escrow.connect(seller).markShipped()).to.be.revertedWith("!seller");
      
      await escrow.connect(seller).claim();
      
      // Can't claim delivery before ship
      await expect(escrow.connect(seller).claimDelivery()).to.be.revertedWith("!status");
      
      await escrow.connect(seller).markShipped();
      
      // Can't finalize before arrived + 7 days
      await expect(escrow.finalizeOrder()).to.be.revertedWith("!status");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GAS REIMBURSEMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Gas Reimbursement", function () {
    beforeEach(async function () {
      escrow = await createTestOrder();
    });

    it("should reimburse seller gas on claim", async function () {
      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const tx = await escrow.connect(seller).claim();
      const receipt = await tx.wait();
      const sellerAfter = await ethers.provider.getBalance(seller.address);

      // Seller should have been reimbursed (net cost close to 0)
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const netCost = sellerBefore - sellerAfter;
      
      // Net cost should be much less than actual gas cost due to reimbursement
      expect(netCost).to.be.lessThan(gasCost);
    });

    it("should track gasUsed correctly", async function () {
      await escrow.connect(seller).claim();
      const gasUsed1 = await escrow.gasUsed();
      expect(gasUsed1).to.be.greaterThan(0);

      await escrow.connect(seller).markShipped();
      const gasUsed2 = await escrow.gasUsed();
      expect(gasUsed2).to.be.greaterThan(gasUsed1);

      await escrow.connect(seller).claimDelivery();
      const gasUsed3 = await escrow.gasUsed();
      expect(gasUsed3).to.be.greaterThan(gasUsed2);
    });

    it("should emit GasReimbursed events", async function () {
      await expect(escrow.connect(seller).claim())
        .to.emit(escrow, "GasReimbursed");
    });

    it("should not reimburse more than available cushion", async function () {
      const gasCushion = await escrow.gasCushion();
      
      // Do many operations to potentially exhaust cushion
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      await escrow.connect(seller).claimDelivery();
      await escrow.connect(buyer).openDispute();
      await escrow.connect(buyer).submitOffer(70);
      await escrow.connect(seller).submitCounterOffer(30);
      
      const gasUsed = await escrow.gasUsed();
      // gasUsed should never exceed gasCushion
      expect(gasUsed).to.be.lessThanOrEqual(gasCushion);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Edge Cases", function () {
    it("should handle 0% buyer offer (all to seller)", async function () {
      escrow = await createTestOrder();
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      await escrow.connect(seller).claimDelivery();
      await escrow.connect(buyer).openDispute();
      
      await escrow.connect(buyer).submitOffer(0); // Buyer offers 0% (all to seller)
      
      const sellerBefore = await ethers.provider.getBalance(seller.address);
      await escrow.connect(seller).acceptBuyerOffer();
      const sellerAfter = await ethers.provider.getBalance(seller.address);
      
      expect(await escrow.status()).to.equal(8);
      // Seller should get ~100% of orderAmount
      expect(sellerAfter - sellerBefore).to.be.closeTo(
        ethers.parseEther("1"),
        ethers.parseEther("0.05")
      );
    });

    it("should handle 100% buyer offer (all to buyer)", async function () {
      escrow = await createTestOrder();
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      await escrow.connect(seller).claimDelivery();
      await escrow.connect(buyer).openDispute();
      
      await escrow.connect(buyer).submitOffer(100); // Buyer wants 100%
      
      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await escrow.connect(seller).acceptBuyerOffer();
      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      
      expect(await escrow.status()).to.equal(8);
      // Buyer should get ~100% of orderAmount + cushion
      expect(buyerAfter - buyerBefore).to.be.closeTo(
        ethers.parseEther("1"),
        ethers.parseEther("0.05")
      );
    });

    it("should reject offer > 100%", async function () {
      escrow = await createTestOrder();
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      await escrow.connect(seller).claimDelivery();
      await escrow.connect(buyer).openDispute();
      
      await expect(escrow.connect(buyer).submitOffer(101)).to.be.revertedWith("invalid");
    });

    it("should handle minimum order amount", async function () {
      const minEscrow = await createTestOrder("0.001025"); // Just above minimum
      expect(await minEscrow.status()).to.equal(0);
    });

    it("should handle large order amounts", async function () {
      const largeEscrow = await createTestOrder("100.25"); // 100 ETH order
      const orderAmount = await largeEscrow.orderAmount();
      expect(orderAmount).to.be.closeTo(ethers.parseEther("100"), ethers.parseEther("0.1"));
    });

    it("should handle rapid status transitions", async function () {
      escrow = await createTestOrder();
      
      // Rapid fire all transitions
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      await escrow.connect(seller).claimDelivery();
      
      expect(await escrow.status()).to.equal(3); // Arrived
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELIVERY CLAIM DELAY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Delivery Claim Delay", function () {
    it("should allow immediate claimDelivery when no oracle", async function () {
      escrow = await createTestOrder();
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      
      // Should work immediately since no oracle is set
      await escrow.connect(seller).claimDelivery();
      expect(await escrow.status()).to.equal(3);
    });

    it("should require 14 day wait when oracle is set", async function () {
      // Set oracle on factory first
      await factory.connect(deployer).setShippingOracle(other.address);
      
      // Create new order with oracle
      escrow = await createTestOrder();
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      
      // Should fail - need to wait 14 days
      await expect(escrow.connect(seller).claimDelivery()).to.be.revertedWith("wait");
      
      // Advance 14 days
      await advanceTime(14 * DAY + 1);
      
      // Now should work
      await escrow.connect(seller).claimDelivery();
      expect(await escrow.status()).to.equal(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW FUNCTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("View Functions", function () {
    beforeEach(async function () {
      escrow = await createTestOrder();
    });

    it("should return correct timeRemaining for arrived status", async function () {
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      await escrow.connect(seller).claimDelivery();
      
      const remaining = await escrow.timeRemaining();
      expect(remaining).to.be.closeTo(7 * DAY, 60);
    });

    it("should return 0 timeRemaining when expired", async function () {
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      await escrow.connect(seller).claimDelivery();
      
      await advanceTime(7 * DAY + 1);
      
      const remaining = await escrow.timeRemaining();
      expect(remaining).to.equal(0);
    });

    it("should return correct isBuyerTurn values", async function () {
      await escrow.connect(seller).claim();
      await escrow.connect(seller).markShipped();
      await escrow.connect(seller).claimDelivery();
      await escrow.connect(buyer).openDispute();
      
      // Round 0 - buyer's turn
      expect(await escrow.isBuyerTurn()).to.be.true;
      
      await escrow.connect(buyer).submitOffer(70); // Round 1
      expect(await escrow.isBuyerTurn()).to.be.false;
      
      await escrow.connect(seller).submitCounterOffer(30); // Round 2
      expect(await escrow.isBuyerTurn()).to.be.true;
    });
  });
});

