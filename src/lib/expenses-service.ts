// ============================================================
// Control Panel (رصيد) — Expenses Service
// إدارة المصروفات + القيود المحاسبية (قيد مزدوج آلي)
// ============================================================

import { supabase } from './supabase';
import { postSimpleEntry, roundMoney } from './double-entry';

// ─── Types ──────────────────────────────────────────────────
export interface Account {
  id: string;
  code: string;
  name_ar: string;
  name_en?: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  nature: 'DEBIT' | 'CREDIT';
  is_header: boolean;
  level: number;
}

export interface AccountBalance extends Account {
  total_debit: number;
  total_credit: number;
  balance: number;
}

export interface ExpenseInput {
  org_id: string;            // مُلزِم — يُمرَّر من TenantContext
  description: string;       // اسم/بيان المصروف (مثال: فاتورة كهرباء أبريل)
  amount: number;            // المبلغ بالريال
  entry_date: string;        // تاريخ بصيغة YYYY-MM-DD
  source_account_id: string; // حساب المصدر (نقدية/بنك)
  expense_account_id: string;// حساب المصروف (مثلاً مرافق)
  reference?: string;        // مرجع اختياري (رقم فاتورة)
}

export interface ExpenseRow {
  id: string;
  entry_number: number;
  entry_date: string;
  description: string;
  reference_no?: string;
  amount: number;
  expense_account: string;
  source_account: string;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════
// ── ACCOUNTS (شجرة الحسابات) ─────────────────────────────────
// ═══════════════════════════════════════════════════════════
export const accountsService = {
  /** جميع الحسابات القابلة للنشاط مُصفَّاة بالمؤسسة */
  async listActive(orgId: string): Promise<Account[]> {
    if (!orgId?.trim()) throw new Error('[AccountsService] org_id مطلوب');
    const { data, error } = await supabase
      .from('accounts')
      .select('id, code, name_ar, name_en, type, nature, is_header, level')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('code', { ascending: true });
    if (error) throw new Error(`accounts.listActive: ${error.message}`);
    return (data ?? []) as Account[];
  },

  /** حسابات المصروفات فقط (للقائمة المنسدلة) — مع Fallback */
  async listExpenseAccounts(orgId: string): Promise<Account[]> {
    const all = await this.listActive(orgId);

    // المحاولة الأولى: حسابات المصروفات القابلة للترحيل (غير رأسية)
    const nonHeader = all.filter(a => a.type === 'EXPENSE' && !a.is_header);
    if (nonHeader.length > 0) return nonHeader;

    // Fallback: كل حسابات المصروفات (بما فيها الرأسية كخيار أخير)
    return all.filter(a => a.type === 'EXPENSE');
  },

  /** حسابات الصندوق/البنك (كمصدر دفع) — مرن: يبدأ بالأكواد المعيارية ثم يتوسع */
  async listCashBankAccounts(orgId: string): Promise<Account[]> {
    const all = await this.listActive(orgId);

    // المحاولة الأولى: الأكواد المحاسبية المعيارية السعودية
    const strict = all.filter(
      a =>
        !a.is_header &&
        a.type === 'ASSET' &&
        a.nature === 'DEBIT' &&
        (
          a.code.startsWith('111') ||  // نقدية وصناديق
          a.code.startsWith('112') ||  // حسابات بنكية
          a.code.startsWith('113') ||  // بنوك احتياطية
          a.code.startsWith('1100') || // صندوق نقدي (بديل)
          a.code.startsWith('1110') || // نقدية بديلة
          a.code.startsWith('1200') || // بنك بديل
          a.code.startsWith('110') ||  // نقدية قصيرة
          a.code.startsWith('120')     // بنوك قصيرة
        )
    );
    if (strict.length > 0) return strict;

    // Fallback: كل حسابات الأصول المدينة غير الرأسية
    const fallback = all.filter(
      a => !a.is_header && a.type === 'ASSET' && a.nature === 'DEBIT'
    );
    if (fallback.length > 0) return fallback;

    // آخر fallback: كل حسابات الأصول غير الرأسية
    return all.filter(a => !a.is_header && a.type === 'ASSET');
  },

  /** رصيد محدّث لحساب واحد عبر الـ VIEW: account_balances */
  async getBalance(accountId: string, _orgId?: string): Promise<number> {
    const { data, error } = await supabase
      .from('account_balances')
      .select('balance')
      .eq('id', accountId)
      .maybeSingle();
    if (error) throw new Error(`accounts.getBalance: ${error.message}`);
    return Number(data?.balance ?? 0);
  },
};

// ═══════════════════════════════════════════════════════════
// ── EXPENSES (قيد مزدوج آلي) ─────────────────────────────────
// ═══════════════════════════════════════════════════════════
export const expensesService = {
  /**
   * إنشاء قيد مصروف (قيد مزدوج آلي)
   *  - مدين (Debit) : حساب المصروف
   *  - دائن (Credit): حساب الصندوق/البنك
   */
  async create(input: ExpenseInput) {
    if (!input.org_id?.trim()) throw new Error('يرجى تحميل بيانات المؤسسة أولاً');
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error('المبلغ يجب أن يكون رقماً موجباً');
    }

    // التحقق من الرصيد الكافي قبل الترحيل
    const balance = await accountsService.getBalance(input.source_account_id);
    const needed  = roundMoney(input.amount);
    if (balance < needed) {
      throw new Error(
        `رصيد الحساب غير كافٍ — المتاح: ${balance.toFixed(2)} ر.س، المطلوب: ${needed.toFixed(2)} ر.س`
      );
    }

    // الترحيل عبر محرك القيد المزدوج
    return postSimpleEntry({
      org_id:            input.org_id,
      entry_date:        input.entry_date,
      description:       input.description,
      reference_type:    'EXPENSE',
      reference_no:      input.reference,
      debit_account_id:  input.expense_account_id,  // مدين: المصروف
      credit_account_id: input.source_account_id,   // دائن: الصندوق/البنك
      amount:            input.amount,
    });
  },

