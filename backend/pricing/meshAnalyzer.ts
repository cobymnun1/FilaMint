import NodeStl from 'node-stl';
import type { MeshAnalysis } from './types.ts';

/**
 * Analyzes an STL file and returns mesh properties
 * @param stlPath - Path to the STL file
 * @returns MeshAnalysis object with volume, area, bounding box, etc.
 */
export function analyzeMesh(stlPath: string): MeshAnalysis {
  const stl = new NodeStl(stlPath);

  return {
    volume: stl.volume, // mm³
    area: stl.area, // mm²
    boundingBox: stl.boundingBox as [number, number, number],
    centerOfMass: stl.centerOfMass as [number, number, number],
    isWatertight: stl.isWatertight,
  };
}

/**
 * Analyzes an STL from a Buffer (useful for uploaded files)
 * @param buffer - Buffer containing STL data
 * @returns MeshAnalysis object with volume, area, bounding box, etc.
 */
export function analyzeMeshFromBuffer(buffer: Buffer): MeshAnalysis {
  const stl = new NodeStl(buffer);

  return {
    volume: stl.volume,
    area: stl.area,
    boundingBox: stl.boundingBox as [number, number, number],
    centerOfMass: stl.centerOfMass as [number, number, number],
    isWatertight: stl.isWatertight,
  };
}

