'use client';

import { useState, useEffect } from 'react';
import FileUpload from './FileUpload';

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

interface UploadResponse {
  success: boolean;
  fileName: string;
  originalName: string;
  size: number;
  path: string;
  estimate: PrintEstimate | null;
}

// Material densities (g/cm³) and prices ($/kg)
const MATERIAL_DATA: Record<string, { density: number; pricePerKg: number; wasteFactor: number }> = {
  PLA: { density: 1.24, pricePerKg: 20, wasteFactor: 1.05 },
  ABS: { density: 1.04, pricePerKg: 22, wasteFactor: 1.08 },
  PETG: { density: 1.27, pricePerKg: 25, wasteFactor: 1.06 },
  TPU: { density: 1.21, pricePerKg: 35, wasteFactor: 1.10 },
  NYLON: { density: 1.14, pricePerKg: 45, wasteFactor: 1.08 },
  ASA: { density: 1.07, pricePerKg: 30, wasteFactor: 1.07 },
  PC: { density: 1.20, pricePerKg: 40, wasteFactor: 1.10 },
  HIPS: { density: 1.04, pricePerKg: 22, wasteFactor: 1.06 },
  PVA: { density: 1.23, pricePerKg: 60, wasteFactor: 1.12 },
  CF_PLA: { density: 1.30, pricePerKg: 50, wasteFactor: 1.08 },
  WOOD_PLA: { density: 1.15, pricePerKg: 35, wasteFactor: 1.10 },
  RESIN_STANDARD: { density: 1.10, pricePerKg: 35, wasteFactor: 1.15 },
};

// Color modifiers
const COLOR_MODIFIERS: Record<string, number> = {
  White: 1.0, Black: 1.0, Gray: 1.0, Red: 1.0, Blue: 1.0, Green: 1.0, Yellow: 1.0, Orange: 1.0,
  'Ocean Blue': 1.0, 'Forest Green': 1.0, 'Crimson Red': 1.0,
  Silver: 1.15, Gold: 1.15, Bronze: 1.15, Copper: 1.15, Chrome: 1.15,
  'Silk White': 1.20, 'Silk Blue': 1.20, 'Silk Red': 1.20, 'Silk Green': 1.20, 'Silk Gold': 1.20, 'Silk Silver': 1.20,
  'Glow Green': 1.25, 'Glow Blue': 1.25, 'Glow White': 1.25, 'Glow Orange': 1.25,
  Clear: 1.10, 'Transparent Blue': 1.10, 'Transparent Red': 1.10, 'Transparent Green': 1.10,
  'Matte Black': 1.05, 'Matte White': 1.05, 'Matte Gray': 1.05,
  Rainbow: 1.30, Galaxy: 1.30, Marble: 1.30,
};

const SHIPPING_COST = 5.00;
const MIN_COST = 0.50;

