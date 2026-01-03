import { getEstimate, getMaterials, getColors } from './index.ts';

const args = process.argv.slice(2);

// Usage: npx ts-node --esm pricing/test.ts [file] [material] [color] [infill]
const filePath = args[0] || '../tests/files/Geekko.stl';
const material = args[1] || 'PLA';
const color = args[2] || 'White';
const infill = parseInt(args[3] || '20', 10);

if (args[0] === '--help' || args[0] === '-h') {
  console.log('Usage: npx ts-node --esm pricing/test.ts [file] [material] [color] [infill]');
  console.log('\nMaterials:', getMaterials().join(', '));
  console.log('\nColors:', getColors().join(', '));
  process.exit(0);
}

const result = getEstimate(filePath, material, color, infill);
console.log(JSON.stringify(result, null, 2));

