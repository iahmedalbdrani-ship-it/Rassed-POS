// ============================================================
// رصيد ERP — Double Entry Accounting Engine
// Core Rule: sum(debits) === sum(credits) — ALWAYS
// ============================================================

export type AccountType   = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type AccountNature = 'debit' | 'credit';
export type EntrySource   = 'manual' | 'invoice' | 'payment' | 'adjustment' | 'opening';

export interface JournalLine {
  accountId:   string;
  accountCode: string;
  description: string;
  debit:       number;  // always ≥ 0
  credit:      number;  // always ≥ 0
}

export interface JournalEntry {
  id?:         string;
  companyId:   string;
  entryDate:   string;         // YYYY-MM-DD
  description: string;
  reference?:  string;
  source:      EntrySource;
  lines:       JournalLine[];
}

export interface AccountBalance {
  accountId:   string;
  accountCode: string;
  name:        string;
  type:        AccountType;
  nature:      AccountNature;
  totalDebit:  number;
  totalCredit: number;
  balance:     number;         // positive = normal side
}

// ─── Validation ──────────────────────────────────────────────

export class AccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingError';
  }
}

export function validateEntry(entry: JournalEntry): void {
  if (!entry.lines || entry.lines.length < 2) {
    throw new AccountingError('القيد يجب أن يحتوي على سطرين على الأقل');
  }

  for (const line of entry.lines) {
    if (line.debit < 0 || line.credit < 0) {
      throw new AccountingError('لا يمكن أن تكون المبالغ سالبة');
    }
    if (line.debit > 0 && line.credit > 0) {
      throw new AccountingError(`السطر ${line.accountCode}: لا يمكن أن يكون مدين ودائن في نفس الوقت`);
    }
  }

  const totalDebit  = entry.lines.reduce((s, l) => s + l.debit,  0);
  const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new AccountingError(
      `القيد غير متوازن: المدين ${totalDebit.toFixed(2)} ≠ الدائن ${totalCredit.toFixed(2)}`
    );
  }

  if (totalDebit === 0) {
    throw new AccountingError('القيد فارغ: لا يمكن ترحيل قيد بمبالغ صفرية');
  }
}

// ─── Invoice → Journal Entry generator ───────────────────────

export interface InvoiceJournalParams {
  companyId:      string;
  invoiceId:      string;
  invoiceNumber:  string;
  invoiceDate:    string;
  customerName:   string;
  subtotal:       number;
  vatAmount:      number;
  total:          number;
  paymentMethod:  'cash' | 'credit';
  // Account IDs (resolved from company CoA)
  cashAccountId:        string;
  arAccountId:          string;  // Accounts Receivable
  revenueAccountId:     string;
  vatPayableAccountId:  string;
}

/** Generate the standard double-entry journal for an invoice. */
export function buildInvoiceJournal(params: InvoiceJournalParams): JournalEntry {
  const debitAccountId   = params.paymentMethod === 'cash' ? params.cashAccountId : params.arAccountId;
  const debitAccountCode = params.paymentMethod === 'cash' ? '111' : '113';
  const debitDescription = params.paymentMethod === 'cash'
    ? `نقدي — ${params.customerName}`
    : `ذمم مدينة — ${params.customerName}`;

  const lines: JournalLine[] = [
    {
      accountId:   debitAccountId,
      accountCode: debitAccountCode,
      description: debitDescription,
      debit:  round(params.total),
      credit: 0,
    },
    {
      accountId:   params.revenueAccountId,
      accountCode: '41',
      description: `إيرادات المبيعات — ${params.invoiceNumber}`,
      debit:  0,
      credit: round(params.subtotal),
    },
    {
      accountId:   params.vatPayableAccountId,
      accountCode: '212',
      description: `ضريبة القيمة المضافة 15% — ${params.invoiceNumber}`,
      debit:  0,
      credit: round(params.vatAmount),
    },
  ];

  validateEntry({ companyId: params.companyId, entryDate: params.invoiceDate, description: `فاتورة ${params.invoiceNumber}`, source: 'invoice', lines });

  return {
    companyId:   params.companyId,
    entryDate:   params.invoiceDate,
    description: `فاتورة مبيعات — ${params.customerName} — ${params.invoiceNumber}`,
    reference:   params.invoiceId,
    source:      'invoice',
    lines,
  };
}

// ─── Trial Balance ────────────────────────────────────────────

export function computeTrialBalance(balances: AccountBalance[]): {
  rows: AccountBalance[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
} {
  const totalDebit  = balances.reduce((s, b) => s + b.totalDebit,  0);
  const totalCredit = balances.reduce((s, b) => s + b.totalCredit, 0);
  return {
    rows: balances.sort((a, b) => a.accountCode.localeCompare(b.accountCode)),
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
  };
}

// ─── P&L extraction ──────────────────────────────────────────

export function computeProfitLoss(balances: AccountBalance[]): {
  totalRevenue:  number;
  totalExpense:  number;
  grossProfit:   number;
  netProfit:     number;
  vatPayable:    number;
} {
  const rev  = balances.filter(b => b.type === 'revenue').reduce((s, b) => s + b.balance, 0);
  const exp  = balances.filter(b => b.type === 'expense').reduce((s, b) => s + b.balance, 0);
  const vat  = balances.find(b => b.accountCode === '212')?.balance ?? 0;
  return {
    totalRevenue: rev,
    totalExpense: exp,
    grossProfit:  rev - exp,
    netProfit:    rev - exp,
    vatPayable:   vat,
  };
}

// ─── Helpers ─────────────────────────────────────────────────
const round = (n: number) => Math.round(n * 100) / 100;

export const VAT_RATE_SA = 0.15;

export function calculateVat(subtotal: number): { subtotal: number; vat: number; total: number } {
  const vat   = round(subtotal * VAT_RATE_SA);
  return { subtotal: round(subtotal), vat, total: round(subtotal + vat) };
}
