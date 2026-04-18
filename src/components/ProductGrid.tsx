// ProductGrid Component
import React from 'react';
import { Search } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  price: number;
  icon: string;
  category?: string;
}

interface ProductGridProps {
  products: Product[];
  categories: string[];
  onAddToCart: (product: Product) => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({ products, categories, onAddToCart }) => {
  const [search, setSearch] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('الكل');

  const filtered = products.filter(p => {
    const matchSearch = p.name.includes(search);
    const matchCat = selectedCategory === 'الكل' || p.category === selectedCategory;
    return matchSearch && matchCat;
  });

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute right-4 top-4 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="ابحث عن منتج..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full p-4 pr-12 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/60 outline-none"
        />
      </div>

      {/* Categories */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-orange-500 text-white'
                : 'bg-white/60 text-slate-700 hover:bg-white/80'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Products */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <div
              key={p.id}
              onClick={() => onAddToCart(p)}
              className="bg-white/40 backdrop-blur-xl border border-white/60 p-5 rounded-2xl cursor-pointer hover:bg-white/80 transition-all"
            >
              <span className="text-4xl block text-center mb-3">{p.icon}</span>
              <p className="font-bold text-center text-sm mb-1">{p.name}</p>
              <p className="text-orange-600 font-black text-center">{p.price.toFixed(2)} ر.س</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
