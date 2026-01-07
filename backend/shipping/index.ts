import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Shippo } from 'shippo';
import { Address, Parcel, Label, LabelRequest } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Shippo client
const shippo = new Shippo({ apiKeyHeader: process.env.SHIPPO_KEY || '' });

// Paths
const LABELS_DIR = path.join(__dirname, '..', 'labels');
const TRACKING_FILE = path.join(__dirname, 'tracking.json');

// Ensure labels directory exists
if (!fs.existsSync(LABELS_DIR)) {
  fs.mkdirSync(LABELS_DIR, { recursive: true });
}

// Tracking record interface
export interface TrackingRecord {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  service: string;
  labelUrl: string;
  localLabelPath: string;
  status: string;
  shippedAt: number | null;
  deliveredAt: number | null;
  lastWebhook: string | null;
  createdAt: string;
}

// Load tracking database
function loadTracking(): Record<string, TrackingRecord> {
  try {
    if (fs.existsSync(TRACKING_FILE)) {
      return JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error loading tracking file:', err);
  }
  return {};
}

// Save tracking database
function saveTracking(data: Record<string, TrackingRecord>): void {
  fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
}

// Get tracking record by orderId
export function getTrackingByOrderId(orderId: string): TrackingRecord | null {
  const tracking = loadTracking();
  return tracking[orderId] || null;
}

// Get tracking record by tracking number
export function getTrackingByNumber(trackingNumber: string): TrackingRecord | null {
  const tracking = loadTracking();
  return Object.values(tracking).find(r => r.trackingNumber === trackingNumber) || null;
}

// Update tracking record (creates if not exists)
export function updateTracking(orderId: string, updates: Partial<TrackingRecord>): TrackingRecord {
  const tracking = loadTracking();
  
  // Create default record if doesn't exist
  if (!tracking[orderId]) {
    tracking[orderId] = {
      orderId,
      trackingNumber: updates.trackingNumber || '',
      carrier: updates.carrier || 'usps',
      service: updates.service || '',
      labelUrl: updates.labelUrl || '',
      localLabelPath: updates.localLabelPath || '',
      status: updates.status || 'UNKNOWN',
      shippedAt: null,
      deliveredAt: null,
      lastWebhook: null,
      createdAt: new Date().toISOString(),
    };
  }
  
  tracking[orderId] = { ...tracking[orderId], ...updates };
  saveTracking(tracking);
  return tracking[orderId];
}

// Convert Address to Shippo format
function toShippoAddress(addr: Address) {
  return {
    name: addr.name,
    street1: addr.street1,
    street2: addr.street2 || '',
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    country: addr.country,
    phone: addr.phone || '',
  };
}

// Convert Parcel to Shippo format
function toShippoParcel(parcel: Parcel) {
  return {
    length: String(parcel.length),
    width: String(parcel.width),
    height: String(parcel.height),
    distanceUnit: 'in' as const,
    weight: String(parcel.weight),
    massUnit: 'oz' as const,
  };
}

/**
 * Create a shipping label using Shippo
 * @param orderId - The escrow order ID (bytes32 hex string)
 * @param labelRequest - From address (seller), to address (buyer), and parcel dimensions
 * @returns Label info including tracking number and label URL
 */
export async function createLabel(
  orderId: string,
  labelRequest: LabelRequest
): Promise<Label> {
  const { fromAddress, toAddress, parcel } = labelRequest;

  // Create shipment using Shippo SDK
  const shipment = await shippo.shipments.create({
    addressFrom: toShippoAddress(fromAddress),
    addressTo: toShippoAddress(toAddress),
    parcels: [toShippoParcel(parcel)],
    async: false,
  });

  if (!shipment.rates || shipment.rates.length === 0) {
    throw new Error('No shipping rates available for this shipment');
  }

  // Find cheapest USPS rate, fallback to cheapest overall
  const uspsRates = shipment.rates.filter(r => 
    r.provider?.toLowerCase().includes('usps')
  );
  
  const sortedRates = (uspsRates.length > 0 ? uspsRates : shipment.rates)
    .sort((a, b) => parseFloat(a.amount || '999') - parseFloat(b.amount || '999'));
  
  const selectedRate = sortedRates[0];

  if (!selectedRate.objectId) {
    throw new Error('Selected rate has no object ID');
  }

  // Purchase the label
  const transaction = await shippo.transactions.create({
    rate: selectedRate.objectId,
    labelFileType: 'PDF',
    async: false,
  });

  if (transaction.status !== 'SUCCESS') {
    throw new Error(`Label purchase failed: ${transaction.messages?.map(m => m.text).join(', ')}`);
  }

  if (!transaction.trackingNumber || !transaction.labelUrl) {
    throw new Error('Transaction missing tracking number or label URL');
  }

  // Download and save label locally
  const labelFileName = `${orderId.slice(0, 18)}-${transaction.trackingNumber}.pdf`;
  const localLabelPath = path.join(LABELS_DIR, labelFileName);
  
  try {
    const response = await fetch(transaction.labelUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localLabelPath, buffer);
  } catch (err) {
    console.error('Failed to download label PDF:', err);
  }

  // Create label result
  const label: Label = {
    id: transaction.objectId || '',
    tracking_code: transaction.trackingNumber,
    tracking_url: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${transaction.trackingNumber}`,
    label_url: transaction.labelUrl,
    carrier: selectedRate.provider || 'unknown',
    service: selectedRate.servicelevel?.name || 'unknown',
    rate: selectedRate.amount || '0',
  };

  // Save to tracking database
  const tracking = loadTracking();
  tracking[orderId] = {
    orderId,
    trackingNumber: transaction.trackingNumber,
    carrier: label.carrier,
    service: label.service,
    labelUrl: transaction.labelUrl,
    localLabelPath: `/labels/${labelFileName}`,
    status: 'PRE_TRANSIT',
    shippedAt: null,
    deliveredAt: null,
    lastWebhook: null,
    createdAt: new Date().toISOString(),
  };
  saveTracking(tracking);

  return label;
}

/**
 * Get shipping rates without purchasing
 * @param labelRequest - From/to addresses and parcel info
 * @returns Array of available rates
 */
export async function getRates(labelRequest: LabelRequest): Promise<Array<{
  carrier: string;
  service: string;
  amount: string;
  estimatedDays: number | null;
  rateId: string;
}>> {
  const { fromAddress, toAddress, parcel } = labelRequest;
  
  const shipment = await shippo.shipments.create({
    addressFrom: toShippoAddress(fromAddress),
    addressTo: toShippoAddress(toAddress),
    parcels: [toShippoParcel(parcel)],
    async: false,
  });

  if (!shipment.rates) {
    return [];
  }

  return shipment.rates.map(rate => ({
    carrier: rate.provider || 'unknown',
    service: rate.servicelevel?.name || 'unknown',
    amount: rate.amount || '0',
    estimatedDays: rate.estimatedDays || null,
    rateId: rate.objectId || '',
  }));
}

/**
 * Get tracking info from Shippo
 * @param carrier - Carrier name (e.g., 'usps')
 * @param trackingNumber - The tracking number
 */
export async function getTrackingStatus(carrier: string, trackingNumber: string) {
  const tracking = await shippo.trackingStatus.get(carrier.toLowerCase(), trackingNumber);
  return {
    status: tracking.trackingStatus?.status || 'UNKNOWN',
    statusDetails: tracking.trackingStatus?.statusDetails || '',
    statusDate: tracking.trackingStatus?.statusDate || null,
    location: tracking.trackingStatus?.location ? {
      city: tracking.trackingStatus.location.city,
      state: tracking.trackingStatus.location.state,
      country: tracking.trackingStatus.location.country,
    } : null,
    eta: tracking.eta || null,
    trackingHistory: tracking.trackingHistory?.map(h => ({
      status: h.status,
      statusDetails: h.statusDetails,
      statusDate: h.statusDate,
      location: h.location ? {
        city: h.location.city,
        state: h.location.state,
      } : null,
    })) || [],
  };
}

// Export for testing
export { loadTracking, saveTracking, LABELS_DIR, TRACKING_FILE };
