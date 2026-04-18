// ============================================================
// Control Panel (رصيد) — Supabase TypeScript Client
// Full CRUD + Realtime Subscriptions + Type-safe Operations
// ============================================================

import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// ─── Environment ────────────────────────────────────────────
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON as string;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON in .env');
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

// ─── Types ───────────────────────────────────────────────────
export type TransactionType     = 'DEBIT' | 'CREDIT';
export type InvoiceType         = 'STANDARD' | 'SIMPLIFIED' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
export type InvoiceStatus       = 'DRAFT' | 'PENDING' | 'CLEARED' | 'REPORTED' | 'REJECTED' | 'CANCELLED' | 'REFUNDED';
export type AccountType         = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type FiscalPeriodStatus  = 'OPEN' | 'CLOSED' | 'LOCKED';

export interface Organization {
  id: string;
  name_ar: string;
  name_en?: string;
  vat_number: string;
  cr_number?: string;
  address_city?: string;
  currency: string;
  zatca_env: 'sandbox' | 'production';
  pih: string;
  invoice_counter: number;
}

export interface Invoice {
  id: string;
  org_id: string;
  party_id?: string;
  invoice_type: InvoiceType;
  invoice_status: InvoiceStatus;
  invoice_number: string;
  invoice_counter_value?: number;
  uuid: string;
  issue_date: string;
  supply_date?: string;
  due_date?: string;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  invoice_hash?: string;
  previous_hash?: string;
  qr_code?: string;
  xml_content?: string;
  xml_storage_path?: string;
  pdf_storage_path?: string;
  notes?: string;
  created_at: string;
  parties?: { name_ar: string; vat_number?: string };
}

export interface InvoiceLine {
  id?: string;
  invoice_id?: string;
  line_number: number;
  item_name_ar: string;
  item_name_en?: string;
  item_code?: string;
  quantity: number;
  unit_price: number;
  discount_pct?: number;
  vat_rate?: number;
  vat_amount?: number;
  line_total?: number;
}

export interface Transaction {
  id: string;
  org_id: string;
  invoice_id?: string;
  entry_date: string;
  description: string;
  reference?: string;
  is_posted: boolean;
  posted_at?: string;
  transaction_lines?: TransactionLine[];
}

export interface TransactionLine {
  id?: string;
  transaction_id?: string;
  account_id: string;
  type: TransactionType;
  amount: number;
  description?: string;
}

export interface LedgerEntry {
  id: string;
  account_id: string;
  entry_date: string;
  debit: number;
  credit: number;
  balance: number;
  reference?: string;
  description?: string;
  accounts?: { code: string; name_ar: string };
}

export interface DashboardMetrics {
  net_revenue: number;
  total_vat:   number;
  total_ar:    number;     // Receivables
  cash_balance:number;
  draft_invoices: number;
  pending_invoices: number;
  this_month_revenue: number;
  last_month_revenue: number;
}

