// ============================================================
// Control Panel (رصيد) — useAccountingMetrics Hook
//
// يدير مقاييس المحاسبة اللحظية:
//   • استدعاء get_dashboard_metrics() عند الإطار الأول
//   • اشتراك Realtime على transactions → إعادة الجلب التلقائي
//   • كل قيمة مُتاحة مباشرة (no selectors needed)
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import accountsService, { type DashboardKPIs } from '../lib/accounts-service';
import { useTenant } from '../contexts/TenantContext';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Empty state (صفر لكل شيء) ─────────────────────────────

const EMPTY_KPIs: DashboardKPIs = {
  total_assets:       0,
  total_liabilities:  0,
  total_equity:       0,
  total_revenue:      0,
  total_expenses:     0,
  net_profit:         0,
  cash_balance:       0,
  vat_payable:        0,
  this_month_revenue: 0,
  last_month_revenue: 0,
  revenue_growth_pct: 0,
};

// ─── Hook ────────────────────────────────────────────────────

interface UseAccountingMetricsReturn {
  kpis:       DashboardKPIs;
  loading:    boolean;
  error:      string | null;
  lastUpdated:Date | null;
  refresh:    () => Promise<void>;
}

export function useAccountingMetrics(): UseAccountingMetricsReturn {
  const { orgId } = useTenant();

  const [kpis,        setKpis]        = useState<DashboardKPIs>(EMPTY_KPIs);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Fetch function ────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await accountsService.getDashboardKPIs(orgId);
      setKpis(data);
      setLastUpdated(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ في جلب المقاييس';
      console.error('[useAccountingMetrics]', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  // ── Initial load + Realtime subscription ─────────────────
  useEffect(() => {
    if (!orgId) return;

    // Load on mount
    refresh();

    // Subscribe to transactions changes — scoped to org
    channelRef.current = accountsService.subscribeToTransactions(orgId, () => {
      // Debounce: wait 500ms so a batch of inserts triggers one refresh
      const timer = setTimeout(refresh, 500);
      return () => clearTimeout(timer);
    });

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [orgId, refresh]);

  return { kpis, loading, error, lastUpdated, refresh };
}

// ─── Derived helpers (used by DashboardHome) ─────────────────

/** حساب نسبة تغيير (مع حماية من القسمة على صفر) */
export function calcGrowth(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return +((current - previous) / previous * 100).toFixed(1);
}

/** تنسيق نسبة التغيير كنص عربي */
export function formatGrowth(pct: number): { label: string; positive: boolean } {
  const positive = pct >= 0;
  return {
    label:    `${positive ? '+' : ''}${pct.toFixed(1)}%`,
    positive,
  };
}
