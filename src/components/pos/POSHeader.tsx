// ============================================================
// Raseed POS - Header Component with Search & Categories
// ============================================================

import React from 'react';
import { Search, X, ShoppingBag } from 'lucide-react';
import { CATEGORIES } from '../../data/products';
import type { ProductCategory } from '../../types/pos';

interface POSHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: ProductCategory | 'all';
  onCategoryChange: (category: ProductCategory | 'all') => void;
  cartItemCount: number;
}

export const POSHeader: React.FC<POSHeaderProps> = ({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  cartItemCount,
}) => {
  return (
    <div className="flex flex-col gap-4 mb-6">
      {/* Search Bar */}
      <div className="relative group">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-3xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity duration-500" />
        <div className="relative flex items-center gap-4 bg-white/60 backdrop-blur-2xl border border-white/80 rounded-3xl px-6 py-4 shadow-xl shadow-orange-500/10">
          <Search className="w-6 h-6 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ابحث عن منتج..."
            className="flex-1 bg-transparent outline-none text-slate-800 font-bold text-lg placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          )}
          <div className="w-px h-8 bg-slate-200" />
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-6 h-6 text-orange-500" />
            <span className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-3 py-1 rounded-full text-sm font-bold">
              {cartItemCount}
            </span>
          </div>
        </div>
      </div>

      {/* Categories Filter */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
            className={`
              shrink-0 flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm
              transition-all duration-300 transform hover:scale-105 active:scale-95
              ${
                selectedCategory === category.id
                  ? `${category.color} text-white shadow-lg scale-105`
                  : 'bg-white/50 backdrop-blur-xl border border-white/60 text-slate-700 hover:bg-white/80'
              }
            `}
          >
            <span className="text-lg">{category.icon}</span>
            <span>{category.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
