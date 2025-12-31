'use client';

export type ViewMode = 'buyer' | 'seller';

interface ViewToggleProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export default function ViewToggle({ currentView, onViewChange }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50">
      <button
        onClick={() => onViewChange('buyer')}
        className={`
          relative px-6 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ease-out
          ${currentView === 'buyer'
            ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-md'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }
        `}
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Buyer
        </span>
      </button>
      
      <button
        onClick={() => onViewChange('seller')}
        className={`
          relative px-6 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ease-out
          ${currentView === 'seller'
            ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-md'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }
        `}
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Seller
        </span>
      </button>
    </div>
  );
}

