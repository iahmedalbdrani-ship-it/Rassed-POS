// ============================================================
// Control Panel (رصيد) — إدارة المخزون v2.0
// Design : White Glassmorphism | RTL Arabic | Tajawal
// Tabs   : قائمة المنتجات | الأصناف | استيراد CSV
// Data   : Supabase Real-time | react-barcode | window.print()
// ============================================================

import {
  useState, useMemo, useEffect, useCallback,
  useRef, type DragEvent, type ChangeEvent,
} from 'react';
import Barcode from 'react-barcode';
import {
  Package, Plus, Search, TrendingDown, AlertTriangle,
  XCircle, DollarSign, Edit3, X, Check, Minus, BarChart2,
  Tag, ArrowUpDown, ChevronLeft, ChevronRight, RefreshCw,
  Loader2, Printer, Upload, Hash, Wand2,
  Layers, FileSpreadsheet, Trash2, CheckSquare, Square,
  Zap, ChevronDown, ArrowRight,
} from 'lucide-react';
import { productsService, type ProductRow } from '../lib/supabase-services';
import supabase from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { getTenantData, deleteTenantData } from '../lib/tenant';

// ─── Types ───────────────────────────────────────────────────
type Product      = ProductRow;
type StockStatus  = 'all' | 'inStock' | 'lowStock' | 'outOfStock';
type SortField    = 'name' | 'stock' | 'price' | 'category';
type SortDir      = 'asc' | 'desc';
type ActiveTab    = 'products' | 'categories' | 'import';
type LabelSize    = '38x25' | '50x30';

interface Category {
  id: string;
  name: string;
  description?: string;
  icon: string;
  created_at?: string;
}

interface CSVRow    { [key: string]: string }
interface CSVResult { headers: string[]; rows: CSVRow[] }

// ─── Supabase: Categories Service ─────────────────────────────
const categoriesService = {
  async list(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Category[];
  },
  async create(cat: Omit<Category, 'id' | 'created_at'>): Promise<Category> {
    const { data, error } = await supabase
      .from('categories')
      .insert([cat])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Category;
  },
  async update(id: string, cat: Partial<Category>): Promise<Category> {
    const { data, error } = await supabase
      .from('categories')
      .update(cat)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Category;
  },
  async delete(id: string, orgId: string): Promise<void> {
    await deleteTenantData('categories', orgId, id);
  },
};

// ─── Static Fallback Categories ──────────────────────────────
const FALLBACK_CATEGORIES = [
  'مواد غذائية','مشروبات','منظفات','أدوات منزلية',
  'إلكترونيات','ألبان','زيوت','توابل','معلبات',
  'مجمدات','مخبوزات','وجبات خفيفة','أخرى',
];
const UNITS = [
  'كيس','زجاجة','كرتون','علبة','حزمة','حبة',
  'لفة','كيلو','لتر','قارورة','شريط','عبوة',
];

// ─── CSV product field map ────────────────────────────────────
const PRODUCT_FIELDS: { key: keyof Product; label: string; required?: boolean }[] = [
  { key: 'name',      label: 'اسم المنتج (عربي)',    required: true },
  { key: 'name_en',   label: 'اسم المنتج (إنجليزي)' },
  { key: 'barcode',   label: 'الباركود / SKU' },
  { key: 'category',  label: 'الفئة' },
  { key: 'price',     label: 'سعر البيع',            required: true },
  { key: 'cost',      label: 'سعر التكلفة' },
  { key: 'stock',     label: 'الكمية' },
  { key: 'min_stock', label: 'حد التنبيه' },
  { key: 'unit',      label: 'وحدة القياس' },
  { key: 'icon',      label: 'أيقونة Emoji' },
];

// ─── Helpers ──────────────────────────────────────────────────
const fmt = new Intl.NumberFormat('ar-SA', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

function getStatus(p: Product): 'inStock' | 'lowStock' | 'outOfStock' {
  if (p.stock === 0)                        return 'outOfStock';
  if (p.min_stock && p.stock < p.min_stock) return 'lowStock';
  return 'inStock';
}

const STATUS_META = {
  inStock:    { label: 'متوفر',  color: '#10b981', bg: 'rgba(16,185,129,0.1)',  dot: '#10b981' },
  lowStock:   { label: 'منخفض', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  dot: '#f59e0b' },
  outOfStock: { label: 'نفذ',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   dot: '#ef4444' },
};

/** Simple but robust CSV parser — handles quoted fields, escaped quotes */
function parseCSV(text: string): CSVResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let cur = '';
    let inQ  = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        fields.push(cur.trim()); cur = '';
      } else { cur += ch; }
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const vals = parseLine(line);
    const row: CSVRow = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v !== ''));

  return { headers, rows };
}

/** Generate a deterministic barcode from UUID (12 numeric digits) */
function barcodeFromId(id: string): string {
  const cleaned = id.replace(/-/g, '').replace(/[^0-9]/g, '');
  return '200' + (cleaned + '000000000').slice(0, 9);
}

/** Safe barcode value — ensures it's non-empty and valid for CODE128 */
function safeBarcode(val: string | undefined, fallback: string): string {
  const v = (val ?? '').trim();
  return v.length > 0 ? v : fallback;
}

// ─── Glass style helper ───────────────────────────────────────
const glass = {
  background: 'rgba(255,255,255,0.60)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.90)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
};

const deepGlass = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(32px)',
  WebkitBackdropFilter: 'blur(32px)',
  border: '1px solid rgba(255,255,255,0.90)',
  boxShadow: '0 32px 80px rgba(0,0,0,0.18)',
};

