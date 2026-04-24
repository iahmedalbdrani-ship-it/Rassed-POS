// ============================================================
// رصيد — Double-Entry Accounting Engine
//
// كل قيد يمر من هنا. القواعد الإلزامية:
//   1. مجموع المدين = مجموع الدائن (وإلا → استثناء)
//   2. تقريب إلزامي: Math.round(val * 100) / 100
//   3. الكتابة الذرية: رأس القيد + البنود في عملية واحدة
//   4. org_id مُدرَج في كل سجل
// ============================================================

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────

export type JournalReferenceType =
  | 'MANUAL'       // قيد يدوي من المستخدم
  | 'EXPENSE'      // مصروف
  | 'INCOME'       // إيراد
  | 'SALE'         // بيع POS
  | 'ADJUSTMENT'   // تسوية
  | 'OPENING';     // رصيد افتتاحي

export interface JournalLine {
  account_id:  string;
  description: string;
  debit:       number;   // must be >= 0
  credit:      number;   // must be >= 0
}

export interface JournalEntryInput {
  org_id:         string;
  entry_date:     string;          // YYYY-MM-DD
  description:    string;
  reference_type: JournalReferenceType;
  reference_no?:  string;
  lines:          JournalLine[];   // minimum 2 lines
}

export interface JournalEntryResult {
  id:           string;
  entry_number: number;
  entry_date:   string;
  description:  string;
  org_id:       string;
  is_posted:    boolean;
  created_at:   string;
}

// ─── Helpers ──────────────────────────────────────────────────

/** تقريب مالي إلزامي — يمنع أخطاء الفاصلة العائمة */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── Validation ───────────────────────────────────────────────

function validateEntry(input: JournalEntryInput): void {
  if (!input.org_id?.trim()) {
    throw new Error('[DoubleEntry] org_id مطلوب لكل قيد محاسبي');
  }
  if (!input.description?.trim()) {
    throw new Error('[DoubleEntry] يرجى إدخال بيان القيد');
  }
  if (!input.entry_date) {
    throw new Error('[DoubleEntry] يرجى إدخال تاريخ القيد');
  }
  if (!input.lines || input.lines.length < 2) {
    throw new Error('[DoubleEntry] القيد يجب أن يحتوي على بندَين على الأقل');
  }

  let totalDebit  = 0;
  let totalCredit = 0;

  for (const line of input.lines) {
    if (!line.account_id) {
      throw new Error('[DoubleEntry] كل بند يجب أن يحتوي على حساب محدد');
    }
    if (line.debit < 0 || line.credit < 0) {
      throw new Error('[DoubleEntry] قيم المدين والدائن يجب أن تكون موجبة');
    }
    if (line.debit > 0 && line.credit > 0) {
      throw new Error('[DoubleEntry] لا يمكن أن يكون البند مديناً ودائناً في آنٍ واحد');
    }
    totalDebit  = roundMoney(totalDebit  + roundMoney(line.debit));
    totalCredit = roundMoney(totalCredit + roundMoney(line.credit));
  }

  if (totalDebit !== totalCredit) {
    throw new Error(
      `[DoubleEntry] القيد غير متوازن — المدين: ${totalDebit.toFixed(2)} ≠ الدائن: ${totalCredit.toFixed(2)}`
    );
  }
  if (totalDebit === 0) {
    throw new Error('[DoubleEntry] مبلغ القيد يجب أن يكون أكبر من صفر');
  }
}

// ─── Core Engine ──────────────────────────────────────────────

/**
 * postJournalEntry — الدالة الوحيدة المُخوَّلة بترحيل القيود
 *
 * تُطبّق:
 *  ✓ التحقق من التوازن (مدين = دائن)
 *  ✓ التقريب الإلزامي
 *  ✓ org_id في رأس القيد وكل بند
 *  ✓ Rollback يدوي عند فشل البنود
 */
export async function postJournalEntry(
  input: JournalEntryInput,
): Promise<JournalEntryResult> {
  // ── 1. التحقق من صحة المدخلات ──────────────────────────────
  validateEntry(input);

  // ── 2. تقريب جميع القيم ────────────────────────────────────
  const roundedLines: JournalLine[] = input.lines.map(line => ({
    ...line,
    debit:  roundMoney(line.debit),
    credit: roundMoney(line.credit),
  }));

  // ── 3. إدراج رأس القيد ─────────────────────────────────────
  const { data: entry, error: entryErr } = await supabase
    .from('journal_entries')
    .insert({
      org_id:         input.org_id,
      entry_date:     input.entry_date,
      description:    input.description.trim(),
      reference_type: input.reference_type,
      reference_no:   input.reference_no ?? null,
      is_posted:      true,
    })
    .select()
    .single();

  if (entryErr) {
    throw new Error(`[DoubleEntry] فشل إنشاء رأس القيد: ${entryErr.message}`);
  }

  // ── 4. إدراج بنود القيد ────────────────────────────────────
  const linesPayload = roundedLines.map(line => ({
    entry_id:    entry.id,
    org_id:      input.org_id,
    account_id:  line.account_id,
    description: line.description.trim() || input.description.trim(),
    debit:       line.debit,
    credit:      line.credit,
  }));

  const { error: linesErr } = await supabase
    .from('journal_entry_lines')
    .insert(linesPayload);

  if (linesErr) {
    // ── Rollback: حذف رأس القيد لمنع قيد ناقص ──────────────
    await supabase.from('journal_entries').delete().eq('id', entry.id);
    throw new Error(`[DoubleEntry] فشل إنشاء بنود القيد (تم التراجع): ${linesErr.message}`);
  }

  return entry as JournalEntryResult;
}

// ─── Shortcut: Simple Two-Line Entry ──────────────────────────

export interface SimpleTwoLineInput {
  org_id:          string;
  entry_date:      string;
  description:     string;
  reference_type:  JournalReferenceType;
  reference_no?:   string;
  debit_account_id:  string;   // الحساب المدين
  credit_account_id: string;   // الحساب الدائن
  amount:          number;
}

/**
 * postSimpleEntry — قيد بسيط (بندان: مدين ودائن)
 * الأكثر استخداماً في المصروفات والإيرادات اليدوية
 */
export async function postSimpleEntry(
  input: SimpleTwoLineInput,
): Promise<JournalEntryResult> {
  if (input.debit_account_id === input.credit_account_id) {
    throw new Error('[DoubleEntry] لا يمكن أن يكون الحساب المدين والدائن متطابقَين');
  }
  const amount = roundMoney(input.amount);
  if (amount <= 0) {
    throw new Error('[DoubleEntry] المبلغ يجب أن يكون أكبر من صفر');
  }

  return postJournalEntry({
    org_id:         input.org_id,
    entry_date:     input.entry_date,
    description:    input.description,
    reference_type: input.reference_type,
    reference_no:   input.reference_no,
    lines: [
      { account_id: input.debit_account_id,  description: input.description, debit: amount,  credit: 0 },
      { account_id: input.credit_account_id, description: input.description, debit: 0,       credit: amount },
    ],
  });
}
