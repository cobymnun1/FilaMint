'use client';

import { useState } from 'react';

type SortOption = 'escrow-high' | 'escrow-low' | 'time-short' | 'time-long' | 'newest';
type FilterMaterial = 'all' | 'PLA' | 'ABS' | 'PETG' | 'TPU' | 'Resin';

export default function SellerView() {
  const [sortBy, setSortBy] = useState<SortOption>('escrow-high');
  const [filterMaterial, setFilterMaterial] = useState<FilterMaterial>('all');

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <section className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800/50">
          <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">Available Requests</p>
          <p className="text-2xl font-bold text-amber-900 dark:text-amber-100">0</p>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800/50">
          <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Total Escrow Value</p>
          <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">0.000 ETH</p>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200 dark:border-violet-800/50">
          <p className="text-sm text-violet-700 dark:text-violet-300 font-medium">My Active Jobs</p>
          <p className="text-2xl font-bold text-violet-900 dark:text-violet-100">0</p>
        </div>
      </section>

      {/* Available Print Requests */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Available Print Requests
          </h2>
          
          {/* Filters */}
          <div className="flex items-center gap-3">
            <select
              value={filterMaterial}
              onChange={(e) => setFilterMaterial(e.target.value as FilterMaterial)}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300"
            >
              <option value="all">All Materials</option>
              <option value="PLA">PLA</option>
              <option value="ABS">ABS</option>
              <option value="PETG">PETG</option>
              <option value="TPU">TPU</option>
              <option value="Resin">Resin</option>
            </select>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300"
            >
              <option value="escrow-high">Highest Escrow</option>
              <option value="escrow-low">Lowest Escrow</option>
              <option value="time-short">Shortest Print</option>
              <option value="time-long">Longest Print</option>
              <option value="newest">Newest First</option>
            </select>
          </div>
        </div>

        {/* Empty State */}
        <div className="text-center py-12 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400">
            No print requests available yet.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Check back soon for new jobs to claim.
          </p>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="p-6 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Seller Actions
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <button
            className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-violet-300 dark:hover:border-violet-700 transition-colors text-left"
            onClick={() => alert('View earnings coming soon!')}
          >
            <svg className="w-6 h-6 text-violet-600 dark:text-violet-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium text-gray-900 dark:text-white">View Earnings</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Track your completed jobs</p>
          </button>
          <button
            className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-violet-300 dark:hover:border-violet-700 transition-colors text-left"
            onClick={() => alert('Printer settings coming soon!')}
          >
            <svg className="w-6 h-6 text-violet-600 dark:text-violet-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="font-medium text-gray-900 dark:text-white">Printer Settings</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Configure your capabilities</p>
          </button>
        </div>
      </section>
    </div>
  );
}
