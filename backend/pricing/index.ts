import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import NodeStl from 'node-stl';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface PrintEstimate {
  // Model info
  dimensions: { x: number; y: number; z: number };
  volumeCm3: number;
  weightGrams: number;
  isWatertight: boolean;
  
  // Print settings
  material: string;
  color: string;
  infillPercent: number;
  
  // Costs
  materialCost: number;
  
  // Available options (for dropdowns)
  availableMaterials: string[];
  availableColors: string[];
}

interface MaterialProfile {
  name: string;
  density: number;
  pricePerKg: number;
  wasteFactor: number;
}

interface MaterialsData {
  materials: Record<string, MaterialProfile>;
  colorModifiers: Record<string, { modifier: number }>;
  colorLookup: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// Load materials data
// ─────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const materialsData: MaterialsData = JSON.parse(
  readFileSync(join(__dirname, 'materials.json'), 'utf-8')
);

const MIN_COST = 0.50; // $0.50 minimum material cost

// ─────────────────────────────────────────────────────────────
// Main API
// ─────────────────────────────────────────────────────────────

/**
 * Analyze an STL file and estimate print cost
 * 
 * @example
 * const estimate = getEstimate('./model.stl', 'PLA', 'White', 20);
 * console.log(estimate.materialCost); // $2.34
 */
export function getEstimate(
  stlPath: string,
  material: string = 'PLA',
  color: string = 'White',
  infillPercent: number = 20
): PrintEstimate {
  // Analyze mesh
  const stl = new NodeStl(stlPath);
  const volumeCm3 = stl.volume;
  const [x, y, z] = stl.boundingBox as [number, number, number];

  // Get material profile
  const matKey = material.toUpperCase().replace(/\s+/g, '_');
  const mat = materialsData.materials[matKey];
  if (!mat) {
    throw new Error(`Unknown material: ${material}`);
  }

  // Calculate effective volume (shell + infill)
  const shellRatio = 0.15;
  const effectiveVolume = volumeCm3 * (shellRatio + (1 - shellRatio) * (infillPercent / 100));

  // Calculate weight and cost
  const weightGrams = effectiveVolume * mat.density;
  const pricePerGram = mat.pricePerKg / 1000;
  const colorMod = getColorModifier(color);
  const rawCost = weightGrams * pricePerGram * colorMod * mat.wasteFactor;
  const materialCost = round(Math.max(rawCost, MIN_COST));

  return {
    dimensions: { x: round(x), y: round(y), z: round(z) },
    volumeCm3: round(volumeCm3),
    weightGrams: round(weightGrams),
    isWatertight: stl.isWatertight,
    material: mat.name,
    color,
    infillPercent,
    materialCost,
    availableMaterials: Object.keys(materialsData.materials),
    availableColors: Object.keys(materialsData.colorLookup),
  };
}

/**
 * Analyze an STL from a Buffer (for uploaded files)
 */
export function getEstimateFromBuffer(
  buffer: Buffer,
  material: string = 'PLA',
  color: string = 'White',
  infillPercent: number = 20
): PrintEstimate {
  const stl = new NodeStl(buffer);
  const volumeCm3 = stl.volume;
  const [x, y, z] = stl.boundingBox as [number, number, number];

  const matKey = material.toUpperCase().replace(/\s+/g, '_');
  const mat = materialsData.materials[matKey];
  if (!mat) {
    throw new Error(`Unknown material: ${material}`);
  }

  const shellRatio = 0.15;
  const effectiveVolume = volumeCm3 * (shellRatio + (1 - shellRatio) * (infillPercent / 100));
  const weightGrams = effectiveVolume * mat.density;
  const pricePerGram = mat.pricePerKg / 1000;
  const colorMod = getColorModifier(color);
  const rawCost = weightGrams * pricePerGram * colorMod * mat.wasteFactor;
  const materialCost = round(Math.max(rawCost, MIN_COST));

  return {
    dimensions: { x: round(x), y: round(y), z: round(z) },
    volumeCm3: round(volumeCm3),
    weightGrams: round(weightGrams),
    isWatertight: stl.isWatertight,
    material: mat.name,
    color,
    infillPercent,
    materialCost,
    availableMaterials: Object.keys(materialsData.materials),
    availableColors: Object.keys(materialsData.colorLookup),
  };
}

/**
 * Get list of available materials
 */
export function getMaterials(): string[] {
  return Object.keys(materialsData.materials);
}

/**
 * Get list of available colors
 */
export function getColors(): string[] {
  return Object.keys(materialsData.colorLookup);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getColorModifier(color: string): number {
  const category = materialsData.colorLookup[color];
  return materialsData.colorModifiers[category]?.modifier ?? 1.0;
}

function round(n: number, d: number = 2): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
