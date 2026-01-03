import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type {
  MaterialsData,
  MaterialProfile,
  MeshAnalysis,
  CostEstimate,
  CostBreakdown,
} from './types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load materials data
const materialsPath = join(__dirname, 'materials.json');
const materialsData: MaterialsData = JSON.parse(readFileSync(materialsPath, 'utf-8'));

/**
 * Get material profile by name (case-insensitive)
 */
export function getMaterial(materialName: string): MaterialProfile | null {
  const key = materialName.toUpperCase().replace(/\s+/g, '_');
  return materialsData.materials[key] ?? null;
}

/**
 * Get color modifier multiplier for a given color
 */
export function getColorModifier(color: string): number {
  const category = materialsData.colorLookup[color];
  if (!category) {
    return 1.0; // Default to standard if color not found
  }
  return materialsData.colorModifiers[category]?.modifier ?? 1.0;
}

/**
 * Get all available materials
 */
export function getAvailableMaterials(): string[] {
  return Object.keys(materialsData.materials);
}

/**
 * Get all available colors
 */
export function getAvailableColors(): string[] {
  return Object.keys(materialsData.colorLookup);
}

/**
 * Calculate material cost from mesh analysis
 */
export function calculateCost(
  meshAnalysis: MeshAnalysis,
  material: string,
  color: string = 'White',
  infillPercent: number = 20,
  needsSupports: boolean = false
): CostEstimate {
  const materialProfile = getMaterial(material);
  if (!materialProfile) {
    throw new Error(`Unknown material: ${material}. Available: ${getAvailableMaterials().join(', ')}`);
  }

  // Volume calculations (node-stl returns volume in cm³)
  const volumeCm3 = meshAnalysis.volume;
  const volumeMm3 = volumeCm3 * 1000;

  // Effective volume based on infill (shell is always 100%, interior is infill%)
  // Approximate: 15% shell + 85% * infill%
  const shellRatio = 0.15;
  const effectiveInfill = shellRatio + (1 - shellRatio) * (infillPercent / 100);
  const effectiveVolumeCm3 = volumeCm3 * effectiveInfill;
  const effectiveVolumeMm3 = effectiveVolumeCm3 * 1000;

  // Weight calculation
  const weightGrams = effectiveVolumeCm3 * materialProfile.density;

  // Price per gram
  const pricePerGram = materialProfile.pricePerKg / 1000;

  // Color modifier
  const colorModifier = getColorModifier(color);

  // Cost breakdown
  const baseMaterialCost = weightGrams * pricePerGram;
  const colorPremium = baseMaterialCost * (colorModifier - 1);
  const wasteCost = baseMaterialCost * (materialProfile.wasteFactor - 1);
  const supportCost = needsSupports
    ? baseMaterialCost * (materialProfile.supportFactor - 1)
    : 0;

  const totalCost = baseMaterialCost + colorPremium + wasteCost + supportCost;

  const breakdown: CostBreakdown = {
    baseMaterialCost: round(baseMaterialCost),
    colorPremium: round(colorPremium),
    wasteCost: round(wasteCost),
    supportCost: round(supportCost),
    totalCost: round(totalCost),
  };

  return {
    volumeMm3: round(volumeMm3),
    volumeCm3: round(volumeCm3),
    weightGrams: round(weightGrams),
    material: materialProfile.name,
    color,
    infillPercent,
    effectiveVolumeMm3: round(effectiveVolumeMm3),
    pricePerGram: round(pricePerGram, 4),
    colorModifier,
    breakdown,
    meshAnalysis,
  };
}

/**
 * Round to specified decimal places
 */
function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

