import { readdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { getFinalPrice, estimateCost, getAvailableMaterials } from '../../backend/pricing/index.ts';

interface BenchmarkResult {
  file: string;
  material: string;
  color: string;
  weightGrams: number;
  materialCost: number;
  shippingCost: number;
  total: number;
  volumeCm3: number;
}

const MATERIALS_TO_TEST = ['PLA', 'ABS', 'PETG', 'TPU', 'NYLON', 'CF_PLA'];
const INFILL = 20;
const SHIPPING = 8.50;

const STL_DIR = join(import.meta.dirname, '../files');
const OUTPUT_HTML = join(import.meta.dirname, 'results.html');

function getStlFiles(): string[] {
  return readdirSync(STL_DIR)
    .filter(f => f.toLowerCase().endsWith('.stl'))
    .map(f => join(STL_DIR, f));
}

function runBenchmark(): BenchmarkResult[] {
  const files = getStlFiles();
  const results: BenchmarkResult[] = [];

  console.log(`Found ${files.length} STL files\n`);

  for (const file of files) {
    const fileName = basename(file);
    
    for (const material of MATERIALS_TO_TEST) {
      try {
        const estimate = estimateCost(file, material, 'White', INFILL, false);
        const quote = getFinalPrice(file, material, 'White', INFILL, SHIPPING);

        results.push({
          file: fileName,
          material,
          color: 'White',
          weightGrams: estimate.weightGrams,
          materialCost: quote.materialCost,
          shippingCost: quote.shippingCost,
          total: quote.total,
          volumeCm3: estimate.volumeCm3,
        });
      } catch (e) {
        console.error(`Error processing ${fileName} with ${material}:`, e);
      }
    }
    console.log(`✓ ${fileName}`);
  }

  return results;
}

function generateHTML(results: BenchmarkResult[]): string {
  const materialColors: Record<string, string> = {
    PLA: '#4CAF50',
    ABS: '#2196F3',
    PETG: '#9C27B0',
    TPU: '#FF9800',
    NYLON: '#E91E63',
    CF_PLA: '#607D8B',
  };

  // Group by material for chart datasets
  const datasets = MATERIALS_TO_TEST.map(material => {
    const materialData = results.filter(r => r.material === material);
    return {
      label: material,
      data: materialData.map(r => ({ x: r.weightGrams, y: r.materialCost, file: r.file })),
      backgroundColor: materialColors[material] + '99',
      borderColor: materialColors[material],
      borderWidth: 2,
    };
  });

  // Summary table data
  const summaryByMaterial = MATERIALS_TO_TEST.map(material => {
    const data = results.filter(r => r.material === material);
    const avgCost = data.reduce((sum, r) => sum + r.materialCost, 0) / data.length;
    const avgWeight = data.reduce((sum, r) => sum + r.weightGrams, 0) / data.length;
    const maxCost = Math.max(...data.map(r => r.materialCost));
    const minCost = Math.min(...data.map(r => r.materialCost));
    return { material, avgCost, avgWeight, maxCost, minCost, count: data.length };
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>3D Print Cost Benchmark</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e8e8e8;
      min-height: 100vh;
      padding: 2rem;
    }
    h1 {
      text-align: center;
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(90deg, #4CAF50, #2196F3, #9C27B0);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      text-align: center;
      color: #888;
      margin-bottom: 2rem;
    }
    .chart-container {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 2rem;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .chart-wrapper {
      position: relative;
      height: 500px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    th, td {
      padding: 1rem;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    th {
      background: rgba(255,255,255,0.05);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.85rem;
      letter-spacing: 0.5px;
    }
    tr:hover { background: rgba(255,255,255,0.03); }
    .material-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-weight: 600;
      font-size: 0.85rem;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 1.5rem;
      text-align: center;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }
    .stat-label { color: #888; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>3D Print Cost Benchmark</h1>
  <p class="subtitle">${results.length / MATERIALS_TO_TEST.length} models × ${MATERIALS_TO_TEST.length} materials = ${results.length} estimates</p>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value">${(results.length / MATERIALS_TO_TEST.length).toFixed(0)}</div>
      <div class="stat-label">STL Files Tested</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${MATERIALS_TO_TEST.length}</div>
      <div class="stat-label">Materials Compared</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">$${(results.reduce((s, r) => s + r.materialCost, 0) / results.length).toFixed(2)}</div>
      <div class="stat-label">Avg Material Cost</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${(results.reduce((s, r) => s + r.weightGrams, 0) / results.length).toFixed(1)}g</div>
      <div class="stat-label">Avg Weight</div>
    </div>
  </div>

  <div class="chart-container">
    <h2 style="margin-bottom: 1rem;">Cost vs Weight by Material</h2>
    <div class="chart-wrapper">
      <canvas id="scatterChart"></canvas>
    </div>
  </div>

  <div class="chart-container">
    <h2 style="margin-bottom: 1rem;">Material Cost Comparison</h2>
    <table>
      <thead>
        <tr>
          <th>Material</th>
          <th>Avg Cost</th>
          <th>Min Cost</th>
          <th>Max Cost</th>
          <th>Avg Weight</th>
          <th>Files</th>
        </tr>
      </thead>
      <tbody>
        ${summaryByMaterial.map(s => `
        <tr>
          <td><span class="material-badge" style="background: ${materialColors[s.material]}40; color: ${materialColors[s.material]}">${s.material}</span></td>
          <td>$${s.avgCost.toFixed(2)}</td>
          <td>$${s.minCost.toFixed(2)}</td>
          <td>$${s.maxCost.toFixed(2)}</td>
          <td>${s.avgWeight.toFixed(1)}g</td>
          <td>${s.count}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="chart-container">
    <h2 style="margin-bottom: 1rem;">All Results</h2>
    <table>
      <thead>
        <tr>
          <th>File</th>
          <th>Material</th>
          <th>Weight</th>
          <th>Material Cost</th>
          <th>Total (+ $${SHIPPING} shipping)</th>
        </tr>
      </thead>
      <tbody>
        ${results.slice(0, 100).map(r => `
        <tr>
          <td>${r.file}</td>
          <td><span class="material-badge" style="background: ${materialColors[r.material]}40; color: ${materialColors[r.material]}">${r.material}</span></td>
          <td>${r.weightGrams.toFixed(1)}g</td>
          <td>$${r.materialCost.toFixed(2)}</td>
          <td>$${r.total.toFixed(2)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <script>
    const ctx = document.getElementById('scatterChart').getContext('2d');
    new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: ${JSON.stringify(datasets)}
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (context) => {
                const point = context.raw;
                return \`\${context.dataset.label}: \${point.file} - \${point.x.toFixed(1)}g, $\${point.y.toFixed(2)}\`;
              }
            }
          },
          legend: {
            position: 'top',
            labels: { color: '#e8e8e8', padding: 20, font: { size: 14 } }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Weight (grams)', color: '#888' },
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#888' }
          },
          y: {
            title: { display: true, text: 'Material Cost ($)', color: '#888' },
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#888' }
          }
        }
      }
    });
  </script>
</body>
</html>`;
}

// Run
console.log('🚀 Starting benchmark...\n');
const results = runBenchmark();
console.log(`\n📊 Generating report...`);

const html = generateHTML(results);
writeFileSync(OUTPUT_HTML, html);

console.log(`\n✅ Done! Open ${OUTPUT_HTML} in a browser.`);
console.log(`\nQuick summary:`);
console.log(`  Files: ${results.length / MATERIALS_TO_TEST.length}`);
console.log(`  Total estimates: ${results.length}`);

