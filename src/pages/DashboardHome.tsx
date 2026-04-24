// ============================================================
// Control Panel (رصيد) — Dashboard Home v2
// Design: White Glassmorphism | Corporate Blue | Full ERP
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, FileText,
  RefreshCw, ChevronRight, Clock, CheckCircle,
  AlertCircle, ShoppingCart, Package, Activity,
  ArrowUpRight,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { supabase } from '../lib/supabase';
import {
  COLORS, GLASS, RADIUS, FONT, GRADIENTS, SHADOWS, MOTION,
  fmtShort, STATUS_META,
  SPARK_SALES, SPARK_EXPENSES, SPARK_PROFIT,
} from '../design-system/tokens';
import {
  StatsCard, SyncStatus, GlassButton,
  Badge, SectionTitle, MicroChart,
} from '../design-system/GlassComponents';

// ─── Types ───────────────────────────────────────────────────
interface DashboardMetrics {
  todayRevenue: number;
  totalExpenses: number;
  netProfit: number;
  pendingInvoices: number;
  todayOrders: number;
  lowStockCount: number;
}

interface RecentInvoice {
  id: string;
  customer: string;
  amount: number;
  status: string;
  date: string;
}

// ─── Static chart data ────────────────────────────────────────
const MONTHLY_DATA = [
  { month: 'يناير', revenue: 142000, expenses: 89000 },
  { month: 'فبراير', revenue: 178000, expenses: 102000 },
  { month: 'مارس',  revenue: 165000, expenses: 94000  },
  { month: 'أبريل', revenue: 210000, expenses: 118000 },
  { month: 'مايو',  revenue: 195000, expenses: 109000 },
  { month: 'يونيو', revenue: 238000, expenses: 127000 },
  { month: 'يوليو', revenue: 256000, expenses: 143000 },
];

const RECENT_INVOICES: RecentInvoice[] = [
  { id: 'INV-2025-0041', customer: 'شركة النور للتجارة', amount: 13800, status: 'cleared',  date: '2025-04-15' },
  { id: 'INV-2025-0040', customer: 'مؤسسة الأمل',        amount: 8625,  status: 'reported', date: '2025-04-14' },
  { id: 'INV-2025-0039', customer: 'متجر الريادة',        amount: 22500, status: 'pending',  date: '2025-04-13' },
  { id: 'INV-2025-0038', customer: 'شركة البنيان',        amount: 5750,  status: 'cleared',  date: '2025-04-12' },
  { id: 'INV-2025-0037', customer: 'مجموعة السلام',       amount: 31200, status: 'rejected', date: '2025-04-11' },
];

