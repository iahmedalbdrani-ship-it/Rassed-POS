// ============================================================
// Control Panel (رصيد) — إدارة المخزون
// Design: White Glassmorphism | RTL Arabic | Tajawal
// Data:   Supabase (products table) — Real CRUD + Realtime alerts
// ============================================================

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Package, Plus, Search, TrendingDown, AlertTriangle,
  XCircle, DollarSign, Edit3, X, Check,
  Minus, BarChart2, Tag, ArrowUpDown,
  ChevronLeft, ChevronRight, RefreshCw, Loader2,
} from 'lucide-react';
import { productsService, type ProductRow } from '../lib/supabase-services';
import supabase from '../lib/supabase';

// ─── Types ──────────────────────────────────────────────────
// We use ProductRow from supabase-services as our canonical type.
// UI aliases for readability:
type Product = ProductRow;

type StockStatus = 'all' | 'inStock' | 'lowStock' | 'outOfStock';
type SortField   = 'name' | 'stock' | 'price' | 'category';
type SortDir     = 'asc' | 'desc';

// ─── Static UI Data ──────────────────────────────────────────
const CATEGORIES = [
  'جميع الأصناف', 'مواد غذائية', 'مشروبات', 'منظفات',
  'أدوات منزلية', 'إلكترونيات', 'أرز', 'ألبان', 'زيوت',
  'توابل', 'معلبات', 'مجمدات', 'مخبوزات', 'وجبات خفيفة', 'أخرى',
];

const UNITS = ['كيس', 'زجاجة', 'كرتون', 'علبة', 'حزمة', 'حبة', 'لفة', 'كيلو', 'لتر', 'قارورة', 'شريط', 'عبوة'];

// ─── Helpers ─────────────────────────────────────────────────
const fmt = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getStatus(p: Product): 'inStock' | 'lowStock' | 'outOfStock' {
  if (p.stock === 0)                         return 'outOfStock';
  if (p.min_stock && p.stock < p.min_stock)  return 'lowStock';
  return 'inStock';
}

const STATUS_META = {
  inStock:    { label: 'متوفر',  color: '#10b981', bg: 'rgba(16,185,129,0.1)',  dot: '#10b981' },
  lowStock:   { label: 'منخفض', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  dot: '#f59e0b' },
  outOfStock: { label: 'نفذ',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   dot: '#ef4444' },
};

// ─── Toast ───────────────────────────────────────────────────
interface ToastProps { message: string; type: 'success' | 'error'; onClose: () => void }

function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div
      className="fixed bottom-6 left-6 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl"
      style={{
        background: type === 'success' ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#ef4444,#dc2626)',
        color: '#fff', backdropFilter: 'blur(20px)', minWidth: '260px',
      }}>
      {type === 'success' ? <Check size={17} /> : <AlertTriangle size={17} />}
      <span className="text-sm font-semibold flex-1">{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100 cursor-pointer"><X size={14} /></button>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color, bg }:
  { icon: React.ElementType; label: string; value: string | number; sub?: string; color: string; bg: string }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 rounded-3xl"
      style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 font-medium mb-0.5">{label}</p>
        <p className="text-xl font-black text-slate-800 leading-none">{value}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'inStock' | 'lowStock' | 'outOfStock' }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: m.bg, color: m.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

// ─── Add / Edit Product Modal ────────────────────────────────
interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
  onSave: (p: Product) => void;
  saving?: boolean;
}

