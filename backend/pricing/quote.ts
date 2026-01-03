import { randomUUID } from 'crypto';
import { estimateCost } from './index.ts';

export interface QuoteResult {
  id: string;
  materialCost: number;
  shippingCost: number;
  total: number;
}

export interface QuoteOptions {
  stlPath: string;
  material: string;
  color?: string;
  infillPercent?: number;
  needsSupports?: boolean;
  shippingCost?: number;
}

// Default shipping estimate based on parcel size (can be replaced with real API)
const DEFAULT_SHIPPING_COST = 8.50;

/**
 * Generate a final price quote combining material and shipping costs
 */
export function getQuote(options: QuoteOptions): QuoteResult {
  const {
    stlPath,
    material,
    color = 'White',
    infillPercent = 20,
    needsSupports = false,
    shippingCost = DEFAULT_SHIPPING_COST,
  } = options;

  const estimate = estimateCost(stlPath, material, color, infillPercent, needsSupports);
  const materialCost = estimate.breakdown.totalCost;

  return {
    id: randomUUID(),
    materialCost: round(materialCost),
    shippingCost: round(shippingCost),
    total: round(materialCost + shippingCost),
  };
}

/**
 * Generate quote from file path with simple params
 */
export function getFinalPrice(
  stlPath: string,
  material: string,
  color: string = 'White',
  infillPercent: number = 20,
  shippingCost: number = DEFAULT_SHIPPING_COST
): QuoteResult {
  return getQuote({ stlPath, material, color, infillPercent, shippingCost });
}

function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