// ─── Custom Chart Tooltip ─────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        ...GLASS.elevated,
        borderRadius: RADIUS.md,
        padding: '10px 14px',
        fontSize: FONT.sizes.xs,
        fontFamily: FONT.family,
        minWidth: 140,
      }}
    >
      <p style={{ fontWeight: FONT.weights.bold, color: COLORS.slate[700], margin: '0 0 6px' }}>{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
          <span style={{ color: entry.color }}>● {entry.name === 'revenue' ? 'الإيرادات' : 'المصروفات'}</span>
          <span style={{ fontWeight: FONT.weights.semibold, color: COLORS.slate[800] }}>
            {fmtShort(entry.value)} ر.س
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── TopBar ───────────────────────────────────────────────────
function TopBar({ loading, onRefresh, connected, lastSync }: {
  loading: boolean;
  onRefresh: () => void;
  connected: boolean;
  lastSync: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 28px',
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        flexShrink: 0,
      }}
    >
      <div>
        <h1 style={{ fontSize: FONT.sizes.xl, fontWeight: FONT.weights.black, color: COLORS.slate[800], margin: 0 }}>
          لوحة التحكم
        </h1>
        <p style={{ fontSize: FONT.sizes.xs, color: COLORS.slate[400], margin: '2px 0 0' }}>
          {new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <SyncStatus connected={connected} lastSync={lastSync} />

        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            width: 36, height: 36,
            borderRadius: RADIUS.md,
            background: COLORS.blue[50],
            border: `1px solid ${COLORS.blue[100]}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          <RefreshCw
            size={15}
            style={{ color: COLORS.blue[600], animation: loading ? 'spin 1s linear infinite' : 'none' }}
          />
        </button>

        <div
          style={{
            width: 36, height: 36,
            borderRadius: RADIUS.full,
            background: GRADIENTS.primaryBtn,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: FONT.sizes.sm,
            fontWeight: FONT.weights.bold,
            color: '#fff',
            boxShadow: SHADOWS.blue,
          }}
        >م</div>
      </div>
    </div>
  );
}

// ─── Stats Row ────────────────────────────────────────────────
function StatsRow({ metrics }: { metrics: DashboardMetrics | null }) {
  const m = metrics ?? { todayRevenue: 0, totalExpenses: 0, netProfit: 0, pendingInvoices: 0, todayOrders: 0, lowStockCount: 0 };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem' }}>
      <StatsCard
        icon={DollarSign} label="مبيعات اليوم"
        value={`${fmtShort(m.todayRevenue)} ر.س`}
        sub="شامل ضريبة القيمة المضافة" trend={12.4}
        sparkData={SPARK_SALES} accentColor={COLORS.blue[600]}
        accentGradient={GRADIENTS.blueAccent} glowColor="rgba(37,99,235,0.15)"
      />
      <StatsCard
        icon={TrendingDown} label="إجمالي المصروفات"
        value={`${fmtShort(m.totalExpenses)} ر.س`}
        sub="الشهر الحالي" trend={-3.1}
        sparkData={SPARK_EXPENSES} accentColor={COLORS.rose.DEFAULT}
        accentGradient={GRADIENTS.roseAccent} glowColor="rgba(244,63,94,0.12)"
      />
      <StatsCard
        icon={TrendingUp} label="صافي الربح"
        value={`${fmtShort(m.netProfit)} ر.س`}
        sub="بعد خصم المصاريف" trend={8.7}
        sparkData={SPARK_PROFIT} accentColor={COLORS.emerald.DEFAULT}
        accentGradient={GRADIENTS.emeraldAccent} glowColor="rgba(16,185,129,0.12)"
      />
      <StatsCard
        icon={FileText} label="فواتير معلقة"
        value={String(m.pendingInvoices)}
        sub="تحتاج مراجعة"
        accentColor={COLORS.amber.DEFAULT}
        accentGradient={GRADIENTS.amberAccent} glowColor="rgba(245,158,11,0.12)"
      />
    </div>
  );
}

// ─── Revenue Area Chart ───────────────────────────────────────
function RevenueChart() {
  return (
    <div style={{ ...GLASS.card, borderRadius: RADIUS.xl, padding: '1.5rem', height: 320 }}>
      <SectionTitle
        title="الإيرادات مقابل المصروفات"
        action={
          <GlassButton variant="ghost" size="sm">
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              عرض التقرير <ArrowUpRight size={13} />
            </span>
          </GlassButton>
        }
      />
      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={MONTHLY_DATA} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={COLORS.blue[600]} stopOpacity={0.18} />
              <stop offset="95%" stopColor={COLORS.blue[600]} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="exp-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={COLORS.rose.DEFAULT} stopOpacity={0.14} />
              <stop offset="95%" stopColor={COLORS.rose.DEFAULT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: COLORS.slate[400], fontFamily: FONT.family }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: COLORS.slate[400], fontFamily: FONT.family }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="revenue" stroke={COLORS.blue[600]}  strokeWidth={2.5} fill="url(#rev-grad)" dot={false} />
          <Area type="monotone" dataKey="expenses" stroke={COLORS.rose.DEFAULT} strokeWidth={2}   fill="url(#exp-grad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Activity Panel ───────────────────────────────────────────
function ActivityPanel({ metrics }: { metrics: DashboardMetrics | null }) {
  const m = metrics ?? { todayOrders: 0, lowStockCount: 0, netProfit: 0 };
  const items = [
    { icon: ShoppingCart, color: COLORS.blue[600],     bg: COLORS.blue[50],          title: 'طلبيات اليوم',    value: `${m.todayOrders} طلب` },
    { icon: Package,      color: COLORS.amber.DEFAULT, bg: COLORS.amber.light,        title: 'أصناف منخفضة',   value: `${m.lowStockCount} صنف` },
    { icon: Activity,     color: COLORS.emerald.DEFAULT, bg: COLORS.emerald.light,    title: 'الربح الصافي',   value: `${fmtShort(m.netProfit)} ر.س` },
  ];

  return (
    <div style={{ ...GLASS.card, borderRadius: RADIUS.xl, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <h3 style={{ fontSize: FONT.sizes.base, fontWeight: FONT.weights.bold, color: COLORS.slate[700], margin: '0 0 4px' }}>
        لمحة سريعة
      </h3>
      {items.map((a) => (
        <div
          key={a.title}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', borderRadius: RADIUS.lg,
            background: 'rgba(248,250,252,0.7)',
            border: '1px solid rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ width: 36, height: 36, borderRadius: RADIUS.md, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <a.icon size={16} style={{ color: a.color }} />
          </div>
          <div>
            <p style={{ fontSize: FONT.sizes.xs, color: COLORS.slate[400], margin: 0 }}>{a.title}</p>
            <p style={{ fontSize: FONT.sizes.base, fontWeight: FONT.weights.bold, color: COLORS.slate[800], margin: 0 }}>{a.value}</p>
          </div>
        </div>
      ))}
      <div style={{ padding: '10px 12px', borderRadius: RADIUS.lg, background: GRADIENTS.blueAccent, border: '1px solid rgba(37,99,235,0.12)' }}>
        <p style={{ fontSize: FONT.sizes.xs, color: COLORS.blue[600], fontWeight: FONT.weights.semibold, margin: '0 0 6px' }}>مسار الإيرادات</p>
        <MicroChart data={SPARK_SALES} color={COLORS.blue[600]} height={40} />
      </div>
    </div>
  );
}

// ─── Recent Invoices ──────────────────────────────────────────
function RecentInvoices() {
  return (
    <div style={{ ...GLASS.card, borderRadius: RADIUS.xl, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <h3 style={{ fontSize: FONT.sizes.base, fontWeight: FONT.weights.bold, color: COLORS.slate[700], margin: 0 }}>آخر الفواتير</h3>
        <button style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: FONT.sizes.xs, color: COLORS.blue[600], fontWeight: FONT.weights.semibold, background: 'none', border: 'none', cursor: 'pointer' }}>
          عرض الكل <ChevronRight size={13} />
        </button>
      </div>
      {RECENT_INVOICES.map((inv, i) => {
        const meta = STATUS_META[inv.status as keyof typeof STATUS_META] ?? STATUS_META.draft;
        const StatusIcon = inv.status === 'cleared' || inv.status === 'reported' ? CheckCircle : inv.status === 'pending' ? Clock : AlertCircle;
        return (
          <div
            key={inv.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '0.9rem 1.5rem',
              borderBottom: i < RECENT_INVOICES.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
              cursor: 'pointer', transition: `background ${MOTION.fast}`,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(37,99,235,0.03)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ width: 36, height: 36, borderRadius: RADIUS.md, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <StatusIcon size={16} style={{ color: meta.color }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold, color: COLORS.slate[700], margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.customer}</p>
              <p style={{ fontSize: FONT.sizes.xs, color: COLORS.slate[400], margin: '2px 0 0', fontFamily: 'monospace' }}>{inv.id}</p>
            </div>
            <div style={{ textAlign: 'left', flexShrink: 0 }}>
              <p style={{ fontSize: FONT.sizes.sm, fontWeight: FONT.weights.bold, color: COLORS.slate[800], margin: '0 0 2px' }}>{fmtShort(inv.amount)} ر.س</p>
              <Badge label={meta.label} color={meta.color} bg={meta.bg} size="sm" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Monthly Bar Chart ────────────────────────────────────────
function MonthlyBarChart() {
  return (
    <div style={{ ...GLASS.card, borderRadius: RADIUS.xl, padding: '1.25rem', height: 340 }}>
      <h3 style={{ fontSize: FONT.sizes.base, fontWeight: FONT.weights.bold, color: COLORS.slate[700], margin: '0 0 1rem' }}>المبيعات الشهرية</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={MONTHLY_DATA} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: COLORS.slate[400], fontFamily: FONT.family }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: COLORS.slate[400], fontFamily: FONT.family }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="revenue"  fill={COLORS.blue[600]}     radius={[6,6,0,0]} opacity={0.85} />
          <Bar dataKey="expenses" fill={COLORS.rose.DEFAULT}  radius={[6,6,0,0]} opacity={0.60} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────
export function DashboardHome() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(true);
  const [lastSync, setLastSync] = useState('الآن');

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const [salesRes, expensesRes] = await Promise.allSettled([
        supabase.rpc('get_today_sales_total').single(),
        supabase.rpc('get_month_expenses_total').single(),
      ]);

      const todayRevenue =
        salesRes.status === 'fulfilled' && !(salesRes.value as any).error
          ? ((salesRes.value as any).data as any)?.total ?? 14850
          : 14850;

      const totalExpenses =
        expensesRes.status === 'fulfilled' && !(expensesRes.value as any).error
          ? ((expensesRes.value as any).data as any)?.total ?? 8320
          : 8320;

      setMetrics({ todayRevenue, totalExpenses, netProfit: todayRevenue - totalExpenses, pendingInvoices: 7, todayOrders: 23, lowStockCount: 4 });
      setConnected(true);
      setLastSync(new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      setConnected(false);
      setMetrics({ todayRevenue: 14850, totalExpenses: 8320, netProfit: 6530, pendingInvoices: 7, todayOrders: 23, lowStockCount: 4 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const channel = supabase
      .channel('dashboard-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, fetchMetrics)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMetrics]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: FONT.family }}>
      <TopBar loading={loading} onRefresh={fetchMetrics} connected={connected} lastSync={lastSync} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <StatsRow metrics={metrics} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem' }}>
          <RevenueChart />
          <ActivityPanel metrics={metrics} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
          <RecentInvoices />
          <MonthlyBarChart />
        </div>
      </div>

      {/* Keyframe for spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default DashboardHome;
