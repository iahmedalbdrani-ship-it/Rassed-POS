// ============================================================
// Control Panel (رصيد) — Invoices Dashboard (Supabase edition)
// ─ Single source of truth: Supabase PostgreSQL
// ─ Realtime subscription: new POS invoices appear instantly
// ─ Search by invoice number + date range + status filter
// ─ Re-preview any invoice via the shared InvoicePreviewModal
// ─ "تحويل إلى مرتجع" flags the invoice as REFUNDED
// ─ White Glassmorphism · Tajawal · rounded-[2.5rem]
// ============================================================
//
// Placement: src/pages/InvoicesPageSupabase.tsx
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, FileText, RefreshCw, Eye, Undo2, CheckCircle,
  XCircle, AlertCircle, Clock, Calendar, Filter, Wifi, WifiOff,
  Hash, Loader2, ReceiptText,
} from 'lucide-react';

import {
  invoicesService,
  type Invoice,
  type InvoiceStatus,
} from '../lib/supabase';
import { settingsService, type StoreSettings } from '../lib/supabase-services';
import InvoicePreviewModal, {
  type PreviewInvoice, type PreviewStore, type PreviewItem,
} from '../components/pos/InvoicePreviewModal';

// ─── Status visual config ───────────────────────────────────

const STATUS_CFG: Record<InvoiceStatus, {
  label: string; color: string; bg: string; border: string; icon: React.ElementType;
}> = {
  DRAFT:     { label: 'مسودة',   color: '#475569', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', icon: FileText    },
  PENDING:   { label: 'معلقة',   color: '#b45309', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)',  icon: Clock       },
  CLEARED:   { label: 'مدفوعة',  color: '#059669', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.35)',  icon: CheckCircle },
  REPORTED:  { label: 'مُرسلة',  color: '#2563eb', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)',  icon: CheckCircle },
  REJECTED:  { label: 'مرفوضة',  color: '#dc2626', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',   icon: XCircle     },
  CANCELLED: { label: 'ملغاة',   color: '#475569', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', icon: XCircle     },
  REFUNDED:  { label: 'مرتجع',   color: '#e11d48', bg: 'rgba(244,63,94,0.12)',   border: 'rgba(244,63,94,0.35)',   icon: Undo2       },
};

// ─── Formatters ─────────────────────────────────────────────

const money = (n?: number | null, currency = 'ر.س') =>
  `${Number(n ?? 0).toFixed(2)} ${currency}`;

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('ar-SA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch { return iso; }
};

// Very small debounce hook — keeps search responsive without spamming Supabase.
const useDebouncedValue = <T,>(value: T, delay = 350): T => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
};

// ══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

const InvoicesPageSupabase: React.FC = () => {
  // ── State ────────────────────────────────────────────────
  const [invoices,  setInvoices]  = useState<Invoice[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [settings,  setSettings]  = useState<StoreSettings | null>(null);

  const [query,      setQuery]     = useState('');
  const [dateFrom,   setDateFrom]  = useState('');
  const [dateTo,     setDateTo]    = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'ALL'>('ALL');

  const debouncedQuery = useDebouncedValue(query, 300);

  const [preview,  setPreview]  = useState<PreviewInvoice | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [toast,    setToast]    = useState<string | null>(null);

  const subRef = useRef<ReturnType<typeof invoicesService.subscribeChanges> | null>(null);

  // ── Load settings once ───────────────────────────────────
  useEffect(() => {
    settingsService.get()
      .then(setSettings)
      .catch(err => console.warn('[InvoicesPage] settings load failed:', err.message));
  }, []);

  // ── Fetch invoices (called on mount + filter changes) ────
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoicesService.search({
        query:  debouncedQuery || undefined,
        from:   dateFrom       || undefined,
        to:     dateTo         || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        limit:  200,
      });
      setInvoices(data);
    } catch (err: any) {
      setError(err.message ?? 'تعذّر تحميل الفواتير');
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, dateFrom, dateTo, statusFilter]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // ── Realtime subscription ────────────────────────────────
  useEffect(() => {
    subRef.current = invoicesService.subscribeChanges(({ event, row }) => {
      if (!row) return;
      setInvoices(prev => {
        if (event === 'INSERT') {
          // Newest first — avoid duplicates in case our fetch already has it.
          if (prev.find(p => p.id === row.id)) return prev;
          return [row, ...prev];
        }
        if (event === 'UPDATE') {
          return prev.map(p => (p.id === row.id ? { ...p, ...row } : p));
        }
        if (event === 'DELETE') {
          return prev.filter(p => p.id !== row.id);
        }
        return prev;
      });
    });
    return () => {
      try { subRef.current?.unsubscribe(); } catch { /* noop */ }
      subRef.current = null;
    };
  }, []);

  // ── Online / offline indicator ───────────────────────────
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online',  on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // ── Build the PreviewStore once settings arrive ──────────
  const previewStore: PreviewStore = useMemo(() => ({
    name:       settings?.name_ar || 'المتجر',
    name_en:    settings?.name_en,
    vat_number: settings?.vat_number ?? '',
    cr_number:  settings?.cr_number,
    address:    settings?.address,
    phone:      settings?.phone,
    email:      settings?.email,
    logo_url:   settings?.logo_url,
    currency:   settings?.currency ?? 'ر.س',
    zatca_env:  settings?.zatca_env ?? 'sandbox',
  }), [settings]);

  // ── Re-preview handler ───────────────────────────────────
  const openPreview = useCallback(async (id: string) => {
    setPreviewLoading(true);
    setError(null);
    try {
      const full = await invoicesService.getById(id);
      const items: PreviewItem[] = (full.invoice_lines ?? []).map((l: any) => ({
        name:         l.item_name_ar,
        barcode:      l.item_code ?? undefined,
        qty:          Number(l.quantity),
        unit_price:   Number(l.unit_price),
        discount_pct: Number(l.discount_pct ?? 0),
        vat_rate:     Number(l.vat_rate ?? 15),
        vat_amount:   Number(l.vat_amount ?? 0),
        line_total:   Number(l.line_total ?? 0),
      }));
      const payment = (full.payment_means ?? '').toString().toLowerCase();
      const payLabel =
        payment.includes('cash')   ? 'نقدي'   :
        payment.includes('mada')   ? 'مدى'     :
        payment.includes('visa')   ? 'فيزا'    :
        payment.includes('credit') ? 'بطاقة ائتمان' :
        payment.includes('bank')   ? 'تحويل بنكي' : (full.payment_means ?? '—');

      const statusKey: PreviewInvoice['status'] =
        full.invoice_status === 'REFUNDED'  ? 'refunded'
      : full.invoice_status === 'CANCELLED' ? 'cancelled'
      : 'paid';

      setPreview({
        invoice_number:  full.invoice_number,
        created_at:      full.created_at,
        branch_name:     undefined,
        items,
        subtotal_ex_vat: Number(full.subtotal ?? 0),
        total_discount:  Number(full.discount_amount ?? 0),
        total_vat:       Number(full.vat_amount ?? 0),
        grand_total:     Number(full.total_amount ?? 0),
        payment_label:   payLabel,
        zatca_qr:        full.qr_code ?? '',
        status:          statusKey,
      });
    } catch (err: any) {
      setError(`تعذّر تحميل الفاتورة: ${err.message ?? err}`);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // ── Refund handler ───────────────────────────────────────
  const handleRefund = useCallback(async (inv: Invoice) => {
    if (!window.confirm(`هل تريد تحويل الفاتورة ${inv.invoice_number} إلى مرتجع؟`)) return;
    setRefunding(inv.id);
    try {
      await invoicesService.markRefunded(inv.id, 'Refund via dashboard');
      setToast(`تم تحويل الفاتورة ${inv.invoice_number} إلى مرتجع`);
      setTimeout(() => setToast(null), 2500);
    } catch (err: any) {
      setError(err.message ?? 'تعذّر إتمام المرتجع');
    } finally {
      setRefunding(null);
    }
  }, []);

  // ── Derived totals ──────────────────────────────────────
  const stats = useMemo(() => {
    const total    = invoices.reduce((s, i) => s + Number(i.total_amount ?? 0), 0);
    const vat      = invoices.reduce((s, i) => s + Number(i.vat_amount ?? 0), 0);
    const refunded = invoices.filter(i => i.invoice_status === 'REFUNDED').length;
    return { count: invoices.length, total, vat, refunded };
  }, [invoices]);

  // ── Styles ──────────────────────────────────────────────
  const glassBase: React.CSSProperties = {
    background: 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.4) 100%)',
    backdropFilter:       'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border:               '1px solid rgba(255,255,255,0.55)',
    boxShadow:            '0 8px 32px rgba(0,0,0,0.06)',
    borderRadius:         '2.5rem',
  };

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 40%, #fff7ed 100%)',
        fontFamily: "'Tajawal', sans-serif",
        padding: '1.5rem',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
        @keyframes rowIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes toastIn { from { opacity: 0; transform: translate(-50%, -10px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .inv-row { animation: rowIn 0.22s ease both; }
        .inv-row:hover { background: rgba(245,158,11,0.06) !important; }
        .floating-icon { transition: transform .35s; }
        .floating-icon:hover { transform: translateY(-2px) rotate(-4deg); }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{
        ...glassBase,
        padding: '1.1rem 1.4rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div className="floating-icon" style={{
            width: 48, height: 48, borderRadius: '1.1rem',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 10px 28px rgba(245,158,11,0.35)',
          }}>
            <ReceiptText size={22} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontWeight: 900, fontSize: '1.3rem', color: '#0f172a' }}>
              سجل الفواتير
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              مصدر البيانات: Supabase · تحديث لحظي
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <StatChip label="إجمالي الفواتير" value={`${stats.count}`} />
          <StatChip label="إجمالي المبيعات" value={money(stats.total, previewStore.currency)} />
          <StatChip label="الضريبة" value={money(stats.vat, previewStore.currency)} />
          <StatChip label="المرتجعات" value={`${stats.refunded}`} accent="#e11d48" />

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.35rem 0.75rem',
            borderRadius: 999,
            background: isOnline ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${isOnline ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`,
            color: isOnline ? '#059669' : '#dc2626',
            fontSize: 11, fontWeight: 800,
          }}>
            {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            {isOnline ? 'متصل' : 'غير متصل'}
          </div>

          <button
            onClick={fetchInvoices}
            disabled={loading}
            title="تحديث"
            style={{
              background: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: '0.9rem',
              padding: '0.5rem 0.8rem',
              display: 'flex', alignItems: 'center', gap: 6,
              color: '#0f172a', fontFamily: 'inherit', cursor: 'pointer',
              fontWeight: 700, fontSize: 12,
            }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            تحديث
          </button>
        </div>
      </header>

      {/* ── FILTERS BAR ── */}
      <section style={{ ...glassBase, padding: '1rem 1.2rem', marginBottom: '1rem' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 1.2fr) repeat(3, minmax(150px, 1fr))',
          gap: '0.75rem',
        }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}/>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="بحث برقم الفاتورة…"
              style={inputStyle}
            />
          </div>

          <div style={{ position: 'relative' }}>
            <Calendar size={14} style={iconAdorn}/>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{ ...inputStyle, paddingRight: 36 }}
              aria-label="من تاريخ"
            />
          </div>

          <div style={{ position: 'relative' }}>
            <Calendar size={14} style={iconAdorn}/>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{ ...inputStyle, paddingRight: 36 }}
              aria-label="إلى تاريخ"
            />
          </div>

          <div style={{ position: 'relative' }}>
            <Filter size={14} style={iconAdorn}/>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as InvoiceStatus | 'ALL')}
              style={{ ...inputStyle, paddingRight: 36, appearance: 'none' }}
            >
              <option value="ALL">جميع الحالات</option>
              {(Object.keys(STATUS_CFG) as InvoiceStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_CFG[s].label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── TABLE ── */}
      <section style={{ ...glassBase, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{
              background: 'rgba(245,158,11,0.08)',
              position: 'sticky', top: 0,
            }}>
              <tr>
                <th style={th}>#</th>
                <th style={{ ...th, textAlign: 'right' }}>رقم الفاتورة</th>
                <th style={th}>التاريخ</th>
                <th style={th}>الإجمالي</th>
                <th style={th}>الضريبة</th>
                <th style={th}>الحالة</th>
                <th style={{ ...th, textAlign: 'left' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && invoices.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem' }}>
                    <Loader2 size={22} style={{ margin: '0 auto', color: '#f59e0b', animation: 'spin 0.8s linear infinite' }} />
                    <div style={{ marginTop: 8, color: '#64748b' }}>جاري تحميل الفواتير…</div>
                  </td>
                </tr>
              )}

              {!loading && invoices.length === 0 && !error && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ fontSize: '3rem' }} className="floating-icon">📄</div>
                    <div style={{ fontWeight: 800, color: '#334155', marginTop: 8 }}>
                      لا توجد فواتير مطابقة
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                      جرّب توسيع نطاق البحث أو التاريخ
                    </div>
                  </td>
                </tr>
              )}

              {error && (
                <tr>
                  <td colSpan={7} style={{ padding: '1.25rem', color: '#dc2626' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                      <AlertCircle size={16} />
                      {error}
                    </div>
                  </td>
                </tr>
              )}

              {invoices.map((inv, i) => {
                const cfg = STATUS_CFG[inv.invoice_status] ?? STATUS_CFG.DRAFT;
                const StatusIcon = cfg.icon;
                return (
                  <tr
                    key={inv.id}
                    className="inv-row"
                    style={{ borderTop: '1px solid rgba(0,0,0,0.05)', transition: 'background .15s' }}
                  >
                    <td style={td}>{i + 1}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: "'Courier New', monospace", fontWeight: 800 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Hash size={12} color="#94a3b8" />
                        {inv.invoice_number}
                      </div>
                    </td>
                    <td style={td}>{fmtDate(inv.issue_date)}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{money(inv.total_amount, previewStore.currency)}</td>
                    <td style={td}>{money(inv.vat_amount, previewStore.currency)}</td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '0.25rem 0.7rem',
                        background: cfg.bg, color: cfg.color,
                        border: `1px solid ${cfg.border}`,
                        borderRadius: 999, fontWeight: 800, fontSize: 11,
                      }}>
                        <StatusIcon size={12} />
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          onClick={() => openPreview(inv.id)}
                          disabled={previewLoading}
                          style={actionBtn('#2563eb')}
                          title="إعادة المعاينة"
                        >
                          <Eye size={14} />
                          معاينة
                        </button>
                        {inv.invoice_status !== 'REFUNDED' && inv.invoice_status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleRefund(inv)}
                            disabled={refunding === inv.id}
                            style={actionBtn('#e11d48')}
                            title="تحويل إلى مرتجع"
                          >
                            {refunding === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
                            مرتجع
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Preview loading overlay */}
      {previewLoading && !preview && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2400,
          background: 'rgba(15,23,42,0.35)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.92)',
            padding: '1.25rem 1.5rem', borderRadius: '1.5rem',
            display: 'flex', alignItems: 'center', gap: 10,
            fontWeight: 800, color: '#0f172a',
            boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
          }}>
            <Loader2 size={18} style={{ animation: 'spin .8s linear infinite' }} />
            جاري تجهيز المعاينة…
          </div>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <InvoicePreviewModal
          invoice={preview}
          store={previewStore}
          title="إعادة معاينة الفاتورة"
          onClose={() => setPreview(null)}
          onAfterPrint={() => {
            setToast('✅ تمت طباعة الفاتورة');
            setTimeout(() => setToast(null), 2500);
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 22, left: '50%',
          zIndex: 3000,
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          color: '#f1f5f9',
          padding: '0.7rem 1.3rem',
          borderRadius: '1rem',
          fontWeight: 800, fontSize: 13,
          boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
          animation: 'toastIn .22s ease both',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
};

// ─── Small presentational helpers ───────────────────────────

const th: React.CSSProperties = {
  padding: '0.85rem 0.75rem',
  textAlign: 'center',
  fontSize: 12,
  fontWeight: 900,
  color: '#92400e',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '0.7rem 0.75rem',
  textAlign: 'center',
  fontSize: 13,
  color: '#0f172a',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 2.25rem 0.65rem 0.85rem',
  background: 'rgba(255,255,255,0.7)',
  border: '1.5px solid rgba(0,0,0,0.08)',
  borderRadius: '0.9rem',
  outline: 'none',
  fontSize: 13,
  color: '#0f172a',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const iconAdorn: React.CSSProperties = {
  position: 'absolute',
  right: 12, top: '50%',
  transform: 'translateY(-50%)',
  color: '#94a3b8',
  pointerEvents: 'none',
};

const actionBtn = (color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '0.4rem 0.7rem',
  background: 'rgba(255,255,255,0.75)',
  border: `1px solid ${color}55`,
  color,
  borderRadius: '0.75rem',
  fontSize: 12, fontWeight: 800,
  fontFamily: 'inherit',
  cursor: 'pointer',
});

const StatChip: React.FC<{ label: string; value: string; accent?: string }> = ({ label, value, accent }) => (
  <div style={{
    padding: '0.35rem 0.85rem',
    borderRadius: '0.9rem',
    background: 'rgba(255,255,255,0.7)',
    border: '1px solid rgba(0,0,0,0.06)',
    lineHeight: 1.1,
  }}>
    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{label}</div>
    <div style={{ fontSize: 13, color: accent ?? '#0f172a', fontWeight: 900 }}>{value}</div>
  </div>
);

export default InvoicesPageSupabase;
