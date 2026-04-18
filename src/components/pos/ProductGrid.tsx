// ============================================================
// Raseed POS - Product Grid Component
// ============================================================

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Sparkles } from 'lucide-react';
import type { Product } from '../../types/pos';
import { fmt } from '../../constants/theme';

interface ProductGridProps {
  products: Product[];
  searchQuery: string;
  onAddToCart: (product: Product) => void;
  animationKey?: string;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  searchQuery,
  onAddToCart,
  animationKey,
}) => {
  const filteredProducts = useMemo(() => {
    if (!searchQuery) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.nameAr.includes(query) ||
        p.nameEn.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  if (filteredProducts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-6 bg-slate-100 rounded-full flex items-center justify-center">
            <Sparkles className="w-12 h-12 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-600 mb-2">لا توجد منتجات</h3>
          <p className="text-slate-400">جرب البحث بكلمات مختلفة</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pr-2 space-y-4">
      {/* Products Count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500 font-medium">
          {filteredProducts.length} منتج
        </p>
        {searchQuery && (
          <p className="text-sm text-orange-500 font-medium">
            نتائج البحث عن: "{searchQuery}"
          </p>
        )}
      </div>

      {/* Products Grid */}
      <motion.div
        key={animationKey}
        layout
        className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      >
        <AnimatePresence mode="popLayout">
          {filteredProducts.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              index={index}
              onAddToCart={onAddToCart}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

// ============================================================
// Product Card Component
// ============================================================

interface ProductCardProps {
  product: Product;
  index: number;
  onAddToCart: (product: Product) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, index, onAddToCart }) => {
  const [isPressed, setIsPressed] = React.useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: -20 }}
      transition={{
        duration: 0.3,
        delay: index * 0.03,
        type: 'spring',
        stiffness: 300,
        damping: 25,
      }}
      className="group"
    >
      <div
        className={`
          relative bg-white/50 backdrop-blur-xl border border-white/60 rounded-3xl p-5
          cursor-pointer transition-all duration-300
          hover:bg-white/80 hover:border-orange-200 hover:shadow-2xl hover:shadow-orange-200/50
          active:scale-[0.97]
          ${isPressed ? 'scale-95' : 'hover:scale-[1.02]'}
        `}
        onClick={() => onAddToCart(product)}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
      >
        {/* Floating Icon */}
        <motion.div
          className="absolute -top-3 -right-3 w-14 h-14 bg-gradient-to-br from-orange-400 to-amber-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-orange-300/50"
          whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
          transition={{ duration: 0.3 }}
        >
          {product.icon}
        </motion.div>

        {/* Add Button */}
        <motion.div
          className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg">
            <Plus className="w-5 h-5 text-white" />
          </div>
        </motion.div>

        {/* Product Info */}
        <div className="pt-8 text-center">
          <h3 className="font-bold text-slate-800 text-sm mb-2 line-clamp-2 leading-tight">
            {product.name}
          </h3>
          <p className="text-xs text-slate-400 mb-3">{product.unit}</p>
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-2 rounded-2xl font-black text-lg shadow-md">
            {fmt.format(product.price)}
          </div>
        </div>

        {/* Stock Badge */}
        {product.stock < 10 && (
          <div className="absolute bottom-3 right-3 bg-rose-100 text-rose-600 text-xs px-2 py-1 rounded-lg font-bold">
            متبقي {product.stock}
          </div>
        )}
      </div>
    </motion.div>
  );
};