export default function BuyerView() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Base volume from initial upload (doesn't change)
  const [baseVolumeCm3, setBaseVolumeCm3] = useState<number>(0);
  
  // Configurable settings
  const [material, setMaterial] = useState('PLA');
  const [color, setColor] = useState('White');
  const [infillPercent, setInfillPercent] = useState(20);
  const [sellerMargin, setSellerMargin] = useState(15);
  
  // Calculated values
  const [estimate, setEstimate] = useState<PrintEstimate | null>(null);

  // Recalculate when settings change
  useEffect(() => {
    if (!estimate || baseVolumeCm3 === 0) return;
    
    const matKey = material.toUpperCase().replace(/\s+/g, '_');
    const matData = MATERIAL_DATA[matKey] || MATERIAL_DATA.PLA;
    const colorMod = COLOR_MODIFIERS[color] ?? 1.0;
    
    const shellRatio = 0.15;
    const effectiveVolume = baseVolumeCm3 * (shellRatio + (1 - shellRatio) * (infillPercent / 100));
    const weightGrams = effectiveVolume * matData.density;
    const pricePerGram = matData.pricePerKg / 1000;
    const rawCost = weightGrams * pricePerGram * colorMod * matData.wasteFactor;
    const materialCost = Math.max(rawCost, MIN_COST);
    
    setEstimate(prev => prev ? {
      ...prev,
      material,
      color,
      infillPercent,
      weightGrams: Math.round(weightGrams * 100) / 100,
      materialCost: Math.round(materialCost * 100) / 100,
    } : null);
  }, [material, color, infillPercent, baseVolumeCm3]);

  const handleFileSelect = async (file: File) => {
    setIsUploading(true);
    setError(null);
    setUploadData(null);
    setEstimate(null);
    setBaseVolumeCm3(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data: UploadResponse = await response.json();

      if (!response.ok) {
        throw new Error((data as { error?: string }).error || 'Upload failed');
      }

      setUploadData(data);
      if (data.estimate) {
        setEstimate(data.estimate);
        setBaseVolumeCm3(data.estimate.volumeCm3);
        setMaterial(data.estimate.material);
        setColor(data.estimate.color);
        setInfillPercent(data.estimate.infillPercent);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  // Calculate totals
  const materialCost = estimate?.materialCost ?? 0;
  const marginAmount = (materialCost + SHIPPING_COST) * (sellerMargin / 100);
  const totalCost = materialCost + SHIPPING_COST + marginAmount;

  // Handle margin slider - show 0% but enforce 10% minimum on submit
  const handleMarginChange = (value: number) => {
    setSellerMargin(value);
  };

  return (
    <div className="space-y-8">
      {/* Upload Section */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Upload Your 3D Model
        </h2>
        <FileUpload onFileSelect={handleFileSelect} isUploading={isUploading} />

        {/* Error Message */}
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-4 dark:bg-red-900/20 dark:border-red-800">
            <p className="text-sm text-red-800 dark:text-red-300 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              {error}
            </p>
          </div>
        )}
      </section>

      {/* Model Analysis & Configuration */}
      {uploadData && estimate && (
        <section className="p-6 rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/50">
          {/* Success Banner */}
          <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 p-4 dark:bg-emerald-900/20 dark:border-emerald-800">
            <p className="text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              File uploaded: {uploadData.originalName}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Left Column - Model Info */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Model Analysis
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Dimensions</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {estimate.dimensions.x} × {estimate.dimensions.y} × {estimate.dimensions.z} mm
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Volume</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {baseVolumeCm3} cm³
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-600 dark:text-gray-400">Est. Weight</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {estimate.weightGrams}g
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600 dark:text-gray-400">Watertight</span>
                  <span className={`font-medium ${estimate.isWatertight ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {estimate.isWatertight ? 'Yes ✓' : 'No ⚠'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column - Print Settings */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Print Settings
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Material
                  </label>
                  <select 
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  >
                    {estimate.availableMaterials.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Color
                  </label>
                  <select 
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  >
                    {estimate.availableColors.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Infill: {infillPercent}%
                  </label>
                  <input 
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={infillPercent}
                    onChange={(e) => setInfillPercent(Number(e.target.value))}
                    className="w-full accent-violet-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Light (10%)</span>
                    <span>Solid (100%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Cost Estimate
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-gray-600 dark:text-gray-400">Material Cost</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${materialCost.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-gray-600 dark:text-gray-400">Shipping</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${SHIPPING_COST.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-gray-600 dark:text-gray-400">
                  Seller Margin ({sellerMargin}%)
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${marginAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Seller Margin Slider */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Seller Margin: {sellerMargin}%
                {sellerMargin < 10 && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400 text-xs">
                    (min 10% required)
                  </span>
                )}
              </label>
              <input 
                type="range"
                min={0}
                max={100}
                step={5}
                value={sellerMargin}
                onChange={(e) => handleMarginChange(Number(e.target.value))}
                className="w-full accent-violet-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0%</span>
                <span>100%</span>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                Higher margins attract more sellers and lead to faster fulfillment of your order. Material cost has a $0.50 minimum.
              </p>
            </div>

            {/* Total Cost */}
            <div className="mt-6 flex justify-between py-3 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 rounded-lg px-4">
              <span className="font-semibold text-gray-900 dark:text-white">Total Cost</span>
              <span className="font-bold text-xl text-violet-600 dark:text-violet-400">
                ${totalCost.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            className="mt-8 w-full rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-lg transition-all hover:from-violet-700 hover:to-indigo-700 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (sellerMargin < 10) {
                alert('Minimum seller margin is 10%');
                return;
              }
              alert('Submit print request coming soon!');
            }}
            disabled={sellerMargin < 10}
          >
            {sellerMargin < 10 ? 'Set margin to at least 10%' : 'Submit Print Request'}
          </button>
        </section>
      )}

      {/* My Orders Section - Empty State */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          My Print Orders
        </h2>
        <div className="text-center py-12 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400">No orders yet. Upload a model to get started!</p>
        </div>
      </section>
    </div>
  );
}