// ═══════════════════════════════════════════════════════════
// ── Reusable UI Atoms
// ═══════════════════════════════════════════════════════════

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="fixed bottom-6 left-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl"
      style={{
        background: type === 'success'
          ? 'linear-gradient(135deg,#10b981,#059669)'
          : 'linear-gradient(135deg,#ef4444,#dc2626)',
        color: '#fff', minWidth: '260px',
      }}>
      {type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
      <span className="text-sm font-semibold flex-1">{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100 cursor-pointer">
        <X size={13} />
      </button>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color, bg }: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color: string; bg: string;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 rounded-3xl" style={glass}>
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{ background: bg }}>
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
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
      style={{ background: m.bg, color: m.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
// ── Product Add/Edit Modal
// ═══════════════════════════════════════════════════════════
interface ProductModalProps {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSave: (p: Product) => void;
  saving?: boolean;
}

function ProductModal({ product, categories, onClose, onSave, saving = false }: ProductModalProps) {
  const isEdit = !!product;
  const blank: Partial<Product> = {
    barcode: '', name: '', name_en: '', category: '',
    unit: 'كيس', cost: 0, price: 0, stock: 0, min_stock: 10, icon: '📦',
  };
  const init = product ?? blank;

  const [form, setForm]     = useState<Partial<Product>>(init);
  const [numStr, setNumStr] = useState({
    cost:      String(init.cost      ?? 0),
    price:     String(init.price     ?? 0),
    stock:     String(init.stock     ?? 0),
    min_stock: String(init.min_stock ?? 10),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── helpers (لا مكوّنات داخلية — سبب فقدان الـ Focus) ──────
  const setField = (field: keyof Product, val: string | number | boolean) =>
    setForm(f => ({ ...f, [field]: val }));

  function handleNum(field: 'cost' | 'price' | 'stock' | 'min_stock', raw: string) {
    if (!/^-?\d*\.?\d*$/.test(raw) && raw !== '') return;
    setNumStr(s => ({ ...s, [field]: raw }));
    const n = parseFloat(raw);
    setField(field, isNaN(n) ? 0 : n);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name?.trim())     e.name  = 'اسم المنتج مطلوب';
    if ((form.price ?? 0) <= 0) e.price = 'سعر البيع يجب أن يكون أكبر من صفر';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const price      = form.price ?? 0;
  const cost       = form.cost  ?? 0;
  const marginPct  = price > 0 ? (((price - cost) / price) * 100).toFixed(1) : null;
  const marginUnit = (price - cost).toFixed(2);
  const marginPos  = price > cost;

  const catOptions = categories.length > 0
    ? categories.map(c => c.name)
    : FALLBACK_CATEGORIES;

  // ── shared input styles ───────────────────────────────────
  const iBase  = 'w-full px-3 py-2.5 rounded-xl text-[13px] text-slate-700 outline-none transition-all';
  const iBorder = (f: string) => ({
    background: 'rgba(248,250,252,0.8)',
    border: errors[f] ? '1.5px solid rgba(239,68,68,0.5)' : '1.5px solid rgba(0,0,0,0.07)',
  });
  const iNum = { textAlign: 'left' as const, fontFamily: 'ui-monospace,monospace' };
  const lbl  = 'block text-[11px] font-semibold text-slate-500 mb-1.5';
  const req  = <span className="text-rose-400 mr-0.5">*</span>;
  const err  = (f: string) => errors[f]
    ? <p className="text-[10px] text-rose-400 mt-1">{errors[f]}</p>
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl" style={deepGlass}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 14px rgba(249,115,22,0.35)' }}>
              <Package size={16} className="text-white" />
            </div>
            <h2 className="font-bold text-slate-800 text-[15px]">
              {isEdit ? 'تعديل منتج' : 'إضافة منتج جديد'}
            </h2>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors cursor-pointer">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Body — كل حقل مُضمَّن مباشرةً (لا sub-components) */}
        <div className="p-6 space-y-5">

          {/* Row 1: اسم عربي + اسم إنجليزي */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>اسم المنتج بالعربية {req}</label>
              <input
                type="text"
                value={form.name ?? ''}
                onChange={e => setField('name', e.target.value)}
                placeholder="مثال: أرز بسمتي"
                className={iBase}
                style={iBorder('name')}
              />
              {err('name')}
            </div>
            <div>
              <label className={lbl}>اسم المنتج بالإنجليزية</label>
              <input
                type="text"
                value={form.name_en ?? ''}
                onChange={e => setField('name_en', e.target.value)}
                placeholder="Basmati Rice"
                className={iBase}
                style={iBorder('name_en')}
              />
            </div>
          </div>

          {/* Row 2: باركود + أيقونة */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>الباركود / SKU</label>
              <input
                type="text"
                value={form.barcode ?? ''}
                onChange={e => setField('barcode', e.target.value)}
                placeholder="6281234567890"
                dir="ltr"
                className={iBase}
                style={{ ...iBorder('barcode'), fontFamily: 'ui-monospace,monospace' }}
              />
            </div>
            <div>
              <label className={lbl}>أيقونة (Emoji)</label>
              <input
                type="text"
                value={form.icon ?? ''}
                onChange={e => setField('icon', e.target.value)}
                placeholder="📦"
                className={iBase}
                style={iBorder('icon')}
              />
            </div>
          </div>

          {/* Row 3: فئة + وحدة */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>الفئة</label>
              <select
                value={form.category ?? ''}
                onChange={e => setField('category', e.target.value)}
                className={iBase + ' cursor-pointer'}
                style={iBorder('category')}
              >
                <option value="">— اختر فئة —</option>
                {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>وحدة القياس</label>
              <select
                value={form.unit ?? 'كيس'}
                onChange={e => setField('unit', e.target.value)}
                className={iBase + ' cursor-pointer'}
                style={iBorder('unit')}
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Row 4: تكلفة + بيع */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>سعر التكلفة (ر.س)</label>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                value={numStr.cost}
                onChange={e => handleNum('cost', e.target.value)}
                onFocus={e => { if (numStr.cost === '0') { setNumStr(s => ({ ...s, cost: '' })); e.target.select(); } }}
                onBlur={() => { if (!numStr.cost || numStr.cost === '-') setNumStr(s => ({ ...s, cost: '0' })); }}
                className={iBase}
                style={{ ...iBorder('cost'), ...iNum }}
              />
            </div>
            <div>
              <label className={lbl}>سعر البيع (ر.س) {req}</label>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                value={numStr.price}
                onChange={e => handleNum('price', e.target.value)}
                onFocus={e => { if (numStr.price === '0') { setNumStr(s => ({ ...s, price: '' })); e.target.select(); } }}
                onBlur={() => { if (!numStr.price || numStr.price === '-') setNumStr(s => ({ ...s, price: '0' })); }}
                className={iBase}
                style={{ ...iBorder('price'), ...iNum }}
              />
              {err('price')}
            </div>
          </div>

          {/* Row 5: كمية + حد تنبيه + ضريبة */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>الكمية الحالية</label>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={numStr.stock}
                onChange={e => handleNum('stock', e.target.value)}
                onFocus={e => { if (numStr.stock === '0') { setNumStr(s => ({ ...s, stock: '' })); e.target.select(); } }}
                onBlur={() => { if (!numStr.stock || numStr.stock === '-') setNumStr(s => ({ ...s, stock: '0' })); }}
                className={iBase}
                style={{ ...iBorder('stock'), ...iNum }}
              />
            </div>
            <div>
              <label className={lbl}>حد التنبيه (أدنى)</label>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={numStr.min_stock}
                onChange={e => handleNum('min_stock', e.target.value)}
                onFocus={e => { if (numStr.min_stock === '0') { setNumStr(s => ({ ...s, min_stock: '' })); e.target.select(); } }}
                onBlur={() => { if (!numStr.min_stock || numStr.min_stock === '-') setNumStr(s => ({ ...s, min_stock: '0' })); }}
                className={iBase}
                style={{ ...iBorder('min_stock'), ...iNum }}
              />
            </div>
            <div>
              <label className={lbl}>معفى من الضريبة</label>
              <select
                value={form.vat_exempt ? 'yes' : 'no'}
                onChange={e => setField('vat_exempt', e.target.value === 'yes')}
                className={iBase + ' cursor-pointer'}
                style={iBorder('vat_exempt')}
              >
                <option value="no">لا — خاضع 15%</option>
                <option value="yes">نعم — معفى</option>
              </select>
            </div>
          </div>

          {/* هامش الربح */}
          {price > 0 && (
            <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{
                background: marginPos ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                border: `1px solid ${marginPos ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`,
              }}>
              <BarChart2 size={14} style={{ color: marginPos ? '#10b981' : '#ef4444', flexShrink: 0 }} />
              <span className="text-[12px] text-slate-600">
                هامش الربح:{' '}
                <strong style={{ color: marginPos ? '#059669' : '#dc2626' }}>{marginPct}%</strong>
                {' '}<span className="text-slate-400">({marginUnit} ر.س للوحدة)</span>
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4"
          style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <button onClick={() => { if (validate()) onSave(form as Product); }} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-white text-[13px] font-bold transition-all hover:opacity-90 disabled:opacity-60 cursor-pointer"
            style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.35)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> جاري الحفظ...</> : <><Check size={15} />{isEdit ? 'حفظ التعديلات' : 'إضافة المنتج'}</>}
          </button>
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-2xl text-slate-500 text-[13px] font-medium hover:bg-slate-100 transition-colors cursor-pointer">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── Stock Adjustment Modal
// ═══════════════════════════════════════════════════════════
const REASONS_ADD = ['استلام بضاعة جديدة','تعديل جرد','إرجاع بضاعة','تحويل من فرع'];
const REASONS_SUB = ['بيع محلي','تالف / هالك','نقل لفرع آخر','تعديل جرد'];

function AdjustModal({ product, onClose, onConfirm }: {
  product: Product;
  onClose: () => void;
  onConfirm: (id: string, delta: number, reason: string) => Promise<void>;
}) {
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

  const accentColor = mode === 'add'
    ? 'linear-gradient(135deg,#10b981,#059669)'
    : 'linear-gradient(135deg,#ef4444,#dc2626)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-3xl" style={deepGlass}>

        <div className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div>
            <h2 className="font-bold text-slate-800 text-[15px]">تعديل الكمية</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{product.name}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 cursor-pointer">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between rounded-2xl px-4 py-3"
            style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid rgba(0,0,0,0.05)' }}>
            <span className="text-[12px] text-slate-500">الكمية الحالية</span>
            <span className="text-xl font-black text-slate-800">
              {product.stock} <span className="text-[12px] font-medium text-slate-400">{product.unit}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl" style={{ background: 'rgba(0,0,0,0.04)' }}>
            {(['add', 'sub'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setReason(m === 'add' ? REASONS_ADD[0] : REASONS_SUB[0]); }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold transition-all cursor-pointer"
                style={{
                  background: mode === m ? accentColor : 'transparent',
                  color: mode === m ? 'white' : '#64748b',
                  boxShadow: mode === m ? (m === 'add' ? '0 4px 12px rgba(16,185,129,0.3)' : '0 4px 12px rgba(239,68,68,0.3)') : 'none',
                }}>
                {m === 'add' ? <><Plus size={14} /> إضافة</> : <><Minus size={14} /> خصم</>}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">الكمية</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
                style={{ background: 'rgba(0,0,0,0.05)' }}>
                <Minus size={14} className="text-slate-500" />
              </button>
              <input type="number" min={1} value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 text-center py-2.5 rounded-xl text-[15px] font-black text-slate-800 outline-none"
                style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(249,115,22,0.3)' }} />
              <button onClick={() => setQty(q => q + 1)}
                className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
                style={{ background: 'rgba(249,115,22,0.1)' }}>
                <Plus size={14} className="text-orange-500" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">السبب</label>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-[13px] text-slate-700 outline-none cursor-pointer"
              style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(0,0,0,0.07)' }}>
              {(mode === 'add' ? REASONS_ADD : REASONS_SUB).map(r => <option key={r}>{r}</option>)}
            </select>
          </div>

          <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
            style={{
              background: mode === 'add' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
              border: `1px solid ${mode === 'add' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`,
            }}>
            <span className="text-[12px]" style={{ color: mode === 'add' ? '#059669' : '#dc2626' }}>
              {mode === 'add' ? 'الكمية بعد الإضافة' : 'الكمية بعد الخصم'}
            </span>
            <span className="text-xl font-black" style={{ color: mode === 'add' ? '#059669' : '#dc2626' }}>
              {newStock} <span className="text-[12px] font-medium opacity-70">{product.unit}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-4" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-white text-[13px] font-bold transition-all hover:opacity-90 disabled:opacity-60 cursor-pointer"
            style={{ background: accentColor, boxShadow: mode === 'add' ? '0 4px 16px rgba(16,185,129,0.3)' : '0 4px 16px rgba(239,68,68,0.3)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> جاري التحديث...</> : 'تأكيد التعديل'}
          </button>
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-2xl text-slate-500 text-[13px] font-medium hover:bg-slate-100 cursor-pointer">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── Label Print Modal
// ═══════════════════════════════════════════════════════════
interface LabelPrintModalProps {
  products: Product[];
  onClose: () => void;
}

function LabelPrintModal({ products, onClose }: LabelPrintModalProps) {
  const [size, setSize]    = useState<LabelSize>('50x30');
  const [qtys, setQtys]    = useState<Record<string, number>>(
    Object.fromEntries(products.map(p => [p.id, 1]))
  );

  const totalLabels = products.reduce((acc, p) => acc + (qtys[p.id] || 1), 0);
  const dims = size === '38x25'
    ? { w: '38mm', h: '25mm', nameSize: '6pt', priceSize: '8pt', barcodeH: 24, barcodeW: 1.2 }
    : { w: '50mm', h: '30mm', nameSize: '7pt', priceSize: '10pt', barcodeH: 30, barcodeW: 1.5 };

  function handlePrint() {
    const style = document.createElement('style');
    style.id = 'raseed-label-print';
    style.textContent = `
      @media print {
        @page { margin: 4mm; size: A4; }
        body > * { display: none !important; }
        #raseed-label-print-root {
          display: flex !important;
          flex-wrap: wrap;
          gap: 2mm;
          position: fixed;
          inset: 0;
          padding: 4mm;
          background: white;
          z-index: 99999;
          align-content: flex-start;
        }
      }
    `;
    document.head.appendChild(style);

    // Reveal print root
    const root = document.getElementById('raseed-label-print-root');
    if (root) root.style.display = 'flex';

    window.print();

    // Cleanup
    setTimeout(() => {
      style.remove();
      if (root) root.style.display = 'none';
    }, 800);
  }

  function setQty(id: string, val: number) {
    setQtys(q => ({ ...q, [id]: Math.max(1, val) }));
  }

  return (
    <>
      {/* Hidden print root — revealed by @media print style above */}
      <div id="raseed-label-print-root"
        style={{ display: 'none', flexWrap: 'wrap', gap: '2mm', alignContent: 'flex-start' }}>
        {products.flatMap(p => {
          const bval = safeBarcode(p.barcode, barcodeFromId(p.id));
          return Array.from({ length: qtys[p.id] || 1 }, (_, i) => (
            <div key={`${p.id}-${i}`}
              style={{
                width: dims.w, height: dims.h,
                border: '0.3mm solid #e2e8f0',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '1mm', boxSizing: 'border-box',
                fontFamily: 'Tajawal, Arial, sans-serif',
                overflow: 'hidden',
                pageBreakInside: 'avoid',
              }}>
              <span style={{ fontSize: '5pt', color: '#94a3b8', letterSpacing: '0.5pt', marginBottom: '0.5mm' }}>
                رصيد
              </span>
              <span style={{
                fontSize: dims.nameSize, fontWeight: 700,
                color: '#1e293b', textAlign: 'center',
                maxWidth: '100%', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginBottom: '0.5mm',
              }}>
                {p.name}
              </span>
              <Barcode
                value={bval}
                width={dims.barcodeW}
                height={dims.barcodeH}
                fontSize={7}
                margin={1}
                displayValue={true}
              />
              <span style={{
                fontSize: dims.priceSize, fontWeight: 900,
                color: '#0f172a', marginTop: '0.5mm',
              }}>
                {p.price.toFixed(2)} ر.س
              </span>
            </div>
          ));
        })}
      </div>

      {/* Modal UI */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.30)', backdropFilter: 'blur(10px)' }}>
        <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-3xl"
          style={deepGlass}>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}>
                <Printer size={16} className="text-white" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800 text-[15px]">منشئ ملصقات الباركود</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {products.length} منتج · {totalLabels} ملصق إجمالاً
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 cursor-pointer">
              <X size={16} className="text-slate-400" />
            </button>
          </div>

          {/* Size Picker */}
          <div className="px-6 pt-5 flex-shrink-0">
            <p className="text-[11px] font-semibold text-slate-500 mb-2">حجم الملصق</p>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl" style={{ background: 'rgba(0,0,0,0.04)' }}>
              {(['38x25', '50x30'] as LabelSize[]).map(s => (
                <button key={s} onClick={() => setSize(s)}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer"
                  style={{
                    background: size === s ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'transparent',
                    color: size === s ? 'white' : '#64748b',
                    boxShadow: size === s ? '0 4px 12px rgba(99,102,241,0.3)' : 'none',
                  }}>
                  {s === '38x25' ? '38 × 25 مم (صغير)' : '50 × 30 مم (متوسط)'}
                </button>
              ))}
            </div>
          </div>

          {/* Product Qty List */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            <p className="text-[11px] font-semibold text-slate-500 mb-3">كمية الملصقات لكل منتج</p>
            {products.map(p => {
              const bval = safeBarcode(p.barcode, barcodeFromId(p.id));
              return (
                <div key={p.id} className="flex items-center gap-4 px-4 py-3 rounded-2xl"
                  style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid rgba(0,0,0,0.05)' }}>
                  {/* Mini label preview */}
                  <div className="flex-shrink-0 flex flex-col items-center justify-center px-3 py-2 rounded-xl overflow-hidden"
                    style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)', minWidth: 90 }}>
                    <span className="text-[8px] text-slate-400">رصيد</span>
                    <span className="text-[10px] font-bold text-slate-700 text-center max-w-[80px] truncate">
                      {p.name}
                    </span>
                    <Barcode value={bval} width={0.8} height={18} fontSize={6} margin={0} displayValue={false} />
                    <span className="text-[9px] font-black text-slate-800">{p.price.toFixed(2)} ر.س</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-700 truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{bval}</p>
                  </div>
                  {/* Qty control */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setQty(p.id, (qtys[p.id] || 1) - 1)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                      style={{ background: 'rgba(0,0,0,0.06)' }}>
                      <Minus size={11} className="text-slate-500" />
                    </button>
                    <input type="number" min={1} value={qtys[p.id] || 1}
                      onChange={e => setQty(p.id, parseInt(e.target.value) || 1)}
                      className="w-10 text-center text-[13px] font-bold text-slate-800 outline-none rounded-lg py-1"
                      style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.08)' }} />
                    <button onClick={() => setQty(p.id, (qtys[p.id] || 1) + 1)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                      style={{ background: 'rgba(99,102,241,0.1)' }}>
                      <Plus size={11} className="text-indigo-500" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0"
            style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <button onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-white text-[13px] font-bold transition-all hover:opacity-90 cursor-pointer"
              style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', boxShadow: '0 4px 16px rgba(99,102,241,0.35)' }}>
              <Printer size={15} /> طباعة {totalLabels} ملصق
            </button>
            <button onClick={onClose}
              className="px-5 py-2.5 rounded-2xl text-slate-500 text-[13px] font-medium hover:bg-slate-100 cursor-pointer">
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// ── Categories Tab
// ═══════════════════════════════════════════════════════════
const EMOJI_SUGGESTIONS = ['🛒','🥩','🥛','🧴','🏠','📱','🌾','🥫','🍞','🍕',
  '🧊','🫙','🌿','🍰','🎁','💊','🔧','📦','🎨','🍷'];

interface CatModalProps {
  cat: Category | null;
  onClose: () => void;
  onSave: (c: Omit<Category, 'id' | 'created_at'>) => void;
  saving?: boolean;
}

function CategoryModal({ cat, onClose, onSave, saving = false }: CatModalProps) {
  const [name, setName]        = useState(cat?.name ?? '');
  const [desc, setDesc]        = useState(cat?.description ?? '');
  const [icon, setIcon]        = useState(cat?.icon ?? '📦');
  const [showEmoji, setShowEmoji] = useState(false);
  const [error, setError]      = useState('');

  function handleSave() {
    if (!name.trim()) { setError('اسم الصنف مطلوب'); return; }
    onSave({ name: name.trim(), description: desc.trim(), icon });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-3xl" style={deepGlass}>
        <div className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-xl"
              style={{ background: 'rgba(249,115,22,0.1)' }}>
              {icon}
            </div>
            <h2 className="font-bold text-slate-800 text-[15px]">
              {cat ? 'تعديل صنف' : 'إضافة صنف جديد'}
            </h2>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 cursor-pointer">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-2">الأيقونة</label>
            <button onClick={() => setShowEmoji(s => !s)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer"
              style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(0,0,0,0.07)' }}>
              <span className="text-2xl">{icon}</span>
              <ChevronDown size={13} className="text-slate-400" />
            </button>
            {showEmoji && (
              <div className="mt-2 p-3 rounded-2xl flex flex-wrap gap-2"
                style={{ background: 'rgba(248,250,252,0.9)', border: '1px solid rgba(0,0,0,0.06)' }}>
                {EMOJI_SUGGESTIONS.map(e => (
                  <button key={e} onClick={() => { setIcon(e); setShowEmoji(false); }}
                    className="text-xl w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white transition-colors cursor-pointer"
                    style={{ border: icon === e ? '2px solid #f97316' : '1px solid transparent' }}>
                    {e}
                  </button>
                ))}
                <input type="text" value={icon} onChange={e => setIcon(e.target.value)} maxLength={2}
                  placeholder="✏️"
                  className="w-9 h-9 text-center text-lg rounded-xl outline-none cursor-text"
                  style={{ border: '1.5px dashed rgba(0,0,0,0.15)', background: 'white' }} />
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
              اسم الصنف <span className="text-rose-400">*</span>
            </label>
            <input type="text" value={name} onChange={e => { setName(e.target.value); setError(''); }}
              placeholder="مثال: مواد غذائية"
              className="w-full px-3 py-2.5 rounded-xl text-[13px] text-slate-700 outline-none"
              style={{
                background: 'rgba(248,250,252,0.8)',
                border: error ? '1.5px solid rgba(239,68,68,0.5)' : '1.5px solid rgba(0,0,0,0.07)',
              }} />
            {error && <p className="text-[10px] text-rose-400 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">الوصف (اختياري)</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              rows={2} placeholder="وصف مختصر للصنف..."
              className="w-full px-3 py-2.5 rounded-xl text-[13px] text-slate-700 outline-none resize-none"
              style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(0,0,0,0.07)' }} />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-white text-[13px] font-bold transition-all hover:opacity-90 disabled:opacity-60 cursor-pointer"
            style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.35)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}
            {cat ? 'حفظ التعديلات' : 'إضافة الصنف'}
          </button>
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-2xl text-slate-500 text-[13px] font-medium hover:bg-slate-100 cursor-pointer">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoriesTab({
  categories, loading, onAdd, onEdit, onDelete,
}: {
  categories: Category[];
  loading: boolean;
  onAdd: (c: Omit<Category, 'id' | 'created_at'>) => Promise<void>;
  onEdit: (id: string, c: Partial<Category>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [catModal, setCatModal]   = useState(false);
  const [editCat, setEditCat]     = useState<Category | null>(null);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState<string | null>(null);

  async function handleSave(data: Omit<Category, 'id' | 'created_at'>) {
    setSaving(true);
    if (editCat) await onEdit(editCat.id, data);
    else await onAdd(data);
    setSaving(false);
    setCatModal(false);
    setEditCat(null);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`هل تريد حذف صنف "${name}"؟`)) return;
    setDeleting(id);
    await onDelete(id);
    setDeleting(null);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[17px] font-black text-slate-800">إدارة الأصناف</h2>
          <p className="text-[12px] text-slate-400 mt-0.5">
            {loading ? 'جاري التحميل...' : `${categories.length} صنف مسجل`}
          </p>
        </div>
        <button onClick={() => { setEditCat(null); setCatModal(true); }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-white text-[13px] font-bold cursor-pointer hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.35)' }}>
          <Plus size={15} /> إضافة صنف
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
          <Loader2 size={22} className="animate-spin text-orange-400" />
          <span className="text-sm">جاري تحميل الأصناف...</span>
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-3xl" style={glass}>
          <Layers size={44} className="text-slate-200 mb-4" />
          <p className="text-slate-400 text-sm font-medium">لا توجد أصناف — ابدأ بإضافة أول صنف</p>
          <button onClick={() => { setEditCat(null); setCatModal(true); }}
            className="mt-4 flex items-center gap-2 px-5 py-2 rounded-2xl text-white text-[13px] font-semibold cursor-pointer"
            style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)' }}>
            <Plus size={14} /> إضافة صنف
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {categories.map(cat => (
            <div key={cat.id} className="group flex flex-col gap-3 px-5 py-4 rounded-3xl transition-all hover:shadow-lg"
              style={glass}>
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ background: 'rgba(249,115,22,0.08)' }}>
                  {cat.icon}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditCat(cat); setCatModal(true); }}
                    className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-blue-50 cursor-pointer"
                    title="تعديل">
                    <Edit3 size={12} className="text-blue-400" />
                  </button>
                  <button onClick={() => handleDelete(cat.id, cat.name)}
                    disabled={deleting === cat.id}
                    className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                    title="حذف">
                    {deleting === cat.id
                      ? <Loader2 size={12} className="animate-spin text-slate-400" />
                      : <Trash2 size={12} className="text-rose-400" />}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[14px] font-bold text-slate-800">{cat.name}</p>
                {cat.description && (
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{cat.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category Modal */}
      {catModal && (
        <CategoryModal
          cat={editCat}
          onClose={() => { setCatModal(false); setEditCat(null); }}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── CSV Import Tab
// ═══════════════════════════════════════════════════════════
interface ImportResult { inserted: number; updated: number; errors: number; total: number }

function CSVImportTab({ categories, onImportDone }: {
  categories: Category[];
  onImportDone: () => void;
}) {
  const { orgId } = useTenant();
  const [dragging, setDragging]     = useState(false);
  const [csvData, setCsvData]       = useState<CSVRow[]>([]);
  const [headers, setHeaders]       = useState<string[]>([]);
  const [fileName, setFileName]     = useState('');
  const [mapping, setMapping]       = useState<Record<string, string>>({});
  const [step, setStep]             = useState<'upload' | 'map' | 'done'>('upload');
  const [importing, setImporting]   = useState(false);
  const [progress, setProgress]     = useState(0);
  const [result, setResult]         = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const { headers: h, rows } = parseCSV(text);
      setHeaders(h);
      setCsvData(rows);
      setFileName(file.name);
      // Auto-map obvious column names
      const autoMap: Record<string, string> = {};
      PRODUCT_FIELDS.forEach(pf => {
        const match = h.find(header =>
          header.toLowerCase().includes(pf.key.toLowerCase()) ||
          header.toLowerCase().includes(pf.label.toLowerCase().split(' ')[0])
        );
        if (match) autoMap[pf.key as string] = match;
      });
      // Common English aliases
      const englishAliases: Record<string, string[]> = {
        name: ['name','product','اسم','المنتج'],
        price: ['price','sell','سعر','البيع'],
        cost: ['cost','purchase','تكلفة'],
        barcode: ['barcode','sku','code','باركود'],
        stock: ['qty','quantity','stock','كمية','المخزون'],
        category: ['category','cat','صنف','الفئة'],
        unit: ['unit','وحدة'],
      };
      h.forEach(header => {
        Object.entries(englishAliases).forEach(([field, aliases]) => {
          if (!autoMap[field] && aliases.some(a => header.toLowerCase().includes(a))) {
            autoMap[field] = header;
          }
        });
      });
      setMapping(autoMap);
      setStep('map');
    };
    reader.readAsText(file, 'UTF-8');
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) processFile(file);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  async function handleImport() {
    const nameCol = mapping['name'];
    if (!nameCol) return;

    setImporting(true);
    setProgress(0);

    let inserted = 0; let updated = 0; let errors = 0;
    const catNames = new Set(categories.map(c => c.name));
    const newCats: string[] = [];

    const rows = csvData.filter(r => r[nameCol]?.trim());

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Build product record from mapping
        const product: Partial<ProductRow> & { name: string; price: number; stock: number } = {
          name: row[mapping['name'] ?? ''] ?? '',
          price: parseFloat(row[mapping['price'] ?? ''] ?? '0') || 0,
          stock: parseInt(row[mapping['stock'] ?? ''] ?? '0') || 0,
        };
        if (mapping['name_en'])  product.name_en  = row[mapping['name_en']];
        if (mapping['barcode'])  product.barcode  = row[mapping['barcode']];
        if (mapping['category']) product.category = row[mapping['category']];
        if (mapping['cost'])     product.cost     = parseFloat(row[mapping['cost']]) || 0;
        if (mapping['min_stock'])product.min_stock= parseInt(row[mapping['min_stock']]) || 10;
        if (mapping['unit'])     product.unit     = row[mapping['unit']] || 'حبة';
        if (mapping['icon'])     product.icon     = row[mapping['icon']] || '📦';

        // Track new categories to auto-create
        if (product.category && !catNames.has(product.category)) {
          newCats.push(product.category);
          catNames.add(product.category);
        }

        if (!product.name.trim() || product.price <= 0) { errors++; continue; }

        // Upsert: check by barcode first, then name (scoped to this org)
        const existingRows = product.barcode
          ? await getTenantData<{ id: string }>('products', orgId, {
              select: 'id',
              filters: [{ column: 'barcode', operator: 'eq', value: product.barcode }],
              limit: 1,
            })
          : await getTenantData<{ id: string }>('products', orgId, {
              select: 'id',
              filters: [{ column: 'name', operator: 'eq', value: product.name }],
              limit: 1,
            });
        const existing = { data: existingRows[0] ?? null };

        if (existing.data?.id) {
          await productsService.update(existing.data.id, product);
          updated++;
        } else {
          await productsService.create(product as ProductRow);
          inserted++;
        }
      } catch { errors++; }

      setProgress(Math.round(((i + 1) / rows.length) * 100));
      // Yield to UI
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }

    // Auto-create new categories
    for (const catName of [...new Set(newCats)]) {
      try {
        await categoriesService.create({ name: catName, icon: '📦' });
      } catch { /* ignore */ }
    }

    setResult({ inserted, updated, errors, total: rows.length });
    setStep('done');
    setImporting(false);
    onImportDone();
  }

  function reset() {
    setCsvData([]); setHeaders([]); setFileName('');
    setMapping({}); setStep('upload'); setResult(null); setProgress(0);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-[17px] font-black text-slate-800">استيراد بيانات CSV</h2>
        <p className="text-[12px] text-slate-400 mt-0.5">
          ارفع ملف CSV وحدد طريقة ربط الأعمدة بحقول المنتجات
        </p>
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center justify-center gap-4 py-16 px-8 rounded-3xl cursor-pointer transition-all"
          style={{
            background: dragging ? 'rgba(249,115,22,0.05)' : 'rgba(255,255,255,0.60)',
            backdropFilter: 'blur(20px)',
            border: `2px dashed ${dragging ? 'rgba(249,115,22,0.5)' : 'rgba(0,0,0,0.12)'}`,
            boxShadow: dragging ? '0 0 0 4px rgba(249,115,22,0.1)' : '0 4px 24px rgba(0,0,0,0.05)',
          }}>
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center"
            style={{ background: dragging ? 'rgba(249,115,22,0.1)' : 'rgba(248,250,252,0.9)' }}>
            <Upload size={28} style={{ color: dragging ? '#f97316' : '#cbd5e1' }} />
          </div>
          <div className="text-center">
            <p className="text-[15px] font-bold text-slate-700">
              اسحب ملف CSV هنا أو انقر للاختيار
            </p>
            <p className="text-[12px] text-slate-400 mt-1">
              يدعم ملفات .csv بترميز UTF-8
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><Check size={11} className="text-emerald-500" /> اسم المنتج</span>
            <span className="flex items-center gap-1"><Check size={11} className="text-emerald-500" /> السعر</span>
            <span className="flex items-center gap-1"><Check size={11} className="text-emerald-500" /> الكمية</span>
            <span className="flex items-center gap-1"><Check size={11} className="text-emerald-500" /> الباركود</span>
          </div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === 'map' && (
        <div className="space-y-4">
          {/* File info */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
            <FileSpreadsheet size={18} className="text-emerald-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-slate-700 truncate">{fileName}</p>
              <p className="text-[11px] text-slate-400">{csvData.length} صف · {headers.length} عمود</p>
            </div>
            <button onClick={reset}
              className="text-[11px] text-slate-400 hover:text-rose-400 cursor-pointer flex items-center gap-1">
              <X size={12} /> تغيير
            </button>
          </div>

          {/* Mapping UI */}
          <div className="rounded-3xl overflow-hidden" style={glass}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <p className="text-[13px] font-bold text-slate-700">ربط الأعمدة</p>
              <p className="text-[11px] text-slate-400 mt-0.5">اربط أعمدة ملفك بحقول المنتجات في رصيد</p>
            </div>
            <div className="p-5 space-y-3">
              {PRODUCT_FIELDS.map(pf => (
                <div key={pf.key as string} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-40 flex-shrink-0">
                    <span className="text-[12px] font-semibold text-slate-600">{pf.label}</span>
                    {pf.required && <span className="text-rose-400 text-[10px]">*</span>}
                  </div>
                  <ArrowRight size={12} className="text-slate-300 flex-shrink-0" />
                  <select
                    value={mapping[pf.key as string] ?? ''}
                    onChange={e => setMapping(m => ({ ...m, [pf.key as string]: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-xl text-[12px] text-slate-700 outline-none cursor-pointer"
                    style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(0,0,0,0.07)' }}>
                    <option value="">— لا تربط —</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  {mapping[pf.key as string] && (
                    <span className="text-[10px] text-emerald-500 flex items-center gap-0.5 flex-shrink-0">
                      <Check size={10} /> مربوط
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {csvData.length > 0 && mapping['name'] && (
            <div className="rounded-2xl overflow-hidden" style={glass}>
              <p className="px-4 py-3 text-[11px] font-semibold text-slate-500"
                style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                معاينة أول 3 صفوف
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ background: 'rgba(248,250,252,0.8)' }}>
                      {PRODUCT_FIELDS.filter(f => mapping[f.key as string]).map(f => (
                        <th key={f.key as string} className="px-3 py-2 text-right text-slate-500 font-semibold">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 3).map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                        {PRODUCT_FIELDS.filter(f => mapping[f.key as string]).map(f => (
                          <td key={f.key as string} className="px-3 py-2 text-slate-600 max-w-[120px] truncate">
                            {row[mapping[f.key as string]]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import button */}
          <div className="flex gap-3">
            <button onClick={handleImport}
              disabled={importing || !mapping['name']}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-[14px] font-bold transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
              style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.35)' }}>
              {importing ? (
                <><Loader2 size={15} className="animate-spin" /> جاري الاستيراد... {progress}%</>
              ) : (
                <><Zap size={15} /> استيراد {csvData.length} منتج</>
              )}
            </button>
            <button onClick={reset}
              className="px-5 py-3 rounded-2xl text-slate-500 text-[13px] font-medium hover:bg-slate-100 cursor-pointer">
              إلغاء
            </button>
          </div>

          {/* Progress bar */}
          {importing && (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid rgba(0,0,0,0.06)' }}>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-[12px] text-slate-500">جاري رفع البيانات...</span>
                <span className="text-[12px] font-bold text-orange-500">{progress}%</span>
              </div>
              <div className="h-2 bg-slate-100">
                <div className="h-full transition-all duration-300 rounded-full"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg,#f97316,#ea580c)',
                  }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Done */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-4 py-10 rounded-3xl" style={glass}>
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 8px 24px rgba(16,185,129,0.35)' }}>
              <Check size={32} className="text-white" />
            </div>
            <div className="text-center">
              <p className="text-[17px] font-black text-slate-800">اكتمل الاستيراد بنجاح</p>
              <p className="text-[12px] text-slate-400 mt-1">تمت معالجة {result.total} صف</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-black text-emerald-600">{result.inserted}</p>
                <p className="text-[11px] text-slate-400">منتج جديد</p>
              </div>
              <div className="w-px h-10 bg-slate-200" />
              <div className="text-center">
                <p className="text-2xl font-black text-blue-600">{result.updated}</p>
                <p className="text-[11px] text-slate-400">تم تحديثه</p>
              </div>
              {result.errors > 0 && (
                <>
                  <div className="w-px h-10 bg-slate-200" />
                  <div className="text-center">
                    <p className="text-2xl font-black text-rose-500">{result.errors}</p>
                    <p className="text-[11px] text-slate-400">خطأ</p>
                  </div>
                </>
              )}
            </div>
          </div>
          <button onClick={reset}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-semibold cursor-pointer"
            style={glass}>
            <Upload size={14} className="text-slate-500" />
            <span className="text-slate-600">استيراد ملف آخر</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── Main Page
// ═══════════════════════════════════════════════════════════
export function InventoryPage() {
  const { orgId } = useTenant();

  // ── Tab state ────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('products');

  // ── Products state ───────────────────────────────────────
  const [products, setProducts]   = useState<Product[]>([]);
  const [loadingP, setLoadingP]   = useState(true);
  const [savingModal, setSavingModal] = useState(false);
  const [search, setSearch]       = useState('');
  const [categoryFilter, setCategoryFilter] = useState('جميع الأصناف');
  const [statusFilter, setStatusFilter]     = useState<StockStatus>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir]     = useState<SortDir>('asc');
  const [page, setPage]           = useState(1);
  const PER_PAGE = 8;

  // ── Selection state ──────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [labelModal, setLabelModal]   = useState(false);

  // ── Modals ───────────────────────────────────────────────
  const [addModal, setAddModal]       = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);

  // ── Categories state ─────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingC, setLoadingC]     = useState(false);

  // ── Toast ────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ message, type });

  // ── Load Products ─────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    setLoadingP(true);
    try {
      const data = await productsService.list();
      setProducts(data);
    } catch (err: any) {
      showToast(`تعذّر جلب المنتجات: ${err.message}`, 'error');
    } finally { setLoadingP(false); }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // ── Load Categories ───────────────────────────────────────
  const loadCategories = useCallback(async () => {
    setLoadingC(true);
    try {
      const data = await categoriesService.list();
      setCategories(data);
    } catch {
      // Table may not exist yet — use empty list, modal falls back to FALLBACK_CATEGORIES
      setCategories([]);
    } finally { setLoadingC(false); }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  // ── Realtime ──────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    const ch = (supabase.channel(`inventory:products:${orgId}`) as any)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'products',
        filter: `org_id=eq.${orgId}`,
      }, (payload: any) => {
        const updated = payload.new as Product;
        setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
        if (updated.min_stock && updated.stock > 0 && updated.stock <= updated.min_stock) {
          showToast(`⚠️ مخزون "${updated.name}" أوشك على النفاد (${updated.stock} متبقٍ)`, 'error');
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgId]);

  // ── KPI Stats ─────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:    products.length,
    lowStock: products.filter(p => getStatus(p) === 'lowStock').length,
    outStock: products.filter(p => getStatus(p) === 'outOfStock').length,
    totalVal: products.reduce((acc, p) => acc + p.price * p.stock, 0),
  }), [products]);

  // ── Filtered + Sorted ─────────────────────────────────────
  const filtered = useMemo(() => {
    let list = products.filter(p => {
      const q = search.trim().toLowerCase();
      if (q && !p.name.toLowerCase().includes(q) && !(p.barcode ?? '').toLowerCase().includes(q)) return false;
      if (categoryFilter !== 'جميع الأصناف' && p.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && getStatus(p) !== statusFilter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let va: any = a[sortField as keyof Product] ?? '';
      let vb: any = b[sortField as keyof Product] ?? '';
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

  // ── CRUD ─────────────────────────────────────────────────
  async function handleSaveProduct(p: Product) {
    setSavingModal(true);
    try {
      if (p.id) {
        const updated = await productsService.update(p.id, p);
        setProducts(prev => prev.map(x => x.id === updated.id ? updated : x));
        showToast(`✓ تم تحديث "${updated.name}" بنجاح`);
      } else {
        const created = await productsService.create(p);
        setProducts(prev => [created, ...prev]);
        showToast(`✓ تمت إضافة "${created.name}" إلى المخزون`);
      }
      setAddModal(false); setEditProduct(null);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally { setSavingModal(false); }
  }

  async function handleAdjust(id: string, delta: number) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const newStock = Math.max(0, product.stock + delta);
    try {
      const updated = await productsService.update(id, { stock: newStock });
      setProducts(prev => prev.map(p => p.id === id ? updated : p));
      showToast(`✓ تم تحديث مخزون "${updated.name}" إلى ${newStock} وحدة`);
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleDelete(id: string) {
    const product = products.find(p => p.id === id);
    if (!product || !confirm(`هل تريد حذف "${product.name}"؟`)) return;
    try {
      await productsService.delete(id);
      setProducts(prev => prev.filter(p => p.id !== id));
      setSelectedIds(s => { const n = new Set(s); n.delete(id); return n; });
      showToast(`✓ تم حذف "${product.name}" بنجاح`);
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleAutoBarcode(product: Product) {
    if (product.barcode) return;
    const barcode = barcodeFromId(product.id);
    try {
      const updated = await productsService.update(product.id, { barcode });
      setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
      showToast(`✓ تم توليد باركود "${product.name}": ${barcode}`);
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  // ── Selection helpers ─────────────────────────────────────
  const allFiltered       = filtered.map(p => p.id);
  const allSelected       = allFiltered.length > 0 && allFiltered.every(id => selectedIds.has(id));
  const someSelected      = allFiltered.some(id => selectedIds.has(id));
  const selectedProducts  = products.filter(p => selectedIds.has(p.id));

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allFiltered));
  }

  function toggleProduct(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // ── Categories CRUD handlers ──────────────────────────────
  async function handleCatAdd(data: Omit<Category, 'id' | 'created_at'>) {
    const created = await categoriesService.create(data);
    setCategories(prev => [...prev, created]);
    showToast(`✓ تمت إضافة صنف "${created.name}"`);
  }

  async function handleCatEdit(id: string, data: Partial<Category>) {
    const updated = await categoriesService.update(id, data);
    setCategories(prev => prev.map(c => c.id === id ? updated : c));
    showToast(`✓ تم تحديث الصنف`);
  }

  async function handleCatDelete(id: string) {
    await categoriesService.delete(id, orgId);
    setCategories(prev => prev.filter(c => c.id !== id));
    showToast(`✓ تم حذف الصنف`);
  }

  // ── Tab definitions ───────────────────────────────────────
  const TABS: { id: ActiveTab; label: string; icon: React.ElementType }[] = [
    { id: 'products',   label: 'قائمة المنتجات',  icon: Package },
    { id: 'categories', label: 'الأصناف',          icon: Layers },
    { id: 'import',     label: 'استيراد البيانات', icon: FileSpreadsheet },
  ];

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown size={11}
      style={{ color: sortField === field ? '#f97316' : '#94a3b8', opacity: sortField === field ? 1 : 0.5 }} />
  );

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5 min-h-full" dir="rtl" style={{ fontFamily: 'Tajawal, sans-serif' }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 leading-tight">إدارة المخزون</h1>
          <p className="text-[12px] text-slate-400 mt-0.5">
            {loadingP ? 'جاري جلب البيانات...' : `${products.length} صنف مسجل في المستودع`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadProducts} disabled={loadingP}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-slate-500 text-[12px] font-medium hover:bg-white/60 cursor-pointer transition-all"
            style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.9)' }}>
            <RefreshCw size={14} className={loadingP ? 'animate-spin' : ''} /> تحديث
          </button>
          {activeTab === 'products' && (
            <button onClick={() => setAddModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-white text-[13px] font-bold transition-all hover:opacity-90 cursor-pointer"
              style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.35)' }}>
              <Plus size={16} /> إضافة منتج
            </button>
          )}
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="flex items-center p-1 gap-1 rounded-2xl w-fit"
        style={{ background: 'rgba(0,0,0,0.04)' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer"
              style={{
                background: active ? 'rgba(255,255,255,0.9)' : 'transparent',
                color: active ? '#1e293b' : '#64748b',
                boxShadow: active ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              }}>
              <Icon size={15} style={{ color: active ? '#f97316' : '#94a3b8' }} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════
          TAB: PRODUCTS
          ════════════════════════════════════════════════ */}
      {activeTab === 'products' && (
        <>
          {/* KPI Cards */}
          {!loadingP && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard icon={Package}      label="إجمالي الأصناف"  value={stats.total}                          color="#f97316" bg="rgba(249,115,22,0.1)" />
              <KpiCard icon={TrendingDown} label="منخفض المخزون"   value={stats.lowStock}  sub="تحتاج تزويد"   color="#f59e0b" bg="rgba(245,158,11,0.1)" />
              <KpiCard icon={XCircle}      label="نفذ من المخزون"  value={stats.outStock}  sub="غير متوفر"     color="#ef4444" bg="rgba(239,68,68,0.1)"  />
              <KpiCard icon={DollarSign}   label="قيمة المخزون"    value={`${fmt.format(stats.totalVal)} ر.س`} color="#10b981" bg="rgba(16,185,129,0.1)" />
            </div>
          )}

          {/* Low-stock alert */}
          {!loadingP && (stats.lowStock > 0 || stats.outStock > 0) && (
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

          {/* Selection toolbar (shown when items selected) */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <span className="text-[13px] font-semibold text-indigo-600">
                {selectedIds.size} منتج محدد
              </span>
              <div className="flex-1" />
              <button onClick={() => setLabelModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-[12px] font-semibold cursor-pointer hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
                <Printer size={14} /> طباعة الملصقات
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                className="px-3 py-2 rounded-xl text-slate-400 text-[12px] hover:bg-white/60 cursor-pointer">
                إلغاء التحديد
              </button>
            </div>
          )}

          {/* Filter Bar */}
          {!loadingP && (
            <div className="rounded-3xl px-4 py-3" style={glass}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[180px] px-3 py-2 rounded-2xl"
                  style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(0,0,0,0.07)' }}>
                  <Search size={14} className="text-slate-400 flex-shrink-0" />
                  <input placeholder="ابحث باسم المنتج أو الباركود..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="flex-1 bg-transparent text-[13px] text-slate-700 placeholder-slate-300 outline-none" />
                  {search && (
                    <button onClick={() => setSearch('')} className="cursor-pointer">
                      <X size={12} className="text-slate-400 hover:text-slate-600" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl"
                  style={{ background: 'rgba(248,250,252,0.8)', border: '1.5px solid rgba(0,0,0,0.07)' }}>
                  <Tag size={13} className="text-slate-400" />
                  <select value={categoryFilter}
                    onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
                    className="bg-transparent text-[12px] text-slate-600 outline-none cursor-pointer pr-1">
                    <option>جميع الأصناف</option>
                    {(categories.length > 0 ? categories.map(c => c.name) : FALLBACK_CATEGORIES)
                      .map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>

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
          )}

          {/* Loading */}
          {loadingP && (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
              <Loader2 size={24} className="animate-spin text-orange-400" />
              <span className="text-sm">جاري جلب بيانات المخزون...</span>
            </div>
          )}

          {/* Table */}
          {!loadingP && (
            <div className="rounded-3xl overflow-hidden" style={glass}>
              {/* Table Header */}
              <div className="grid px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider"
                style={{
                  gridTemplateColumns: '28px 2fr 1fr 1fr 1fr 1fr 1fr auto',
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                }}>
                {/* Select All */}
                <button onClick={toggleAll} className="flex items-center cursor-pointer"
                  title={allSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}>
                  {allSelected
                    ? <CheckSquare size={15} className="text-indigo-500" />
                    : someSelected
                      ? <CheckSquare size={15} className="text-indigo-300" />
                      : <Square size={15} className="text-slate-300" />}
                </button>
                {[
                  { label: 'المنتج',       field: 'name'     as SortField },
                  { label: 'الفئة',        field: 'category' as SortField },
                  { label: 'الكمية',       field: 'stock'    as SortField },
                  { label: 'الحالة',       field: null },
                  { label: 'سعر البيع',    field: 'price'    as SortField },
                  { label: 'قيمة المخزون', field: null },
                  { label: 'إجراءات',      field: null },
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
                  const status   = getStatus(p);
                  const selected = selectedIds.has(p.id);
                  return (
                    <div key={p.id}
                      className="grid px-5 py-4 items-center transition-all hover:bg-white/60"
                      style={{
                        gridTemplateColumns: '28px 2fr 1fr 1fr 1fr 1fr 1fr auto',
                        borderBottom: idx < paginated.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                        background: selected ? 'rgba(99,102,241,0.04)' : undefined,
                      }}>

                      {/* Checkbox */}
                      <button onClick={() => toggleProduct(p.id)}
                        className="flex items-center cursor-pointer flex-shrink-0">
                        {selected
                          ? <CheckSquare size={15} className="text-indigo-500" />
                          : <Square size={15} className="text-slate-300 hover:text-slate-400" />}
                      </button>

                      {/* Name */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
                          style={{ background: 'rgba(249,115,22,0.08)' }}>
                          {p.icon ?? '📦'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-slate-700 truncate">{p.name}</p>
                          {p.barcode
                            ? <p className="text-[10px] text-slate-400 font-mono">{p.barcode}</p>
                            : (
                              <button onClick={() => handleAutoBarcode(p)}
                                className="text-[10px] text-indigo-400 hover:text-indigo-600 flex items-center gap-0.5 cursor-pointer"
                                title="توليد باركود تلقائي">
                                <Wand2 size={9} /> توليد باركود
                              </button>
                            )}
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

                      {/* Price */}
                      <p className="text-[13px] font-semibold text-slate-700">
                        {fmt.format(p.price)} <span className="text-slate-400 text-[10px]">ر.س</span>
                      </p>

                      {/* Stock value */}
                      <p className="text-[12px] text-emerald-600 font-semibold">
                        {fmt.format(p.price * p.stock)} <span className="text-slate-400 text-[10px]">ر.س</span>
                      </p>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleAutoBarcode(p)}
                          disabled={!!p.barcode}
                          className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-indigo-50 disabled:opacity-30 cursor-pointer"
                          title={p.barcode ? 'يملك باركود' : 'توليد باركود تلقائي'}>
                          <Hash size={12} className="text-indigo-400" />
                        </button>
                        <button onClick={() => setAdjustProduct(p)}
                          className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-amber-50 cursor-pointer"
                          title="تعديل الكمية">
                          <Package size={12} className="text-amber-500" />
                        </button>
                        <button onClick={() => setEditProduct(p)}
                          className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-blue-50 cursor-pointer"
                          title="تعديل المنتج">
                          <Edit3 size={12} className="text-blue-400" />
                        </button>
                        <button onClick={() => handleDelete(p.id)}
                          className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-rose-50 cursor-pointer"
                          title="حذف المنتج">
                          <X size={12} className="text-rose-400" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Pagination */}
          {!loadingP && totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-[12px] text-slate-400">
                عرض {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} من {filtered.length} صنف
              </p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40 cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <ChevronRight size={14} className="text-slate-500" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map(pg => (
                  <button key={pg} onClick={() => setPage(pg)}
                    className="w-8 h-8 rounded-xl text-[12px] font-bold transition-all cursor-pointer"
                    style={{
                      background: page === pg ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'rgba(255,255,255,0.7)',
                      color: page === pg ? 'white' : '#64748b',
                      border: page === pg ? 'none' : '1px solid rgba(0,0,0,0.06)',
                      boxShadow: page === pg ? '0 4px 12px rgba(249,115,22,0.3)' : 'none',
                    }}>
                    {pg}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40 cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <ChevronLeft size={14} className="text-slate-500" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════
          TAB: CATEGORIES
          ════════════════════════════════════════════════ */}
      {activeTab === 'categories' && (
        <CategoriesTab
          categories={categories}
          loading={loadingC}
          onAdd={handleCatAdd}
          onEdit={handleCatEdit}
          onDelete={handleCatDelete}
        />
      )}

      {/* ════════════════════════════════════════════════
          TAB: CSV IMPORT
          ════════════════════════════════════════════════ */}
      {activeTab === 'import' && (
        <CSVImportTab
          categories={categories}
          onImportDone={() => {
            loadProducts();
            loadCategories();
            showToast('✓ تم الاستيراد وتحديث المنتجات بنجاح');
          }}
        />
      )}

      {/* ── Modals ── */}
      {(addModal || editProduct) && (
        <ProductModal
          product={editProduct}
          categories={categories}
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
      {labelModal && selectedProducts.length > 0 && (
        <LabelPrintModal
          products={selectedProducts}
          onClose={() => setLabelModal(false)}
        />
      )}
    </div>
  );
}

export default InventoryPage;
