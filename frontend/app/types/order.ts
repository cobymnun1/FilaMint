export type OrderStatus = 'pending' | 'claimed' | 'printing' | 'shipped' | 'delivered' | 'disputed';

export type PrintMaterial = 'PLA' | 'ABS' | 'PETG' | 'TPU' | 'Resin';

export interface Order {
  id: string;
  status: OrderStatus;
  
  // Buyer info
  buyerAddress: string;
  
  // File info
  fileName: string;
  fileUrl: string;
  fileSizeMB: number;
  dimensions: string;
  
  // Print specs
  material: PrintMaterial;
  color: string;
  infill: number; // percentage 0-100
  printTimeHours: number;
  
  // Escrow & pricing
  escrowAmountEth: number;
  
  // Seller info (populated when claimed)
  sellerAddress?: string;
  claimedAt?: string;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Helper type for creating new orders (buyer side)
export interface NewOrderInput {
  fileName: string;
  fileUrl: string;
  fileSizeMB: number;
  dimensions: string;
  material: PrintMaterial;
  color: string;
  infill: number;
  printTimeHours: number;
  escrowAmountEth: number;
}