  /** قائمة آخر المصروفات (manual/adjustment) مُصفَّاة بالمؤسسة */
  async listRecent(orgId: string, limit = 20): Promise<ExpenseRow[]> {
    if (!orgId?.trim()) throw new Error('[ExpensesService] org_id مطلوب');
    const { data, error } = await supabase
      .from('journal_entries')
      .select(`
        id, entry_number, entry_date, description, reference_no, created_at,
        journal_entry_lines (
          debit, credit,
          accounts ( code, name_ar, type )
        )
      `)
      .eq('org_id', orgId)
      .in('reference_type', ['MANUAL', 'ADJUSTMENT'])
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`expenses.listRecent: ${error.message}`);

    return (data ?? []).map((row: any) => {
      const debitLine  = row.journal_entry_lines.find((l: any) => Number(l.debit)  > 0);
      const creditLine = row.journal_entry_lines.find((l: any) => Number(l.credit) > 0);
      return {
        id: row.id,
        entry_number: row.entry_number,
        entry_date: row.entry_date,
        description: row.description,
        reference_no: row.reference_no ?? undefined,
        amount: Number(debitLine?.debit ?? creditLine?.credit ?? 0),
        expense_account: debitLine?.accounts?.name_ar ?? '—',
        source_account: creditLine?.accounts?.name_ar ?? '—',
        created_at: row.created_at,
      } as ExpenseRow;
    });
  },
};

// ═══════════════════════════════════════════════════════════
// ── RESET SERVICE (تصفير البيانات المحاسبية) ─────────────────
// ═══════════════════════════════════════════════════════════
export const resetService = {
  /**
   * ⚠️ خطير: يحذف كافة بيانات القيود والسجلات.
   *    لا يلمس جداول: accounts, organizations, products, invoices
   *    لكنه يصفّر: transactions, transaction_lines, ledger, journal_entries, journal_entry_lines
   */
  async resetLedgerData(): Promise<{
    journal_entries: number;
    journal_entry_lines: number;
    transactions: number;
    transaction_lines: number;
    ledger: number;
  }> {
    const results = {
      journal_entry_lines: 0,
      journal_entries: 0,
      transaction_lines: 0,
      transactions: 0,
      ledger: 0,
    };

    // أحذف البنود قبل الرؤوس
    const del1 = await supabase.from('journal_entry_lines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (del1.error) throw new Error(`reset.jel: ${del1.error.message}`);
    results.journal_entry_lines = del1.count ?? 0;

    const del2 = await supabase.from('journal_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (del2.error) throw new Error(`reset.je: ${del2.error.message}`);
    results.journal_entries = del2.count ?? 0;

    const del3 = await supabase.from('transaction_lines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (del3.error) throw new Error(`reset.txlines: ${del3.error.message}`);
    results.transaction_lines = del3.count ?? 0;

    const del4 = await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (del4.error) throw new Error(`reset.tx: ${del4.error.message}`);
    results.transactions = del4.count ?? 0;

    const del5 = await supabase.from('ledger').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (del5.error) throw new Error(`reset.ledger: ${del5.error.message}`);
    results.ledger = del5.count ?? 0;

    return results;
  },
};
