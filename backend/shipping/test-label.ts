/**
 * Test script to create a shipping label using mock data
 * 
 * Usage:
 *   cd backend
 *   npx ts-node --esm shipping/test-label.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { Shippo } from 'shippo';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.back') });

// Check for API key
if (!process.env.SHIPPO_KEY) {
  console.error('❌ SHIPPO_KEY not found in .env.back');
  process.exit(1);
}

console.log('✅ SHIPPO_KEY loaded');
console.log(`   Key prefix: ${process.env.SHIPPO_KEY.slice(0, 20)}...`);

// Load mock data
const mockDataPath = path.join(__dirname, 'mockShippingData.json');
const mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));

// Test sender address (Shippo's test address)
const testSenderAddress = {
  name: "FilaMint Seller",
  street1: "215 Clayton St",
  city: "San Francisco",
  state: "CA",
  zip: "94117",
  country: "US",
  phone: "4151234567",
};

console.log('\n📦 Shipping Data:');
console.log(`   From: ${testSenderAddress.name}`);
console.log(`   From Address: ${testSenderAddress.street1}, ${testSenderAddress.city}, ${testSenderAddress.state} ${testSenderAddress.zip}`);
console.log(`   To: ${mockData.address.name}`);
console.log(`   To Address: ${mockData.address.street1}, ${mockData.address.city}, ${mockData.address.state} ${mockData.address.zip}`);
console.log(`   Parcel: ${mockData.parcel.length}x${mockData.parcel.width}x${mockData.parcel.height} in, ${mockData.parcel.weight} oz`);

// Initialize Shippo client
const shippo = new Shippo({ apiKeyHeader: process.env.SHIPPO_KEY });

async function createTestLabel() {
  console.log('\n🚀 Creating shipment...');

  try {
    // Create shipment using Shippo SDK
    const shipment = await shippo.shipments.create({
      addressFrom: testSenderAddress,
      addressTo: {
        name: mockData.address.name,
        street1: mockData.address.street1,
        city: mockData.address.city,
        state: mockData.address.state,
        zip: mockData.address.zip,
        country: mockData.address.country,
        phone: mockData.address.phone,
      },
      parcels: [{
        length: String(mockData.parcel.length),
        width: String(mockData.parcel.width),
        height: String(mockData.parcel.height),
        distanceUnit: 'in',
        weight: String(mockData.parcel.weight),
        massUnit: 'oz',
      }],
      async: false,
    });

    console.log('✅ Shipment created!');
    console.log(`   Shipment ID: ${shipment.objectId}`);
    console.log(`   Rates available: ${shipment.rates?.length || 0}`);

    if (!shipment.rates || shipment.rates.length === 0) {
      console.error('❌ No rates available');
      return;
    }

    // Show available rates
    console.log('\n📋 Available Rates:');
    shipment.rates.forEach((rate, i) => {
      console.log(`   ${i + 1}. ${rate.provider} ${rate.servicelevel?.name} - $${rate.amount} (${rate.estimatedDays || '?'} days)`);
    });

    // Select cheapest USPS rate
    const uspsRates = shipment.rates.filter(r => 
      r.provider?.toLowerCase().includes('usps')
    );
    
    const sortedRates = (uspsRates.length > 0 ? uspsRates : shipment.rates)
      .sort((a, b) => parseFloat(a.amount || '999') - parseFloat(b.amount || '999'));
    
    const selectedRate = sortedRates[0];
    console.log(`\n🎯 Selected: ${selectedRate.provider} ${selectedRate.servicelevel?.name} - $${selectedRate.amount}`);

    // Purchase label
    console.log('\n💳 Purchasing label...');
    const transaction = await shippo.transactions.create({
      rate: selectedRate.objectId!,
      labelFileType: 'PDF',
      async: false,
    });

    if (transaction.status !== 'SUCCESS') {
      console.error('❌ Label purchase failed:');
      console.error(transaction.messages);
      return;
    }

    console.log('✅ Label purchased!');
    console.log(`   Transaction ID: ${transaction.objectId}`);
    console.log(`   Tracking Number: ${transaction.trackingNumber}`);
    console.log(`   Label URL: ${transaction.labelUrl}`);

    // Download label
    const labelsDir = path.join(__dirname, '..', 'labels');
    if (!fs.existsSync(labelsDir)) {
      fs.mkdirSync(labelsDir, { recursive: true });
    }

    const labelPath = path.join(labelsDir, `test-${transaction.trackingNumber}.pdf`);
    console.log(`\n📥 Downloading label to: ${labelPath}`);

    const response = await fetch(transaction.labelUrl!);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(labelPath, buffer);

    console.log('✅ Label saved!');
    console.log('\n════════════════════════════════════════');
    console.log('  LABEL CREATED SUCCESSFULLY');
    console.log('════════════════════════════════════════');
    console.log(`  Tracking: ${transaction.trackingNumber}`);
    console.log(`  Cost: $${selectedRate.amount}`);
    console.log(`  File: ${labelPath}`);
    console.log('════════════════════════════════════════\n');

  } catch (err: unknown) {
    const error = err as Error & { detail?: unknown };
    console.error('\n❌ Error:', error.message || err);
    if (error.detail) {
      console.error('   Detail:', JSON.stringify(error.detail, null, 2));
    }
  }
}

createTestLabel();
