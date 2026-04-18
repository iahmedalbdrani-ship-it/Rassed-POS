// ============================================================
// Control Panel (رصيد) — Expenses Service
// إدارة المصروفات + القيود المحاسبية (قيد مزدوج آلي)
// ============================================================

import { supabase } from './supabase';

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
  /** جميع الحسابات القابلة للنشاط (غير رؤوس) */
  async listActive(): Promise<Account[]> {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, code, name_ar, name_en, type, nature, is_header, level')
      .eq('is_active', true)
      .order('code', { ascending: true });
    if (error) throw new Error(`accounts.listActive: ${error.message}`);
    return (data ?? []) as Account[];
  },

  /** حسابات المصروفات فقط (للقائمة المنسدلة) */
  async listExpenseAccounts(): Promise<Account[]> {
    const all = await this.listActive();
    return all.filter(a => a.type === 'EXPENSE' && !a.is_header);
  },

  /** حسابات الصندوق/البنك (كمصدر دفع) — كل الأصول المتداولة النقدية غير الرأسية */
  async listCashBankAccounts(): Promise<Account[]> {
    const all = await this.listActive();
    return all.filter(
      a =>
        !a.is_header &&
        a.type === 'ASSET' &&
        a.nature === 'DEBIT' &&
        (
          a.code.startsWith('111') ||   // نقدية وصناديق
          a.code.startsWith('112') ||   // حسابات بنكية
          a.code.startsWith('113')      // بنوك احتياطية
        )
    );
  },

  /** رصيد محدّث لحساب واحد عبر الـ VIEW: account_balances */
  async getBalance(accountId: string): Promise<number> {
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
    // تحققات أولية
    if (!input.description?.trim()) throw new Error('يرجى إدخال بيان المصروف');
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error('المبلغ يجب أن يكون رقماً موجباً');
    }
    if (!input.entry_date) throw new Error('يرجى إدخال تاريخ العملية');
    if (!input.source_account_id) throw new Error('يرجى اختيار حساب المصدر');
    if (!input.expense_account_id) throw new Error('يرجى اختيار حساب المصروف');
    if (input.source_account_id === input.expense_account_id) {
      throw new Error('لا يمكن أن يكون حساب المصدر وحساب المصروف متطابقين');
    }

    const amount = +Number(input.amount).toFixed(2);

    // 1) إنشاء رأس القيد
    const { data: entry, error: entryErr } = await supabase
      .from('journal_entries')
      .insert({
        entry_date: input.entry_date,
        description: input.description.trim(),
        reference_type: 'MANUAL',
        reference_no: input.reference ?? null,
        is_posted: true,
      })
      .select()
      .single();

    if (entryErr) throw new Error(`expenses.createEntry: ${entryErr.message}`);

    // 2) إنشاء بنود القيد (مدين/دائن)
    const lines = [
      {
        entry_id: entry.id,
        account_id: input.expense_account_id,
        description: input.description.trim(),
        debit: amount,
        credit: 0,
      },
      {
        entry_id: entry.id,
        account_id: input.source_account_id,
        description: input.description.trim(),
        debit: 0,
        credit: amount,
      },
    ];

    const { error: linesErr } = await supabase
      .from('journal_entry_lines')
      .insert(lines);

    if (linesErr) {
      // تراجع يدوي في حال فشل بنود القيد
      await supabase.from('journal_entries').delete().eq('id', entry.id);
      throw new Error(`expenses.createLines: ${linesErr.message}`);
    }

    return entry;
  },

  /** قائمة آخر المصروفات (manual/adjustment) */
  async listRecent(limit = 20): Promise<ExpenseRow[]> {
    const { data, error } = await supabase
      .from('journal_entries')
      .select(`
        id, entry_number, entry_date, description, reference_no, created_at,
        journal_entry_lines (
          debit, credit,
          accounts ( code, name_ar, type )
        )
      `)
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
