// ─── TransactionModal — add income / expense entry ────────────
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

interface TransactionModalProps {
  onClose: () => void;
  onSave:  () => void;
}

export default function TransactionModal({ onClose, onSave }: TransactionModalProps) {
  const [form, setForm]     = useState({ description: '', amount: '', type: 'income' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: dbErr } = await supabase.from('transactions').insert([{
      description: form.description,
      amount:      parseFloat(form.amount),
      type:        form.type,
    }]);
    setLoading(false);
    if (dbErr) { setError(dbErr.message); return; }
    onSave();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ background: 'rgba(2,6,15,0.75)', backdropFilter: 'blur(12px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-[2rem] p-8"
        style={{
          background: 'rgba(10,19,38,0.95)',
          border:     '1px solid rgba(255,255,255,0.10)',
          boxShadow:  '0 32px 80px rgba(0,0,0,0.80)',
        }}
      >
        <div className="flex items-center justify-between mb-7">
          <h3 className="text-[17px] font-semibold text-white">تسجيل عملية مالية</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-all text-lg leading-none"
          >×</button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          {/* Description */}
          <div>
            <label className="block text-[11px] text-slate-500 mb-1.5 font-medium">وصف العملية</label>
            <input
              required
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="مثال: مبيعات أجهزة، دفع رواتب…"
              className="w-full rounded-[14px] px-4 py-3 text-[13px] text-white placeholder-slate-600 outline-none transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
            />
          </div>

          {/* Amount + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5 font-medium">المبلغ (ر.س)</label>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-[14px] px-4 py-3 text-[13px] text-amber-400 font-semibold placeholder-slate-600 outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5 font-medium">النوع</label>
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-[14px] px-4 py-3 text-[13px] text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                <option value="income"  style={{ background: '#0a1326' }}>دخل (+)</option>
                <option value="expense" style={{ background: '#0a1326' }}>مصروف (−)</option>
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-[11px] text-rose-400 bg-rose-400/10 px-3 py-2 rounded-xl">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-[14px] font-semibold text-[14px] text-black transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 8px 24px #f59e0b33' }}
          >
            {loading ? '…جاري الحفظ' : 'ترحيل القيد للسحابة ☁'}
          </button>
        </form>
      </div>
    </div>
  );
}
