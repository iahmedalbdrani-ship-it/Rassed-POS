// ============================================================
// Control Panel (رصيد) — Dashboard Page
// Tabs: Overview · Transactions · Ledger · Audit
// ============================================================

import type { Transaction, TabId } from '../types';
import { STATUS_META, fmt, fmtShort, LEDGER_MOCK } from '../constants/theme';
import { GlassPanel, KpiCard, CashflowChart } from '../components/ui';

interface DashboardProps {
  txs:        Transaction[];
  onTabChange: (tab: TabId) => void;
  onNewEntry:  () => void;
  activeTab:   TabId;
}

// ─── P&L summary rows ────────────────────────────────────────
function PLRows({ income, expense, net, vat }: {
  income: number; expense: number; net: number; vat: number;
}) {
  const rows = [
    { label: 'إجمالي الدخل',     value:  income,  color: '#34d399', pct: 100 },
    { label: 'المصروفات',         value: -expense, color: '#f87171', pct: income ? (expense / income) * 100 : 0 },
    { label: 'صافي الربح',        value:  net,     color: '#a78bfa', pct: income ? (net / income) * 100 : 0 },
    { label: 'ضريبة ق.م متوقعة', value: -vat,     color: '#fb923c', pct: 15 },
  ];

  return (
    <div className="px-5 pb-5 space-y-4">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-slate-500">{r.label}</span>
            <span style={{ color: r.color }} className="font-medium">
              {r.value < 0 ? '-' : ''}{fmtShort(Math.abs(r.value))} ﷼
            </span>
          </div>
          <div className="h-0.5 rounded-full bg-slate-800/80">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(Math.abs(r.pct), 100)}%`, background: r.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── DASHBOARD TAB ───────────────────────────────────────────
function DashboardOverview({ txs, onTabChange, onNewEntry }: Omit<DashboardProps, 'activeTab'>) {
  const totalIncome  = txs.filter(t => t.type === 'income').reduce((s, t) => s + +t.amount, 0);
  const totalExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + +t.amount, 0);
  const netBalance   = totalIncome - totalExpense;
  const vatEst       = totalIncome * 0.15;

  const sparkIncome = txs.slice(0, 7).map(t => t.type === 'income' ? +t.amount : 0).reverse();
  const sparkNet    = [0.7, 0.8, 0.75, 0.9, 0.85, 0.95, 1].map(f => netBalance * f);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">لوحة التحكم المالية</h1>
          <p className="text-[12px] text-slate-600 mt-0.5">
            {new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onNewEntry}
            className="px-4 py-1.5 rounded-xl text-[12px] font-semibold text-black transition-all hover:scale-[1.03] active:scale-[0.97]"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 3px 14px #f59e0b30' }}
          >
            + قيد جديد
          </button>
          <span className="text-[11px] text-slate-600">{txs.length} عملية مسجلة</span>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon="📈" label="إجمالي الدخل"       value={totalIncome}  sub="من الحركات المسجلة"
          delta={18.4} spark={sparkIncome.length ? sparkIncome : [1,2,3,4,5,6,7]} accent="#10b981" />
        <KpiCard icon="💰" label="الرصيد الصافي"       value={netBalance}   sub="دخل ناقص مصروفات"
          spark={sparkNet} accent="#6366f1" />
        <KpiCard icon="📋" label="إجمالي المصروفات"    value={totalExpense} sub="كل العمليات الخارجية"
          spark={[80,95,88,100,91,87,91]} accent="#f59e0b" />
        <KpiCard icon="🏛️" label="ضريبة ق.م المتوقعة" value={vatEst}       sub="تقدير 15% من الدخل"
          accent="#f43f5e" />
      </div>

      {/* Mid row */}
      <div className="grid grid-cols-3 gap-3">
        <GlassPanel className="col-span-2" title="التدفق النقدي — آخر 7 أشهر">
          <div className="px-5 pb-5">
            <CashflowChart />
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 rounded bg-emerald-400 inline-block" />
                <span className="text-[10px] text-slate-500">التدفق الداخل</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 rounded bg-red-400 inline-block" />
                <span className="text-[10px] text-slate-500">التدفق الخارج</span>
              </div>
              <span className="mr-auto text-[10px] text-slate-600">
                صافي أبريل: <span className="text-emerald-400 font-medium">137,550 ر.س</span>
              </span>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel title="ملخص الأرباح والخسائر">
          <PLRows income={totalIncome} expense={totalExpense} net={netBalance} vat={vatEst} />
        </GlassPanel>
      </div>

      {/* Recent transactions */}
      <GlassPanel
        title={`آخر العمليات (${txs.length})`}
        action={
          <button
            onClick={() => onTabChange('transactions')}
            className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
          >
            عرض الكل ←
          </button>
        }
      >
        <div className="px-2 pb-3">
          {txs.length === 0 ? (
            <div className="text-center py-10 text-slate-600 text-[13px]">
              لا توجد عمليات بعد — أضف قيداً جديداً
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr>
                  {['المعرف', 'الوصف', 'النوع', 'المبلغ', 'التاريخ'].map(h => (
                    <th key={h} className="text-right text-slate-600 font-normal px-4 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txs.slice(0, 6).map(tx => {
                  const s = STATUS_META[tx.type] ?? STATUS_META['DRAFT'];
                  return (
                    <tr key={tx.id} className="border-t border-slate-800/50 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5 font-mono text-slate-600 text-[10px]">#{tx.id?.slice(0, 6)}</td>
                      <td className="px-4 py-2.5 text-slate-300 max-w-[180px] truncate">{tx.description}</td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1" style={{ color: s.text }}>
                          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: s.dot }} />
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-semibold"
                        style={{ color: tx.type === 'income' ? '#34d399' : '#f87171' }}>
                        {tx.type === 'income' ? '+' : '-'}{fmt(Math.abs(+tx.amount))}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-[10px]">
                        {new Date(tx.created_at).toLocaleDateString('ar-SA')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </GlassPanel>

      {/* Status strip */}
      <div
        className="rounded-[1.4rem] px-5 py-3 flex items-center justify-between"
        style={{ background: 'rgba(10,19,38,0.45)', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Supabase متصل • مباشر
          </span>
          <span className="text-[11px] text-slate-600">
            الفترة: <span className="text-slate-400">أبريل 2025</span>
          </span>
        </div>
        <span className="text-[10px] text-slate-600 font-mono">{new Date().toLocaleTimeString('ar-SA')}</span>
      </div>
    </div>
  );
}

// ─── TRANSACTIONS TAB ─────────────────────────────────────────
function TransactionsPage({ txs, onNewEntry }: { txs: Transaction[]; onNewEntry: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">سجل العمليات</h1>
        <button
          onClick={onNewEntry}
          className="px-5 py-2 rounded-xl text-[13px] font-semibold text-black"
          style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 4px 16px #f59e0b35' }}
        >
          + إضافة قيد
        </button>
      </div>
      <GlassPanel>
        <div className="p-1">
          {txs.length === 0 ? (
            <div className="py-16 text-center text-slate-600 text-[13px]">لا توجد عمليات — ابدأ بإضافة أول قيد</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr>
                  {['المعرف', 'الوصف', 'النوع', 'المبلغ', 'التاريخ'].map(h => (
                    <th key={h} className="text-right text-slate-600 font-normal px-5 py-3 border-b border-slate-800/60">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txs.map(tx => {
                  const s = STATUS_META[tx.type] ?? STATUS_META['DRAFT'];
                  return (
                    <tr key={tx.id} className="border-b border-slate-800/40 hover:bg-white/[0.025] transition-colors">
                      <td className="px-5 py-3.5 font-mono text-slate-600 text-[10px]">#{tx.id?.slice(0, 8)}</td>
                      <td className="px-5 py-3.5 text-slate-200">{tx.description}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium"
                          style={{ color: s.text, background: `${s.dot}15` }}
                        >
                          <span className="w-1 h-1 rounded-full" style={{ background: s.dot }} />
                          {s.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-[13px]"
                        style={{ color: tx.type === 'income' ? '#34d399' : '#f87171' }}>
                        {tx.type === 'income' ? '+' : '-'}{fmt(Math.abs(+tx.amount))}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 text-[11px]">
                        {new Date(tx.created_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}

// ─── LEDGER TAB ───────────────────────────────────────────────
function LedgerPage() {
  const debit  = LEDGER_MOCK.filter(a => ['أصول', 'مصروفات'].includes(a.type)).reduce((s, a) => s + a.balance, 0);
  const credit = LEDGER_MOCK.filter(a => ['إيرادات', 'التزامات'].includes(a.type)).reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">الأستاذ العام</h1>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {LEDGER_MOCK.map((acc, i) => (
          <GlassPanel key={i} className="p-5 cursor-pointer hover:scale-[1.02] transition-transform duration-200" glow={acc.color}>
            <div className="text-[9px] text-slate-600 font-mono mb-1">{acc.code}</div>
            <div className="text-[12px] text-slate-400 mb-3 leading-snug">{acc.name}</div>
            <div className="text-xl font-semibold text-white">{fmtShort(acc.balance)}</div>
            <div className="text-[9px] text-slate-600 mt-0.5">ريال سعودي</div>
            <div className="mt-3 pt-2.5 border-t border-slate-800/60">
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                style={{ color: acc.color, background: `${acc.color}15` }}
              >
                {acc.type}
              </span>
            </div>
          </GlassPanel>
        ))}
      </div>

      <GlassPanel title="ميزان المراجعة">
        <div className="px-5 pb-5">
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'إجمالي المدين', value: debit,  color: '#34d399' },
              { label: 'إجمالي الدائن', value: credit, color: '#60a5fa' },
            ].map((item, i) => (
              <div key={i} className="rounded-2xl p-4"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-[11px] text-slate-500 mb-1">{item.label}</div>
                <div className="text-lg font-semibold" style={{ color: item.color }}>{fmt(item.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

// ─── AUDIT TAB ────────────────────────────────────────────────
function AuditPage({ txs }: { txs: Transaction[] }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">سجل العمليات الكامل</h1>
      <GlassPanel>
        <div className="p-3 space-y-0.5">
          {txs.length === 0 ? (
            <div className="py-10 text-center text-slate-600 text-[13px]">لا توجد عمليات مسجلة</div>
          ) : txs.map(tx => (
            <div
              key={tx.id}
              className="flex items-start gap-3 p-3.5 rounded-2xl hover:bg-white/[0.025] transition-colors border-b border-slate-800/30"
            >
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                style={{
                  background: tx.type === 'income' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                  color:      tx.type === 'income' ? '#34d399' : '#f87171',
                }}
              >
                {tx.type === 'income' ? '+' : '−'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-slate-200 truncate">{tx.description}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {new Date(tx.created_at).toLocaleString('ar-SA')}
                </p>
              </div>
              <span
                className="font-semibold text-[12px] flex-shrink-0"
                style={{ color: tx.type === 'income' ? '#34d399' : '#f87171' }}
              >
                {tx.type === 'income' ? '+' : '-'}{fmt(Math.abs(+tx.amount))}
              </span>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────
export default function Dashboard({ txs, onTabChange, onNewEntry, activeTab }: DashboardProps) {
  return (
    <>
      {activeTab === 'dashboard'    && <DashboardOverview txs={txs} onTabChange={onTabChange} onNewEntry={onNewEntry} />}
      {activeTab === 'transactions' && <TransactionsPage  txs={txs} onNewEntry={onNewEntry} />}
      {activeTab === 'ledger'       && <LedgerPage />}
      {activeTab === 'audit'        && <AuditPage txs={txs} />}
    </>
  );
}