function ProductModal({ product, onClose, onSave, saving = false }: ProductModalProps) {
  const isEdit = !!product;
  const blank: Partial<Product> = {
    barcode: '', name: '', name_en: '', category: 'مواد غذائية',
    unit: 'كيس', cost: 0, price: 0, stock: 0, min_stock: 10, icon: '📦',
  };

  const init = product ?? blank;

  // Numeric fields stored as strings so typing "1." doesn't snap to "1"
  // and Western digits are preserved regardless of OS locale
  const [form, setForm] = useState<Partial<Product>>(init);
  const [numStr, setNumStr] = useState({
    cost:      String(init.cost      ?? 0),
    price:     String(init.price     ?? 0),
    stock:     String(init.stock     ?? 0),
    min_stock: String(init.min_stock ?? 10),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = (field: keyof Product, val: string | number | boolean) =>
    setForm(f => ({ ...f, [field]: val }));

  /** Handle numeric text input — keeps raw string for display, syncs parsed number to form */
  function handleNum(field: 'cost' | 'price' | 'stock' | 'min_stock', raw: string) {
    // Allow: digits, one dot, leading minus
    if (!/^-?\d*\.?\d*$/.test(raw) && raw !== '') return;
    setNumStr(s => ({ ...s, [field]: raw }));
    const num = parseFloat(raw);
    setField(field, isNaN(num) ? 0 : num);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name?.trim())      e.name  = 'اسم المنتج مطلوب';
    if ((form.price ?? 0) <= 0)  e.price = 'سعر البيع يجب أن يكون أكبر من صفر';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (validate()) onSave(form as Product);
  }

  // Profit margin calc (use plain JS — not ar-SA formatter — so digits stay Western)
  const price = form.price ?? 0;
  const cost  = form.cost  ?? 0;
  const marginPct    = price > 0 ? (((price - cost) / price) * 100).toFixed(1) : null;
  const marginPerUnit = (price - cost).toFixed(2);
  const marginPositive = price > cost;

  // Text field component
  const TextField = ({ label, field, required = false, placeholder = '' }: {
    label: string; field: keyof Product; required?: boolean; placeholder?: string;
  }) => (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
        {label}{required && <span className="text-rose-400 mr-0.5">*</span>}
      </label>
      <input
        type="text"
        value={form[field] as string ?? ''}
        onChange={e => setField(field, e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl text-[13px] text-slate-700 outline-none transition-all"
        style={{
          background: 'rgba(248,250,252,0.8)',
          border: errors[field] ? '1.5px solid rgba(239,68,68,0.5)' : '1.5px solid rgba(0,0,0,0.07)',
        }}
      />
      {errors[field] && <p className="text-[10px] text-rose-400 mt-1">{errors[field]}</p>}
    </div>
  );

  // Numeric field component — always LTR Western digits, no type="number" quirks
  const NumField = ({ label, field, required = false, placeholder = '0' }: {
    label: string; field: 'cost' | 'price' | 'stock' | 'min_stock'; required?: boolean; placeholder?: string;
  }) => (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
        {label}{required && <span className="text-rose-400 mr-0.5">*</span>}
      </label>
      <input
        type="text"
        inputMode="decimal"
        dir="ltr"
        value={numStr[field]}
        onChange={e => handleNum(field, e.target.value)}
        onFocus={e => { if (numStr[field] === '0') { setNumStr(s => ({ ...s, [field]: '' })); e.target.select(); } }}
        onBlur={() => { if (numStr[field] === '' || numStr[field] === '-') setNumStr(s => ({ ...s, [field]: '0' })); }}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl text-[13px] text-slate-700 outline-none transition-all"
        style={{
          background: 'rgba(248,250,252,0.8)',
          border: errors[field] ? '1.5px solid rgba(239,68,68,0.5)' : '1.5px solid rgba(0,0,0,0.07)',
          textAlign: 'left',
          fontVariantNumeric: 'tabular-nums',
          fontFamily: 'ui-monospace, monospace',
        }}
      />
      {errors[field] && <p className="text-[10px] text-rose-400 mt-1">{errors[field]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl"
        style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 32px 80px rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.9)' }}>

        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 14px rgba(249,115,22,0.35)' }}>
              <Package size={16} className="text-white" />
            </div>
            <h2 className="font-bold text-slate-800 text-[15px]">{isEdit ? 'تعديل منتج' : 'إضافة منتج جديد'}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors cursor-pointer">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <TextField label="اسم المنتج بالعربية" field="name" required placeholder="مثال: أرز بسمتي" />
            <TextField label="اسم المنتج بالإنجليزية" field="name_en" placeholder="Basmati Rice" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="الباركود / SKU" field="barcode" placeholder="6281234567890" />
            <TextField label="أيقونة (Emoji)" field="icon" placeholder="📦" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">الفئة</label>
              <select value={form.category ?? 'مواد غذائية'} onChange={e => setField('category', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-slate-700 outline-none cursor-pointer"
                style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(0,0,0,0.07)' }}>
                {CATEGORIES.slice(1).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">وحدة القياس</label>
              <select value={form.unit ?? 'كيس'} onChange={e => setField('unit', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-slate-700 outline-none cursor-pointer"
                style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(0,0,0,0.07)' }}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumField label="سعر التكلفة (ر.س)" field="cost" placeholder="0.00" />
            <NumField label="سعر البيع (ر.س)" field="price" required placeholder="0.00" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <NumField label="الكمية الحالية" field="stock" placeholder="0" />
            <NumField label="حد التنبيه (أدنى)" field="min_stock" placeholder="10" />
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">معفى من الضريبة</label>
              <select value={form.vat_exempt ? 'yes' : 'no'} onChange={e => setField('vat_exempt', e.target.value === 'yes')}
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-slate-700 outline-none cursor-pointer"
                style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(0,0,0,0.07)' }}>
                <option value="no">لا — خاضع للضريبة 15%</option>
                <option value="yes">نعم — معفى</option>
              </select>
            </div>
          </div>
          {price > 0 && (
            <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{
                background: marginPositive ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                border: `1px solid ${marginPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`,
              }}>
              <BarChart2 size={14} style={{ color: marginPositive ? '#10b981' : '#ef4444', flexShrink: 0 }} />
              <span className="text-[12px] text-slate-600">
                هامش الربح:{' '}
                <strong style={{ color: marginPositive ? '#059669' : '#dc2626' }}>
                  {marginPct}%
                </strong>
                {' '}
                <span className="text-slate-400">({marginPerUnit} ر.س للوحدة)</span>
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-white text-[13px] font-bold transition-all hover:opacity-90 disabled:opacity-60 cursor-pointer"
            style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.35)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> جاري الحفظ...</> : <><Check size={15} />{isEdit ? 'حفظ التعديلات' : 'إضافة المنتج'}</>}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-2xl text-slate-500 text-[13px] font-medium hover:bg-slate-100 transition-colors cursor-pointer">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stock Adjustment Modal ──────────────────────────────────
interface AdjustModalProps {
  product: Product;
  onClose: () => void;
  onConfirm: (id: string, delta: number, reason: string) => Promise<void>;
}

const REASONS_ADD = ['استلام بضاعة جديدة', 'تعديل جرد', 'إرجاع بضاعة', 'تحويل من فرع'];
const REASONS_SUB = ['بيع محلي', 'تالف / هالك', 'نقل لفرع آخر', 'تعديل جرد'];

function AdjustModal({ product, onClose, onConfirm }: AdjustModalProps) {
  const [mode, setMode]     = useState<'add' | 'sub'>('add');
  const [qty, setQty]       = useState(1);
  const [reason, setReason] = useState(REASONS_ADD[0]);
  const [saving, setSaving] = useState(false);
  const newStock = mode === 'add' ? product.stock + qty : Math.max(0, product.stock - qty);

  async function handleSave() {
    setSaving(true);
    await onConfirm(product.id, mode === 'add' ? qty : -qty, reason);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-3xl" style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 32px 80px rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.9)' }}>
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <div>
            <h2 className="font-bold text-slate-800 text-[15px]">تعديل الكمية</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{product.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors cursor-pointer">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid rgba(0,0,0,0.05)' }}>
            <span className="text-[12px] text-slate-500">الكمية الحالية</span>
            <span className="text-xl font-black text-slate-800">{product.stock} <span className="text-[12px] font-medium text-slate-400">{product.unit}</span></span>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl" style={{ background: 'rgba(0,0,0,0.04)' }}>
            {(['add', 'sub'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setReason(m === 'add' ? REASONS_ADD[0] : REASONS_SUB[0]); }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold transition-all cursor-pointer"
                style={{
                  background: mode === m ? (m === 'add' ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#ef4444,#dc2626)') : 'transparent',
                  color: mode === m ? 'white' : '#64748b',
                  boxShadow: mode === m ? (m === 'add' ? '0 4px 12px rgba(16,185,129,0.3)' : '0 4px 12px rgba(239,68,68,0.3)') : 'none',
                }}>
                {m === 'add' ? <><Plus size={14} /> إضافة كمية</> : <><Minus size={14} /> خصم كمية</>}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">الكمية</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer" style={{ background: 'rgba(0,0,0,0.05)' }}>
                <Minus size={14} className="text-slate-500" />
              </button>
              <input type="number" min={1} value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 text-center py-2.5 rounded-xl text-[15px] font-black text-slate-800 outline-none"
                style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(249,115,22,0.3)' }} />
              <button onClick={() => setQty(q => q + 1)}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer" style={{ background: 'rgba(249,115,22,0.1)' }}>
                <Plus size={14} className="text-orange-500" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">السبب</label>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-[13px] text-slate-700 outline-none"
              style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(0,0,0,0.07)' }}>
              {(mode === 'add' ? REASONS_ADD : REASONS_SUB).map(r => <option key={r}>{r}</option>)}
            </select>
          </div>

          <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
            style={{ background: mode === 'add' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${mode === 'add' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
            <span className="text-[12px]" style={{ color: mode === 'add' ? '#059669' : '#dc2626' }}>
              {mode === 'add' ? 'الكمية بعد الإضافة' : 'الكمية بعد الخصم'}
            </span>
            <span className="text-xl font-black" style={{ color: mode === 'add' ? '#059669' : '#dc2626' }}>
              {newStock} <span className="text-[12px] font-medium opacity-70">{product.unit}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-white text-[13px] font-bold transition-all hover:opacity-90 disabled:opacity-60 cursor-pointer"
            style={{ background: mode === 'add' ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: mode === 'add' ? '0 4px 16px rgba(16,185,129,0.3)' : '0 4px 16px rgba(239,68,68,0.3)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> جاري التحديث...</> : 'تأكيد التعديل'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-2xl text-slate-500 text-[13px] font-medium hover:bg-slate-100 transition-colors cursor-pointer">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export function InventoryPage() {
  const [products, setProducts]       = useState<Product[]>([]);
  const [loading, setLoading]         = useState(true);
  const [savingModal, setSavingModal] = useState(false);
  const [search, setSearch]           = useState('');
  const [categoryFilter, setCategoryFilter] = useState('جميع الأصناف');
  const [statusFilter, setStatusFilter]     = useState<StockStatus>('all');
  const [sortField, setSortField]     = useState<SortField>('name');
  const [sortDir, setSortDir]         = useState<SortDir>('asc');
  const [page, setPage]               = useState(1);
  const [addModal, setAddModal]       = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [toast, setToast]             = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const PER_PAGE = 8;

  // ── Fetch from Supabase ──────────────────────────────
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await productsService.list();
      setProducts(data);
    } catch (err: any) {
      setToast({ message: `تعذّر جلب المنتجات: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // ── Realtime: low stock alerts ───────────────────────
  useEffect(() => {
    // Subscribe to product updates (to detect low stock in realtime)
    const channel = (supabase
      .channel('inventory:products') as any)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products' }, (payload: any) => {
        const updated = payload.new as Product;
        setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
        // Alert if low stock after update
        if (updated.min_stock && updated.stock > 0 && updated.stock <= updated.min_stock) {
          setToast({ message: `⚠️ تنبيه: مخزون "${updated.name}" أوشك على النفاد (${updated.stock} متبقٍ)`, type: 'error' });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Derived stats ─────────────────────────────────────
  const stats = useMemo(() => ({
    total:    products.length,
    lowStock: products.filter(p => getStatus(p) === 'lowStock').length,
    outStock: products.filter(p => getStatus(p) === 'outOfStock').length,
    totalVal: products.reduce((acc, p) => acc + p.price * p.stock, 0),
  }), [products]);

  // ── Filtered + sorted list ────────────────────────────
  const filtered = useMemo(() => {
    let list = products.filter(p => {
      const q = search.trim().toLowerCase();
      if (q && !p.name.toLowerCase().includes(q) && !(p.barcode ?? '').toLowerCase().includes(q)) return false;
      if (categoryFilter !== 'جميع الأصناف' && p.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && getStatus(p) !== statusFilter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let va: any = a[sortField as keyof Product];
      let vb: any = b[sortField as keyof Product];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [products, search, categoryFilter, statusFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setPage(1);
  }

  // ── CRUD Handlers ─────────────────────────────────────
  async function handleSaveProduct(p: Product) {
    setSavingModal(true);
    try {
      if (p.id) {
        // Edit existing
        const updated = await productsService.update(p.id, p);
        setProducts(prev => prev.map(x => x.id === updated.id ? updated : x));
        setToast({ message: `✓ تم تحديث "${updated.name}" بنجاح`, type: 'success' });
      } else {
        // New product
        const created = await productsService.create(p);
        setProducts(prev => [created, ...prev]);
        setToast({ message: `✓ تمت إضافة "${created.name}" إلى المخزون`, type: 'success' });
      }
      setAddModal(false);
      setEditProduct(null);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setSavingModal(false);
    }
  }

  async function handleAdjust(id: string, delta: number, _reason: string) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const newStock = Math.max(0, product.stock + delta);
    try {
      const updated = await productsService.update(id, { stock: newStock });
      setProducts(prev => prev.map(p => p.id === id ? updated : p));
      setToast({ message: `✓ تم تحديث مخزون "${updated.name}" إلى ${newStock} وحدة`, type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  }

  async function handleDelete(id: string) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    if (!confirm(`هل تريد حذف "${product.name}" من المخزون؟`)) return;
    try {
      await productsService.delete(id);
      setProducts(prev => prev.filter(p => p.id !== id));
      setToast({ message: `✓ تم حذف "${product.name}" بنجاح`, type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown size={11} className="opacity-40 mr-0.5"
      style={{ color: sortField === field ? '#f97316' : 'inherit', opacity: sortField === field ? 1 : 0.4 }} />
  );

  // ── Render ────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5 min-h-full" dir="rtl" style={{ fontFamily: 'Tajawal, sans-serif' }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 leading-tight">إدارة المخزون</h1>
          <p className="text-[12px] text-slate-400 mt-0.5">
            {loading ? 'جاري جلب بيانات المخزون...' : `${products.length} صنف مسجل في المستودع`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadProducts} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-slate-500 text-[12px] font-medium transition-all hover:bg-white/60 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.9)' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            تحديث
          </button>
          <button onClick={() => setAddModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-white text-[13px] font-bold transition-all hover:opacity-90 active:scale-[0.97] cursor-pointer"
            style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.35)' }}>
            <Plus size={16} /> إضافة منتج
          </button>
        </div>
      </div>

      {/* ── Loading State ── */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
          <Loader2 size={24} className="animate-spin text-orange-400" />
          <span className="text-sm font-medium">جاري جلب بيانات المخزون من قاعدة البيانات...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard icon={Package}      label="إجمالي الأصناف"   value={stats.total}                              color="#f97316" bg="rgba(249,115,22,0.1)" />
            <KpiCard icon={TrendingDown} label="منخفض المخزون"    value={stats.lowStock}  sub="تحتاج تزويد"       color="#f59e0b" bg="rgba(245,158,11,0.1)" />
            <KpiCard icon={XCircle}      label="نفذ من المخزون"   value={stats.outStock}  sub="غير متوفر"         color="#ef4444" bg="rgba(239,68,68,0.1)"  />
            <KpiCard icon={DollarSign}   label="قيمة المخزون"     value={`${fmt.format(stats.totalVal)} ر.س`}     color="#10b981" bg="rgba(16,185,129,0.1)" />
          </div>

          {/* ── Low stock alert ── */}
          {(stats.lowStock > 0 || stats.outStock > 0) && (
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl"
              style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
              <p className="text-[12px] text-amber-700">
                {stats.outStock > 0 && <><strong>{stats.outStock} صنف نفذ</strong> من المخزون. </>}
                {stats.lowStock > 0 && <><strong>{stats.lowStock} صنف</strong> وصل لحد التنبيه الأدنى.</>}
                {' '}يُنصح بإعادة التزويد فوراً.
              </p>
            </div>
          )}

          {/* ── Filter Bar ── */}
          <div className="rounded-3xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[180px] px-3 py-2 rounded-2xl"
                style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(0,0,0,0.07)' }}>
                <Search size={14} className="text-slate-400 flex-shrink-0" />
                <input
                  placeholder="ابحث باسم المنتج أو الباركود..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="flex-1 bg-transparent text-[13px] text-slate-700 placeholder-slate-300 outline-none"
                />
                {search && <button onClick={() => setSearch('')} className="cursor-pointer"><X size={12} className="text-slate-400 hover:text-slate-600" /></button>}
              </div>

              <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl"
                style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(0,0,0,0.07)' }}>
                <Tag size={13} className="text-slate-400" />
                <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
                  className="bg-transparent text-[12px] text-slate-600 outline-none cursor-pointer pr-1">
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {/* Status filter pills */}
              {(['all', 'inStock', 'lowStock', 'outOfStock'] as StockStatus[]).map(s => {
                const labels = { all: 'الكل', inStock: 'متوفر', lowStock: 'منخفض', outOfStock: 'نفذ' };
                const colors = { all: '#64748b', inStock: '#10b981', lowStock: '#f59e0b', outOfStock: '#ef4444' };
                return (
                  <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                    className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer"
                    style={{
                      background: statusFilter === s ? `${colors[s]}18` : 'rgba(0,0,0,0.03)',
                      color: statusFilter === s ? colors[s] : '#94a3b8',
                      border: `1.5px solid ${statusFilter === s ? `${colors[s]}30` : 'rgba(0,0,0,0.06)'}`,
                    }}>
                    {labels[s]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Table ── */}
          <div className="rounded-3xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>

            {/* Table header */}
            <div className="grid px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider"
              style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr auto', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              {[
                { label: 'المنتج', field: 'name' as SortField },
                { label: 'الفئة', field: 'category' as SortField },
                { label: 'الكمية', field: 'stock' as SortField },
                { label: 'الحالة', field: null },
                { label: 'سعر البيع', field: 'price' as SortField },
                { label: 'قيمة المخزون', field: null },
                { label: 'إجراءات', field: null },
              ].map((col, i) => (
                <div key={i}
                  className={`flex items-center gap-1 ${col.field ? 'cursor-pointer hover:text-slate-600' : ''}`}
                  onClick={() => col.field && toggleSort(col.field)}>
                  {col.label}
                  {col.field && <SortIcon field={col.field} />}
                </div>
              ))}
            </div>

            {/* Rows */}
            {paginated.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-300">
                <Package size={40} className="mb-3 opacity-30" />
                <p className="text-sm">لا توجد منتجات — أضف منتجاً جديداً</p>
              </div>
            ) : (
              paginated.map((p, idx) => {
                const status = getStatus(p);
                return (
                  <div key={p.id}
                    className="grid px-5 py-4 items-center transition-all hover:bg-white/60"
                    style={{
                      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr auto',
                      borderBottom: idx < paginated.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                    }}>
                    {/* Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
                        style={{ background: 'rgba(249,115,22,0.08)' }}>
                        {p.icon ?? '📦'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-slate-700 truncate">{p.name}</p>
                        {p.barcode && <p className="text-[10px] text-slate-400 font-mono">{p.barcode}</p>}
                      </div>
                    </div>

                    {/* Category */}
                    <p className="text-[12px] text-slate-500">{p.category ?? '—'}</p>

                    {/* Stock */}
                    <div>
                      <p className="text-[13px] font-bold text-slate-800">{p.stock}</p>
                      <p className="text-[10px] text-slate-400">{p.unit}</p>
                    </div>

                    {/* Status */}
                    <StatusBadge status={status} />

                    {/* Sale price */}
                    <p className="text-[13px] font-semibold text-slate-700">{fmt.format(p.price)} <span className="text-slate-400 text-[10px]">ر.س</span></p>

                    {/* Stock value */}
                    <p className="text-[12px] text-emerald-600 font-semibold">{fmt.format(p.price * p.stock)} <span className="text-slate-400 text-[10px]">ر.س</span></p>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setAdjustProduct(p)}
                        className="w-7 h-7 rounded-xl flex items-center justify-center transition-colors hover:bg-amber-50 cursor-pointer"
                        title="تعديل الكمية">
                        <Package size={13} className="text-amber-500" />
                      </button>
                      <button onClick={() => setEditProduct(p)}
                        className="w-7 h-7 rounded-xl flex items-center justify-center transition-colors hover:bg-blue-50 cursor-pointer"
                        title="تعديل المنتج">
                        <Edit3 size={13} className="text-blue-400" />
                      </button>
                      <button onClick={() => handleDelete(p.id)}
                        className="w-7 h-7 rounded-xl flex items-center justify-center transition-colors hover:bg-rose-50 cursor-pointer"
                        title="حذف المنتج">
                        <X size={13} className="text-rose-400" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-[12px] text-slate-400">
                عرض {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} من {filtered.length} صنف
              </p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <ChevronRight size={14} className="text-slate-500" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className="w-8 h-8 rounded-xl text-[12px] font-bold transition-all cursor-pointer"
                      style={{
                        background: page === p ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'rgba(255,255,255,0.7)',
                        color: page === p ? 'white' : '#64748b',
                        border: page === p ? 'none' : '1px solid rgba(0,0,0,0.06)',
                        boxShadow: page === p ? '0 4px 12px rgba(249,115,22,0.3)' : 'none',
                      }}>
                      {p}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <ChevronLeft size={14} className="text-slate-500" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modals ── */}
      {(addModal || editProduct) && (
        <ProductModal
          product={editProduct}
          onClose={() => { setAddModal(false); setEditProduct(null); }}
          onSave={handleSaveProduct}
          saving={savingModal}
        />
      )}
      {adjustProduct && (
        <AdjustModal
          product={adjustProduct}
          onClose={() => setAdjustProduct(null)}
          onConfirm={handleAdjust}
        />
      )}
    </div>
  );
}

export default InventoryPage;
