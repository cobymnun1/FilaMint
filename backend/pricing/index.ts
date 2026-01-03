import { analyzeMesh, analyzeMeshFromBuffer } from './meshAnalyzer.ts';
import {
  calculateCost,
  getMaterial,
  getColorModifier,
  getAvailableMaterials,
  getAvailableColors,
} from './costCalculator.ts';
import { getQuote, getFinalPrice } from './quote.ts';
import type {
  CostEstimate,
  MeshAnalysis,
  MaterialProfile,
  EstimateCostOptions,
} from './types.ts';
import type { QuoteResult, QuoteOptions } from './quote.ts';

/**
 * Estimate material cost for a 3D print from an STL file
 * @param stlPath - Path to the STL file
 * @param material - Material type (e.g., 'PLA', 'ABS', 'PETG')
 * @param color - Color name (e.g., 'White', 'Silver', 'Glow Green')
 * @param infillPercent - Infill percentage (0-100), default 20
 * @param needsSupports - Whether the print needs supports, default false
 * @returns CostEstimate with breakdown
 */
export function estimateCost(
  stlPath: string,
  material: string,
  color: string = 'White',
  infillPercent: number = 20,
  needsSupports: boolean = false
): CostEstimate {
  const meshAnalysis = analyzeMesh(stlPath);
  return calculateCost(meshAnalysis, material, color, infillPercent, needsSupports);
}

/**
 * Estimate material cost from an STL buffer (for uploaded files)
 */
export function estimateCostFromBuffer(
  buffer: Buffer,
  material: string,
  color: string = 'White',
  infillPercent: number = 20,
  needsSupports: boolean = false
): CostEstimate {
  const meshAnalysis = analyzeMeshFromBuffer(buffer);
  return calculateCost(meshAnalysis, material, color, infillPercent, needsSupports);
}

/**
 * Estimate cost using options object
 */
export function estimateCostWithOptions(options: EstimateCostOptions): CostEstimate {
  const {
    stlPath,
    material,
    color = 'White',
    infillPercent = 20,
    needsSupports = false,
  } = options;
  return estimateCost(stlPath, material, color, infillPercent, needsSupports);
}

// Re-export utilities
export {
  analyzeMesh,
  analyzeMeshFromBuffer,
  calculateCost,
  getMaterial,
  getColorModifier,
  getAvailableMaterials,
  getAvailableColors,
  getQuote,
  getFinalPrice,
};

// Re-export types
export type {
  CostEstimate,
  MeshAnalysis,
  MaterialProfile,
  EstimateCostOptions,
  CostBreakdown,
  MaterialsData,
  ColorModifierCategory,
  MaterialProperties,
} from './types.ts';

export type { QuoteResult, QuoteOptions } from './quote.ts';

