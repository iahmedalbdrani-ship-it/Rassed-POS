// ============================================================
// Control Panel (رصيد) — Expenses Page v2
// إصلاح: حقول الحسابات المنسدلة + Empty State + تشخيص أفضل
// ============================================================

import { useEffect, useMemo, useState, useId } from 'react';
import {
  Receipt, Save, Zap, Wallet, Calendar, FileText,
  Loader2, CheckCircle2, AlertTriangle, RefreshCw,
  TrendingDown, ArrowDownLeft, ArrowUpRight, Plus,
  ChevronDown, BookOpen, Info,
} from 'lucide-react';
import { fmt } from '../constants/theme';
import {
  accountsService,
  expensesService,
  type Account,
  type ExpenseRow,
} from '../lib/expenses-service';
import { useTenant } from '../contexts/TenantContext';

// ─── Helpers ──────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);

const COMMON_EXPENSES = [
  'فاتورة كهرباء',
  'فاتورة ماء',
  'فاتورة اتصالات / إنترنت',
  'إيجار المحل',
  'رواتب الموظفين',
  'صيانة وإصلاح',
  'مصاريف تسويق',
  'مصاريف عمومية',
];

// ─── Custom Account Select ─────────────────────────────────────
// يحل مشكلة bg-transparent و RTL في المتصفحات المختلفة
interface AccountSelectProps {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  accounts: Account[];
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  emptyMessage?: string;
}

