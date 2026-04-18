// ============================================================
// Control Panel (رصيد) — Financial Reports
// Tabs: P&L | Balance Sheet | Trial Balance | Cash Flow
// ============================================================

import React, { useState } from 'react';
import {
  TrendingUp, Scale, Activity,
  Download, Printer,
  BarChart2, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell
} from 'recharts';

// ─── Helpers ─────────────────────────────────────────────────
const fmt = (n: number, signed = false) => {
  const s = new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(Math.abs(n));
  return signed ? (n >= 0 ? `+${s}` : `-${s}`) : s;
};

// ─── Mock Financial Data ──────────────────────────────────────

const PL_MONTHLY = [
  { month: 'يناير', revenue: 142000, cogs: 62000, gross: 80000, opex: 41000, ebit: 39000, tax: 5850, net: 33150 },
  { month: 'فبراير', revenue: 178000, cogs: 78000, gross: 100000, opex: 45000, ebit: 55000, tax: 8250, net: 46750 },
  { month: 'مارس',   revenue: 165000, cogs: 71000, gross: 94000, opex: 43000, ebit: 51000, tax: 7650, net: 43350 },
  { month: 'أبريل',  revenue: 210000, cogs: 93000, gross: 117000, opex: 52000, ebit: 65000, tax: 9750, net: 55250 },
  { month: 'مايو',   revenue: 195000, cogs: 86000, gross: 109000, opex: 49000, ebit: 60000, tax: 9000, net: 51000 },
  { month: 'يونيو',  revenue: 238000, cogs: 105000, gross: 133000, opex: 58000, ebit: 75000, tax: 11250, net: 63750 },
  { month: 'يوليو',  revenue: 256000, cogs: 114000, gross: 142000, opex: 63000, ebit: 79000, tax: 11850, net: 67150 },
];

const BALANCE_SHEET = {
  assets: [
    { name: 'الأصول المتداولة', items: [
      { account: 'النقدية والبنوك',    balance: 1620000 },
      { account: 'المدينون / العملاء', balance: 230000  },
      { account: 'المخزون',           balance: 70000   },
      { account: 'ضريبة ق.م - مدخلات', balance: 0       },
    ]},
    { name: 'الأصول الثابتة', items: [
      { account: 'المعدات والأثاث',  balance: 620000 },
      { account: 'الحاسبات والأجهزة', balance: 310000 },
    ]},
  ],
  liabilities: [
    { name: 'الخصوم المتداولة', items: [
      { account: 'الموردون / الدائنون', balance: 380000 },
      { account: 'ضريبة ق.م - مخرجات', balance: 38400  },
      { account: 'الرواتب المستحقة',   balance: 231600 },
    ]},
    { name: 'الخصوم طويلة الأجل', items: [
      { account: 'القروض البنكية', balance: 450000 },
    ]},
  ],
  equity: [
    { account: 'رأس المال',        balance: 1500000 },
    { account: 'الأرباح المحتجزة', balance: 250000  },
  ],
};

const TRIAL_BALANCE = [
  { code: '111', name: 'النقدية',                   debit: 1620000, credit: 0 },
  { code: '113', name: 'المدينون / العملاء',          debit: 230000,  credit: 0 },
  { code: '114', name: 'المخزون',                   debit: 70000,   credit: 0 },
  { code: '121', name: 'المعدات والأثاث',            debit: 620000,  credit: 0 },
  { code: '122', name: 'الحاسبات',                  debit: 310000,  credit: 0 },
  { code: '211', name: 'الموردون / الدائنون',         debit: 0,       credit: 380000 },
  { code: '212', name: 'ضريبة ق.م - مخرجات',        debit: 0,       credit: 38400 },
  { code: '213', name: 'الرواتب المستحقة',           debit: 0,       credit: 231600 },
  { code: '221', name: 'القروض البنكية',             debit: 0,       credit: 450000 },
  { code: '31',  name: 'رأس المال',                 debit: 0,       credit: 1500000 },
  { code: '32',  name: 'الأرباح المحتجزة',           debit: 0,       credit: 250000 },
  { code: '41',  name: 'إيرادات المبيعات',           debit: 0,       credit: 1384000 },
  { code: '511', name: 'الرواتب والأجور',            debit: 441000,  credit: 0 },
  { code: '512', name: 'الإيجارات',                 debit: 175000,  credit: 0 },
  { code: '52',  name: 'تكلفة البضاعة المباعة',      debit: 609000,  credit: 0 },
];

