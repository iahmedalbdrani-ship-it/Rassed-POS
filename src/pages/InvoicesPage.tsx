// ============================================================
// Control Panel (رصيد) — Invoices Page (الفواتير) v3
// Real Firestore data | Loading Skeletons | Error Boundary
// Instant Invoice Preview | XML/PDF Download | ZATCA actions
// Create Invoice Drawer | Snackbar feedback
// ============================================================
//
// Placement: src/pages/InvoicesPage.tsx
//
// Data flow:
//   useInvoices()      → real-time Firestore list
//   useCreateInvoice() → calls createInvoice Cloud Function
//   InvoiceModal       → uses cached Invoice from list (instant display)
// ============================================================

import React, {
  useState, useRef, useCallback, useEffect,
  type ReactNode,
} from 'react';
import { useReactToPrint }   from 'react-to-print';
import { QRCodeCanvas }      from 'qrcode.react';
import Barcode               from 'react-barcode';
import {
  Search, Plus, Eye, Download, Send, CheckCircle, Clock,
  AlertCircle, XCircle, Filter, X, FileText,
  Printer, RefreshCw, Loader2, WifiOff, AlertTriangle,
  Trash2, Hash,
  Copy, CheckCheck,
} from 'lucide-react';
import {
  useInvoices, useCreateInvoice,
  type Invoice, type ZatcaStatus, type InvoiceStatus,
  type CreateInvoiceInput, type CreateInvoiceLineInput,
} from '../hooks/useInvoices';
import { auth } from '../lib/firebase';

// ─── Auth context (reads from Firebase Auth directly) ────────
function useCurrentUser() {
  const [orgId, setOrgId] = useState<string | null>(null);
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) { setOrgId(null); return; }
      // In production, read org_id from Firestore user_profile
      // For now, use custom claim or stored value
      const tokenResult = await user.getIdTokenResult();
      setOrgId((tokenResult.claims['org_id'] as string | undefined) ?? null);
    });
    return () => unsubscribe();
  }, []);
  return { orgId };
}

// ─── Format helpers ───────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 2 }).format(n);
const fmtShort = (n: number) =>
  new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(n);

// ─── Status configs ───────────────────────────────────────────
const ZATCA_CFG: Record<ZatcaStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  cleared:  { label: 'مقبولة ✓',   color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: CheckCircle },
  reported: { label: 'مُرسلة',      color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: CheckCircle },
  pending:  { label: 'معلقة',       color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: Clock       },
  rejected: { label: 'مرفوضة ✗',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  icon: XCircle     },
  warning:  { label: 'تحذير ⚠',    color: '#f97316', bg: 'rgba(249,115,22,0.1)', icon: AlertCircle },
};

const INV_CFG: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'مسودة',    color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
  PENDING:   { label: 'معلقة',    color: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
  CLEARED:   { label: 'مقبولة',   color: '#10b981', bg: 'rgba(16,185,129,0.08)'  },
  REPORTED:  { label: 'مُرسلة',   color: '#3b82f6', bg: 'rgba(59,130,246,0.08)'  },
  REJECTED:  { label: 'مرفوضة',   color: '#ef4444', bg: 'rgba(239,68,68,0.08)'   },
  CANCELLED: { label: 'ملغاة',    color: '#ef4444', bg: 'rgba(239,68,68,0.08)'   },
};

// ─── Glassmorphism card style ─────────────────────────────────
const glass = {
  background:          'rgba(255,255,255,0.65)',
  backdropFilter:      'blur(20px)',
  WebkitBackdropFilter:'blur(20px)',
  border:              '1px solid rgba(255,255,255,0.8)',
  boxShadow:           '0 4px 20px rgba(0,0,0,0.04)',
} as const;

// ═══════════════════════════════════════════════════════════
// ── ERROR BOUNDARY ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

interface ErrorBoundaryState { hasError: boolean; error: Error | null }

class InvoicesErrorBoundary extends React.Component<
  { children: ReactNode; fallback?: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[InvoicesPage] Uncaught error:', error, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center py-20 gap-4" dir="rtl">
          <AlertTriangle size={40} className="text-rose-400" />
          <p className="text-slate-600 text-sm font-medium">حدث خطأ غير متوقع في صفحة الفواتير</p>
          <p className="text-slate-400 text-xs max-w-xs text-center">
            {this.state.error?.message ?? 'خطأ مجهول'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded-xl text-sm text-white font-medium"
            style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)' }}>
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════════════
// ── SNACKBAR (Toast notification) ──────────────────────────
// ═══════════════════════════════════════════════════════════

type SnackType = 'success' | 'error' | 'warning';

interface SnackbarProps {
  message:  string;
  type:     SnackType;
  onClose:  () => void;
}

function Snackbar({ message, type, onClose }: SnackbarProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4500);
    return () => clearTimeout(timer);
  }, [onClose]);

  const configs: Record<SnackType, { bg: string; icon: React.ElementType }> = {
    success: { bg: 'linear-gradient(135deg,#10b981,#059669)', icon: CheckCircle  },
    error:   { bg: 'linear-gradient(135deg,#ef4444,#dc2626)', icon: XCircle      },
    warning: { bg: 'linear-gradient(135deg,#f59e0b,#d97706)', icon: AlertCircle  },
  };

  const { bg, icon: Icon } = configs[type];

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl text-white text-sm font-medium shadow-2xl animate-in slide-in-from-bottom-4"
      style={{ background: bg, maxWidth: '360px' }}
      dir="rtl"
    >
      <Icon size={18} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="text-white/70 hover:text-white ml-1">
        <X size={15} />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── SKELETON LOADERS ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