function AccountSelect({
  id, value, onChange, accounts, placeholder,
  disabled = false, required = false, emptyMessage,
}: AccountSelectProps) {
  const fallbackId = useId();
  const selectId = id ?? fallbackId;

  if (accounts.length === 0) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <Info size={14} className="text-amber-500 flex-shrink-0" />
        <span className="text-[12px] text-amber-600">
          {emptyMessage ?? 'لا توجد حسابات — تحقق من شجرة الحسابات'}
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        dir="rtl"
        style={{
          // نتجنب bg-transparent لأنه يُخفي النص في بعض المتصفحات
          background: 'transparent',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          appearance: 'none',
          paddingRight: '0.5rem',
          paddingLeft: '2rem', // مكان للسهم
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: value ? '#1e293b' : '#94a3b8',
        }}
        className="w-full border-0 outline-none text-sm font-medium"
      >
        <option value="" disabled>{placeholder}</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id} style={{ color: '#1e293b', background: '#fff' }}>
            {a.code} — {a.name_ar}
          </option>
        ))}
      </select>
      {/* سهم مخصص موثوق (لا يختفي في RTL) */}
      <ChevronDown
        size={14}
        className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function ExpensesPage() {
  const { orgId } = useTenant();

  // State: بيانات المرجع
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [cashAccounts,    setCashAccounts]    = useState<Account[]>([]);
  const [recent,          setRecent]          = useState<ExpenseRow[]>([]);

  // State: الفورم
  const [description,      setDescription]      = useState('');
  const [amount,           setAmount]           = useState('');
  const [entryDate,        setEntryDate]        = useState(todayStr());
  const [sourceAccountId,  setSourceAccountId]  = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [reference,        setReference]        = useState('');

  // State: UX
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState<string | null>(null);

  // ─── تحميل البيانات ────────────────────────────────────────
  useEffect(() => { void loadAll(); }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [exp, cash, list] = await Promise.all([
        accountsService.listExpenseAccounts(orgId),
        accountsService.listCashBankAccounts(orgId),
        expensesService.listRecent(orgId, 20),
      ]);

      setExpenseAccounts(exp);
      setCashAccounts(cash);
      setRecent(list);

      // ضبط القيم الافتراضية الذكية (مرة واحدة فقط)
      setSourceAccountId(prev => {
        if (prev) return prev;
        return cash.length ? cash[0].id : '';
      });
      setExpenseAccountId(prev => {
        if (prev) return prev;
        if (!exp.length) return '';
        const utilities = exp.find(a =>
          a.code?.startsWith('55') || a.code?.startsWith('5500')
        ) ?? exp[0];
        return utilities.id;
      });
    } catch (e: any) {
      setError(e?.message ?? 'تعذّر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }

  // ─── إجمالي الشهر ──────────────────────────────────────────
  const monthlyTotal = useMemo(() => {
    const month = todayStr().slice(0, 7);
    return recent
      .filter(r => r.entry_date.startsWith(month))
      .reduce((s, r) => s + r.amount, 0);
  }, [recent]);

  // ─── التحقق من إمكانية الإرسال ─────────────────────────────
  const noAccounts = cashAccounts.length === 0 || expenseAccounts.length === 0;
  const canSubmit  = !saving && !loading && !noAccounts
    && description.trim() && Number(amount) > 0
    && sourceAccountId && expenseAccountId;

  // ─── إرسال الفورم ──────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await expensesService.create({
        org_id: orgId,
        description: description.trim(),
        amount: Number(amount),
        entry_date: entryDate,
        source_account_id: sourceAccountId,
        expense_account_id: expenseAccountId,
        reference: reference.trim() || undefined,
      });
      setSuccess('✅ تم حفظ المصروف وإنشاء القيد المحاسبي بنجاح');
      // إعادة تهيئة الفورم (مع الإبقاء على الحسابات المختارة)
      setDescription('');
      setAmount('');
      setReference('');
      setEntryDate(todayStr());
      // تحديث القائمة
      const list = await expensesService.listRecent(20);
      setRecent(list);
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: any) {
      setError(e?.message ?? 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-6 lg:p-8" dir="rtl">

      {/* ── Header ── */}
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
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-slate-600 hover:bg-white/60 transition-all disabled:opacity-50 cursor-pointer"
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
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white transition-all active:scale-95 cursor-pointer"
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

      {/* ── KPI Cards ── */}
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
          value={loading ? '...' : String(cashAccounts.length)}
          icon={<Wallet size={22} className="text-blue-500" />}
          tone="blue"
        />
      </section>

      {/* ── تحذير عند غياب الحسابات ── */}
      {!loading && noAccounts && (
        <div
          className="mb-6 flex items-start gap-3 p-4 rounded-3xl"
          style={{
            background: 'rgba(254,243,199,0.7)',
            border: '1px solid rgba(245,158,11,0.3)',
          }}
        >
          <BookOpen size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800 mb-1">
              {cashAccounts.length === 0 && expenseAccounts.length === 0
                ? 'لا توجد حسابات مُعدّة في النظام بعد'
                : cashAccounts.length === 0
                  ? 'لا توجد حسابات صندوق/بنك مُعدّة'
                  : 'لا توجد حسابات مصروفات مُعدّة'}
            </p>
            <p className="text-xs text-amber-700">
              لتسجيل المصروفات يجب أولاً إنشاء{' '}
              {cashAccounts.length === 0 ? 'حسابات نقدية (نوع: أصول) ' : ''}
              {cashAccounts.length === 0 && expenseAccounts.length === 0 ? 'و' : ''}
              {expenseAccounts.length === 0 ? ' حسابات مصروفات (نوع: مصروف) ' : ''}
              من صفحة <strong>شجرة الحسابات</strong>.
              بعد الإنشاء اضغط <strong>تحديث</strong> أعلاه.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* ─── نموذج الإدخال ── */}
        <section
          id="expense-form"
          className="xl:col-span-2 rounded-[2.5rem] p-7"
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

          {/* التنبيهات */}
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

          {/* حالة التحميل */}
          {loading && (
            <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
              <Loader2 size={20} className="animate-spin text-blue-400" />
              <span className="text-sm">جاري تحميل الحسابات...</span>
            </div>
          )}

          {!loading && (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>

              {/* بيان المصروف */}
              <FormField
                label="بيان المصروف"
                icon={<FileText size={14} className="text-slate-400" />}
                required
              >
                <input
                  type="text"
                  list="expense-suggestions"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="مثال: فاتورة كهرباء شهر أبريل"
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
                  required
                >
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    dir="ltr"
                    style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, monospace' }}
                    className="w-full bg-transparent border-0 outline-none text-sm font-bold text-slate-800 placeholder:text-slate-400"
                  />
                </FormField>
                <FormField
                  label="التاريخ"
                  icon={<Calendar size={14} className="text-slate-400" />}
                  required
                >
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    dir="ltr"
                    className="w-full bg-transparent border-0 outline-none text-sm text-slate-800 cursor-pointer"
                  />
                </FormField>
              </div>

              {/* حساب المصدر */}
              <FormField
                label="حساب المصدر — من أين سيُدفع؟"
                icon={<Wallet size={14} className="text-blue-400" />}
                required={cashAccounts.length > 0}
                hasError={!loading && cashAccounts.length === 0}
              >
                <AccountSelect
                  value={sourceAccountId}
                  onChange={setSourceAccountId}
                  accounts={cashAccounts}
                  placeholder="— اختر حساب صندوق أو بنك —"
                  required={cashAccounts.length > 0}
                  emptyMessage="لا توجد حسابات نقدية — أضفها في شجرة الحسابات"
                />
              </FormField>

              {/* حساب المصروف */}
              <FormField
                label="حساب المصروف — ما نوع المصروف؟"
                icon={<TrendingDown size={14} className="text-rose-400" />}
                required={expenseAccounts.length > 0}
                hasError={!loading && expenseAccounts.length === 0}
              >
                <AccountSelect
                  value={expenseAccountId}
                  onChange={setExpenseAccountId}
                  accounts={expenseAccounts}
                  placeholder="— اختر حساب المصروف —"
                  required={expenseAccounts.length > 0}
                  emptyMessage="لا توجد حسابات مصروفات — أضفها في شجرة الحسابات"
                />
              </FormField>

              {/* ملخص القيد المحاسبي (يظهر عند اكتمال البيانات) */}
              {amount && Number(amount) > 0 && sourceAccountId && expenseAccountId && (
                <EntryPreview
                  amount={Number(amount)}
                  expAccount={expenseAccounts.find(a => a.id === expenseAccountId)}
                  srcAccount={cashAccounts.find(a => a.id === sourceAccountId)}
                />
              )}

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

              {/* زر الإرسال */}
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full flex items-center justify-center gap-2 mt-2 py-3.5 rounded-2xl text-white font-black text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                style={{
                  background: canSubmit
                    ? 'linear-gradient(135deg, #f97316, #ea580c)'
                    : 'linear-gradient(135deg, #94a3b8, #64748b)',
                  boxShadow: canSubmit ? '0 12px 28px rgba(249,115,22,0.4)' : 'none',
                }}
              >
                {saving ? (
                  <><Loader2 size={18} className="animate-spin" /> جاري الحفظ...</>
                ) : noAccounts ? (
                  <><BookOpen size={18} /> يجب إعداد الحسابات أولاً</>
                ) : (
                  <><Save size={18} /> حفظ وإنشاء القيد المحاسبي</>
                )}
              </button>

              {/* رسالة التوجيه عند غياب الحسابات */}
              {noAccounts && !loading && (
                <p className="text-center text-[11px] text-slate-400">
                  اذهب إلى <strong>شجرة الحسابات</strong> لإضافة الحسابات المطلوبة
                </p>
              )}
            </form>
          )}
        </section>

        {/* ─── القيود الأخيرة ── */}
        <section
          className="xl:col-span-3 rounded-[2.5rem] p-6"
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
            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pl-1">
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

// ═══════════════════════════════════════════════════════════
// ── Sub-components
// ═══════════════════════════════════════════════════════════

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
      <div className="floating-icon w-12 h-12 rounded-2xl bg-white/70 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 font-medium mb-0.5 truncate">{title}</p>
        <p className="text-xl font-black text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  required?: boolean;
  hasError?: boolean;
}

function FormField({ label, icon, children, required = false, hasError = false }: FormFieldProps) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 px-1">
        {icon}
        {label}
        {required && <span className="text-rose-400 mr-0.5">*</span>}
      </label>
      <div
        className="rounded-2xl px-4 py-3 transition-all focus-within:ring-2 focus-within:ring-orange-200"
        style={{
          background: 'rgba(255,255,255,0.85)',
          border: hasError
            ? '1.5px solid rgba(245,158,11,0.5)'
            : '1px solid rgba(15,23,42,0.08)',
          boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.03)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** معاينة القيد المحاسبي قبل الحفظ */
function EntryPreview({
  amount, expAccount, srcAccount,
}: {
  amount: number;
  expAccount?: Account;
  srcAccount?: Account;
}) {
  if (!expAccount || !srcAccount) return null;
  return (
    <div
      className="rounded-2xl p-3 space-y-1.5"
      style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.12)' }}
    >
      <p className="text-[10px] font-bold text-slate-400 mb-2">معاينة القيد المحاسبي</p>
      <div className="flex items-center justify-between text-[12px]">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
          <span className="text-slate-600">مدين — {expAccount.name_ar}</span>
        </span>
        <span className="font-black text-rose-600">{fmt.format(amount)} ر.س</span>
      </div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          <span className="text-slate-600">دائن — {srcAccount.name_ar}</span>
        </span>
        <span className="font-black text-emerald-600">{fmt.format(amount)} ر.س</span>
      </div>
    </div>
  );
}

function ExpenseRowCard({ row }: { row: ExpenseRow }) {
  return (
    <div
      className="flex items-center gap-3 p-4 rounded-2xl transition-all hover:translate-x-[-2px]"
      style={{
        background: 'rgba(255,255,255,0.7)',
        border: '1px solid rgba(255,255,255,0.9)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(244,63,94,0.10)' }}
      >
        <ArrowDownLeft className="text-rose-500" size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 truncate">{row.description}</p>
        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500 mt-0.5">
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
        <p className="text-[9px] text-slate-400 text-center">ر.س</p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="floating-icon w-16 h-16 rounded-[1.5rem] flex items-center justify-center mb-4"
        style={{ background: 'rgba(148,163,184,0.12)' }}
      >
        <Receipt className="text-slate-300" size={28} />
      </div>
      <p className="text-sm font-bold text-slate-500">لا توجد مصروفات مسجلة حتى الآن</p>
      <p className="text-xs text-slate-400 mt-1">أدخل أول مصروف من النموذج الجانبي</p>
    </div>
  );
}
