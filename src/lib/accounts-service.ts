// ============================================================
// Control Panel (رصيد) — Accounts Service
//
// CRUD كامل لجدول الحسابات (Chart of Accounts) مع:
//   • جلب الشجرة الكاملة مع الأرصدة الحية (account_balances VIEW)
//   • جلب حركات حساب محدد (get_account_movements RPC)
//   • توليد كود الحساب الفرعي التالي (generate_child_account_code RPC)
//   • مقاييس لوحة التحكم (get_dashboard_metrics RPC)
//   • اشتراك Realtime على تغييرات transactions
// ============================================================

import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { AccountType } from './supabase';

// ─── Types ───────────────────────────────────────────────────

export interface Account {
  id:           string;
  code:         string;
  name_ar:      string;
  name_en?:     string;
  account_type: AccountType;
  parent_id?:   string | null;
  level:        number;       // 1=رئيسي, 2=فرعي, 3=تفصيلي
  is_active:    boolean;
  allow_entries:boolean;      // هل يقبل قيوداً مباشرة؟
  notes?:       string;
  created_at:   string;
  // Joined fields from account_balances VIEW
  total_debit?:  number;
  total_credit?: number;
  balance?:      number;
  // Derived client-side
  children?:     Account[];
  isExpanded?:   boolean;
}

export interface AccountMovement {
  transaction_id: string;
  entry_date:     string;
  description:    string;
  reference?:     string;
  debit:          number;
  credit:         number;
  running_balance:number;
}

export interface DashboardKPIs {
  total_assets:      number;
  total_liabilities: number;
  total_equity:      number;
  total_revenue:     number;
  total_expenses:    number;
  net_profit:        number;
  cash_balance:      number;
  vat_payable:       number;
  this_month_revenue:number;
  last_month_revenue:number;
  revenue_growth_pct:number;
}

// ─── Helpers ─────────────────────────────────────────────────

/** Arabic label per account type */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET:     'أصول',
  LIABILITY: 'خصوم',
  EQUITY:    'حقوق ملكية',
  REVENUE:   'إيرادات',
  EXPENSE:   'مصروفات',
};

