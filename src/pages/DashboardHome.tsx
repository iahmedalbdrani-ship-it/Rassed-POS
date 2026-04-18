// ============================================================
// Control Panel (رصيد) — Dashboard Home (Standalone Page)
// Design: White Glassmorphism | Full ERP Dashboard
// ============================================================

import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, FileText, Users,
  AlertCircle, CheckCircle, Clock, ChevronRight, BarChart2, Zap
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts';

// ─── Format helpers ──────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}م` : n >= 1000 ? `${(n / 1000).toFixed(0)}ك` : String(n);

// ─── Mock data ───────────────────────────────────────────────
const MONTHLY_DATA = [
  { month: 'يناير', revenue: 142000, expenses: 89000, vat: 21300 },
  { month: 'فبراير', revenue: 178000, expenses: 102000, vat: 26700 },
  { month: 'مارس', revenue: 165000, expenses: 94000, vat: 24750 },
  { month: 'أبريل', revenue: 210000, expenses: 118000, vat: 31500 },
  { month: 'مايو', revenue: 195000, expenses: 109000, vat: 29250 },
  { month: 'يونيو', revenue: 238000, expenses: 127000, vat: 35700 },
  { month: 'يوليو', revenue: 256000, expenses: 143000, vat: 38400 },
];

const RECENT_INVOICES = [
  { id: 'INV-2025-0041', customer: 'شركة النور للتجارة', amount: 13800, vat: 2070, status: 'cleared', date: '2025-04-15' },
  { id: 'INV-2025-0040', customer: 'مؤسسة الأمل', amount: 8625, vat: 1293, status: 'reported', date: '2025-04-14' },
  { id: 'INV-2025-0039', customer: 'متجر الريادة', amount: 22500, vat: 3375, status: 'pending', date: '2025-04-13' },
  { id: 'INV-2025-0038', customer: 'شركة البنيان', amount: 5750, vat: 862, status: 'cleared', date: '2025-04-12' },
  { id: 'INV-2025-0037', customer: 'مجموعة السلام', amount: 31200, vat: 4680, status: 'rejected', date: '2025-04-11' },
];

const ZATCA_STATUS: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  cleared:  { label: 'مقبولة',  color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: CheckCircle },
  reported: { label: 'مُرسلة',  color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: CheckCircle },
  pending:  { label: 'معلقة',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: Clock },
  rejected: { label: 'مرفوضة', color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  icon: AlertCircle },
};

// ─── Glass Panel ─────────────────────────────────────────────
function Card({ children, className = '', title = '', action = null }: any) {
  return (
    <div
      className={`rounded-[1.75rem] overflow-hidden ${className}`}
      style={{
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.8)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.05)',
      }}
    >
      {title && (
        <div
          className="px-6 py-4 flex items-center justify-between border-b"
          style={{ borderColor: 'rgba(0,0,0,0.05)' }}
        >
          <h3 className="font-bold text-slate-700 text-[15px]">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, trend, trendUp, color }: any) {
  return (
    <div
      className="rounded-[1.75rem] p-5 flex flex-col gap-3"
      style={{
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.8)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center"
          style={{ background: `${color}18` }}
        >
          <Icon size={18} style={{ color }} />
        </div>
        {trend !== undefined && (
          <div
            className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              color: trendUp ? '#10b981' : '#ef4444',
              background: trendUp ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
            }}
          >
            {trendUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {trend}%
          </div>
        )}
      </div>
      <div>
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <p className="text-xl font-black text-slate-800">{value}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Custom Tooltip ──────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-2xl p-3 text-xs"
      style={{
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
      }}
    >
      <p className="font-bold text-slate-600 mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === 'revenue' ? 'الإيرادات' : p.name === 'expenses' ? 'المصروفات' : 'ضريبة'}: {fmtShort(p.value)} ر.س
        </p>
      ))}
    </div>
  );
};

