 // ============================================================
// Control Panel (رصيد) — Chart of Accounts (شجرة الحسابات)
// Design: White Glassmorphism | Connected to Supabase
//
// Features:
//   • شجرة حسابات قابلة للطي مع الأرصدة الحية
//   • لوحة تفاصيل جانبية: حركات الحساب مع running balance
//   • إضافة حساب فرعي مع توليد الكود تلقائياً
//   • معادلة الميزانية في أعلى الصفحة (Assets = Liabilities + Equity)
//   • Realtime: يُحدّث عند كل عملية محاسبية
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronDown, Plus, RefreshCw,
  BookOpen, TrendingUp, TrendingDown, Scale, X,
  Loader2, AlertCircle,
  Building2, BarChart3, CreditCard, Search,
  Check, Activity,
} from 'lucide-react';
import accountsService, {
  buildAccountTree,
  fmtSAR,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_COLORS,
  type Account,
  type AccountMovement,
  type DashboardKPIs,
} from '../lib/accounts-service';
import type { AccountType } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useTenant } from '../contexts/TenantContext';

// ─── Constants ───────────────────────────────────────────────

const TYPE_ICON: Record<AccountType, React.ReactNode> = {
  ASSET:     <Building2  className="w-4 h-4" />,
  LIABILITY: <CreditCard className="w-4 h-4" />,
  EQUITY:    <Scale      className="w-4 h-4" />,
  REVENUE:   <TrendingUp className="w-4 h-4" />,
  EXPENSE:   <TrendingDown className="w-4 h-4" />,
};

// ─── Sub-components ──────────────────────────────────────────