// ═══════════════════════════════════════════════════════════
// ── INVOICES SERVICE ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════
export const invoicesService = {

  /** List invoices with optional filters */
  async list(filters?: {
    status?: InvoiceStatus;
    from?: string;
    to?: string;
    party_id?: string;
    limit?: number;
    offset?: number;
  }) {
    let q = supabase
      .from('invoices')
      .select(`*, parties(name_ar, vat_number)`)
      .order('issue_date', { ascending: false });

    if (filters?.status)   q = q.eq('invoice_status', filters.status);
    if (filters?.party_id) q = q.eq('party_id', filters.party_id);
    if (filters?.from)     q = q.gte('issue_date', filters.from);
    if (filters?.to)       q = q.lte('issue_date', filters.to);
    if (filters?.limit)    q = q.range(filters.offset ?? 0, (filters.offset ?? 0) + filters.limit - 1);

    const { data, error } = await q;
    if (error) throw new Error(`invoices.list: ${error.message}`);
    return data as Invoice[];
  },

  /** Get single invoice with lines */
  async getById(id: string) {
    const { data, error } = await supabase
      .from('invoices')
      .select(`*, invoice_lines(*), parties(*)`)
      .eq('id', id)
      .single();
    if (error) throw new Error(`invoices.getById: ${error.message}`);
    return data;
  },

  /** Create invoice + lines in one transaction */
  async create(invoice: Omit<Invoice, 'id' | 'created_at' | 'taxable_amount'>, lines: InvoiceLine[]) {
    // Step 1: compute totals server-side style
    const subtotal = lines.reduce((s, l) => {
      const base = l.quantity * l.unit_price;
      return s + base * (1 - (l.discount_pct ?? 0) / 100);
    }, 0);
    const vat_amount    = +(subtotal * (invoice.vat_rate / 100)).toFixed(2);
    const total_amount  = +(subtotal + vat_amount).toFixed(2);

    const { data: inv, error: invErr } = await supabase
      .from('invoices')
      .insert({ ...invoice, subtotal, vat_amount, total_amount })
      .select()
      .single();
    if (invErr) throw new Error(`invoices.create: ${invErr.message}`);

    // Step 2: insert lines
    const linesPayload = lines.map((l, i) => ({
      ...l,
      line_number: i + 1,
      invoice_id: inv.id,
      vat_amount: +(l.quantity * l.unit_price * (1 - (l.discount_pct ?? 0) / 100) * (inv.vat_rate / 100)).toFixed(4),
    }));
    const { error: lineErr } = await supabase.from('invoice_lines').insert(linesPayload);
    if (lineErr) throw new Error(`invoice_lines.insert: ${lineErr.message}`);

    return inv as Invoice;
  },

  /** Update invoice status (triggers double-entry) */
  async updateStatus(id: string, status: InvoiceStatus) {
    const { data, error } = await supabase
      .from('invoices')
      .update({ invoice_status: status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`invoices.updateStatus: ${error.message}`);
    return data as Invoice;
  },

  /** Attach ZATCA fields after signing */
  async attachZatcaData(id: string, payload: {
    invoice_hash: string;
    previous_hash: string;
    qr_code: string;
    digital_signature: string;
    xml_content: string;
    xml_storage_path: string;
    zatca_clearance_uuid?: string;
    zatca_response?: object;
    invoice_status: InvoiceStatus;
  }) {
    const { data, error } = await supabase
      .from('invoices')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`invoices.attachZatcaData: ${error.message}`);
    return data as Invoice;
  },

  /**
   * Full-text-ish search on the invoice number + optional date range.
   * Designed for the POS Invoices Dashboard.
   */
  async search(params: {
    query?: string;      // matches invoice_number (ilike)
    from?:  string;      // ISO date (YYYY-MM-DD)
    to?:    string;      // ISO date (YYYY-MM-DD)
    status?: InvoiceStatus;
    limit?: number;
    offset?: number;
  }) {
    const limit  = params.limit ?? 100;
    const offset = params.offset ?? 0;

    let q = supabase
      .from('invoices')
      .select(`id, invoice_number, issue_date, invoice_status, invoice_type,
               subtotal, discount_amount, vat_amount, total_amount,
               qr_code, notes, created_at, payment_means`)
      .order('issue_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (params.query && params.query.trim()) {
      q = q.ilike('invoice_number', `%${params.query.trim()}%`);
    }
    if (params.from)   q = q.gte('issue_date', params.from);
    if (params.to)     q = q.lte('issue_date', params.to);
    if (params.status) q = q.eq('invoice_status', params.status);

    const { data, error } = await q.range(offset, offset + limit - 1);
    if (error) throw new Error(`invoices.search: ${error.message}`);
    return (data ?? []) as unknown as Invoice[];
  },

  /**
   * Subscribe to Realtime changes on the invoices table.
   * Fires on INSERT / UPDATE / DELETE. Returns the channel so callers
   * can .unsubscribe() on cleanup.
   */
  subscribeChanges(onChange: (payload: {
    event: 'INSERT' | 'UPDATE' | 'DELETE';
    row:   Invoice | null;
  }) => void): RealtimeChannel {
    const channel = supabase
      .channel('invoices-feed')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'invoices' },
        (payload) => {
          const evt = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          const row = (payload.new ?? payload.old ?? null) as Invoice | null;
          onChange({ event: evt, row });
        })
      .subscribe();
    return channel;
  },

  /**
   * Flag an invoice as REFUNDED (سند مرتجع).
   * Intentionally does NOT delete the original record — preserves audit trail.
   * Returns the updated invoice.
   */
  async markRefunded(id: string, reason?: string) {
    const { data, error } = await supabase
      .from('invoices')
      .update({
        invoice_status: 'REFUNDED' as InvoiceStatus,
        notes: reason ? `[مرتجع] ${reason}` : undefined,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`invoices.markRefunded: ${error.message}`);
    return data as Invoice;
  },
};

