'use client';

import { useState } from 'react';
import FileUpload from './FileUpload';
import OrderCard from './OrderCard';
import { Order } from '../types/order';

interface BuyerViewProps {
  orders: Order[];
}

export default function BuyerView({ orders }: BuyerViewProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter orders to show only buyer's orders (in real app, filter by connected wallet)
  // For mock, show orders with various statuses
  const buyerOrders = orders.filter(order => 
    ['pending', 'claimed', 'printing', 'shipped', 'delivered'].includes(order.status)
  ).slice(0, 3);

  const handleFileSelect = async (file: File) => {
    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadedFile(data.originalName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Upload Section */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Upload Your 3D Model
        </h2>
        <FileUpload onFileSelect={handleFileSelect} isUploading={isUploading} />

        {/* Success/Error Messages */}
        {uploadedFile && (
          <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-4 dark:bg-emerald-900/20 dark:border-emerald-800">
            <p className="text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              File uploaded successfully: {uploadedFile}
            </p>
          </div>
        )}

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

      {/* Configure Print Section */}
      {uploadedFile && (
        <section className="p-6 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Configure Your Print
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Material
              </label>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
                <option>PLA</option>
                <option>ABS</option>
                <option>PETG</option>
                <option>TPU</option>
                <option>Resin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Color
              </label>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
                <option>Black</option>
                <option>White</option>
                <option>Gray</option>
                <option>Red</option>
                <option>Blue</option>
                <option>Green</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Infill %
              </label>
              <input 
                type="number" 
                defaultValue={20} 
                min={0} 
                max={100}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Escrow Amount (ETH)
              </label>
              <input 
                type="number" 
                defaultValue={0.02} 
                step={0.001}
                min={0.001}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            className="mt-6 w-full rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-lg transition-all hover:from-violet-700 hover:to-indigo-700 hover:shadow-xl"
            onClick={() => alert('Submit print request coming soon!')}
          >
            Submit Print Request
          </button>
        </section>
      )}

      {/* My Orders Section */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          My Print Orders
        </h2>
        {buyerOrders.length > 0 ? (
          <div className="space-y-4">
            {buyerOrders.map(order => (
              <OrderCard key={order.id} order={order} viewMode="buyer" />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400">No orders yet. Upload a model to get started!</p>
          </div>
        )}
      </section>
    </div>
  );
}

