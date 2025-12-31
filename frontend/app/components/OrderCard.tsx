'use client';

import { Order, OrderStatus } from '../types/order';

interface OrderCardProps {
  order: Order;
  viewMode: 'buyer' | 'seller';
  onClaim?: (orderId: string) => void;
}

const statusConfig: Record<OrderStatus, { label: string; color: string; bgColor: string }> = {
  pending: { 
    label: 'Pending', 
    color: 'text-amber-700 dark:text-amber-300', 
    bgColor: 'bg-amber-100 dark:bg-amber-900/30' 
  },
  claimed: { 
    label: 'Claimed', 
    color: 'text-blue-700 dark:text-blue-300', 
    bgColor: 'bg-blue-100 dark:bg-blue-900/30' 
  },
  printing: { 
    label: 'Printing', 
    color: 'text-violet-700 dark:text-violet-300', 
    bgColor: 'bg-violet-100 dark:bg-violet-900/30' 
  },
  shipped: { 
    label: 'Shipped', 
    color: 'text-cyan-700 dark:text-cyan-300', 
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30' 
  },
  delivered: { 
    label: 'Delivered', 
    color: 'text-emerald-700 dark:text-emerald-300', 
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' 
  },
  disputed: { 
    label: 'Disputed', 
    color: 'text-red-700 dark:text-red-300', 
    bgColor: 'bg-red-100 dark:bg-red-900/30' 
  },
};

const materialColors: Record<string, string> = {
  PLA: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  ABS: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  PETG: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  TPU: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  Resin: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
};

export default function OrderCard({ order, viewMode, onClaim }: OrderCardProps) {
  const status = statusConfig[order.status];
  const materialColor = materialColors[order.material] || 'bg-gray-100 text-gray-800';

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow dark:border-gray-800 dark:bg-gray-900/80 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
            {order.fileName}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
            {viewMode === 'seller' ? `Buyer: ${truncateAddress(order.buyerAddress)}` : `ID: ${order.id}`}
          </p>
        </div>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
          {status.label}
        </span>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Size</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{order.fileSizeMB}MB</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Dimensions</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{order.dimensions}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Print Time</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{order.printTimeHours}h</span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Material</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${materialColor}`}>
              {order.material}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Color</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{order.color}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Infill</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{order.infill}%</span>
          </div>
        </div>
      </div>

      {/* Escrow & Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-800">
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 block">Escrow</span>
          <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {order.escrowAmountEth} <span className="text-sm font-medium text-gray-500">ETH</span>
          </span>
        </div>
        
        {viewMode === 'seller' && order.status === 'pending' && onClaim && (
          <button
            onClick={() => onClaim(order.id)}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all"
          >
            Claim Request
          </button>
        )}
        
        {viewMode === 'buyer' && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatDate(order.createdAt)}
          </span>
        )}
      </div>

      {/* Seller info for claimed orders */}
      {order.sellerAddress && viewMode === 'buyer' && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Printer: <span className="font-mono">{truncateAddress(order.sellerAddress)}</span>
            {order.claimedAt && ` • Claimed ${formatDate(order.claimedAt)}`}
          </p>
        </div>
      )}
    </div>
  );
}