// ═══════════════════════════════════════════════════════════
// ── TRANSACTIONS SERVICE ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════
export const transactionsService = {

  async list(limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('transactions')
      .select(`*, transaction_lines(*, accounts(code, name_ar))`)
      .order('entry_date', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`transactions.list: ${error.message}`);
    return data as Transaction[];
  },

  /** Create a manual journal entry with balanced lines */
  async createManualEntry(entry: {
    description: string;
    entry_date: string;
    reference?: string;
    lines: TransactionLine[];
  }) {
    // Validate balance
    const totalDebit  = entry.lines.filter(l => l.type === 'DEBIT').reduce((s, l)  => s + l.amount, 0);
    const totalCredit = entry.lines.filter(l => l.type === 'CREDIT').reduce((s, l) => s + l.amount, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Unbalanced entry: Debit=${totalDebit}, Credit=${totalCredit}`);
    }

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({ description: entry.description, entry_date: entry.entry_date, reference: entry.reference })
      .select()
      .single();
    if (txErr) throw new Error(`transactions.create: ${txErr.message}`);

    const linesPayload = entry.lines.map(l => ({ ...l, transaction_id: tx.id }));
    const { error: lineErr } = await supabase.from('transaction_lines').insert(linesPayload);
    if (lineErr) throw new Error(`transaction_lines.insert: ${lineErr.message}`);

    return tx as Transaction;
  },

  /** Post a transaction (marks is_posted = true; triggers balance check) */
  async post(id: string) {
    const { data, error } = await supabase
      .from('transactions')
      .update({ is_posted: true, posted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`transactions.post: ${error.message}`);
    return data as Transaction;
  },
};

// ═══════════════════════════════════════════════════════════
// ── LEDGER / REPORTS SERVICE ─────────────────────────────────
// ═══════════════════════════════════════════════════════════
export const reportsService = {

  /** Trial Balance */
  async getTrialBalance(from: string, to: string) {
    const { data, error } = await supabase.rpc('get_trial_balance', { p_from: from, p_to: to });
    if (error) throw new Error(`reports.trialBalance: ${error.message}`);
    return data as Array<{ account_code: string; account_name: string; debit: number; credit: number }>;
  },

  /** Profit & Loss */
  async getProfitLoss(from: string, to: string) {
    const { data, error } = await supabase.rpc('get_profit_loss', { p_from: from, p_to: to });
    if (error) throw new Error(`reports.profitLoss: ${error.message}`);
    return data;
  },

  /** Dashboard real-time metrics */
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const now     = new Date();
    const thisMonth  = now.toISOString().slice(0, 7);          // YYYY-MM

    const [arRes, , revRes, cashRes] = await Promise.all([
      // Accounts Receivable
      supabase.from('ledger')
        .select('debit, credit')
        .eq('account_id', (await supabase.from('accounts').select('id').eq('code', '1200').single()).data?.id),

      // VAT Payable
      supabase.from('ledger')
        .select('credit')
        .eq('account_id', (await supabase.from('accounts').select('id').eq('code', '2300').single()).data?.id),

      // Revenue this month
      supabase.from('invoices')
        .select('taxable_amount, vat_amount, total_amount')
        .in('invoice_status', ['CLEARED', 'REPORTED'])
        .like('issue_date', `${thisMonth}%`),

      // Cash
      supabase.from('ledger')
        .select('debit, credit')
        .eq('account_id', (await supabase.from('accounts').select('id').eq('code', '1100').single()).data?.id),
    ]);

    const net_revenue  = (revRes.data ?? []).reduce((s: number, r: any) => s + +r.taxable_amount, 0);
    const total_vat    = (revRes.data ?? []).reduce((s: number, r: any) => s + +r.vat_amount, 0);
    const total_ar     = (arRes.data  ?? []).reduce((s: number, r: any) => s + +r.debit - +r.credit, 0);
    const cash_balance = (cashRes.data ?? []).reduce((s: number, r: any) => s + +r.debit - +r.credit, 0);

    const draftCount   = await supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('invoice_status', 'DRAFT');
    const pendingCount = await supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('invoice_status', 'PENDING');

    return {
      net_revenue,
      total_vat,
      total_ar,
      cash_balance,
      draft_invoices:   draftCount.count ?? 0,
      pending_invoices: pendingCount.count ?? 0,
      this_month_revenue: net_revenue,
      last_month_revenue: 0,
    };
  },

  /** General Ledger for one account */
  async getAccountLedger(accountId: string, from: string, to: string): Promise<LedgerEntry[]> {
    const { data, error } = await supabase
      .from('ledger')
      .select(`*, accounts(code, name_ar)`)
      .eq('account_id', accountId)
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date', { ascending: true });
    if (error) throw new Error(`ledger.getAccount: ${error.message}`);
    return data as LedgerEntry[];
  },
};

// ═══════════════════════════════════════════════════════════
// ── FISCAL PERIODS SERVICE ───────────────────────────────────
// ═══════════════════════════════════════════════════════════
export const fiscalPeriodsService = {

  async list() {
    const { data, error } = await supabase
      .from('fiscal_periods')
      .select('*')
      .order('start_date', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async closePeriod(id: string) {
    const { data, error } = await supabase
      .from('fiscal_periods')
      .update({ status: 'CLOSED', closed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`fiscalPeriods.close: ${error.message}`);
    return data;
  },

  async lockPeriod(id: string) {
    const { data, error } = await supabase
      .from('fiscal_periods')
      .update({ status: 'LOCKED' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`fiscalPeriods.lock: ${error.message}`);
    return data;
  },
};

// ═══════════════════════════════════════════════════════════
// ── REALTIME SUBSCRIPTIONS ───────────────────────────────────
// ═══════════════════════════════════════════════════════════
export function subscribeToInvoices(
  orgId: string,
  callback: (payload: { eventType: string; new: Invoice; old: Invoice }) => void
): RealtimeChannel {
  return (supabase
    .channel(`invoices:org:${orgId}`) as any)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'invoices',
      filter: `org_id=eq.${orgId}`,
    }, callback)
    .subscribe();
}

export function subscribeToLowStock(
  orgId: string,
  callback: (payload: any) => void
): RealtimeChannel {
  return (supabase
    .channel(`products:low_stock:${orgId}`) as any)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'products',
      filter: `org_id=eq.${orgId}`,
    }, (payload: any) => {
      if (payload.new.stock_qty <= payload.new.min_stock_qty) {
        callback(payload);
      }
    })
    .subscribe();
}

// ═══════════════════════════════════════════════════════════
// ── AUDIT LOGS ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════
export const auditService = {
  async log(action: string, tableName: string, recordId: string, oldData?: object, newData?: object) {
    const { error } = await supabase.from('audit_logs').insert({
      action,
      table_name: tableName,
      record_id: recordId,
      old_data: oldData ?? null,
      new_data: newData ?? null,
    });
    if (error) console.error('[Audit]', error.message);
  },

  async list(limit = 100, offset = 0) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*, user_profiles(full_name)')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return data;
  },
};

// ─── Named export shorthand ──────────────────────────────────
export default supabase;