const CASHFLOW_DATA = [
  { month: 'يناير', operating: 38000, investing: -15000, financing: 0 },
  { month: 'فبراير', operating: 52000, investing: -8000, financing: -5000 },
  { month: 'مارس',   operating: 48000, investing: 0,      financing: 0 },
  { month: 'أبريل',  operating: 61000, investing: -22000, financing: 10000 },
  { month: 'مايو',   operating: 56000, investing: 0,      financing: -5000 },
  { month: 'يونيو',  operating: 70000, investing: -5000,  financing: 0 },
  { month: 'يوليو',  operating: 74000, investing: -30000, financing: 0 },
];

const PIE_DATA = [
  { name: 'إيرادات المبيعات', value: 1384000, color: '#f97316' },
  { name: 'تكلفة المبيعات',   value: 609000,  color: '#3b82f6' },
  { name: 'مصروفات التشغيل',  value: 351000,  color: '#8b5cf6' },
  { name: 'صافي الربح',       value: 424000,  color: '#10b981' },
];

// ─── GlassCard ────────────────────────────────────────────────
const Card = ({ children, className = '', title = '', action = null }: any) => (
  <div className={`rounded-[1.75rem] overflow-hidden ${className}`}
    style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>
    {title && (
      <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
        <h3 className="font-bold text-slate-700 text-sm">{title}</h3>
        {action}
      </div>
    )}
    {children}
  </div>
);

const ToolTipCmp = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl p-3 text-xs" style={{ background: 'rgba(255,255,255,0.96)', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', fontFamily: 'Tajawal' }}>
      <p className="font-bold text-slate-600 mb-1">{label}</p>
      {payload.map((p: any) => <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>)}
    </div>
  );
};