/** Single account row in the tree */
function AccountRow({
  account,
  depth,
  isSelected,
  onSelect,
  onToggle,
  expanded,
}: {
  account:    Account;
  depth:      number;
  isSelected: boolean;
  onSelect:   (a: Account) => void;
  onToggle:   (id: string) => void;
  expanded:   boolean;
}) {
  const hasChildren = (account.children?.length ?? 0) > 0;
  const colors      = ACCOUNT_TYPE_COLORS[account.account_type];
  const isPos       = (account.balance ?? 0) >= 0;

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-2.5 rounded-2xl cursor-pointer transition-all duration-150
        ${isSelected
          ? 'bg-blue-500/15 border border-blue-300/50 shadow-sm'
          : 'hover:bg-white/60 border border-transparent'}
      `}
      style={{ paddingRight: `${(depth * 20) + 12}px` }}
      onClick={() => onSelect(account)}
    >
      {/* Expand toggle */}
      <button
        className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-lg transition-all
          ${hasChildren ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-100' : 'invisible'}`}
        onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(account.id); }}
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5" />
          : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* Type badge */}
      {depth === 0 && (
        <span className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${colors.bg} ${colors.text} border ${colors.border}`}>
          {TYPE_ICON[account.account_type]}
        </span>
      )}
      {depth > 0 && (
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0 mr-1" />
      )}

      {/* Name & code */}
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-2 ${depth === 0 ? 'font-semibold text-slate-800' : depth === 1 ? 'font-medium text-slate-700' : 'text-slate-600'} text-sm`}>
          <span className="truncate">{account.name_ar}</span>
          {!account.allow_entries && (
            <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-md">رئيسي</span>
          )}
        </div>
        <div className="text-xs text-slate-400 font-mono">{account.code}</div>
      </div>

      {/* Balance */}
      <div className={`text-sm font-medium tabular-nums ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
        {fmtSAR(account.balance ?? 0)}
      </div>
    </div>
  );
}

/** Recursive tree renderer */
function AccountTree({
  nodes,
  depth,
  expandedIds,
  selectedId,
  onSelect,
  onToggle,
}: {
  nodes:       Account[];
  depth:       number;
  expandedIds: Set<string>;
  selectedId:  string | null;
  onSelect:    (a: Account) => void;
  onToggle:    (id: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map(account => (
        <React.Fragment key={account.id}>
          <AccountRow
            account={account}
            depth={depth}
            isSelected={selectedId === account.id}
            onSelect={onSelect}
            onToggle={onToggle}
            expanded={expandedIds.has(account.id)}
          />
          {expandedIds.has(account.id) && (account.children?.length ?? 0) > 0 && (
            <div className="mr-3 border-r-2 border-slate-100">
              <AccountTree
                nodes={account.children!}
                depth={depth + 1}
                expandedIds={expandedIds}
                selectedId={selectedId}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/** Balance equation bar */
function BalanceEquation({ kpis }: { kpis: DashboardKPIs | null }) {
  if (!kpis) return null;
  const balanced = Math.abs(kpis.total_assets - (kpis.total_liabilities + kpis.total_equity)) < 1;

  return (
    <div className="flex items-center gap-3 bg-white/60 backdrop-blur-xl border border-white/50 rounded-2xl px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">إجمالي الأصول</span>
        <span className="text-sm font-bold text-blue-700">{fmtSAR(kpis.total_assets)}</span>
      </div>
      <span className="text-slate-300 text-lg">=</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">الخصوم</span>
        <span className="text-sm font-bold text-rose-600">{fmtSAR(kpis.total_liabilities)}</span>
      </div>
      <span className="text-slate-300">+</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">حقوق الملكية</span>
        <span className="text-sm font-bold text-purple-700">{fmtSAR(kpis.total_equity)}</span>
      </div>
      <div className={`mr-auto flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium
        ${balanced ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
        {balanced ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
        {balanced ? 'متوازنة' : 'غير متوازنة'}
      </div>
    </div>
  );
}

/** Account movements table in the side panel */
function MovementsTable({ movements, loading }: { movements: AccountMovement[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      </div>
    );
  }
  if (!movements.length) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
        لا توجد حركات في هذه الفترة
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-right pb-2 text-slate-400 font-medium">التاريخ</th>
            <th className="text-right pb-2 text-slate-400 font-medium">البيان</th>
            <th className="text-left pb-2 text-slate-400 font-medium">مدين</th>
            <th className="text-left pb-2 text-slate-400 font-medium">دائن</th>
            <th className="text-left pb-2 text-slate-400 font-medium">الرصيد</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {movements.map((m, i) => (
            <tr key={`${m.transaction_id}-${i}`} className="hover:bg-slate-50/50">
              <td className="py-2 text-slate-500 whitespace-nowrap font-mono">
                {new Date(m.entry_date).toLocaleDateString('ar-SA')}
              </td>
              <td className="py-2 text-slate-700 max-w-[140px] truncate pr-2">{m.description}</td>
              <td className="py-2 text-emerald-600 font-medium tabular-nums text-left">
                {m.debit > 0 ? fmtSAR(m.debit) : '—'}
              </td>
              <td className="py-2 text-rose-500 font-medium tabular-nums text-left">
                {m.credit > 0 ? fmtSAR(m.credit) : '—'}
              </td>
              <td className={`py-2 font-bold tabular-nums text-left ${m.running_balance >= 0 ? 'text-slate-700' : 'text-rose-600'}`}>
                {fmtSAR(m.running_balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Add child account modal */
function AddAccountModal({
  parentAccount,
  onClose,
  onCreated,
}: {
  parentAccount: Account;
  onClose:       () => void;
  onCreated:     () => void;
}) {
  const { orgId } = useTenant();
  const [nameAr,  setNameAr]  = useState('');
  const [nameEn,  setNameEn]  = useState('');
  const [notes,   setNotes]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [previewCode, setPreviewCode] = useState<string>('...');

  // Load preview code on mount
  useEffect(() => {
    accountsService.generateChildCode(parentAccount.code)
      .then(c => setPreviewCode(c))
      .catch(() => setPreviewCode('—'));
  }, [parentAccount.code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim()) { setError('اسم الحساب مطلوب'); return; }
    setSaving(true);
    setError(null);
    try {
      await accountsService.createChild(orgId, {
        parent_id:    parentAccount.id,
        name_ar:      nameAr.trim(),
        name_en:      nameEn.trim() || undefined,
        account_type: parentAccount.account_type,
        allow_entries: true,
        notes:        notes.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إنشاء الحساب');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ direction: 'rtl' }}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white/90 backdrop-blur-2xl border border-white/60 rounded-[2rem] shadow-2xl w-full max-w-md p-6 animate-in slide-in-from-bottom-4 duration-200">

        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-slate-800">إضافة حساب فرعي</h3>
            <p className="text-sm text-slate-400">تحت: <span className="font-medium text-slate-600">{parentAccount.name_ar}</span></p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Preview code */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
          <span className="text-xs text-blue-500">كود الحساب</span>
          <span className="font-mono font-bold text-blue-700 text-lg">{previewCode}</span>
          <span className={`mr-auto text-xs px-2 py-0.5 rounded-full border ${ACCOUNT_TYPE_COLORS[parentAccount.account_type].bg} ${ACCOUNT_TYPE_COLORS[parentAccount.account_type].text} ${ACCOUNT_TYPE_COLORS[parentAccount.account_type].border}`}>
            {ACCOUNT_TYPE_LABELS[parentAccount.account_type]}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">اسم الحساب (عربي) *</label>
            <input
              type="text"
              value={nameAr}
              onChange={e => setNameAr(e.target.value)}
              placeholder="مثال: النقدية في الصندوق"
              className="w-full bg-white/70 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-300 transition-all"
              dir="rtl"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">اسم الحساب (إنجليزي)</label>
            <input
              type="text"
              value={nameEn}
              onChange={e => setNameEn(e.target.value)}
              placeholder="e.g. Cash in Safe"
              className="w-full bg-white/70 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-300 transition-all"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">ملاحظات</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-white/70 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-300 transition-all resize-none"
              dir="rtl"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-2.5 text-sm text-rose-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-l from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-500/20"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'جارٍ الحفظ...' : 'إنشاء الحساب'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export function ChartOfAccounts() {
  const { orgId } = useTenant();

  // ── Data state ────────────────────────────────────────────
  const [accounts,      setAccounts]      = useState<Account[]>([]);
  const [tree,          setTree]          = useState<Account[]>([]);
  const [kpis,          setKpis]          = useState<DashboardKPIs | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);

  // ── UI state ──────────────────────────────────────────────
  const [expandedIds,   setExpandedIds]   = useState<Set<string>>(new Set());
  const [selectedAcct,  setSelectedAcct]  = useState<Account | null>(null);
  const [movements,     setMovements]     = useState<AccountMovement[]>([]);
  const [movLoading,    setMovLoading]    = useState(false);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [addParent,     setAddParent]     = useState<Account | null>(null);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [filterType,    setFilterType]    = useState<AccountType | 'ALL'>('ALL');

  // ── Date range for movements ──────────────────────────────
  const now   = new Date();
  const [fromDate, setFromDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [toDate,   setToDate]   = useState(now.toISOString().slice(0, 10));

  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Load data ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      setError(null);
      const [accs, kpiData] = await Promise.all([
        accountsService.getAll(orgId),
        accountsService.getDashboardKPIs(orgId),
      ]);
      setAccounts(accs);
      setTree(buildAccountTree(accs));
      setKpis(kpiData);

      // Expand root level by default
      const roots = accs.filter(a => !a.parent_id);
      setExpandedIds(new Set(roots.map(a => a.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في جلب الحسابات');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    loadAll();

    // Realtime: re-load on any accounting change — scoped to org
    channelRef.current = accountsService.subscribeToTransactions(orgId, () => {
      setTimeout(loadAll, 400);
    });

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [orgId, loadAll]);

  // ── Load movements when account/dates change ──────────────
  useEffect(() => {
    if (!selectedAcct || !orgId) return;
    setMovLoading(true);
    accountsService.getMovements(selectedAcct.id, orgId, fromDate, toDate)
      .then(setMovements)
      .catch(() => setMovements([]))
      .finally(() => setMovLoading(false));
  }, [selectedAcct, orgId, fromDate, toDate]);

  // ── Expand/collapse ───────────────────────────────────────
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedIds(new Set(accounts.map(a => a.id)));
  }, [accounts]);

  const collapseAll = useCallback(() => {
    const roots = accounts.filter(a => !a.parent_id);
    setExpandedIds(new Set(roots.map(a => a.id)));
  }, [accounts]);

  // ── Filter ────────────────────────────────────────────────
  const filteredTree = React.useMemo(() => {
    if (!searchQuery.trim() && filterType === 'ALL') return tree;

    const matchesSearch = (a: Account): boolean => {
      const q = searchQuery.toLowerCase();
      return a.name_ar.toLowerCase().includes(q) || a.code.includes(q);
    };

    const filterNode = (nodes: Account[]): Account[] =>
      nodes.reduce<Account[]>((acc, node) => {
        const filteredChildren = filterNode(node.children ?? []);
        const typeOk = filterType === 'ALL' || node.account_type === filterType;
        const searchOk = !searchQuery.trim() || matchesSearch(node) || filteredChildren.length > 0;
        if (typeOk && searchOk) {
          acc.push({ ...node, children: filteredChildren });
        }
        return acc;
      }, []);

    return filterNode(tree);
  }, [tree, searchQuery, filterType]);

  // ── KPI cards ─────────────────────────────────────────────
  const kpiCards = kpis ? [
    { label: 'إجمالي الأصول',       value: kpis.total_assets,      icon: <Building2   className="w-4 h-4" />, color: 'blue'    },
    { label: 'إجمالي الخصوم',       value: kpis.total_liabilities, icon: <CreditCard  className="w-4 h-4" />, color: 'rose'    },
    { label: 'إجمالي الإيرادات',    value: kpis.total_revenue,     icon: <TrendingUp  className="w-4 h-4" />, color: 'emerald' },
    { label: 'صافي الربح',          value: kpis.net_profit,        icon: <BarChart3   className="w-4 h-4" />, color: kpis.net_profit >= 0 ? 'emerald' : 'rose' },
  ] : [];

  const colorMap: Record<string, string> = {
    blue:    'from-blue-500/10 to-blue-600/5 text-blue-700 border-blue-200/50',
    rose:    'from-rose-500/10 to-rose-600/5 text-rose-700 border-rose-200/50',
    emerald: 'from-emerald-500/10 to-emerald-600/5 text-emerald-700 border-emerald-200/50',
  };

  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 p-6" style={{ direction: 'rtl' }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">شجرة الحسابات</h1>
              <p className="text-sm text-slate-400">دليل الحسابات المحاسبي — Chart of Accounts</p>
            </div>
          </div>
          <button
            onClick={loadAll}
            disabled={loading}
            className="flex items-center gap-2 bg-white/70 hover:bg-white/90 border border-white/60 text-slate-600 hover:text-slate-800 px-4 py-2 rounded-2xl text-sm font-medium transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────── */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {kpiCards.map(card => (
            <div key={card.label}
              className={`bg-gradient-to-br ${colorMap[card.color]} border rounded-[1.5rem] p-4 backdrop-blur-xl`}>
              <div className="flex items-center gap-2 mb-1">
                {card.icon}
                <span className="text-xs font-medium opacity-70">{card.label}</span>
              </div>
              <div className="text-xl font-bold tabular-nums">{fmtSAR(card.value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Balance Equation ──────────────────────────────── */}
      {kpis && (
        <div className="mb-5">
          <BalanceEquation kpis={kpis} />
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={loadAll} className="mr-auto underline text-rose-600 hover:text-rose-800">
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ── Main grid ─────────────────────────────────────── */}
      <div className="flex gap-5">

        {/* ── LEFT: Account Tree ────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="bg-white/60 backdrop-blur-2xl border border-white/50 rounded-[2.5rem] shadow-xl shadow-slate-200/50 overflow-hidden">

            {/* Toolbar */}
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-48">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="بحث بالاسم أو الكود..."
                  className="w-full bg-white/80 border border-slate-200 rounded-2xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40 placeholder-slate-300"
                />
              </div>

              {/* Type filter */}
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value as AccountType | 'ALL')}
                className="bg-white/80 border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40 text-slate-700"
              >
                <option value="ALL">جميع الأنواع</option>
                {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map(t => (
                  <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
                ))}
              </select>

              {/* Expand/Collapse */}
              <button onClick={expandAll}   className="text-xs text-blue-500 hover:text-blue-700 px-3 py-2 rounded-xl hover:bg-blue-50 transition-colors">توسيع الكل</button>
              <button onClick={collapseAll} className="text-xs text-slate-400 hover:text-slate-600 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors">طي الكل</button>
            </div>

            {/* Tree body */}
            <div className="p-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                  <p className="text-sm text-slate-400">جارٍ تحميل شجرة الحسابات...</p>
                </div>
              ) : filteredTree.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">لا توجد حسابات مطابقة</p>
                </div>
              ) : (
                <AccountTree
                  nodes={filteredTree}
                  depth={0}
                  expandedIds={expandedIds}
                  selectedId={selectedAcct?.id ?? null}
                  onSelect={acct => {
                    setSelectedAcct(acct);
                    setMovements([]);
                  }}
                  onToggle={toggleExpand}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Detail Panel ────────────────────────── */}
        {selectedAcct && (
          <div className="w-96 flex-shrink-0">
            <div className="bg-white/60 backdrop-blur-2xl border border-white/50 rounded-[2.5rem] shadow-xl shadow-slate-200/50 overflow-hidden sticky top-4">

              {/* Panel header */}
              <div className={`p-5 border-b border-slate-100 bg-gradient-to-br ${
                ACCOUNT_TYPE_COLORS[selectedAcct.account_type].bg} bg-opacity-30`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border mb-2
                      ${ACCOUNT_TYPE_COLORS[selectedAcct.account_type].bg}
                      ${ACCOUNT_TYPE_COLORS[selectedAcct.account_type].text}
                      ${ACCOUNT_TYPE_COLORS[selectedAcct.account_type].border}`}>
                      {TYPE_ICON[selectedAcct.account_type]}
                      {ACCOUNT_TYPE_LABELS[selectedAcct.account_type]}
                    </div>
                    <h2 className="text-base font-bold text-slate-800">{selectedAcct.name_ar}</h2>
                    {selectedAcct.name_en && (
                      <p className="text-xs text-slate-400" dir="ltr">{selectedAcct.name_en}</p>
                    )}
                    <p className="text-xs font-mono text-slate-400 mt-1">الكود: {selectedAcct.code}</p>
                  </div>
                  <button
                    onClick={() => setSelectedAcct(null)}
                    className="w-7 h-7 rounded-xl bg-white/70 hover:bg-white border border-white/60 flex items-center justify-center transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>

                {/* Balance summary */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="bg-white/70 rounded-2xl p-2.5 text-center">
                    <div className="text-xs text-slate-400 mb-0.5">مدين</div>
                    <div className="text-xs font-bold text-emerald-700 tabular-nums">{fmtSAR(selectedAcct.total_debit ?? 0)}</div>
                  </div>
                  <div className="bg-white/70 rounded-2xl p-2.5 text-center">
                    <div className="text-xs text-slate-400 mb-0.5">دائن</div>
                    <div className="text-xs font-bold text-rose-600 tabular-nums">{fmtSAR(selectedAcct.total_credit ?? 0)}</div>
                  </div>
                  <div className="bg-white/70 rounded-2xl p-2.5 text-center">
                    <div className="text-xs text-slate-400 mb-0.5">الرصيد</div>
                    <div className={`text-xs font-bold tabular-nums ${(selectedAcct.balance ?? 0) >= 0 ? 'text-blue-700' : 'text-rose-600'}`}>
                      {fmtSAR(selectedAcct.balance ?? 0)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Movements section */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-slate-700">الحركات</span>
                  <div className="flex items-center gap-1.5">
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                      className="text-xs bg-white/70 border border-slate-200 rounded-xl px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400/40" />
                    <span className="text-slate-300 text-xs">—</span>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                      className="text-xs bg-white/70 border border-slate-200 rounded-xl px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400/40" />
                  </div>
                </div>

                <MovementsTable movements={movements} loading={movLoading} />
              </div>

              {/* Add child account button */}
              <div className="p-4 border-t border-slate-100">
                <button
                  onClick={() => { setAddParent(selectedAcct); setShowAddModal(true); }}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-l from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white text-sm font-semibold py-2.5 rounded-2xl shadow-md shadow-blue-500/20 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  إضافة حساب فرعي
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Account Modal ─────────────────────────────── */}
      {showAddModal && addParent && (
        <AddAccountModal
          parentAccount={addParent}
          onClose={() => { setShowAddModal(false); setAddParent(null); }}
          onCreated={() => { loadAll(); }}
        />
      )}
    </div>
  );
}
