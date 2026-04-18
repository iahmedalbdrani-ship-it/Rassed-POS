// ============================================================
// Control Panel (رصيد) — Shared TypeScript Types
// ============================================================

// ─── Enums ───────────────────────────────────────────────────
export type TransactionType    = 'income' | 'expense';
export type InvoiceType        = 'STANDARD' | 'SIMPLIFIED' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
export type InvoiceStatus      = 'DRAFT' | 'PENDING' | 'CLEARED' | 'REPORTED' | 'REJECTED' | 'CANCELLED';
export type AccountType        = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type FiscalPeriodStatus = 'OPEN' | 'CLOSED' | 'LOCKED';
export type ZatcaEnv           = 'sandbox' | 'production';
export type PaymentMethod      = 'cash' | 'card' | 'credit';
export type TabId              = 'dashboard' | 'pos' | 'transactions' | 'ledger' | 'audit';

// ─── Core entities ───────────────────────────────────────────
export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  created_at: string;
  updated_at?: string;
  org_id?: string;
  reference?: string;
}

export interface Invoice {
  id: string;
  org_id: string;
  party_id?: string;
  invoice_type: InvoiceType;
  invoice_status: InvoiceStatus;
  invoice_number: string;
  uuid: string;
  issue_date: string;
  supply_date?: string;
  due_date?: string;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  vat_amount: number;
  total_amount: number;
  notes?: string;
  created_at: string;
}

export interface Product {
  id: string;
  barcode: string;
  name: string;
  name_en: string;
  category: string;
  price: number;
  stock: number;
  unit: string;
  icon: string;
  vat_exempt?: boolean;
  cost?: number;
}

export interface CartItem extends Product {
  qty: number;
  discount: number; // percentage 0–100
}

export interface Supplier {
  id: string;
  name: string;
  vat_number?: string;
  phone?: string;
  email?: string;
  total_purchases: number;
  total_paid: number;
  balance: number;
  created_at: string;
}

export interface LedgerAccount {
  code: string;
  name: string;
  balance: number;
  type: AccountType | string;
  color?: string;
}

// ─── UI helpers ──────────────────────────────────────────────
export interface StatusMeta {
  label: string;
  dot:   string; // bg color
  text:  string; // text color
}

export interface NavTab {
  id:    TabId;
  label: string;
  icon:  string;
}

// ─── POS sale result ─────────────────────────────────────────
export interface SaleResult {
  invoice_number: string;
  items: CartItem[];
  subtotal: number;
  vat: number;
  grand_total: number;
  payment_method: PaymentMethod;
  timestamp: string;
}