// ─── Main Dashboard ──────────────────────────────────────────
export function DashboardHome() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const currentMonth = MONTHLY_DATA[MONTHLY_DATA.length - 1];
  const prevMonth    = MONTHLY_DATA[MONTHLY_DATA.length - 2];
  const revGrowth    = (((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100).toFixed(1);

  return (
    <div className="p-6 space-y-5 min-h-screen" dir="rtl" style={{ fontFamily: 'Tajawal, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">لوحة التحكم المالية</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {time.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-600 font-medium text-xs">Supabase متصل</span>
          </div>
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm"
            style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.15)' }}
          >
            <Zap size={12} className="text-orange-500" />
            <span className="text-orange-600 font-medium text-xs">ZATCA Sandbox</span>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon={DollarSign} label="إجمالي الإيرادات" color="#f97316"
          value={fmt(currentMonth.revenue)} sub="يوليو 2025"
          trend={revGrowth} trendUp={parseFloat(revGrowth) > 0}
        />
        <KpiCard
          icon={TrendingUp} label="صافي الربح" color="#10b981"
          value={fmt(currentMonth.revenue - currentMonth.expenses)}
          sub={`هامش ${(((currentMonth.revenue - currentMonth.expenses) / currentMonth.revenue) * 100).toFixed(0)}%`}
          trend={12.3} trendUp
        />
        <KpiCard
          icon={FileText} label="الفواتير هذا الشهر" color="#3b82f6"
          value="١٤١ فاتورة" sub="٣ مرفوضة من ZATCA"
          trend={8.1} trendUp
        />
        <KpiCard
          icon={Users} label="ضريبة القيمة المضافة" color="#8b5cf6"
          value={fmt(currentMonth.vat)} sub="15% من المبيعات"
          trend={5.7} trendUp
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <Card
          className="col-span-2"
          title="التدفق المالي — آخر 7 أشهر"
          action={
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <BarChart2 size={12} /> ريال سعودي
            </span>
          }
        >
          <div className="p-4">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={MONTHLY_DATA} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <defs>
                  <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'Tajawal' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtShort(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2.5} fill="url(#gradRev)" />
                <Area type="monotone" dataKey="expenses" stroke="#3b82f6" strokeWidth={2} fill="url(#gradExp)" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 justify-center">
              <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="w-3 h-0.5 rounded bg-orange-400 inline-block" /> الإيرادات
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="w-3 h-0.5 rounded bg-blue-400 inline-block" /> المصروفات
              </span>
            </div>
          </div>
        </Card>

        {/* P&L Summary */}
        <Card title="ملخص الأرباح والخسائر">
          <div className="p-5 space-y-4">
            {[
              { label: 'إيرادات المبيعات', value: currentMonth.revenue, color: '#10b981' },
              { label: 'إجمالي المصروفات', value: -currentMonth.expenses, color: '#ef4444' },
              { label: 'ضريبة القيمة المضافة', value: -currentMonth.vat, color: '#f59e0b' },
              {
                label: 'صافي الربح',
                value: currentMonth.revenue - currentMonth.expenses - currentMonth.vat,
                color: '#8b5cf6',
              },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">{row.label}</span>
                  <span style={{ color: row.color }} className="font-bold">
                    {row.value < 0 ? '-' : ''}{fmtShort(Math.abs(row.value))} ر.س
                  </span>
                </div>
                <div
                  className="h-1 rounded-full"
                  style={{ background: 'rgba(0,0,0,0.06)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${Math.min((Math.abs(row.value) / currentMonth.revenue) * 100, 100)}%`,
                      background: row.color,
                    }}
                  />
                </div>
              </div>
            ))}

            <div
              className="mt-2 pt-3 border-t flex items-center justify-between"
              style={{ borderColor: 'rgba(0,0,0,0.06)' }}
            >
              <span className="text-xs text-slate-400">هامش الربح الصافي</span>
              <span className="text-sm font-black text-emerald-600">
                {(((currentMonth.revenue - currentMonth.expenses) / currentMonth.revenue) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* VAT & Invoices Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* VAT Bar Chart */}
        <Card title="ضريبة القيمة المضافة الشهرية">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={MONTHLY_DATA} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: 'Tajawal' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: any) => [fmt(v), 'ضريبة القيمة المضافة']}
                  contentStyle={{ borderRadius: '16px', border: '1px solid rgba(0,0,0,0.08)', fontSize: '11px', fontFamily: 'Tajawal' }}
                />
                <Bar dataKey="vat" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Recent Invoices */}
        <Card
          className="col-span-2"
          title="آخر الفواتير"
          action={
            <button className="text-xs text-orange-500 font-medium flex items-center gap-1 hover:gap-2 transition-all">
              عرض الكل <ChevronRight size={12} />
            </button>
          }
        >
          <div className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
            {RECENT_INVOICES.map((inv) => {
              const s = ZATCA_STATUS[inv.status];
              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-white/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background: s.bg }}
                    >
                      <s.icon size={14} style={{ color: s.color }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700 font-mono">{inv.id}</p>
                      <p className="text-xs text-slate-400">{inv.customer}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className="text-[11px] px-2.5 py-0.5 rounded-full font-medium"
                      style={{ color: s.color, background: s.bg }}
                    >
                      {s.label}
                    </span>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-700">{fmt(inv.amount)}</p>
                      <p className="text-[10px] text-slate-400">ضريبة: {fmt(inv.vat)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Bottom Strip */}
      <div
        className="rounded-[1.5rem] px-5 py-3.5 flex items-center justify-between"
        style={{
          background: 'rgba(249,115,22,0.04)',
          border: '1px solid rgba(249,115,22,0.12)',
        }}
      >
        <div className="flex items-center gap-6">
          {[
            { label: 'فواتير مقبولة ZATCA', value: '138', color: '#10b981' },
            { label: 'في الانتظار', value: '3', color: '#f59e0b' },
            { label: 'مرفوضة', value: '1', color: '#ef4444' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
              <span className="text-[11px] text-slate-500">{s.label}:</span>
              <span className="text-[11px] font-bold" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
        <span className="text-[10px] text-slate-400 font-mono">{time.toLocaleTimeString('ar-SA')}</span>
      </div>
    </div>
  );
}
