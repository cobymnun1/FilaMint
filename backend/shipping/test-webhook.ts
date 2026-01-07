/**
 * Test script to simulate Shippo webhooks and verify oracle updates
 * 
 * Usage:
 *   cd backend
 *   npx tsx shipping/test-webhook.ts
 * 
 * Prerequisites:
 *   - Backend server running on port 3001
 *   - Hardhat node running with deployed contracts
 *   - ORACLE_ADDRESS and BACKEND_PRIVATE_KEY set in .env.back
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_URL = 'http://localhost:3001';
const TRACKING_FILE = path.join(__dirname, 'tracking.json');

// Generate unique IDs for each test run
const timestamp = Date.now();
const TEST_ORDER_ID = '0x' + timestamp.toString(16).padStart(64, '0');
const TEST_TRACKING_NUMBER = `920019${timestamp.toString().slice(-13)}`;

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SHIPPO WEBHOOK SIMULATION TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Check if server is running
  console.log('1️⃣  Checking server health...');
  try {
    const health = await fetch(`${SERVER_URL}/health`);
    const data = await health.json();
    console.log(`   ✅ Server is running: ${JSON.stringify(data)}\n`);
  } catch (err) {
    console.error('   ❌ Server not running! Start it with: npm run dev');
    process.exit(1);
  }

  // Step 2: Create a fake tracking record (simulating label creation)
  console.log('2️⃣  Creating test tracking record...');
  const testTrackingNumber = TEST_TRACKING_NUMBER;
  
  // Manually add to tracking.json
  let tracking: Record<string, unknown> = {};
  try {
    if (fs.existsSync(TRACKING_FILE)) {
      tracking = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf-8'));
    }
  } catch {}
  
  tracking[TEST_ORDER_ID] = {
    orderId: TEST_ORDER_ID,
    trackingNumber: testTrackingNumber,
    carrier: 'usps',
    service: 'Ground Advantage',
    labelUrl: 'https://example.com/label.pdf',
    localLabelPath: '/labels/test.pdf',
    status: 'PRE_TRANSIT',
    shippedAt: null,
    deliveredAt: null,
    lastWebhook: null,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(TRACKING_FILE, JSON.stringify(tracking, null, 2));
  console.log(`   ✅ Added tracking record for order: ${TEST_ORDER_ID.slice(0, 20)}...`);
  console.log(`   📦 Tracking number: ${testTrackingNumber}\n`);

  // Step 3: Check oracle status BEFORE
  console.log('3️⃣  Checking oracle status BEFORE webhook...');
  try {
    const before = await fetch(`${SERVER_URL}/api/oracle/status/${TEST_ORDER_ID}`);
    const beforeData = await before.json();
    console.log(`   📊 Oracle state: ${JSON.stringify(beforeData)}\n`);
  } catch (err) {
    console.log(`   ⚠️  Oracle not configured (this is OK for testing webhooks)\n`);
  }

  // Step 4: Simulate TRANSIT webhook
  console.log('4️⃣  Simulating TRANSIT webhook...');
  const transitPayload = {
    event: 'track_updated',
    data: {
      tracking_number: testTrackingNumber,
      carrier: 'usps',
      tracking_status: {
        status: 'TRANSIT',
        status_details: 'Package in transit',
        status_date: new Date().toISOString(),
        location: {
          city: 'Los Angeles',
          state: 'CA',
          country: 'US',
        },
      },
    },
  };

  try {
    const transitRes = await fetch(`${SERVER_URL}/webhook/shippo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transitPayload),
    });
    const transitData = await transitRes.json();
    console.log(`   📬 Webhook response: ${JSON.stringify(transitData)}\n`);
  } catch (err) {
    console.error(`   ❌ Webhook failed:`, err);
  }

  // Step 5: Check tracking record after TRANSIT
  console.log('5️⃣  Checking tracking record after TRANSIT...');
  const afterTransit = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf-8'));
  const record = afterTransit[TEST_ORDER_ID];
  console.log(`   Status: ${record.status}`);
  console.log(`   ShippedAt: ${record.shippedAt}`);
  console.log(`   LastWebhook: ${record.lastWebhook}\n`);

  // Step 6: Simulate DELIVERED webhook
  console.log('6️⃣  Simulating DELIVERED webhook...');
  const deliveredPayload = {
    event: 'track_updated',
    data: {
      tracking_number: testTrackingNumber,
      carrier: 'usps',
      tracking_status: {
        status: 'DELIVERED',
        status_details: 'Delivered to mailbox',
        status_date: new Date().toISOString(),
        location: {
          city: 'Redondo Beach',
          state: 'CA',
          country: 'US',
        },
      },
    },
  };

  try {
    const deliveredRes = await fetch(`${SERVER_URL}/webhook/shippo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deliveredPayload),
    });
    const deliveredData = await deliveredRes.json();
    console.log(`   📬 Webhook response: ${JSON.stringify(deliveredData)}\n`);
  } catch (err) {
    console.error(`   ❌ Webhook failed:`, err);
  }

  // Step 7: Check tracking record after DELIVERED
  console.log('7️⃣  Checking tracking record after DELIVERED...');
  const afterDelivered = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf-8'));
  const finalRecord = afterDelivered[TEST_ORDER_ID];
  console.log(`   Status: ${finalRecord.status}`);
  console.log(`   ShippedAt: ${finalRecord.shippedAt}`);
  console.log(`   DeliveredAt: ${finalRecord.deliveredAt}`);
  console.log(`   LastWebhook: ${finalRecord.lastWebhook}\n`);

  // Step 8: Check oracle status AFTER
  console.log('8️⃣  Checking oracle status AFTER webhooks...');
  try {
    const after = await fetch(`${SERVER_URL}/api/oracle/status/${TEST_ORDER_ID}`);
    const afterData = await after.json();
    console.log(`   📊 Oracle state: ${JSON.stringify(afterData)}\n`);
  } catch (err) {
    console.log(`   ⚠️  Oracle check failed (may not be configured)\n`);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(console.error);