// ─── TAB: Profit & Loss ───────────────────────────────────────
function ProfitLoss() {
  // current month unused — totals used directly
  const total = PL_MONTHLY.reduce((acc, m) => ({
    revenue: acc.revenue + m.revenue, cogs: acc.cogs + m.cogs,
    gross: acc.gross + m.gross, opex: acc.opex + m.opex,
    ebit: acc.ebit + m.ebit, tax: acc.tax + m.tax, net: acc.net + m.net,
  }), { revenue: 0, cogs: 0, gross: 0, opex: 0, ebit: 0, tax: 0, net: 0 });

  const rows = [
    { label: 'إيرادات المبيعات',         value: total.revenue,    style: 'header revenue' },
    { label: 'تكلفة البضاعة المباعة',    value: -total.cogs,      style: 'expense' },
    { label: 'مجمل الربح',               value: total.gross,      style: 'subtotal' },
    { label: 'مصروفات التشغيل',          value: -total.opex,      style: 'expense' },
    { label: 'الربح قبل الضريبة',        value: total.ebit,       style: 'subtotal' },
    { label: 'ضريبة الدخل (15%)',        value: -total.tax,       style: 'expense' },
    { label: 'صافي الربح',               value: total.net,        style: 'total' },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الإيرادات', value: fmt(total.revenue), color: '#f97316', delta: '+18.4%', up: true },
          { label: 'مجمل الربح',       value: fmt(total.gross),   color: '#3b82f6', delta: '+22.1%', up: true },
          { label: 'صافي الربح',       value: fmt(total.net),     color: '#10b981', delta: '+15.7%', up: true },
          { label: 'هامش الربح الصافي', value: `${((total.net / total.revenue) * 100).toFixed(1)}%`, color: '#8b5cf6', delta: '+2.3%', up: true },
        ].map(k => (
          <Card key={k.label} className="p-5">
            <p className="text-xs text-slate-400 mb-1">{k.label}</p>
            <p className="text-xl font-black" style={{ color: k.color }}>{k.value}</p>
            <div className="flex items-center gap-1 mt-1.5">
              {k.up ? <ArrowUpRight size={12} className="text-emerald-500" /> : <ArrowDownRight size={12} className="text-rose-500" />}
              <span className="text-xs font-medium text-emerald-500">{k.delta}</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Chart */}
        <Card className="col-span-2" title="الإيرادات مقابل التكاليف">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={PL_MONTHLY} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'Tajawal' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v/1000}k`} />
                <Tooltip content={<ToolTipCmp />} />
                <Bar dataKey="revenue" name="الإيرادات" fill="#f97316" radius={[4, 4, 0, 0]} opacity={0.9} />
                <Bar dataKey="cogs" name="التكاليف"    fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.7} />
                <Bar dataKey="net"  name="صافي الربح"  fill="#10b981" radius={[4, 4, 0, 0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Pie */}
        <Card title="توزيع الأرباح">
          <div className="p-3">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={PIE_DATA} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                  {PIE_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(v)} contentStyle={{ fontFamily: 'Tajawal', borderRadius: '12px', fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-1">
              {PIE_DATA.map(d => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-slate-500">{d.name}</span>
                  </div>
                  <span className="font-medium text-slate-700">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* P&L Statement */}
      <Card title="قائمة الدخل — من يناير إلى يوليو 2025">
        <div className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
          {rows.map((row, i) => (
            <div key={i}
              className={`flex items-center justify-between px-6 py-3.5 ${row.style === 'total' ? 'font-black text-base' : row.style === 'subtotal' ? 'font-bold' : ''}`}
              style={{ background: row.style === 'total' ? 'rgba(16,185,129,0.05)' : row.style === 'subtotal' ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
              <span className={row.style === 'header revenue' ? 'text-slate-800 font-semibold' : row.style === 'expense' ? 'text-slate-500 text-sm pr-4' : 'text-slate-700'}>
                {row.label}
              </span>
              <span style={{ color: row.value < 0 ? '#ef4444' : row.style === 'total' ? '#10b981' : row.style === 'subtotal' ? '#3b82f6' : '#1e293b' }}>
                {fmt(row.value, row.value < 0)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── TAB: Balance Sheet ───────────────────────────────────────
function BalanceSheet() {
  const totalAssets = BALANCE_SHEET.assets.flatMap(g => g.items).reduce((s, i) => s + i.balance, 0);
  const totalLiab   = BALANCE_SHEET.liabilities.flatMap(g => g.items).reduce((s, i) => s + i.balance, 0);
  const totalEquity = BALANCE_SHEET.equity.reduce((s, i) => s + i.balance, 0);
  const balanced    = Math.abs(totalAssets - (totalLiab + totalEquity)) < 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'إجمالي الأصول',    value: totalAssets,         color: '#3b82f6' },
          { label: 'إجمالي الخصوم',    value: totalLiab,           color: '#ef4444' },
          { label: 'حقوق الملكية',     value: totalEquity,         color: '#8b5cf6' },
        ].map(k => (
          <Card key={k.label} className="p-5">
            <p className="text-xs text-slate-400 mb-1">{k.label}</p>
            <p className="text-xl font-black" style={{ color: k.color }}>{fmt(k.value)}</p>
          </Card>
        ))}
      </div>

      {/* Balance equation check */}
      <div
        className="rounded-[1.5rem] px-5 py-3 flex items-center justify-between"
        style={{ background: balanced ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${balanced ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
        <span className="text-sm font-medium" style={{ color: balanced ? '#10b981' : '#ef4444' }}>
          {balanced ? '✓ الميزانية متوازنة — الأصول = الخصوم + حقوق الملكية' : '✗ الميزانية غير متوازنة'}
        </span>
        <span className="font-mono text-xs text-slate-400">{fmt(totalAssets)} = {fmt(totalLiab)} + {fmt(totalEquity)}</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Assets */}
        <Card title="الأصول">
          <div className="divide-y pb-2" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
            {BALANCE_SHEET.assets.map(group => (
              <React.Fragment key={group.name}>
                <div className="px-5 py-2.5 text-xs font-bold text-blue-500" style={{ background: 'rgba(59,130,246,0.04)' }}>{group.name}</div>
                {group.items.map(item => (
                  <div key={item.account} className="flex justify-between px-6 py-2.5 text-sm">
                    <span className="text-slate-600">{item.account}</span>
                    <span className="font-medium text-blue-600">{item.balance > 0 ? fmt(item.balance) : '—'}</span>
                  </div>
                ))}
              </React.Fragment>
            ))}
            <div className="flex justify-between px-5 py-3 font-bold" style={{ background: 'rgba(59,130,246,0.06)' }}>
              <span className="text-slate-700">إجمالي الأصول</span>
              <span className="text-blue-600">{fmt(totalAssets)}</span>
            </div>
          </div>
        </Card>

        {/* Liabilities + Equity */}
        <div className="space-y-4">
          <Card title="الخصوم">
            <div className="divide-y pb-2" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
              {BALANCE_SHEET.liabilities.map(group => (
                <React.Fragment key={group.name}>
                  <div className="px-5 py-2.5 text-xs font-bold text-rose-500" style={{ background: 'rgba(239,68,68,0.04)' }}>{group.name}</div>
                  {group.items.map(item => (
                    <div key={item.account} className="flex justify-between px-6 py-2.5 text-sm">
                      <span className="text-slate-600">{item.account}</span>
                      <span className="font-medium text-rose-500">{fmt(item.balance)}</span>
                    </div>
                  ))}
                </React.Fragment>
              ))}
              <div className="flex justify-between px-5 py-3 font-bold" style={{ background: 'rgba(239,68,68,0.06)' }}>
                <span className="text-slate-700">إجمالي الخصوم</span>
                <span className="text-rose-500">{fmt(totalLiab)}</span>
              </div>
            </div>
          </Card>
          <Card title="حقوق الملكية">
            <div className="divide-y pb-2" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
              {BALANCE_SHEET.equity.map(item => (
                <div key={item.account} className="flex justify-between px-5 py-2.5 text-sm">
                  <span className="text-slate-600">{item.account}</span>
                  <span className="font-medium text-violet-500">{fmt(item.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between px-5 py-3 font-bold" style={{ background: 'rgba(139,92,246,0.06)' }}>
                <span className="text-slate-700">إجمالي حقوق الملكية</span>
                <span className="text-violet-500">{fmt(totalEquity)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── TAB: Trial Balance ───────────────────────────────────────
function TrialBalance() {
  const totalDebit  = TRIAL_BALANCE.reduce((s, r) => s + r.debit, 0);
  const totalCredit = TRIAL_BALANCE.reduce((s, r) => s + r.credit, 0);
  const balanced    = Math.abs(totalDebit - totalCredit) < 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'إجمالي المدين',  value: totalDebit,  color: '#3b82f6' },
          { label: 'إجمالي الدائن', value: totalCredit, color: '#ef4444' },
          { label: 'الفرق',          value: Math.abs(totalDebit - totalCredit), color: balanced ? '#10b981' : '#ef4444' },
        ].map(k => (
          <Card key={k.label} className="p-5">
            <p className="text-xs text-slate-400 mb-1">{k.label}</p>
            <p className="text-xl font-black" style={{ color: k.color }}>{fmt(k.value)}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(0,0,0,0.02)' }}>
                <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 w-16">الكود</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-slate-400">الحساب</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-blue-400">مدين</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-rose-400">دائن</th>
              </tr>
            </thead>
            <tbody>
              {TRIAL_BALANCE.map(row => (
                <tr key={row.code} className="hover:bg-white/60 transition-colors" style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <td className="px-5 py-3 font-mono text-xs text-slate-400">{row.code}</td>
                  <td className="px-5 py-3 text-slate-700">{row.name}</td>
                  <td className="px-5 py-3 text-left font-medium text-blue-600">{row.debit > 0 ? fmt(row.debit) : '—'}</td>
                  <td className="px-5 py-3 text-left font-medium text-rose-500">{row.credit > 0 ? fmt(row.credit) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid rgba(0,0,0,0.08)', background: balanced ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)' }}>
                <td colSpan={2} className="px-5 py-3.5 font-black text-slate-700">الإجمالي</td>
                <td className="px-5 py-3.5 text-left font-black text-blue-600">{fmt(totalDebit)}</td>
                <td className="px-5 py-3.5 text-left font-black text-rose-500">{fmt(totalCredit)}</td>
              </tr>
              <tr>
                <td colSpan={4} className="px-5 py-2 text-center text-xs font-medium"
                  style={{ color: balanced ? '#10b981' : '#ef4444' }}>
                  {balanced ? '✓ ميزان المراجعة متوازن' : '✗ ميزان المراجعة غير متوازن'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── TAB: Cash Flow ───────────────────────────────────────────
function CashFlow() {
  const totalOp  = CASHFLOW_DATA.reduce((s, m) => s + m.operating, 0);
  const totalInv = CASHFLOW_DATA.reduce((s, m) => s + m.investing, 0);
  const totalFin = CASHFLOW_DATA.reduce((s, m) => s + m.financing, 0);
  const netCash  = totalOp + totalInv + totalFin;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'تدفقات التشغيل',   value: totalOp,  color: '#10b981' },
          { label: 'تدفقات الاستثمار', value: totalInv, color: '#f97316' },
          { label: 'تدفقات التمويل',   value: totalFin, color: '#8b5cf6' },
          { label: 'صافي التدفق النقدي', value: netCash, color: netCash >= 0 ? '#10b981' : '#ef4444' },
        ].map(k => (
          <Card key={k.label} className="p-5">
            <p className="text-xs text-slate-400 mb-1">{k.label}</p>
            <p className="text-xl font-black" style={{ color: k.color }}>{fmt(k.value, true)}</p>
          </Card>
        ))}
      </div>

      <Card title="التدفقات النقدية الشهرية">
        <div className="p-4">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={CASHFLOW_DATA} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'Tajawal' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v/1000}k`} />
              <Tooltip content={<ToolTipCmp />} />
              <Bar dataKey="operating" name="تشغيلي"  fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="investing" name="استثماري" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar dataKey="financing" name="تمويلي"   fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

