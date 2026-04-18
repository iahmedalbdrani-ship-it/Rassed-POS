// ============================================================
// Control Panel (رصيد) — Expenses Page
// Design: White Glassmorphism | RTL Arabic | Live Sync
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  Receipt, Save, Zap, Wallet, Calendar, FileText,
  Loader2, CheckCircle2, AlertTriangle, RefreshCw,
  TrendingDown, ArrowDownLeft, ArrowUpRight, Plus
} from 'lucide-react';
import { fmt } from '../constants/theme';
import {
  accountsService,
  expensesService,
  type Account,
  type ExpenseRow,
} from '../lib/expenses-service';

// ─── Helpers ──────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);

const COMMON_EXPENSES = [
  'فاتورة كهرباء',
  'فاتورة ماء',
  'فاتورة اتصالات / إنترنت',
  'إيجار المحل',
  'رواتب الموظفين',
  'مصاريف عمومية',
];

// ─── Main Component ───────────────────────────────────────────
export default function ExpensesPage() {
  // State: reference data
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [cashAccounts, setCashAccounts] = useState<Account[]>([]);
  const [recent, setRecent] = useState<ExpenseRow[]>([]);

  // State: form
  const [description, setDescription]           = useState('');
  const [amount, setAmount]                     = useState<string>('');
  const [entryDate, setEntryDate]               = useState<string>(todayStr());
  const [sourceAccountId, setSourceAccountId]   = useState<string>('');
  const [expenseAccountId, setExpenseAccountId] = useState<string>('');
  const [reference, setReference]               = useState('');

  // State: UX
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);

  // ─── Load reference data on mount ──────────────────────────
  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [exp, cash, list] = await Promise.all([
        accountsService.listExpenseAccounts(),
        accountsService.listCashBankAccounts(),
        expensesService.listRecent(20),
      ]);
      setExpenseAccounts(exp);
      setCashAccounts(cash);
      setRecent(list);
      // Smart defaults
      if (!sourceAccountId && cash.length)  setSourceAccountId(cash[0].id);
      if (!expenseAccountId && exp.length) {
        const utilities = exp.find(a => a.code === '5500') ?? exp[0];
        setExpenseAccountId(utilities.id);
      }
    } catch (e: any) {
      setError(e?.message ?? 'تعذّر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }

  // ─── Computed ──────────────────────────────────────────────
  const monthlyTotal = useMemo(() => {
    const month = todayStr().slice(0, 7);
    return recent
      .filter(r => r.entry_date.startsWith(month))
      .reduce((s, r) => s + r.amount, 0);
  }, [recent]);

  // ─── Submit handler ────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await expensesService.create({
        description,
        amount: Number(amount),
        entry_date: entryDate,
        source_account_id: sourceAccountId,
        expense_account_id: expenseAccountId,
        reference: reference || undefined,
      });
      setSuccess('✅ تم حفظ المصروف وإنشاء القيد المحاسبي بنجاح');
      // Reset form (keep selected accounts)
      setDescription('');
      setAmount('');
      setReference('');
      setEntryDate(todayStr());
      // Refresh list
      const list = await expensesService.listRecent(20);
      setRecent(list);
      setTimeout(() => setSuccess(null), 3500);
    } catch (e: any) {
      setError(e?.message ?? 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-6 lg:p-8" dir="rtl">
      {/* Header */}
      <header className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div
            className="floating-icon w-16 h-16 rounded-[1.75rem] flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #fb7185, #f43f5e)',
              boxShadow: '0 12px 32px rgba(244, 63, 94, 0.35)',
            }}
          >
            <TrendingDown className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-800">المصروفات</h1>
            <p className="text-sm text-slate-500 mt-1">
              إدخال المصروفات وإنشاء القيود المحاسبية تلقائياً (قيد مزدوج)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void loadAll()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-slate-600 hover:bg-white/60 transition-all disabled:opacity-50"
            style={{
              background: 'rgba(255,255,255,0.5)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.8)',
            }}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            تحديث
          </button>
          <button
            onClick={() => document.getElementById('expense-form')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              boxShadow: '0 8px 24px rgba(59, 130, 246, 0.4)',
            }}
          >
            <Plus size={16} />
            مصروف جديد
          </button>
        </div>
      </header>

      {/* KPI bar */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <GlassKpi
          title="إجمالي مصروفات الشهر"
          value={`${fmt.format(monthlyTotal)} ر.س`}
          icon={<ArrowDownLeft size={22} className="text-rose-500" />}
          tone="rose"
        />
        <GlassKpi
          title="عدد القيود الأخيرة"
          value={String(recent.length)}
          icon={<Receipt size={22} className="text-amber-500" />}
          tone="amber"
        />
        <GlassKpi
          title="حسابات الصندوق/البنك المتاحة"
          value={String(cashAccounts.length)}
          icon={<Wallet size={22} className="text-blue-500" />}
          tone="blue"
        />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* ─── Form Card ────────────────────────────────────── */}
        <section
          id="expense-form"
          className="xl:col-span-2 rounded-[2.5rem] p-7 animate-in fade-in slide-in-from-bottom-2 duration-300"
          style={{
            background: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            border: '1px solid rgba(255,255,255,0.9)',
            boxShadow: '0 20px 60px rgba(15, 23, 42, 0.08)',
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className="floating-icon w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #60a5fa, #3b82f6)',
                boxShadow: '0 8px 24px rgba(59,130,246,0.35)',
              }}
            >
              <Plus className="text-white" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">تسجيل مصروف جديد</h2>
              <p className="text-[11px] text-slate-500">قيد مزدوج آلي — مدين المصروف / دائن الصندوق</p>
            </div>
          </div>

          {/* Alerts */}
          {error && (
            <div
              className="mb-4 flex items-start gap-2 p-3 rounded-2xl text-xs text-rose-700"
              style={{ background: 'rgba(254,226,226,0.7)', border: '1px solid rgba(244,63,94,0.3)' }}
            >
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div
              className="mb-4 flex items-start gap-2 p-3 rounded-2xl text-xs text-emerald-700"
              style={{ background: 'rgba(209,250,229,0.7)', border: '1px solid rgba(16,185,129,0.3)' }}
            >
              <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* بيان المصروف */}
            <FormField
              label="بيان المصروف"
              icon={<FileText size={14} className="text-slate-400" />}
            >
              <input
                type="text"
                list="expense-suggestions"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="مثال: فاتورة كهرباء شهر أبريل"
                required
                className="w-full bg-transparent border-0 outline-none text-sm text-slate-800 placeholder:text-slate-400"
              />
              <datalist id="expense-suggestions">
                {COMMON_EXPENSES.map(s => <option key={s} value={s} />)}
              </datalist>
            </FormField>

            {/* المبلغ والتاريخ */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="المبلغ (ر.س)"
                icon={<Zap size={14} className="text-amber-400" />}
              >
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1000.00"
                  required
                  className="w-full bg-transparent border-0 outline-none text-sm font-bold text-slate-800 placeholder:text-slate-400"
                />
              </FormField>
              <FormField
                label="التاريخ"
                icon={<Calendar size={14} className="text-slate-400" />}
              >
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  required
                  className="w-full bg-transparent border-0 outline-none text-sm text-slate-800"
                />
              </FormField>
            </div>

            {/* حساب المصدر */}
            <FormField
              label="حساب المصدر (من أين سيُدفع المبلغ؟)"
              icon={<Wallet size={14} className="text-blue-400" />}
            >
              <select
                value={sourceAccountId}
                onChange={(e) => setSourceAccountId(e.target.value)}
                required
                className="w-full bg-transparent border-0 outline-none text-sm text-slate-800"
              >
                <option value="" disabled>— اختر حساب صندوق أو بنك —</option>
                {cashAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name_ar}</option>
                ))}
              </select>
            </FormField>

            {/* حساب المصروف */}
            <FormField
              label="حساب المصروف"
              icon={<TrendingDown size={14} className="text-rose-400" />}
            >
              <select
                value={expenseAccountId}
                onChange={(e) => setExpenseAccountId(e.target.value)}
                required
                className="w-full bg-transparent border-0 outline-none text-sm text-slate-800"
              >
                <option value="" disabled>— اختر حساب المصروف —</option>
                {expenseAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name_ar}</option>
                ))}
              </select>
            </FormField>

            {/* مرجع اختياري */}
            <FormField label="مرجع (اختياري)" icon={<Receipt size={14} className="text-slate-400" />}>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="رقم فاتورة المورد إن وُجد"
                className="w-full bg-transparent border-0 outline-none text-sm text-slate-800 placeholder:text-slate-400"
              />
            </FormField>

            {/* Submit */}
            <button
              type="submit"
              disabled={saving || loading}
              className="w-full flex items-center justify-center gap-2 mt-2 py-3.5 rounded-2xl text-white font-black text-sm transition-all disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                boxShadow: '0 12px 28px rgba(249,115,22,0.4)',
              }}
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {saving ? 'جاري الحفظ...' : 'حفظ وإنشاء القيد المحاسبي'}
            </button>
          </form>
        </section>

        {/* ─── Recent Entries ─────────────────────────────── */}
        <section
          className="xl:col-span-3 rounded-[2.5rem] p-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
          style={{
            background: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            border: '1px solid rgba(255,255,255,0.9)',
            boxShadow: '0 20px 60px rgba(15, 23, 42, 0.08)',
          }}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div
                className="floating-icon w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #34d399, #10b981)',
                  boxShadow: '0 8px 24px rgba(16,185,129,0.3)',
                }}
              >
                <Receipt className="text-white" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-800">القيود الأخيرة</h2>
                <p className="text-[11px] text-slate-500">آخر 20 قيد مصروف يدوي</p>
              </div>
            </div>
            <span
              className="text-[10px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(16,185,129,0.15)', color: '#059669' }}
            >
              LIVE
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : recent.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-2">
              {recent.map((r) => (
                <ExpenseRowCard key={r.id} row={r} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────
function GlassKpi({
  title, value, icon, tone,
}: {
  title: string; value: string; icon: React.ReactNode;
  tone: 'rose' | 'amber' | 'blue';
}) {
  const bgMap = {
    rose:  'rgba(254,226,226,0.55)',
    amber: 'rgba(254,243,199,0.55)',
    blue:  'rgba(219,234,254,0.55)',
  };
  return (
    <div
      className="rounded-[2rem] p-5 flex items-center gap-4"
      style={{
        background: bgMap[tone],
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.8)',
        boxShadow: '0 10px 30px rgba(15,23,42,0.05)',
      }}
    >
      <div className="floating-icon w-12 h-12 rounded-2xl bg-white/70 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 font-medium mb-0.5 truncate">{title}</p>
        <p className="text-xl font-black text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
}

function FormField({
  label, icon, children,
}: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 px-1">
        {icon}{label}
      </label>
      <div
        className="rounded-2xl px-4 py-3 transition-all focus-within:ring-2 focus-within:ring-orange-200"
        style={{
          background: 'rgba(255,255,255,0.75)',
          border: '1px solid rgba(15,23,42,0.08)',
          boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.04)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ExpenseRowCard({ row }: { row: ExpenseRow }) {
  return (
    <div
      className="flex items-center gap-3 p-4 rounded-2xl transition-all hover:translate-x-[-2px]"
      style={{
        background: 'rgba(255,255,255,0.6)',
        border: '1px solid rgba(255,255,255,0.9)',
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(244,63,94,0.12)' }}
      >
        <ArrowDownLeft className="text-rose-500" size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 truncate">{row.description}</p>
        <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-0.5">
          <span>#{row.entry_number}</span>
          <span>•</span>
          <span>{row.entry_date}</span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <ArrowUpRight size={10} className="text-rose-400" />
            {row.expense_account}
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <Wallet size={10} className="text-blue-400" />
            {row.source_account}
          </span>
        </div>
      </div>
      <div className="text-left flex-shrink-0">
        <p className="text-sm font-black text-rose-600">{fmt.format(row.amount)}</p>
        <p className="text-[9px] text-slate-400">ر.س</p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="floating-icon w-16 h-16 rounded-[1.5rem] flex items-center justify-center mb-4"
        style={{ background: 'rgba(148,163,184,0.15)' }}
      >
        <Receipt className="text-slate-400" size={28} />
      </div>
      <p className="text-sm font-bold text-slate-600">لا توجد مصروفات مسجلة حتى الآن</p>
      <p className="text-xs text-slate-400 mt-1">أدخل أول مصروف من النموذج الجانبي</p>
    </div>
  );
}
