// ============================================================
// رصيد — TransactionModal (قيد يدوي)
//
// يُسجّل قيداً محاسبياً مزدوجاً عبر double-entry engine:
//   • اختيار الحساب المدين والدائن من شجرة الحسابات
//   • التحقق من توازن القيد قبل الإرسال
//   • تقريب إلزامي + org_id من TenantContext
// ============================================================

import { useState, useEffect } from 'react';
import { BookOpen, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { postSimpleEntry } from '../../lib/double-entry';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────

interface AccountOption {
  id:      string;
  code:    string;
  name_ar: string;
  type:    string;
}

interface TransactionModalProps {
  onClose: () => void;
  onSave:  () => void;
}

// ─── Component ────────────────────────────────────────────────

export default function TransactionModal({ onClose, onSave }: TransactionModalProps) {
  const { orgId } = useTenant();

  const [accounts,  setAccounts]  = useState<AccountOption[]>([]);
  const [accsLoading, setAccsLoading] = useState(true);

  const [form, setForm] = useState({
    description:       '',
    amount:            '',
    entry_date:        new Date().toISOString().slice(0, 10),
    debit_account_id:  '',
    credit_account_id: '',
    reference_no:      '',
  });

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  // ── جلب الحسابات القابلة للترحيل ─────────────────────────
  useEffect(() => {
    async function loadAccounts() {
      const { data, error: dbErr } = await supabase
        .from('accounts')
        .select('id, code, name_ar, account_type')
        .eq('is_active', true)
        .eq('allow_entries', true)
        .order('code', { ascending: true });

      if (!dbErr && data) {
        setAccounts(
          (data as Array<{ id: string; code: string; name_ar: string; account_type: string }>)
            .map(a => ({ id: a.id, code: a.code, name_ar: a.name_ar, type: a.account_type }))
        );
      }
      setAccsLoading(false);
    }
    loadAccounts();
  }, []);

  // ── التحقق الفوري من الحسابات ────────────────────────────
  const sameAccount =
    form.debit_account_id &&
    form.credit_account_id &&
    form.debit_account_id === form.credit_account_id;

  // ── الإرسال ───────────────────────────────────────────────
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!orgId) {
      setError('لم يتم تحميل بيانات المؤسسة بعد — يرجى الانتظار');
      return;
    }
    if (sameAccount) {
      setError('لا يمكن أن يكون الحساب المدين والدائن متطابقَين');
      return;
    }

    setLoading(true);
    try {
      await postSimpleEntry({
        org_id:            orgId,
        entry_date:        form.entry_date,
        description:       form.description,
        reference_type:    'MANUAL',
        reference_no:      form.reference_no || undefined,
        debit_account_id:  form.debit_account_id,
        credit_account_id: form.credit_account_id,
        amount:            parseFloat(form.amount),
      });

      setSuccess(true);
      setTimeout(() => { onSave(); }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  // ─── UI ───────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
        style={{
          background: 'rgba(255,255,255,0.97)',
          border:     '1px solid rgba(0,0,0,0.08)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <BookOpen size={18} className="text-amber-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-gray-900">قيد يدوي</h3>
              <p className="text-[11px] text-gray-400">قيد محاسبي مزدوج</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="p-6 space-y-4">

          {/* البيان */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">بيان القيد *</label>
            <input
              required
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="مثال: إيراد خدمات استشارية — أبريل 2026"
              className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          {/* المبلغ + التاريخ */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1.5">المبلغ (ر.س) *</label>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-amber-600 placeholder-gray-300 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1.5">تاريخ القيد *</label>
              <input
                required
                type="date"
                value={form.entry_date}
                onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))}
                className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-[13px] text-gray-800 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
          </div>

          {/* الحساب المدين */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">
              الحساب المدين * <span className="text-blue-500">(Debit ↑)</span>
            </label>
            <select
              required
              value={form.debit_account_id}
              onChange={e => setForm(f => ({ ...f, debit_account_id: e.target.value }))}
              disabled={accsLoading}
              className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-[13px] text-gray-800 focus:outline-none focus:border-blue-400 transition-colors disabled:opacity-50"
            >
              <option value="">{accsLoading ? 'جارٍ التحميل…' : '— اختر الحساب المدين —'}</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name_ar}
                </option>
              ))}
            </select>
          </div>

          {/* الحساب الدائن */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">
              الحساب الدائن * <span className="text-emerald-500">(Credit ↓)</span>
            </label>
            <select
              required
              value={form.credit_account_id}
              onChange={e => setForm(f => ({ ...f, credit_account_id: e.target.value }))}
              disabled={accsLoading}
              className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-[13px] text-gray-800 focus:outline-none focus:border-emerald-400 transition-colors disabled:opacity-50"
            >
              <option value="">{accsLoading ? 'جارٍ التحميل…' : '— اختر الحساب الدائن —'}</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name_ar}
                </option>
              ))}
            </select>
          </div>

          {/* رقم المرجع (اختياري) */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">رقم المرجع (اختياري)</label>
            <input
              value={form.reference_no}
              onChange={e => setForm(f => ({ ...f, reference_no: e.target.value }))}
              placeholder="مثال: INV-2026-001"
              className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-[13px] text-gray-600 placeholder-gray-300 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          {/* تحذير التطابق */}
          {sameAccount && (
            <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 rounded-2xl border border-rose-100">
              <AlertCircle size={14} className="text-rose-500 shrink-0" />
              <p className="text-[12px] text-rose-600">الحساب المدين والدائن متطابقان — يرجى التصحيح</p>
            </div>
          )}

          {/* خطأ */}
          {error && (
            <div className="flex items-start gap-2 px-4 py-3 bg-rose-50 rounded-2xl border border-rose-100">
              <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
              <p className="text-[12px] text-rose-600">{error}</p>
            </div>
          )}

          {/* نجاح */}
          {success && (
            <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 rounded-2xl border border-emerald-100">
              <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
              <p className="text-[12px] text-emerald-600">تم ترحيل القيد بنجاح ✓</p>
            </div>
          )}

          {/* زر الإرسال */}
          <button
            type="submit"
            disabled={loading || success || !!sameAccount || !orgId}
            className="w-full py-3 rounded-2xl font-semibold text-[14px] text-white transition-all disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 6px 20px #f59e0b30' }}
          >
            {loading ? 'جارٍ الترحيل…' : success ? 'تم ✓' : 'ترحيل القيد'}
          </button>
        </form>
      </div>
    </div>
  );
}