/** Colour per account type (Tailwind classes) */
export const ACCOUNT_TYPE_COLORS: Record<AccountType, { bg: string; text: string; border: string }> = {
  ASSET:     { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200'   },
  LIABILITY: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200'   },
  EQUITY:    { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  REVENUE:   { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200'},
  EXPENSE:   { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200'  },
};

/** Format SAR amounts */
export function fmtSAR(amount: number): string {
  return new Intl.NumberFormat('ar-SA', {
    style:                'currency',
    currency:             'SAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Build a nested tree from flat list (sorted by code) */
export function buildAccountTree(flatList: Account[]): Account[] {
  const map = new Map<string, Account>();

  // Clone & attach children array
  flatList.forEach(a => map.set(a.id, { ...a, children: [] }));

  const roots: Account[] = [];
  map.forEach(account => {
    if (account.parent_id && map.has(account.parent_id)) {
      map.get(account.parent_id)!.children!.push(account);
    } else {
      roots.push(account);
    }
  });

  // Sort each level by code
  const sortByCode = (list: Account[]) =>
    list.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));

  const sortTree = (nodes: Account[]): Account[] =>
    sortByCode(nodes).map(n => ({ ...n, children: sortTree(n.children ?? []) }));

  return sortTree(roots);
}

// ─── Service ─────────────────────────────────────────────────

// ─── Guard ────────────────────────────────────────────────────
function assertOrgId(orgId: string | undefined | null): asserts orgId is string {
  if (!orgId?.trim()) throw new Error('[AccountsService] org_id مطلوب — لم يتم تحميل بيانات المؤسسة بعد');
}

export const accountsService = {

  // ══════════════════════════════════════════════════════════
  // READ
  // ══════════════════════════════════════════════════════════

  /** جلب جميع حسابات المؤسسة مع الأرصدة الحية */
  async getAll(orgId: string): Promise<Account[]> {
    assertOrgId(orgId);

    // 1. جلب بنية الحسابات مُصفَّاة بالمؤسسة
    const { data: accs, error: accErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('code');
    if (accErr) throw new Error(`accounts.getAll: ${accErr.message}`);

    // 2. جلب الأرصدة للحسابات المُحدَّدة فقط
    const accountIds = (accs ?? []).map((a: any) => a.id);
    const { data: balances } = accountIds.length
      ? await supabase
          .from('account_balances')
          .select('account_id, total_debit, total_credit, balance')
          .in('account_id', accountIds)
      : { data: [] };

    const balMap = new Map<string, { total_debit: number; total_credit: number; balance: number }>();
    (balances ?? []).forEach((b: any) => balMap.set(b.account_id, {
      total_debit:  +b.total_debit  || 0,
      total_credit: +b.total_credit || 0,
      balance:      +b.balance      || 0,
    }));

    return (accs ?? []).map((a: any): Account => ({
      ...a,
      total_debit:  balMap.get(a.id)?.total_debit  ?? 0,
      total_credit: balMap.get(a.id)?.total_credit ?? 0,
      balance:      balMap.get(a.id)?.balance      ?? 0,
    }));
  },

  /** جلب حساب واحد — org_id مُحقَّق مزدوج */
  async getById(id: string, orgId: string): Promise<Account> {
    assertOrgId(orgId);
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();
    if (error) throw new Error(`accounts.getById: ${error.message}`);
    return data as Account;
  },

  /** حركات حساب محدد خلال فترة (تستدعي get_account_movements RPC) */
  async getMovements(
    accountId: string,
    orgId: string,
    from: string,
    to: string,
    limit = 200,
  ): Promise<AccountMovement[]> {
    assertOrgId(orgId);
    const { data, error } = await supabase.rpc('get_account_movements', {
      p_account_id: accountId,
      p_from:       from,
      p_to:         to,
      p_limit:      limit,
    });
    if (error) throw new Error(`accounts.getMovements: ${error.message}`);
    return (data ?? []) as AccountMovement[];
  },

  // ══════════════════════════════════════════════════════════
  // CREATE / UPDATE / DELETE
  // ══════════════════════════════════════════════════════════

  /** إنشاء حساب جديد — org_id مُلزَم */
  async create(orgId: string, payload: {
    code:          string;
    name_ar:       string;
    name_en?:      string;
    account_type:  AccountType;
    parent_id?:    string | null;
    level?:        number;
    allow_entries?:boolean;
    notes?:        string;
  }): Promise<Account> {
    assertOrgId(orgId);
    const { data, error } = await supabase
      .from('accounts')
      .insert({
        ...payload,
        org_id:        orgId,
        level:         payload.level         ?? 1,
        allow_entries: payload.allow_entries ?? true,
        is_active:     true,
      })
      .select()
      .single();
    if (error) throw new Error(`accounts.create: ${error.message}`);
    return data as Account;
  },

  /** إنشاء حساب فرعي (يُولّد الكود تلقائياً عبر RPC) */
  async createChild(orgId: string, payload: {
    parent_id:    string;
    name_ar:      string;
    name_en?:     string;
    account_type: AccountType;
    allow_entries?:boolean;
    notes?:        string;
  }): Promise<Account> {
    assertOrgId(orgId);

    // 1. جلب الحساب الأب لنعرف كوده ومستواه
    const parent = await accountsService.getById(payload.parent_id, orgId);

    // 2. توليد الكود التالي عبر RPC
    const nextCode = await accountsService.generateChildCode(parent.code);

    // 3. إنشاء الحساب
    return accountsService.create(orgId, {
      code:          nextCode,
      name_ar:       payload.name_ar,
      name_en:       payload.name_en,
      account_type:  payload.account_type,
      parent_id:     payload.parent_id,
      level:         parent.level + 1,
      allow_entries: payload.allow_entries ?? true,
      notes:         payload.notes,
    });
  },

  /** تحديث حساب — org_id مُحقَّق مزدوج */
  async update(id: string, orgId: string, changes: Partial<Omit<Account, 'id' | 'created_at'>>): Promise<Account> {
    assertOrgId(orgId);
    const { data, error } = await supabase
      .from('accounts')
      .update(changes)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();
    if (error) throw new Error(`accounts.update: ${error.message}`);
    return data as Account;
  },

  /** حذف ناعم: is_active = false — org_id مُحقَّق مزدوج */
  async deactivate(id: string, orgId: string): Promise<void> {
    assertOrgId(orgId);
    const { error } = await supabase
      .from('accounts')
      .update({ is_active: false })
      .eq('id', id)
      .eq('org_id', orgId);
    if (error) throw new Error(`accounts.deactivate: ${error.message}`);
  },

  // ══════════════════════════════════════════════════════════
  // RPCs
  // ══════════════════════════════════════════════════════════

  /** توليد الكود الفرعي التالي (generate_child_account_code RPC) */
  async generateChildCode(parentCode: string): Promise<string> {
    const { data, error } = await supabase.rpc('generate_child_account_code', {
      p_parent_code: parentCode,
    });
    if (error) throw new Error(`accounts.generateChildCode: ${error.message}`);
    return data as string;
  },

  /** مقاييس لوحة التحكم (get_dashboard_metrics RPC) */
  async getDashboardKPIs(orgId?: string): Promise<DashboardKPIs> {
    const { data, error } = await supabase.rpc('get_dashboard_metrics');
    if (error) throw new Error(`accounts.getDashboardKPIs: ${error.message}`);
    const d = (data ?? {}) as any;
    return {
      total_assets:       +d.total_assets       || 0,
      total_liabilities:  +d.total_liabilities  || 0,
      total_equity:       +d.total_equity        || 0,
      total_revenue:      +d.total_revenue       || 0,
      total_expenses:     +d.total_expenses      || 0,
      net_profit:         +d.net_profit          || 0,
      cash_balance:       +d.cash_balance        || 0,
      vat_payable:        +d.vat_payable         || 0,
      this_month_revenue: +d.this_month_revenue  || 0,
      last_month_revenue: +d.last_month_revenue  || 0,
      revenue_growth_pct: +d.revenue_growth_pct  || 0,
    };
  },

  // ══════════════════════════════════════════════════════════
  // REALTIME
  // ══════════════════════════════════════════════════════════

  /**
   * اشتراك Realtime على جدول transactions — مُصفَّى بالمؤسسة.
   * يستدعي onChange في كل INSERT/UPDATE → الـ UI يُعيد جلب المقاييس.
   */
  subscribeToTransactions(orgId: string, onChange: () => void): RealtimeChannel {
    return supabase
      .channel(`transactions-${orgId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'transactions',
        filter: `org_id=eq.${orgId}`,
      }, onChange)
      .subscribe();
  },

  /** اشتراك على تغييرات الحسابات — مُصفَّى بالمؤسسة */
  subscribeToAccounts(orgId: string, onChange: () => void): RealtimeChannel {
    return supabase
      .channel(`accounts-${orgId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'accounts',
        filter: `org_id=eq.${orgId}`,
      }, onChange)
      .subscribe();
  },
};

export default accountsService;