// ─── Tab Config ───────────────────────────────────────────────
type Tab = 'pl' | 'bs' | 'tb' | 'cf';
const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'pl', label: 'قائمة الدخل',    icon: TrendingUp  },
  { id: 'bs', label: 'الميزانية العمومية', icon: Scale    },
  { id: 'tb', label: 'ميزان المراجعة', icon: Activity    },
  { id: 'cf', label: 'التدفق النقدي',  icon: BarChart2   },
];

// ─── Main Component ───────────────────────────────────────────
export function ProfitLossReport() {
  const [tab, setTab] = useState<Tab>('pl');

  return (
    <div className="p-6 space-y-5 min-h-screen" dir="rtl" style={{ fontFamily: 'Tajawal, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">التقارير المالية</h1>
          <p className="text-sm text-slate-400 mt-0.5">من يناير إلى يوليو 2025 — معتمدة على القيود المحاسبية</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium text-slate-600"
            style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Printer size={14} /> طباعة
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.3)' }}>
            <Download size={14} /> تصدير PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-1 p-1 rounded-2xl w-fit"
        style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: tab === t.id ? 'white' : 'transparent',
              color: tab === t.id ? '#1e293b' : '#94a3b8',
              boxShadow: tab === t.id ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
            }}>
            <t.icon size={15} style={{ color: tab === t.id ? '#f97316' : '#94a3b8' }} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'pl' && <ProfitLoss />}
      {tab === 'bs' && <BalanceSheet />}
      {tab === 'tb' && <TrialBalance />}
      {tab === 'cf' && <CashFlow />}
    </div>
  );
}
