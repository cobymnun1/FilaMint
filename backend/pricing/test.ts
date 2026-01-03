import { getFinalPrice } from './index.ts';

// Test with an STL file
const stlPath = '../frontend/public/stl-temp/1767132037318-Bag_Clip_1.1.stl';

const quote = getFinalPrice(stlPath, 'PLA', 'Ocean Blue', 20, 8.50);
console.log(JSON.stringify(quote, null, 2));

