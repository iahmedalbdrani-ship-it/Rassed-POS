// CartSidebar Component
import React from 'react';
import { Plus, Minus, Trash2, ShoppingCart, Receipt } from 'lucide-react';

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  icon?: string;
}

interface CartSidebarProps {
  cart: CartItem[];
  updateQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  onCheckout: () => void;
}

export const CartSidebar: React.FC<CartSidebarProps> = ({ cart, updateQty, removeItem, onCheckout }) => {
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const tax = subtotal * 0.15;
  const total = subtotal + tax;

  return (
    <div className="h-full bg-white/40 backdrop-blur-2xl border border-white/60 rounded-[2.5rem] flex flex-col shadow-2xl">
      {/* Header */}
      <div className="p-6 border-b border-white/20">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black flex items-center gap-2">
            <ShoppingCart className="text-orange-500" /> السلة
          </h2>
          {cart.length > 0 && (
            <button onClick={() => cart.forEach(item => removeItem(item.id))} className="text-xs text-rose-500 font-bold hover:underline">
              مسح الكل
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <ShoppingCart size={48} className="mx-auto mb-3 opacity-30" />
            <p>السلة فارغة</p>
          </div>
        ) : (
          cart.map(item => (
            <div key={item.id} className="bg-white/60 p-4 rounded-2xl flex items-center justify-between border border-white/40">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{item.icon || '📦'}</span>
                <div>
                  <p className="font-bold text-sm">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.price.toFixed(2)} ر.س</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white/80 rounded-xl p-1">
                <button onClick={() => item.qty > 1 ? updateQty(item.id, item.qty - 1) : removeItem(item.id)} className="p-1">
                  {item.qty === 1 ? <Trash2 size={14} className="text-rose-400" /> : <Minus size={14} />}
                </button>
                <span className="font-black text-sm w-6 text-center">{item.qty}</span>
                <button onClick={() => updateQty(item.id, item.qty + 1)} className="p-1 text-orange-600">
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totals */}
      <div className="p-6 bg-white/50 border-t border-white/20 space-y-3">
        <div className="flex justify-between"><span>المجموع:</span> <span className="font-bold">{subtotal.toFixed(2)} ر.س</span></div>
        <div className="flex justify-between text-orange-500 text-sm"><span>الضريبة (15%):</span> <span>+ {tax.toFixed(2)} ر.س</span></div>
        <div className="flex justify-between text-xl font-black border-t pt-2"><span>الإجمالي:</span> <span>{total.toFixed(2)} ر.س</span></div>
        <button
          onClick={onCheckout}
          disabled={cart.length === 0}
          className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${
            cart.length === 0 ? 'bg-slate-200 text-slate-400' : 'bg-orange-500 text-white hover:bg-orange-600'
          }`}
        >
          <Receipt size={20} /> إتمام البيع
        </button>
      </div>
    </div>
  );
};
