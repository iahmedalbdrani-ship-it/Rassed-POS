// ============================================================
// Raseed POS - Cart Component
// ============================================================

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Trash2, Plus, Minus, Receipt } from 'lucide-react';
import type { CartItem, CartTotals } from '../../types/pos';
import { fmt } from '../../constants/theme';

interface POSCartProps {
  items: CartItem[];
  totals: CartTotals;
  onUpdateQuantity: (productId: string, newQuantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onCheckout: () => void;
}

export const POSCart: React.FC<POSCartProps> = ({
  items,
  totals,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onCheckout,
}) => {
  const itemCount = useMemo(() => items.reduce((acc, item) => acc + item.quantity, 0), [items]);

  return (
    <div className="w-[400px] shrink-0 bg-white/40 backdrop-blur-3xl border border-white/60 rounded-[2.5rem] flex flex-col shadow-2xl shadow-slate-200/50 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/20 bg-gradient-to-l from-white/50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-200/50">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800">سلة المشتريات</h2>
              <p className="text-sm text-slate-500">{itemCount} منتج</p>
            </div>
          </div>
          {items.length > 0 && (
            <button
              onClick={onClearCart}
              className="p-3 hover:bg-rose-100 rounded-2xl transition-colors group"
              title="مسح السلة"
            >
              <Trash2 className="w-5 h-5 text-rose-400 group-hover:text-rose-600" />
            </button>
          )}
        </div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <AnimatePresence mode="popLayout">
          {items.length === 0 ? (
            <EmptyCart />
          ) : (
            items.map((item) => (
              <CartItemCard
                key={item.product.id}
                item={item}
                onUpdateQuantity={onUpdateQuantity}
                onRemove={onRemoveItem}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Totals & Checkout */}
      <div className="p-6 bg-gradient-to-t from-white/60 to-white/40 border-t border-white/20 space-y-4">
        {/* Totals */}
        <div className="space-y-3 bg-white/60 backdrop-blur-xl rounded-3xl p-5 border border-white/40">
          <div className="flex justify-between items-center text-slate-600">
            <span className="text-sm">المجموع الفرعي</span>
            <span className="font-bold">{fmt.format(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-orange-500">
            <span className="text-sm">الضريبة (15%)</span>
            <span className="font-bold">+ {fmt.format(totals.taxAmount)}</span>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between items-center text-emerald-500">
              <span className="text-sm">الخصم</span>
              <span className="font-bold">- {fmt.format(totals.discount)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-3 border-t border-slate-100">
            <span className="text-lg font-black text-slate-800">الإجمالي</span>
            <span className="text-2xl font-black text-gradient bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
              {fmt.format(totals.total)}
            </span>
          </div>
        </div>

        {/* Checkout Button */}
        <motion.button
          onClick={onCheckout}
          disabled={items.length === 0}
          className={`
            w-full py-5 rounded-[1.8rem] font-black text-lg shadow-xl
            transition-all duration-300 flex items-center justify-center gap-3
            ${
              items.length === 0
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:shadow-2xl hover:shadow-orange-300/50 active:scale-[0.98]'
            }
          `}
          whileHover={items.length > 0 ? { scale: 1.02 } : {}}
          whileTap={items.length > 0 ? { scale: 0.98 } : {}}
        >
          <Receipt className="w-6 h-6" />
          <span>إتمام البيع</span>
        </motion.button>
      </div>
    </div>
  );
};

// ============================================================
// Empty Cart Component
// ============================================================

const EmptyCart: React.FC = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex-1 flex items-center justify-center py-12"
  >
    <div className="text-center">
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-slate-100 to-slate-200 rounded-full flex items-center justify-center"
      >
        <ShoppingCart className="w-12 h-12 text-slate-300" />
      </motion.div>
      <h3 className="text-lg font-bold text-slate-600 mb-2">السلة فارغة</h3>
      <p className="text-sm text-slate-400">اضغط على منتج لإضافته</p>
    </div>
  </motion.div>
);

// ============================================================
// Cart Item Card Component
// ============================================================

interface CartItemCardProps {
  item: CartItem;
  onUpdateQuantity: (productId: string, newQuantity: number) => void;
  onRemove: (productId: string) => void;
}

const CartItemCard: React.FC<CartItemCardProps> = ({ item, onUpdateQuantity, onRemove }) => {
  const { product, quantity } = item;
  const lineTotal = product.price * quantity;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50, height: 0 }}
      className="bg-white/70 backdrop-blur-xl rounded-3xl p-4 border border-white/40 shadow-sm"
    >
      <div className="flex items-center gap-4">
        {/* Product Icon */}
        <div className="w-14 h-14 bg-gradient-to-br from-orange-100 to-amber-100 rounded-2xl flex items-center justify-center text-2xl shrink-0">
          {product.icon}
        </div>

        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-slate-800 text-sm truncate">{product.name}</h4>
          <p className="text-xs text-slate-400">{fmt.format(product.price)} لكل {product.unit}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2">
          {/* Price */}
          <span className="font-black text-orange-600">{fmt.format(lineTotal)}</span>

          {/* Quantity Controls */}
          <div className="flex items-center gap-2 bg-slate-100/80 rounded-2xl p-1">
            <button
              onClick={() => {
                if (quantity === 1) {
                  onRemove(product.id);
                } else {
                  onUpdateQuantity(product.id, quantity - 1);
                }
              }}
              className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-xl transition-colors"
            >
              {quantity === 1 ? (
                <Trash2 className="w-4 h-4 text-rose-400" />
              ) : (
                <Minus className="w-4 h-4 text-slate-600" />
              )}
            </button>
            <motion.span
              key={quantity}
              initial={{ scale: 1.5, color: '#f97316' }}
              animate={{ scale: 1, color: '#1e293b' }}
              className="w-8 text-center font-black text-sm"
            >
              {quantity}
            </motion.span>
            <button
              onClick={() => onUpdateQuantity(product.id, quantity + 1)}
              className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
