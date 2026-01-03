export interface MaterialProperties {
  heatResistant: boolean;
  flexible: boolean;
  uvResistant: boolean;
  foodSafe: boolean;
}

export interface MaterialProfile {
  name: string;
  fullName: string;
  density: number; // g/cm³
  pricePerKg: number; // USD
  wasteFactor: number; // multiplier for waste (e.g., 1.05 = 5% waste)
  supportFactor: number; // multiplier when supports needed (e.g., 1.15 = 15% extra)
  properties: MaterialProperties;
}

export interface ColorModifierCategory {
  name: string;
  modifier: number; // price multiplier
  colors: string[];
}

export interface MaterialsData {
  materials: Record<string, MaterialProfile>;
  colorModifiers: Record<string, ColorModifierCategory>;
  colorLookup: Record<string, string>;
}

export interface MeshAnalysis {
  volume: number; // mm³
  area: number; // mm²
  boundingBox: [number, number, number]; // [x, y, z] in mm
  centerOfMass: [number, number, number]; // [x, y, z] in mm
  isWatertight: boolean;
}

export interface CostBreakdown {
  baseMaterialCost: number;
  colorPremium: number;
  wasteCost: number;
  supportCost: number;
  totalCost: number;
}

export interface CostEstimate {
  volumeMm3: number;
  volumeCm3: number;
  weightGrams: number;
  material: string;
  color: string;
  infillPercent: number;
  effectiveVolumeMm3: number;
  pricePerGram: number;
  colorModifier: number;
  breakdown: CostBreakdown;
  meshAnalysis: MeshAnalysis;
}

export interface EstimateCostOptions {
  stlPath: string;
  material: string;
  color?: string;
  infillPercent?: number;
  needsSupports?: boolean;
}

