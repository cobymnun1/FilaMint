import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env.back
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.back') });

import {
  createLabel,
  getRates,
  getTrackingStatus,
  getTrackingByOrderId,
  getTrackingByNumber,
  updateTracking,
  LABELS_DIR,
} from './shipping/index.js';

import {
  initOracle,
  registerEscrowWithOracle,
  markShippedOnChain,
  markDeliveredOnChain,
  getShipmentRecord,
  estimateGasCosts,
  getWalletBalance,
} from './shipping/oracle.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve label PDFs
app.use('/labels', express.static(LABELS_DIR));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ═══════════════════════════════════════════════════════════════════════════
// LABEL ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/labels/create
 * Create a shipping label for an order
 * Body: { orderId: string, fromAddress: Address, toAddress: Address, parcel: Parcel }
 */
app.post('/api/labels/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId, fromAddress, toAddress, parcel } = req.body;

    if (!orderId || !fromAddress || !toAddress || !parcel) {
      res.status(400).json({ error: 'Missing required fields: orderId, fromAddress, toAddress, parcel' });
      return;
    }

    // Validate orderId format (should be bytes32 hex)
    if (!orderId.startsWith('0x') || orderId.length !== 66) {
      res.status(400).json({ error: 'Invalid orderId format. Expected 32-byte hex string.' });
      return;
    }

    const label = await createLabel(orderId, { fromAddress, toAddress, parcel });

    res.json({
      success: true,
      label: {
        trackingNumber: label.tracking_code,
        trackingUrl: label.tracking_url,
        labelUrl: label.label_url,
        carrier: label.carrier,
        service: label.service,
        rate: label.rate,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/labels/rates
 * Get shipping rates without purchasing
 * Body: { fromAddress: Address, toAddress: Address, parcel: Parcel }
 */
app.post('/api/labels/rates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fromAddress, toAddress, parcel } = req.body;

    if (!fromAddress || !toAddress || !parcel) {
      res.status(400).json({ error: 'Missing required fields: fromAddress, toAddress, parcel' });
      return;
    }

    const rates = await getRates({ fromAddress, toAddress, parcel });

    res.json({ success: true, rates });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/labels/:orderId
 * Get label info for an order
 */
app.get('/api/labels/:orderId', (req: Request, res: Response) => {
  const { orderId } = req.params;

  const tracking = getTrackingByOrderId(orderId);
  if (!tracking) {
    res.status(404).json({ error: 'Label not found for this order' });
    return;
  }

  res.json({ success: true, tracking });
});

// ═══════════════════════════════════════════════════════════════════════════
// TRACKING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/tracking/create
 * Create a tracking record (for testing/simulation)
 * Body: { orderId, trackingNumber, carrier, status, labelUrl }
 */
app.post('/api/tracking/create', (req: Request, res: Response) => {
  const { orderId, trackingNumber, carrier, status, labelUrl } = req.body;

  if (!orderId || !trackingNumber) {
    res.status(400).json({ error: 'Missing required fields: orderId, trackingNumber' });
    return;
  }

  updateTracking(orderId, {
    orderId,
    trackingNumber,
    carrier: carrier || 'usps',
    status: status || 'PRE_TRANSIT',
    labelUrl: labelUrl || '',
  });

  console.log(`Created tracking record: ${trackingNumber} -> ${orderId}`);

  res.json({ success: true, trackingNumber, orderId });
});

/**
 * GET /api/tracking/:trackingNumber
 * Get current tracking status from Shippo
 */
app.get('/api/tracking/:trackingNumber', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { trackingNumber } = req.params;
    const carrier = (req.query.carrier as string) || 'usps';

    // First check our local database
    const localRecord = getTrackingByNumber(trackingNumber);

    // Then get live status from Shippo
    const liveStatus = await getTrackingStatus(carrier, trackingNumber);

    res.json({
      success: true,
      trackingNumber,
      localRecord,
      liveStatus,
    });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SHIPPO WEBHOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Shippo tracking status values:
 * - UNKNOWN: Initial state
 * - PRE_TRANSIT: Label created, not yet picked up
 * - TRANSIT: In transit
 * - DELIVERED: Delivered
 * - RETURNED: Returned to sender
 * - FAILURE: Delivery failed
 */

interface ShippoWebhookPayload {
  event: string;
  data: {
    tracking_number: string;
    carrier: string;
    tracking_status: {
      status: string;
      status_details: string;
      status_date: string;
      location?: {
        city?: string;
        state?: string;
        country?: string;
      };
    };
    eta?: string;
  };
}

/**
 * POST /webhook/shippo
 * Receive tracking updates from Shippo
 */
app.post('/webhook/shippo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body as ShippoWebhookPayload;
    
    console.log('Received Shippo webhook:', JSON.stringify(payload, null, 2));

    // Validate webhook payload
    if (!payload.data?.tracking_number || !payload.data?.tracking_status) {
      res.status(400).json({ error: 'Invalid webhook payload' });
      return;
    }

    const { tracking_number, tracking_status } = payload.data;
    const status = tracking_status.status;
    const statusDate = tracking_status.status_date;

    // Find the order by tracking number
    const record = getTrackingByNumber(tracking_number);
    if (!record) {
      console.log(`No order found for tracking number: ${tracking_number}`);
      res.status(200).json({ received: true, processed: false, reason: 'unknown tracking number' });
      return;
    }

    const orderId = record.orderId;
    console.log(`Processing webhook for order ${orderId}, status: ${status}`);

    // Update local tracking record
    const updates: Partial<typeof record> = {
      status,
      lastWebhook: new Date().toISOString(),
    };

    // Handle status transitions
    let oracleUpdated = false;

    if (status === 'TRANSIT' && !record.shippedAt) {
      // Package is in transit - mark as shipped on-chain
      try {
        await markShippedOnChain(orderId);
        updates.shippedAt = Math.floor(new Date(statusDate).getTime() / 1000);
        oracleUpdated = true;
        console.log(`Order ${orderId} marked as SHIPPED on-chain`);
      } catch (err) {
        console.error(`Failed to mark shipped on-chain:`, err);
      }
    }

    if (status === 'DELIVERED' && !record.deliveredAt) {
      // Package delivered - mark as delivered on-chain
      const deliveryTimestamp = Math.floor(new Date(statusDate).getTime() / 1000);
      try {
        await markDeliveredOnChain(orderId, deliveryTimestamp);
        updates.deliveredAt = deliveryTimestamp;
        oracleUpdated = true;
        console.log(`Order ${orderId} marked as DELIVERED on-chain`);
      } catch (err) {
        console.error(`Failed to mark delivered on-chain:`, err);
      }
    }

    // Save updates to local database
    updateTracking(orderId, updates);

    res.json({
      received: true,
      processed: true,
      orderId,
      status,
      oracleUpdated,
    });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ORACLE ENDPOINTS (for debugging/admin)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/oracle/status/:orderId
 * Get on-chain shipment status
 */
app.get('/api/oracle/status/:orderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const record = await getShipmentRecord(orderId);
    res.json({ success: true, orderId, ...record });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/oracle/gas-estimate
 * Get estimated gas costs for oracle operations
 */
app.get('/api/oracle/gas-estimate', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const estimates = await estimateGasCosts();
    res.json({ success: true, estimates });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/oracle/wallet
 * Get backend wallet info
 */
app.get('/api/oracle/wallet', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const balance = await getWalletBalance();
    res.json({ success: true, balance });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/oracle/ship/:orderId
 * Manually mark order as shipped (admin/testing)
 */
app.post('/api/oracle/ship/:orderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const receipt = await markShippedOnChain(orderId);
    res.json({ success: true, txHash: receipt.hash });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/oracle/deliver/:orderId
 * Manually mark order as delivered (admin/testing)
 */
app.post('/api/oracle/deliver/:orderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const timestamp = req.body.timestamp || 0;
    const receipt = await markDeliveredOnChain(orderId, timestamp);
    res.json({ success: true, txHash: receipt.hash });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/oracle/register
 * Register an escrow contract with the oracle
 * Body: { orderId: string, escrowAddress: string }
 */
app.post('/api/oracle/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId, escrowAddress } = req.body;
    
    if (!orderId || !escrowAddress) {
      res.status(400).json({ error: 'Missing required fields: orderId, escrowAddress' });
      return;
    }
    
    const receipt = await registerEscrowWithOracle(orderId, escrowAddress);
    res.json({ success: true, txHash: receipt.hash });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLER
// ═══════════════════════════════════════════════════════════════════════════

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════════════

async function start() {
  console.log('Starting shipping backend server...');
  
  // Initialize oracle (will fail gracefully if env vars not set)
  try {
    initOracle();
  } catch (err) {
    console.warn('Oracle initialization skipped:', (err as Error).message);
    console.warn('Set BACKEND_PRIVATE_KEY and ORACLE_ADDRESS to enable on-chain updates.');
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Shipping server running on http://localhost:${PORT}`);
    console.log('\nEndpoints:');
    console.log('  POST /api/labels/create     - Create shipping label');
    console.log('  POST /api/labels/rates      - Get shipping rates');
    console.log('  GET  /api/labels/:orderId   - Get label info');
    console.log('  GET  /api/tracking/:num     - Get tracking status');
    console.log('  POST /webhook/shippo        - Shippo webhook receiver');
    console.log('  GET  /api/oracle/status/:id - Get on-chain status');
    console.log('  GET  /api/oracle/wallet     - Get backend wallet balance');
    console.log('');
  });
}

start().catch(console.error);
