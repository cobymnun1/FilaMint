import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Inline the pricing logic to avoid ESM import issues
// This mirrors backend/pricing/index.ts

interface PrintEstimate {
  dimensions: { x: number; y: number; z: number };
  volumeCm3: number;
  weightGrams: number;
  isWatertight: boolean;
  material: string;
  color: string;
  infillPercent: number;
  materialCost: number;
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

const MIN_COST = 0.50;

function round(n: number, d: number = 2): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

async function loadMaterialsData(): Promise<MaterialsData> {
  const materialsPath = path.join(process.cwd(), '..', 'backend', 'pricing', 'materials.json');
  const data = await readFile(materialsPath, 'utf-8');
  return JSON.parse(data);
}

function getColorModifier(materialsData: MaterialsData, color: string): number {
  const category = materialsData.colorLookup[color];
  return materialsData.colorModifiers[category]?.modifier ?? 1.0;
}

async function getEstimateFromBuffer(
  buffer: Buffer,
  material: string = 'PLA',
  color: string = 'White',
  infillPercent: number = 20
): Promise<PrintEstimate> {
  // Dynamic import for node-stl (CommonJS module)
  const NodeStl = (await import('node-stl')).default;
  const materialsData = await loadMaterialsData();
  
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
  const colorMod = getColorModifier(materialsData, color);
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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const validExtensions = ['.stl', '.obj', '.3mf'];
    const fileName = file.name.toLowerCase();
    const isValidFile = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValidFile) {
      return NextResponse.json(
        { error: 'Invalid file type. Only STL, OBJ, and 3MF files are allowed.' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ensure the stl-temp directory exists
    const uploadDir = path.join(process.cwd(), 'public', 'stl-temp');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Create unique filename with timestamp
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${file.name}`;
    const filePath = path.join(uploadDir, uniqueFileName);

    // Write the file
    await writeFile(filePath, buffer);

    // Get print estimate (only for STL files)
    let estimate: PrintEstimate | null = null;
    if (fileName.endsWith('.stl')) {
      try {
        estimate = await getEstimateFromBuffer(buffer, 'PLA', 'White', 20);
      } catch (err) {
        console.error('Error analyzing STL:', err);
        // Continue without estimate - file is still uploaded
      }
    }

    // Return success response with file metadata and estimate
    return NextResponse.json({
      success: true,
      fileName: uniqueFileName,
      originalName: file.name,
      size: file.size,
      path: `/stl-temp/${uniqueFileName}`,
      estimate,
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