function SkeletonCell({ w = 'w-24' }: { w?: string }) {
  return <div className={`h-4 ${w} rounded-md bg-slate-100 animate-pulse`} />;
}

function InvoiceTableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
          <td className="px-5 py-4"><SkeletonCell w="w-32" /></td>
          <td className="px-5 py-4"><SkeletonCell w="w-28" /></td>
          <td className="px-5 py-4"><SkeletonCell w="w-20" /></td>
          <td className="px-5 py-4"><SkeletonCell w="w-24" /></td>
          <td className="px-5 py-4"><SkeletonCell w="w-20" /></td>
          <td className="px-5 py-4"><SkeletonCell w="w-20" /></td>
          <td className="px-5 py-4"><SkeletonCell w="w-16" /></td>
        </tr>
      ))}
    </>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-[1.5rem] p-4" style={glass}>
      <div className="h-3 w-24 rounded bg-slate-100 animate-pulse mb-2" />
      <div className="h-6 w-20 rounded bg-slate-100 animate-pulse" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── ERROR STATE ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

function InvoicesErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  const isOffline = error.includes('إنترنت') || error.includes('اتصال');
  const Icon      = isOffline ? WifiOff : AlertTriangle;

  return (
    <tr>
      <td colSpan={7} className="px-5 py-16 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
               style={{ background: 'rgba(239,68,68,0.08)' }}>
            <Icon size={26} className="text-rose-400" />
          </div>
          <p className="text-slate-600 text-sm font-medium">{error}</p>
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-slate-600 border border-slate-200 hover:border-slate-300 transition-all">
            <RefreshCw size={13} /> إعادة المحاولة
          </button>
        </div>
      </td>
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════
// ── PRINTABLE INVOICE ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

const PrintableInvoice = React.forwardRef<HTMLDivElement, { inv: Invoice }>(({ inv }, ref) => (
  <div ref={ref}
    className="p-6 w-[210mm] bg-white text-black font-['Tajawal'] text-[12px] print:text-[11px]"
    dir="rtl">
    <div className="flex justify-between items-start border-b-2 border-gray-200 pb-5 mb-5">
      <div>
        <h1 className="text-2xl font-black text-gray-800">فاتورة ضريبية</h1>
        <p className="text-gray-500 mt-1">Tax Invoice — ZATCA Phase 2</p>
      </div>
      <div className="text-right">
        <p className="text-xl font-black text-orange-600">{inv.invoice_number}</p>
        <p className="text-gray-500 text-xs mt-1">UUID: {inv.uuid.slice(0, 20)}...</p>
        <p className="text-gray-500 text-xs">ICV: {inv.icv}</p>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-6 mb-5">
      <div className="space-y-1">
        <p className="font-bold text-gray-700">{inv.org_name}</p>
        <p className="text-gray-500 text-xs">الرقم الضريبي: {inv.org_vat}</p>
        <p className="text-gray-500 text-xs">المملكة العربية السعودية</p>
      </div>
      <div className="space-y-1 text-right">
        <p className="font-bold text-gray-700">{inv.customer_name}</p>
        {inv.customer_vat && <p className="text-gray-500 text-xs">الرقم الضريبي: {inv.customer_vat}</p>}
        <p className="text-gray-500 text-xs">تاريخ الفاتورة: {inv.invoice_date}</p>
      </div>
    </div>

    <table className="w-full border border-gray-200 rounded-lg overflow-hidden mb-5 text-xs">
      <thead className="bg-gray-50">
        <tr>
          {['الوصف', 'الكمية', 'سعر الوحدة', 'الضريبة', 'الإجمالي'].map(h => (
            <th key={h} className="text-right p-2.5 font-semibold text-gray-600">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {inv.items.map((item, i) => (
          <tr key={i} className="border-t border-gray-100">
            <td className="p-2.5 text-gray-700">{item.description}</td>
            <td className="p-2.5 text-center text-gray-600">{item.quantity}</td>
            <td className="p-2.5 text-left text-gray-600">{fmt(item.unit_price)}</td>
            <td className="p-2.5 text-left text-gray-600">{fmt(item.vat_amount)}</td>
            <td className="p-2.5 text-left font-medium text-gray-800">{fmt(item.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>

    <div className="flex justify-between items-start">
      <div className="flex flex-col items-center gap-3">
        {inv.qr_code && <QRCodeCanvas value={inv.qr_code} size={90} level="M" />}
        <p className="text-[9px] text-gray-400">QR Code — ZATCA TLV</p>
        <Barcode value={inv.invoice_number.replace(/[^0-9]/g, '')} height={30} fontSize={8} width={1.2} />
      </div>
      <div className="w-52 space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">المجموع قبل الضريبة</span>
          <span className="font-medium">{fmt(inv.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">ضريبة القيمة المضافة 15%</span>
          <span className="font-medium text-orange-600">{fmt(inv.vat_amount)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-300 pt-2 text-sm">
          <span className="font-bold text-gray-800">الإجمالي</span>
          <span className="font-black text-gray-900">{fmt(inv.total)}</span>
        </div>
      </div>
    </div>

    <div className="mt-5 pt-3 border-t border-gray-200 text-center text-[9px] text-gray-400">
      شكراً لتعاملكم معنا — رصيد ERP — ZATCA Phase 2 Compliant
    </div>
  </div>
));
PrintableInvoice.displayName = 'PrintableInvoice';

// ═══════════════════════════════════════════════════════════
// ── INVOICE PREVIEW MODAL ───────────────────────────────────
// ═══════════════════════════════════════════════════════════

/**
 * Instant preview — receives the cached Invoice object from the list.
 * No Firestore round-trip; data is always available immediately.
 *
 * Features:
 *  • Full A4-style preview (org + customer + items + totals)
 *  • QR Code (ZATCA TLV) + linear barcode
 *  • Download XML (.xml) button
 *  • Print A4 PDF via react-to-print
 *  • ZATCA hash chain (invoice_hash, previous_hash, ICV, signature)
 *  • Close on Escape key or backdrop click
 */
function InvoiceModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ contentRef: printRef } as any);

  // Active tab: 'details' | 'chain'
  const [tab, setTab] = useState<'details' | 'chain'>('details');
  // Copy-to-clipboard feedback
  const [copied, setCopied] = useState<string | null>(null);

  // ── Keyboard / backdrop close ──────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── XML download ───────────────────────────────────────
  const downloadXml = () => {
    if (!invoice.xml_content) return;
    const blob = new Blob([invoice.xml_content], { type: 'application/xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${invoice.invoice_number}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Copy to clipboard ──────────────────────────────────
  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const zc = ZATCA_CFG[invoice.zatca_status];
  const ic = INV_CFG[invoice.status];

  const PAYMENT_AR: Record<string, string> = {
    cash: 'نقدي', card: 'بطاقة', bank_transfer: 'تحويل بنكي',
  };
  const TYPE_AR: Record<string, string> = {
    SIMPLIFIED: 'مبسطة (B2C)', STANDARD: 'ضريبية (B2B)',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(10px)' }}
      dir="rtl"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-[2rem] overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.98)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.6)',
          animation: 'modalSlideIn 0.28s cubic-bezier(.34,1.56,.64,1) both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── MODAL HEADER ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
             style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg,rgba(249,115,22,0.12),rgba(234,88,12,0.08))' }}>
              <FileText size={18} className="text-orange-500" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 leading-tight">{invoice.invoice_number}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {invoice.customer_name} · {invoice.invoice_date}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Print */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 3px 10px rgba(249,115,22,0.35)' }}
              title="طباعة PDF"
            >
              <Printer size={13} /> طباعة
            </button>

            {/* Download XML */}
            {invoice.xml_content && (
              <button
                onClick={downloadXml}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-90"
                style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)' }}
                title="تنزيل XML"
              >
                <Download size={13} /> XML
              </button>
            )}

            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── STATUS STRIP ── */}
        <div className="flex items-center gap-3 px-6 py-3 shrink-0"
             style={{ background: 'rgba(248,250,252,0.8)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          {/* Invoice status */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                style={{ background: ic.bg, color: ic.color }}>
            {ic.label}
          </span>
          {/* ZATCA status */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                style={{ background: zc.bg, color: zc.color }}>
            <zc.icon size={11} />
            ZATCA: {zc.label}
          </span>
          {/* Type + Payment */}
          <span className="text-xs text-slate-400">{TYPE_AR[invoice.invoice_type]}</span>
          <span className="w-1 h-1 rounded-full bg-slate-200" />
          <span className="text-xs text-slate-400">{PAYMENT_AR[invoice.payment_method] ?? invoice.payment_method}</span>
          {/* ICV */}
          <span className="mr-auto flex items-center gap-1 text-xs text-slate-400">
            <Hash size={11} /> ICV: <strong className="text-slate-600">{invoice.icv}</strong>
          </span>
        </div>

        {/* ── TABS ── */}
        <div className="flex gap-1 px-6 pt-4 shrink-0">
          {[
            { id: 'details', label: 'تفاصيل الفاتورة' },
            { id: 'chain',   label: 'سلسلة التوقيع' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as 'details' | 'chain')}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: tab === t.id ? 'rgba(249,115,22,0.1)' : 'transparent',
                color:      tab === t.id ? '#f97316' : '#94a3b8',
                border:     `1px solid ${tab === t.id ? 'rgba(249,115,22,0.25)' : 'transparent'}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {tab === 'details' && (
            <>
              {/* Org ↔ Customer */}
              <div className="grid grid-cols-2 gap-4">
                {/* Issuer (Org) */}
                <div className="rounded-2xl p-4 space-y-1.5"
                     style={{ background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.1)' }}>
                  <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2">المورد</p>
                  <p className="font-bold text-slate-800 text-sm">{invoice.org_name}</p>
                  <p className="text-xs text-slate-500">الرقم الضريبي: <span className="font-mono">{invoice.org_vat}</span></p>
                  <p className="text-xs text-slate-400">المملكة العربية السعودية</p>
                </div>
                {/* Customer */}
                <div className="rounded-2xl p-4 space-y-1.5"
                     style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.1)' }}>
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">العميل</p>
                  <p className="font-bold text-slate-800 text-sm">{invoice.customer_name}</p>
                  {invoice.customer_vat
                    ? <p className="text-xs text-slate-500">الرقم الضريبي: <span className="font-mono">{invoice.customer_vat}</span></p>
                    : <p className="text-xs text-slate-400 italic">عميل نقدي — بدون رقم ضريبي</p>
                  }
                  <p className="text-xs text-slate-400">
                    {invoice.invoice_date} · {invoice.invoice_time}
                  </p>
                </div>
              </div>

              {/* Items table */}
              <div className="rounded-2xl overflow-hidden"
                   style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'rgba(248,250,252,1)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                      {['الوصف', 'الكمية', 'سعر الوحدة', 'ض.ق.م', 'الإجمالي'].map(h => (
                        <th key={h} className="text-right px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                          className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 text-slate-700 font-medium">{item.description}</td>
                        <td className="px-3 py-3 text-center text-slate-500">{item.quantity}</td>
                        <td className="px-3 py-3 text-left text-slate-500">{fmt(item.unit_price)}</td>
                        <td className="px-3 py-3 text-left text-orange-500 font-medium">{fmt(item.vat_amount)}</td>
                        <td className="px-3 py-3 text-left font-bold text-slate-700">{fmt(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals + QR + Barcode */}
              <div className="flex gap-5 items-start">
                {/* QR + Barcode */}
                <div className="flex flex-col items-center gap-3 p-4 rounded-2xl shrink-0"
                     style={{ background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.05)' }}>
                  {invoice.qr_code
                    ? <QRCodeCanvas value={invoice.qr_code} size={96} level="M" />
                    : <div className="w-24 h-24 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300 text-xs">لا يوجد QR</div>
                  }
                  <p className="text-[9px] text-slate-400 font-medium">QR · ZATCA TLV Base64</p>
                  <div className="mt-1">
                    <Barcode
                      value={invoice.invoice_number.replace(/[^0-9A-Za-z\-]/g, '') || '0000'}
                      height={28} fontSize={8} width={1.2}
                      background="transparent"
                    />
                  </div>
                </div>

                {/* Totals */}
                <div className="flex-1 space-y-2.5 text-sm">
                  <div className="flex justify-between py-1.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                    <span className="text-slate-500">المجموع قبل الضريبة</span>
                    <span className="font-semibold text-slate-700">{fmt(invoice.subtotal)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                    <span className="text-slate-500">ضريبة القيمة المضافة (15%)</span>
                    <span className="font-semibold text-orange-500">{fmt(invoice.vat_amount)}</span>
                  </div>
                  <div className="flex justify-between py-2.5 rounded-2xl px-4"
                       style={{ background: 'linear-gradient(135deg,rgba(249,115,22,0.07),rgba(234,88,12,0.04))', border: '1px solid rgba(249,115,22,0.15)' }}>
                    <span className="font-black text-slate-800">الإجمالي النهائي</span>
                    <span className="font-black text-lg text-orange-600">{fmt(invoice.total)}</span>
                  </div>

                  {/* Notes */}
                  {invoice.notes && (
                    <div className="rounded-xl p-3 mt-2 text-xs text-slate-500 italic"
                         style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                      {invoice.notes}
                    </div>
                  )}
                </div>
              </div>

              {/* ZATCA action buttons */}
              {invoice.zatca_status === 'pending' && (
                <button
                  className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)', boxShadow: '0 4px 16px rgba(59,130,246,0.3)' }}
                  onClick={() => { /* TODO: wire to zatca-submit Edge Function */ }}
                >
                  <Send size={15} /> إرسال إلى ZATCA
                </button>
              )}
              {invoice.zatca_status === 'rejected' && (
                <button
                  className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: '0 4px 16px rgba(239,68,68,0.3)' }}
                  onClick={() => { /* TODO: wire to zatca-submit Edge Function */ }}
                >
                  <RefreshCw size={15} /> إعادة الإرسال إلى ZATCA
                </button>
              )}
            </>
          )}

          {tab === 'chain' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                سلسلة القيود المحاسبية الضريبية — كل فاتورة مرتبطة بالسابقة عبر تجزئة SHA-256 وتوقيع ECDSA P-256.
              </p>

              {/* UUID */}
              <HashRow label="UUID الفاتورة" value={invoice.uuid} icon="🔑" onCopy={copyText} copied={copied} />
              {/* ICV */}
              <div className="rounded-2xl p-4 flex items-center justify-between"
                   style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)' }}>
                <div className="flex items-center gap-2">
                  <Hash size={14} className="text-indigo-400" />
                  <span className="text-xs font-bold text-slate-600">رقم ICV (عداد الفواتير)</span>
                </div>
                <span className="font-mono font-black text-indigo-600 text-base">{invoice.icv}</span>
              </div>
              {/* Invoice hash */}
              {invoice.invoice_hash && (
                <HashRow label="تجزئة هذه الفاتورة (SHA-256)" value={invoice.invoice_hash} icon="🔒" onCopy={copyText} copied={copied} />
              )}
              {/* Previous hash */}
              {invoice.previous_invoice_hash && (
                <HashRow label="تجزئة الفاتورة السابقة (PIH)" value={invoice.previous_invoice_hash} icon="🔗" onCopy={copyText} copied={copied} />
              )}
              {/* ECDSA signature */}
              {invoice.ecdsa_signature && (
                <HashRow label="التوقيع الرقمي ECDSA" value={invoice.ecdsa_signature} icon="✍️" onCopy={copyText} copied={copied} />
              )}
              {/* ZATCA submission info */}
              {invoice.zatca_request_id && (
                <div className="rounded-2xl p-4 space-y-2"
                     style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.12)' }}>
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">بيانات ZATCA</p>
                  <p className="text-xs text-slate-600">
                    <span className="text-slate-400">Request ID: </span>
                    <span className="font-mono">{invoice.zatca_request_id}</span>
                  </p>
                  {invoice.zatca_submitted_at && (
                    <p className="text-xs text-slate-500">
                      أُرسل في: {new Date(invoice.zatca_submitted_at).toLocaleString('ar-SA')}
                    </p>
                  )}
                </div>
              )}

              {/* Issued by */}
              <div className="rounded-2xl p-4"
                   style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">أُصدرت بواسطة</p>
                <p className="text-xs text-slate-600 font-medium">{invoice.created_by_name}</p>
                <p className="text-xs text-slate-400">{invoice.created_at instanceof Date ? invoice.created_at.toLocaleString('ar-SA') : String(invoice.created_at)}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── FOOTER (close button) ── */}
        <div className="px-6 py-4 border-t shrink-0 flex justify-end"
             style={{ borderColor: 'rgba(0,0,0,0.05)', background: 'rgba(248,250,252,0.7)' }}>
          <button onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm text-slate-500 font-medium hover:bg-slate-100 transition-all border border-slate-200">
            إغلاق
          </button>
        </div>
      </div>

      {/* Hidden printable layer */}
      <div className="hidden">
        <PrintableInvoice ref={printRef} inv={invoice} />
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes modalSlideIn {
          from { opacity: 0; transform: scale(0.94) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Hash Row Helper ──────────────────────────────────────────

function HashRow({
  label, value, icon, onCopy, copied,
}: {
  label:   string;
  value:   string;
  icon:    string;
  onCopy:  (text: string, key: string) => void;
  copied:  string | null;
}) {
  const isCopied = copied === value;
  return (
    <div className="rounded-2xl p-4 space-y-2"
         style={{ background: 'rgba(15,23,42,0.025)', border: '1px solid rgba(0,0,0,0.07)' }}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
          <span>{icon}</span> {label}
        </p>
        <button
          onClick={() => onCopy(value, value)}
          className="flex items-center gap-1 text-[10px] font-medium transition-all"
          style={{ color: isCopied ? '#10b981' : '#94a3b8' }}
        >
          {isCopied ? <CheckCheck size={11} /> : <Copy size={11} />}
          {isCopied ? 'تم النسخ' : 'نسخ'}
        </button>
      </div>
      <p className="font-mono text-[10px] text-slate-600 break-all leading-relaxed bg-slate-50 rounded-xl px-3 py-2">
        {value}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── CREATE INVOICE DRAWER ───────────────────────────────────
// ═══════════════════════════════════════════════════════════

interface CreateDrawerProps {
  orgId:    string;
  onClose:  () => void;
  onSuccess:(invoiceNumber: string) => void;
  onError:  (msg: string) => void;
}

const EMPTY_LINE: CreateInvoiceLineInput = {
  description: '', quantity: 1, unit_price: 0, vat_exempt: false,
};

function CreateInvoiceDrawer({ orgId, onClose, onSuccess, onError }: CreateDrawerProps) {
  const { createInvoice, creating } = useCreateInvoice();

  const [customerName,  setCustomerName]  = useState('');
  const [customerVat,   setCustomerVat]   = useState('');
  const [invoiceType,   setInvoiceType]   = useState<'SIMPLIFIED' | 'STANDARD'>('SIMPLIFIED');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer'>('cash');
  const [notes,         setNotes]         = useState('');
  const [lines, setLines] = useState<CreateInvoiceLineInput[]>([{ ...EMPTY_LINE }]);

  // Live total preview
  const VAT_RATE = 0.15;
  const totals = lines.reduce((acc, l) => {
    const sub = (l.quantity || 0) * (l.unit_price || 0);
    const vat = l.vat_exempt ? 0 : sub * VAT_RATE;
    return { subtotal: acc.subtotal + sub, vat: acc.vat + vat };
  }, { subtotal: 0, vat: 0 });

  const addLine    = () => setLines(prev => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof CreateInvoiceLineInput, value: unknown) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload: CreateInvoiceInput = {
      org_id:         orgId,
      customer_name:  customerName.trim() || undefined,
      customer_vat:   customerVat.trim()  || undefined,
      invoice_type:   invoiceType,
      payment_method: paymentMethod,
      lines,
      notes:          notes.trim() || undefined,
    };

    const result = await createInvoice(payload);

    if (result.success && result.invoice_number) {
      onSuccess(result.invoice_number);
      onClose();
    } else {
      onError(result.message ?? 'حدث خطأ غير متوقع');
    }
  };

  const inputStyle = {
    background: 'rgba(241,245,249,0.8)',
    border:     '1.5px solid rgba(0,0,0,0.07)',
    borderRadius: '0.75rem',
    padding:    '0.5rem 0.75rem',
    fontSize:   '0.813rem',
    outline:    'none',
    width:      '100%',
  } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/15 backdrop-blur-sm" dir="rtl">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-[2rem]"
           style={{ ...glass, background: 'rgba(255,255,255,0.97)', boxShadow: '0 32px 80px rgba(0,0,0,0.12)' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <h3 className="text-lg font-black text-slate-800">فاتورة جديدة</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Invoice type + payment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">نوع الفاتورة</label>
              <select value={invoiceType} onChange={e => setInvoiceType(e.target.value as 'SIMPLIFIED' | 'STANDARD')}
                style={inputStyle}>
                <option value="SIMPLIFIED">مبسطة (B2C)</option>
                <option value="STANDARD">ضريبية (B2B)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">طريقة الدفع</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}
                style={inputStyle}>
                <option value="cash">نقدي</option>
                <option value="card">بطاقة</option>
                <option value="bank_transfer">تحويل بنكي</option>
              </select>
            </div>
          </div>

          {/* Customer */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">اسم العميل (اختياري)</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                placeholder="عميل نقدي" style={inputStyle} />
            </div>
            {invoiceType === 'STANDARD' && (
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  الرقم الضريبي للعميل <span className="text-rose-400">*</span>
                </label>
                <input value={customerVat} onChange={e => setCustomerVat(e.target.value)}
                  placeholder="310XXXXXXXXXXXX" maxLength={15} style={inputStyle} />
              </div>
            )}
          </div>

          {/* Invoice lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">بنود الفاتورة</label>
              <button type="button" onClick={addLine}
                className="flex items-center gap-1 text-xs text-orange-500 font-medium hover:text-orange-600">
                <Plus size={13} /> إضافة بند
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.07)' }}>
              <table className="w-full text-xs">
                <thead style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <tr>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">الوصف</th>
                    <th className="text-center px-2 py-2 text-slate-400 font-medium w-16">الكمية</th>
                    <th className="text-center px-2 py-2 text-slate-400 font-medium w-24">سعر الوحدة</th>
                    <th className="text-center px-2 py-2 text-slate-400 font-medium w-12">معفى</th>
                    <th className="w-8 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                      <td className="px-2 py-2">
                        <input value={line.description}
                          onChange={e => updateLine(i, 'description', e.target.value)}
                          placeholder="وصف الخدمة أو المنتج" required
                          style={{ ...inputStyle, padding: '0.4rem 0.6rem' }} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min={0.01} step={0.01} value={line.quantity}
                          onChange={e => updateLine(i, 'quantity', parseFloat(e.target.value) || 0)}
                          required style={{ ...inputStyle, padding: '0.4rem 0.5rem', textAlign: 'center' }} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min={0} step={0.01} value={line.unit_price}
                          onChange={e => updateLine(i, 'unit_price', parseFloat(e.target.value) || 0)}
                          required style={{ ...inputStyle, padding: '0.4rem 0.5rem', textAlign: 'center' }} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={line.vat_exempt ?? false}
                          onChange={e => updateLine(i, 'vat_exempt', e.target.checked)}
                          className="w-4 h-4 accent-orange-500" />
                      </td>
                      <td className="px-2 py-2 text-center">
                        {lines.length > 1 && (
                          <button type="button" onClick={() => removeLine(i)}
                            className="text-slate-300 hover:text-rose-400 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">ملاحظات (اختياري)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="ملاحظات إضافية للفاتورة..."
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {/* Live total */}
          <div className="rounded-2xl p-4 space-y-2" style={{ background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.1)' }}>
            <div className="flex justify-between text-xs text-slate-500">
              <span>المجموع قبل الضريبة</span>
              <span className="font-medium">{fmt(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>ضريبة القيمة المضافة (15%)</span>
              <span className="font-medium text-orange-500">{fmt(totals.vat)}</span>
            </div>
            <div className="flex justify-between text-sm font-black text-slate-800 pt-2 border-t" style={{ borderColor: 'rgba(249,115,22,0.1)' }}>
              <span>الإجمالي</span>
              <span className="text-orange-600">{fmt(totals.subtotal + totals.vat)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button type="submit" disabled={creating}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.3)' }}>
              {creating
                ? <><Loader2 size={15} className="animate-spin" /> جاري الإصدار...</>
                : <><Plus size={15} /> إصدار الفاتورة</>
              }
            </button>
            <button type="button" onClick={onClose} disabled={creating}
              className="px-5 py-3 rounded-2xl text-sm text-slate-500 border border-slate-200 font-medium">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── MAIN INVOICES PAGE ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════

export function InvoicesPage() {
  // ── Auth / org ─────────────────────────────────────────
  const { orgId } = useCurrentUser();

  // ── Real-time data ─────────────────────────────────────
  const { invoices, loading, error, refresh } = useInvoices(orgId);

  // ── UI state ───────────────────────────────────────────
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<ZatcaStatus | 'all'>('all');
  const [page,         setPage]         = useState(0);
  const [previewInv,   setPreviewInv]   = useState<Invoice | null>(null);
  const [showCreate,   setShowCreate]   = useState(false);

  // ── Snackbar ───────────────────────────────────────────
  const [snack, setSnack] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showSnack = useCallback((message: string, type: 'success' | 'error' | 'warning') => {
    setSnack({ message, type });
  }, []);

  // ── Filtering + pagination ─────────────────────────────
  const PER_PAGE = 8;
  const filtered = invoices.filter(inv => {
    const matchSearch = inv.invoice_number.includes(search) || inv.customer_name.includes(search);
    const matchStatus = statusFilter === 'all' || inv.zatca_status === statusFilter;
    return matchSearch && matchStatus;
  });
  const paginated  = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  // ── Stats (computed from live data) ───────────────────
  const stats = {
    cleared:  invoices.filter(i => i.zatca_status === 'cleared').length,
    pending:  invoices.filter(i => i.zatca_status === 'pending').length,
    rejected: invoices.filter(i => i.zatca_status === 'rejected').length,
  };
  const totalVat = invoices.reduce((s, i) => s + i.vat_amount, 0);
  const totalRev = invoices.reduce((s, i) => s + i.total,      0);

  return (
    <InvoicesErrorBoundary>
      <div className="p-6 space-y-5 min-h-screen" dir="rtl" style={{ fontFamily: 'Tajawal, sans-serif' }}>

        {/* ── Header ───────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800">الفواتير الإلكترونية</h1>
            <p className="text-sm text-slate-400 mt-0.5">متوافقة مع ZATCA Phase 2 | فاتورة TLV QR</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            disabled={!orgId}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.3)' }}>
            <Plus size={16} /> فاتورة جديدة
          </button>
        </div>

        {/* ── Stats Row ──────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
            : [
                { label: 'إجمالي الإيرادات',                value: fmtShort(totalRev), color: '#f97316', bg: 'rgba(249,115,22,0.08)' },
                { label: 'إجمالي الضريبة',                  value: fmtShort(totalVat), color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
                { label: `مقبولة ZATCA (${stats.cleared})`, value: `${stats.cleared}/${invoices.length}`, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
                { label: 'معلقة / مرفوضة',                  value: `${stats.pending + stats.rejected}`, color: stats.rejected > 0 ? '#ef4444' : '#f59e0b', bg: stats.rejected > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)' },
              ].map(s => (
                <div key={s.label} className="rounded-[1.5rem] p-4" style={{ ...glass, background: s.bg }}>
                  <p className="text-xs text-slate-400 mb-1">{s.label}</p>
                  <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))
          }
        </div>

        {/* ── Filter Bar ─────────────────────────────── */}
        <div className="rounded-[1.5rem] p-4 flex items-center gap-3 flex-wrap" style={glass}>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="بحث برقم الفاتورة أو اسم العميل..."
              className="w-full pr-9 pl-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: 'rgba(241,245,249,0.8)', border: '1.5px solid rgba(0,0,0,0.07)' }} />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-slate-400" />
            {(['all', 'cleared', 'reported', 'pending', 'warning', 'rejected'] as const).map(s => {
              const cfg = s === 'all' ? null : ZATCA_CFG[s];
              return (
                <button key={s} onClick={() => { setStatusFilter(s); setPage(0); }}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  style={{
                    background: statusFilter === s ? (cfg?.bg ?? 'rgba(249,115,22,0.1)') : 'transparent',
                    color:      statusFilter === s ? (cfg?.color ?? '#f97316') : '#94a3b8',
                    border:     `1px solid ${statusFilter === s ? (cfg?.color ?? '#f97316') + '30' : 'transparent'}`,
                  }}>
                  {s === 'all' ? 'الكل' : cfg?.label}
                </button>
              );
            })}
          </div>
          <button onClick={refresh}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1.5 rounded-xl hover:bg-slate-100">
            <RefreshCw size={12} /> تحديث
          </button>
        </div>

        {/* ── Table ──────────────────────────────────── */}
        <div className="rounded-[1.75rem] overflow-hidden" style={glass}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                {['رقم الفاتورة', 'العميل', 'التاريخ', 'الإجمالي', 'الضريبة', 'حالة ZATCA', 'الإجراءات'].map(h => (
                  <th key={h} className="text-right px-5 py-3.5 text-xs font-medium text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? <InvoiceTableSkeleton />
                : error
                  ? <InvoicesErrorState error={error} onRetry={refresh} />
                  : paginated.length === 0
                    ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-14 text-center">
                          <FileText size={28} className="text-slate-200 mx-auto mb-2" />
                          <p className="text-slate-400 text-sm">
                            {invoices.length === 0 ? 'لا توجد فواتير بعد. أنشئ فاتورتك الأولى!' : 'لا توجد نتائج مطابقة'}
                          </p>
                        </td>
                      </tr>
                    )
                    : paginated.map(inv => {
                        const zc = ZATCA_CFG[inv.zatca_status];
                        return (
                          <tr key={inv.id} className="hover:bg-white/60 transition-colors"
                            style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <FileText size={13} className="text-slate-300" />
                                <span className="font-mono font-semibold text-slate-700 text-[12px]">{inv.invoice_number}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-slate-600">{inv.customer_name}</td>
                            <td className="px-5 py-3.5 text-slate-400 text-[12px]">{inv.invoice_date}</td>
                            <td className="px-5 py-3.5 font-bold text-slate-700">{fmt(inv.total)}</td>
                            <td className="px-5 py-3.5 text-orange-500 font-medium">{fmt(inv.vat_amount)}</td>
                            <td className="px-5 py-3.5">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
                                style={{ color: zc.color, background: zc.bg }}>
                                <zc.icon size={11} />
                                {zc.label}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-1">
                                <button onClick={() => setPreviewInv(inv)}
                                  title="معاينة الفاتورة"
                                  className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all">
                                  <Eye size={14} />
                                </button>
                                <button
                                  title={inv.xml_content ? 'تنزيل XML' : 'XML غير متوفر'}
                                  disabled={!inv.xml_content}
                                  onClick={() => {
                                    if (!inv.xml_content) return;
                                    const blob = new Blob([inv.xml_content], { type: 'application/xml' });
                                    const url  = URL.createObjectURL(blob);
                                    const a    = document.createElement('a');
                                    a.href     = url;
                                    a.download = `${inv.invoice_number}.xml`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  }}
                                  className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                                  <Download size={14} />
                                </button>
                                {inv.zatca_status === 'pending' && (
                                  <button title="إرسال إلى ZATCA"
                                    className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-all">
                                    <Send size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
              }
            </tbody>
          </table>

          {/* Pagination */}
          {!loading && !error && totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
              <span className="text-xs text-slate-400">{filtered.length} فاتورة</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button key={i} onClick={() => setPage(i)}
                    className="w-7 h-7 rounded-xl text-xs font-medium transition-all"
                    style={{ background: page === i ? '#f97316' : 'rgba(0,0,0,0.04)', color: page === i ? 'white' : '#64748b' }}>
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Modals / Drawers ───────────────────────── */}
      {previewInv && (
        <InvoiceModal
          invoice={previewInv}
          onClose={() => setPreviewInv(null)}
        />
      )}

      {showCreate && orgId && (
        <CreateInvoiceDrawer
          orgId={orgId}
          onClose={() => setShowCreate(false)}
          onSuccess={(num) => {
            showSnack(`✅ تم إصدار الفاتورة ${num} بنجاح`, 'success');
          }}
          onError={(msg) => {
            showSnack(msg, 'error');
          }}
        />
      )}

      {/* ── Snackbar ───────────────────────────────── */}
      {snack && (
        <Snackbar
          message={snack.message}
          type={snack.type}
          onClose={() => setSnack(null)}
        />
      )}
    </InvoicesErrorBoundary>
  );
}
