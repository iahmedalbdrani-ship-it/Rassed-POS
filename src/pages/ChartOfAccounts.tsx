// ============================================================
// Control Panel (رصيد) — Chart of Accounts (شجرة الحسابات)
// Design: White Glassmorphism | Hierarchical Tree View
// ============================================================

import { useState } from 'react';
import {
  ChevronLeft, ChevronDown, Plus, Edit2, Trash2,
  BookOpen, TrendingUp, TrendingDown, Scale, DollarSign, X, Save
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────
type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
interface Account {
  id: string; code: string; name_ar: string; name_en: string;
  type: AccountType; nature: 'debit' | 'credit';
  is_header: boolean; level: number; balance: number;
  children?: Account[];
}

// ─── Default CoA Tree ────────────────────────────────────────
const DEFAULT_COA: Account[] = [
  {
    id: '1', code: '1', name_ar: 'الأصول', name_en: 'Assets',
    type: 'asset', nature: 'debit', is_header: true, level: 1, balance: 2850000,
    children: [
      {
        id: '11', code: '11', name_ar: 'الأصول المتداولة', name_en: 'Current Assets',
        type: 'asset', nature: 'debit', is_header: true, level: 2, balance: 1920000,
        children: [
          { id: '111', code: '111', name_ar: 'النقدية', name_en: 'Cash', type: 'asset', nature: 'debit', is_header: false, level: 3, balance: 480000 },
          { id: '112', code: '112', name_ar: 'البنوك', name_en: 'Banks', type: 'asset', nature: 'debit', is_header: false, level: 3, balance: 1140000 },
          { id: '113', code: '113', name_ar: 'العملاء / المدينون', name_en: 'Accounts Receivable', type: 'asset', nature: 'debit', is_header: false, level: 3, balance: 230000 },
          { id: '114', code: '114', name_ar: 'المخزون', name_en: 'Inventory', type: 'asset', nature: 'debit', is_header: false, level: 3, balance: 70000 },
          { id: '115', code: '115', name_ar: 'ضريبة القيمة المضافة - مدخلات', name_en: 'VAT Input', type: 'asset', nature: 'debit', is_header: false, level: 3, balance: 0 },
        ],
      },
      {
        id: '12', code: '12', name_ar: 'الأصول الثابتة', name_en: 'Fixed Assets',
        type: 'asset', nature: 'debit', is_header: true, level: 2, balance: 930000,
        children: [
          { id: '121', code: '121', name_ar: 'المعدات والأثاث', name_en: 'Equipment', type: 'asset', nature: 'debit', is_header: false, level: 3, balance: 620000 },
          { id: '122', code: '122', name_ar: 'الحاسبات والأجهزة', name_en: 'Computers', type: 'asset', nature: 'debit', is_header: false, level: 3, balance: 310000 },
        ],
      },
    ],
  },
  {
    id: '2', code: '2', name_ar: 'الخصوم', name_en: 'Liabilities',
    type: 'liability', nature: 'credit', is_header: true, level: 1, balance: 1100000,
    children: [
      {
        id: '21', code: '21', name_ar: 'الخصوم المتداولة', name_en: 'Current Liabilities',
        type: 'liability', nature: 'credit', is_header: true, level: 2, balance: 650000,
        children: [
          { id: '211', code: '211', name_ar: 'الموردون / الدائنون', name_en: 'Accounts Payable', type: 'liability', nature: 'credit', is_header: false, level: 3, balance: 380000 },
          { id: '212', code: '212', name_ar: 'ضريبة القيمة المضافة - مخرجات', name_en: 'VAT Payable', type: 'liability', nature: 'credit', is_header: false, level: 3, balance: 38400 },
          { id: '213', code: '213', name_ar: 'الرواتب المستحقة', name_en: 'Accrued Salaries', type: 'liability', nature: 'credit', is_header: false, level: 3, balance: 231600 },
        ],
      },
      {
        id: '22', code: '22', name_ar: 'الخصوم طويلة الأجل', name_en: 'Long-term Liabilities',
        type: 'liability', nature: 'credit', is_header: true, level: 2, balance: 450000,
        children: [
          { id: '221', code: '221', name_ar: 'القروض البنكية', name_en: 'Bank Loans', type: 'liability', nature: 'credit', is_header: false, level: 3, balance: 450000 },
        ],
      },
    ],
  },
  {
    id: '3', code: '3', name_ar: 'حقوق الملكية', name_en: 'Equity',
    type: 'equity', nature: 'credit', is_header: true, level: 1, balance: 1750000,
    children: [
      { id: '31', code: '31', name_ar: 'رأس المال', name_en: 'Capital', type: 'equity', nature: 'credit', is_header: false, level: 2, balance: 1500000 },
      { id: '32', code: '32', name_ar: 'الأرباح المحتجزة', name_en: 'Retained Earnings', type: 'equity', nature: 'credit', is_header: false, level: 2, balance: 250000 },
    ],
  },
  {
    id: '4', code: '4', name_ar: 'الإيرادات', name_en: 'Revenue',
    type: 'revenue', nature: 'credit', is_header: true, level: 1, balance: 256000,
    children: [
      { id: '41', code: '41', name_ar: 'إيرادات المبيعات', name_en: 'Sales Revenue', type: 'revenue', nature: 'credit', is_header: false, level: 2, balance: 256000 },
      { id: '42', code: '42', name_ar: 'إيرادات أخرى', name_en: 'Other Revenue', type: 'revenue', nature: 'credit', is_header: false, level: 2, balance: 0 },
    ],
  },
  {
    id: '5', code: '5', name_ar: 'المصروفات', name_en: 'Expenses',
    type: 'expense', nature: 'debit', is_header: true, level: 1, balance: 143000,
    children: [
      {
        id: '51', code: '51', name_ar: 'مصروفات التشغيل', name_en: 'Operating Expenses',
        type: 'expense', nature: 'debit', is_header: true, level: 2, balance: 110000,
        children: [
          { id: '511', code: '511', name_ar: 'الرواتب والأجور', name_en: 'Salaries', type: 'expense', nature: 'debit', is_header: false, level: 3, balance: 62000 },
          { id: '512', code: '512', name_ar: 'الإيجارات', name_en: 'Rent', type: 'expense', nature: 'debit', is_header: false, level: 3, balance: 25000 },
          { id: '513', code: '513', name_ar: 'الكهرباء والمياه', name_en: 'Utilities', type: 'expense', nature: 'debit', is_header: false, level: 3, balance: 8000 },
          { id: '514', code: '514', name_ar: 'الاتصالات والإنترنت', name_en: 'Telecom', type: 'expense', nature: 'debit', is_header: false, level: 3, balance: 5000 },
          { id: '515', code: '515', name_ar: 'مصروفات التسويق', name_en: 'Marketing', type: 'expense', nature: 'debit', is_header: false, level: 3, balance: 10000 },
        ],
      },
      { id: '52', code: '52', name_ar: 'تكلفة البضاعة المباعة', name_en: 'COGS', type: 'expense', nature: 'debit', is_header: false, level: 2, balance: 33000 },
    ],
  },
];

// ─── Config ───────────────────────────────────────────────────
const TYPE_CONFIG: Record<AccountType, { label: string; color: string; bg: string; icon: any }> = {
  asset:     { label: 'أصول',       color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   icon: DollarSign  },
  liability: { label: 'خصوم',       color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    icon: TrendingDown },
  equity:    { label: 'حقوق ملكية', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',   icon: Scale       },
  revenue:   { label: 'إيرادات',    color: '#10b981', bg: 'rgba(16,185,129,0.1)',   icon: TrendingUp  },
  expense:   { label: 'مصروفات',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   icon: BookOpen    },
};

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(n);

// ─── Add Account Modal ────────────────────────────────────────
function AccountModal({ onClose, parent }: { onClose: () => void; parent?: Account }) {
  const [form, setForm] = useState({ code: '', name_ar: '', name_en: '', type: parent?.type || 'asset' as AccountType, nature: 'debit' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/10 backdrop-blur-sm" dir="rtl">
      <div
        className="w-full max-w-md rounded-[2rem] p-7"
        style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 32px 80px rgba(0,0,0,0.12)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-black text-slate-800">
            {parent ? `إضافة حساب فرعي تحت: ${parent.name_ar}` : 'حساب جديد'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">كود الحساب</label>
              <input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: 'rgba(241,245,249,0.8)', border: '1.5px solid rgba(0,0,0,0.08)' }}
                placeholder="مثال: 1101" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">نوع الحساب</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as AccountType }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: 'rgba(241,245,249,0.8)', border: '1.5px solid rgba(0,0,0,0.08)' }}>
                {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">اسم الحساب بالعربية</label>
            <input value={form.name_ar} onChange={e => setForm(p => ({ ...p, name_ar: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'rgba(241,245,249,0.8)', border: '1.5px solid rgba(0,0,0,0.08)' }}
              placeholder="مثال: الصندوق النقدي" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">اسم الحساب بالإنجليزية</label>
            <input value={form.name_en} onChange={e => setForm(p => ({ ...p, name_en: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'rgba(241,245,249,0.8)', border: '1.5px solid rgba(0,0,0,0.08)' }}
              placeholder="Cash Account" />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600"
              style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }}>إلغاء</button>
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.3)' }}>
              <Save size={14} /> حفظ الحساب
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Account Row (Recursive) ──────────────────────────────────
function AccountRow({ account, onAddChild }: { account: Account; onAddChild: (a: Account) => void }) {
  const [expanded, setExpanded] = useState(account.level <= 2);
  const cfg = TYPE_CONFIG[account.type];
  const hasChildren = account.children && account.children.length > 0;
  const indent = (account.level - 1) * 20;

  return (
    <>
      <div
        className="flex items-center gap-3 px-4 py-3 group hover:bg-white/70 transition-colors rounded-2xl mx-1"
        style={{ paddingRight: `${indent + 16}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-5 h-5 flex items-center justify-center flex-shrink-0 transition-transform"
          style={{ opacity: hasChildren ? 1 : 0, pointerEvents: hasChildren ? 'auto' : 'none' }}
        >
          {expanded
            ? <ChevronDown size={14} className="text-slate-400" />
            : <ChevronLeft size={14} className="text-slate-400" />}
        </button>

        {/* Type icon */}
        {!account.is_header && (
          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: cfg.bg }}>
            <cfg.icon size={12} style={{ color: cfg.color }} />
          </div>
        )}
        {account.is_header && <div className="w-7 flex-shrink-0" />}

        {/* Code */}
        <span className="text-[11px] font-mono text-slate-400 w-12 flex-shrink-0">{account.code}</span>

        {/* Name */}
        <span className={`flex-1 text-right ${account.is_header ? 'font-bold text-slate-700 text-sm' : 'text-slate-600 text-[13px]'}`}>
          {account.name_ar}
          {account.name_en && <span className="text-slate-300 text-[10px] mr-2">({account.name_en})</span>}
        </span>

        {/* Nature badge */}
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium hidden group-hover:inline-flex"
          style={{ color: account.nature === 'debit' ? '#3b82f6' : '#ef4444', background: account.nature === 'debit' ? 'rgba(59,130,246,0.08)' : 'rgba(239,68,68,0.08)' }}>
          {account.nature === 'debit' ? 'مدين' : 'دائن'}
        </span>

        {/* Balance */}
        <span className="w-32 text-left font-semibold text-[13px]"
          style={{ color: account.balance > 0 ? cfg.color : '#94a3b8' }}>
          {account.balance > 0 ? fmt(account.balance) : '—'}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onAddChild(account)}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all">
            <Plus size={12} />
          </button>
          <button className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all">
            <Edit2 size={12} />
          </button>
          {!account.is_header && (
            <button className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Children */}
      {expanded && account.children?.map(child => (
        <AccountRow key={child.id} account={child} onAddChild={onAddChild} />
      ))}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export function ChartOfAccounts() {
  const [accounts] = useState<Account[]>(DEFAULT_COA);
  const [modal, setModal] = useState<{ open: boolean; parent?: Account }>({ open: false });
  const [filter, setFilter] = useState<AccountType | 'all'>('all');

  const totalAssets     = accounts.find(a => a.code === '1')?.balance ?? 0;
  const totalLiabilities = accounts.find(a => a.code === '2')?.balance ?? 0;
  const totalEquity     = accounts.find(a => a.code === '3')?.balance ?? 0;
  const balanceCheck    = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1;

  const filtered = filter === 'all' ? accounts : accounts.filter(a => a.type === filter);

  return (
    <div className="p-6 space-y-5 min-h-screen" dir="rtl" style={{ fontFamily: 'Tajawal, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">شجرة الحسابات</h1>
          <p className="text-sm text-slate-400 mt-0.5">دليل الحسابات المحاسبي — النظام السعودي</p>
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.3)' }}>
          <Plus size={16} /> حساب جديد
        </button>
      </div>

      {/* Balance Equation */}
      <div
        className="rounded-[1.75rem] p-5 grid grid-cols-4 gap-4"
        style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>
        {[
          { label: 'إجمالي الأصول', value: totalAssets, color: '#3b82f6' },
          { label: 'إجمالي الخصوم', value: totalLiabilities, color: '#ef4444' },
          { label: 'حقوق الملكية', value: totalEquity, color: '#8b5cf6' },
          { label: balanceCheck ? '✓ الميزانية متوازنة' : '✗ الميزانية غير متوازنة', value: totalLiabilities + totalEquity, color: balanceCheck ? '#10b981' : '#ef4444' },
        ].map((item) => (
          <div key={item.label} className="text-center">
            <p className="text-xs text-slate-400 mb-1">{item.label}</p>
            <p className="text-lg font-black" style={{ color: item.color }}>
              {new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(item.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(['all', 'asset', 'liability', 'equity', 'revenue', 'expense'] as const).map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className="px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex-shrink-0"
            style={{
              background: filter === t ? (t === 'all' ? '#f97316' : TYPE_CONFIG[t as AccountType]?.color ?? '#f97316') : 'rgba(255,255,255,0.65)',
              color: filter === t ? 'white' : '#64748b',
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: filter === t ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
            }}>
            {t === 'all' ? 'الكل' : TYPE_CONFIG[t as AccountType].label}
          </button>
        ))}
      </div>

      {/* Tree */}
      <div
        className="rounded-[1.75rem] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>
        {/* Header row */}
        <div
          className="flex items-center gap-3 px-6 py-3 text-[11px] text-slate-400 border-b"
          style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
          <span className="w-5 flex-shrink-0" />
          <span className="w-7 flex-shrink-0" />
          <span className="w-12 flex-shrink-0">الكود</span>
          <span className="flex-1 text-right">اسم الحساب</span>
          <span className="w-32 text-left">الرصيد</span>
          <span className="w-16" />
        </div>

        {/* Rows */}
        <div className="py-2">
          {filtered.map(account => (
            <AccountRow key={account.id} account={account} onAddChild={(a) => setModal({ open: true, parent: a })} />
          ))}
        </div>
      </div>

      {/* Modal */}
      {modal.open && <AccountModal parent={modal.parent} onClose={() => setModal({ open: false })} />}
    </div>
  );
}
