// ============================================================
// Control Panel (رصيد) — Invoice Preview Modal  v2.0
// ─ A4 preview (White Glassmorphism) + hidden 80mm thermal
//   target for react-to-print.
// ─ ZATCA Phase 2: Base64 TLV QR rendered via qrcode.react.
// ─ 1D linear barcode for the invoice number (bottom).
// ─ Full RTL Arabic support + @media print via invoice.css
// ─ Reusable from POSCashier AND InvoicesPage.
// ============================================================

import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { QRCodeSVG } from 'qrcode.react';
import {
  X, Printer, CheckCircle2, FileText, Hash, Building2,
  Calendar, CreditCard, Download,
} from 'lucide-react';
import '../../styles/invoice.css';

// ─── Shared invoice shape ────────────────────────────────────

export interface PreviewItem {
  name:         string;
  barcode?:     string;
  qty:          number;
  unit_price:   number;        // Ex-VAT
  discount_pct: number;        // 0..100
  vat_rate:     number;        // e.g. 15
  vat_amount:   number;
  line_total:   number;        // Inc-VAT
}

export interface PreviewStore {
  name:        string;
  name_en?:    string;
  vat_number:  string;
  cr_number?:  string;
  address?:    string;
  phone?:      string;
  email?:      string;
  logo_url?:   string;
  currency:    string;         // e.g. "ر.س"
  zatca_env:   'sandbox' | 'production';
}

export interface PreviewInvoice {
  invoice_number:   string;
  created_at:       string;
  cashier_name?:    string;
  branch_name?:     string;
  items:            PreviewItem[];
  subtotal_ex_vat:  number;
  total_discount:   number;
  total_vat:        number;
  grand_total:      number;
  payment_label:    string;
  change_due?:      number;
  zatca_qr:         string;
  status?:          'paid' | 'refunded' | 'cancelled';
}

interface InvoicePreviewModalProps {
  invoice:       PreviewInvoice;
  store:         PreviewStore;
  onClose:       () => void;
  onAfterPrint?: () => void;
  title?:        string;
}

// ─── Formatters ──────────────────────────────────────────────

const money = (n: number, currency: string) =>
  `${(Number.isFinite(n) ? n : 0).toFixed(2)} ${currency}`;

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ar-SA', {
      year:   'numeric',
      month:  '2-digit',
      day:    '2-digit',
      hour:   '2-digit',
      minute: '2-digit',
    });
  } catch { return iso; }
};

const fmtDateShort = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('ar-SA', {
      year:  'numeric',
      month: '2-digit',
      day:   '2-digit',
    });
  } catch { return iso; }
};

// ─── 1D Barcode SVG (no external lib) ───────────────────────

const BarcodeLine: React.FC<{
  value:     string;
  height?:   number;
  barWidth?: number;
  className?: string;
}> = ({ value, height = 42, barWidth = 1.4, className }) => {
  const bars: React.ReactNode[] = [];
  let x = 0;
  for (let i = 0; i < value.length; i++) {
    const w = ((value.charCodeAt(i) % 3) + 1) * barWidth;
    if (i % 2 === 0) {
      bars.push(<rect key={i} x={x} y={0} width={w} height={height} fill="#0f172a" />);
    }
    x += w + barWidth;
  }
  return (
    <svg
      viewBox={`0 0 ${Math.max(200, x)} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      style={{ display: 'block' }}
    >
      {bars}
    </svg>
  );
};

// ══════════════════════════════════════════════════════════════
//  80mm THERMAL RECEIPT — hidden print target
//  Pure inline styles — zero dependency on Tailwind / CSS.
// ══════════════════════════════════════════════════════════════

const ThermalReceipt = React.forwardRef<
  HTMLDivElement,
  { invoice: PreviewInvoice; store: PreviewStore }
>(({ invoice, store }, ref) => (
  <div
    ref={ref}
    dir="rtl"
    className="thermal-receipt"
    style={{
      width:      '80mm',
      padding:    '4mm 3mm',
      fontFamily: "'Tajawal', 'Courier New', monospace",
      fontSize:   '10px',
      color:      '#000',
      background: '#fff',
      lineHeight: 1.4,
    }}
  >
    {/* Header */}
    <div style={{ textAlign: 'center', marginBottom: 8 }}>
      {store.logo_url
        ? <img src={store.logo_url} alt="" style={{ maxHeight: 40, margin: '0 auto 4px', display: 'block' }} />
        : <div style={{ fontSize: 24, marginBottom: 4 }}>🏪</div>}
      <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 2 }}>{store.name}</div>
      {store.name_en && (
        <div style={{ fontSize: 9, color: '#555', direction: 'ltr' }}>{store.name_en}</div>
      )}
      {store.address  && <div style={{ fontSize: 9, color: '#555' }}>{store.address}</div>}
      {store.phone    && <div style={{ fontSize: 9, color: '#555' }}>📞 {store.phone}</div>}
      <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>الرقم الضريبي: {store.vat_number}</div>
      {store.cr_number && <div style={{ fontSize: 9, color: '#555' }}>س.ت: {store.cr_number}</div>}
    </div>

    <div className="thermal-divider" style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

    <div style={{ textAlign: 'center', marginBottom: 6 }}>
      <div style={{ fontWeight: 900, fontSize: 12 }}>فاتورة ضريبية مبسطة</div>
      <div style={{ fontSize: 9, marginTop: 2 }}>رقم الفاتورة: {invoice.invoice_number}</div>
      <div style={{ fontSize: 9 }}>التاريخ: {fmtDate(invoice.created_at)}</div>
      {invoice.cashier_name && <div style={{ fontSize: 9 }}>الكاشير: {invoice.cashier_name}</div>}
      {invoice.branch_name  && <div style={{ fontSize: 9 }}>الفرع: {invoice.branch_name}</div>}
    </div>

    <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

    {/* Items table */}
    <table style={{ width: '100%', fontSize: 9, borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'right',  padding: '3px 1px', borderBottom: '1px solid #000', width: '45%' }}>الصنف</th>
          <th style={{ textAlign: 'center', padding: '3px 1px', borderBottom: '1px solid #000', width: '12%' }}>الكمية</th>
          <th style={{ textAlign: 'center', padding: '3px 1px', borderBottom: '1px solid #000', width: '23%' }}>السعر</th>
          <th style={{ textAlign: 'left',   padding: '3px 1px', borderBottom: '1px solid #000', width: '20%' }}>الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        {invoice.items.map((item, i) => (
          <tr key={i}>
            <td style={{ padding: '2px 1px', borderBottom: '1px dotted #ddd' }}>{item.name}</td>
            <td style={{ padding: '2px 1px', textAlign: 'center', borderBottom: '1px dotted #ddd' }}>{item.qty}</td>
            <td style={{ padding: '2px 1px', textAlign: 'center', borderBottom: '1px dotted #ddd' }}>{item.unit_price.toFixed(2)}</td>
            <td style={{ padding: '2px 1px', textAlign: 'left',   borderBottom: '1px dotted #ddd' }}>{item.line_total.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>

    <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

    {/* Totals */}
    <div style={{ fontSize: 9 }}>
      {[
        { label: 'المجموع (قبل الضريبة):', value: `${invoice.subtotal_ex_vat.toFixed(2)} ${store.currency}` },
        ...(invoice.total_discount > 0 ? [{ label: 'الخصم:', value: `- ${invoice.total_discount.toFixed(2)} ${store.currency}` }] : []),
        { label: 'ضريبة القيمة المضافة 15%:', value: `${invoice.total_vat.toFixed(2)} ${store.currency}` },
      ].map((row, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span>{row.label}</span>
          <span>{row.value}</span>
        </div>
      ))}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontWeight: 900, fontSize: 13,
        borderTop: '1px solid #000', marginTop: 4, paddingTop: 4,
      }}>
        <span>الإجمالي المستحق:</span>
        <span>{invoice.grand_total.toFixed(2)} {store.currency}</span>
      </div>
    </div>

    <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

    {/* Payment */}
    <div style={{ fontSize: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>طريقة الدفع:</span>
        <span style={{ fontWeight: 700 }}>{invoice.payment_label}</span>
      </div>
      {(invoice.change_due ?? 0) > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1a7a4a' }}>
          <span>المبلغ المُعاد:</span>
          <span>{(invoice.change_due ?? 0).toFixed(2)} {store.currency}</span>
        </div>
      )}
    </div>

    <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

    {/* ZATCA QR */}
    <div style={{ textAlign: 'center', margin: '8px 0' }}>
      <div style={{ fontSize: 9, marginBottom: 4, fontWeight: 700 }}>
        رمز QR الضريبي — ZATCA Phase 2
      </div>
      <div style={{ display: 'inline-block', background: '#fff', padding: 4, border: '1px solid #eee' }}>
        <QRCodeSVG value={invoice.zatca_qr} size={88} level="M" />
      </div>
      <div style={{ fontSize: 8, color: '#777', marginTop: 2 }}>
        {store.zatca_env === 'sandbox' ? '⚠️ بيئة الاختبار' : '✅ بيئة الإنتاج'}
      </div>
    </div>

    <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

    {/* 1D Barcode */}
    <div style={{ textAlign: 'center', margin: '6px 0' }}>
      <div style={{ fontSize: 8, color: '#666', marginBottom: 3 }}>رمز شريطي للفاتورة</div>
      <BarcodeLine value={invoice.invoice_number} height={38} />
      <div style={{ fontSize: 8, letterSpacing: '0.06em', marginTop: 3, fontFamily: 'monospace' }}>
        {invoice.invoice_number}
      </div>
    </div>

    <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

    <div style={{ textAlign: 'center', fontSize: 9, color: '#444', paddingTop: 4 }}>
      <div style={{ fontWeight: 900, marginBottom: 2 }}>شكراً لتسوقكم معنا 💛</div>
      <div>نظام رصيد ERP — متوافق مع هيئة الزكاة</div>
    </div>
  </div>
));
ThermalReceipt.displayName = 'ThermalReceipt';

// ══════════════════════════════════════════════════════════════
//  A4 PRINT TARGET — used when printMode === 'a4'
//  Full page layout with proper @media print support.
// ══════════════════════════════════════════════════════════════

const A4PrintTarget = React.forwardRef<
  HTMLDivElement,
  { invoice: PreviewInvoice; store: PreviewStore }
>(({ invoice, store }, ref) => {
  const statusInfo =
    invoice.status === 'refunded'  ? { label: 'مرتجع',  cls: 'status-refunded'  } :
    invoice.status === 'cancelled' ? { label: 'ملغاة',   cls: 'status-cancelled' } :
                                     { label: 'مدفوعة', cls: 'status-paid'      };

  return (
    <div ref={ref} dir="rtl" className="a4-print-target">
      {/* ── Page Header ── */}
      <div className="a4-header">
        <div className="a4-store-info">
          {store.logo_url
            ? <img src={store.logo_url} alt="logo" className="a4-logo" />
            : <div className="a4-logo-placeholder">🏪</div>}
          <div className="a4-store-details">
            <h1 className="a4-store-name">{store.name}</h1>
            {store.name_en && <p className="a4-store-name-en">{store.name_en}</p>}
            <p className="a4-store-meta">
              <span>الرقم الضريبي: {store.vat_number}</span>
              {store.cr_number && <span className="a4-meta-sep">|</span>}
              {store.cr_number && <span>السجل التجاري: {store.cr_number}</span>}
            </p>
            {(store.address || store.phone) && (
              <p className="a4-store-address">
                {store.address}{store.phone && ` · هاتف: ${store.phone}`}
              </p>
            )}
            {store.email && <p className="a4-store-address">{store.email}</p>}
          </div>
        </div>
        <div className="a4-invoice-title-block">
          <h2 className="a4-invoice-title">فاتورة ضريبية مبسطة</h2>
          <p className="a4-invoice-subtitle">Simplified Tax Invoice</p>
          <span className={`a4-status-badge ${statusInfo.cls}`}>{statusInfo.label}</span>
          {store.zatca_env === 'sandbox' && (
            <span className="a4-sandbox-badge">بيئة الاختبار</span>
          )}
        </div>
      </div>

      <div className="a4-divider" />

      {/* ── Meta Grid ── */}
      <div className="a4-meta-grid">
        <MetaBox icon="🔢" label="رقم الفاتورة"  value={invoice.invoice_number}       mono />
        <MetaBox icon="📅" label="التاريخ"        value={fmtDate(invoice.created_at)}  />
        <MetaBox icon="💳" label="طريقة الدفع"    value={invoice.payment_label}        />
        <MetaBox icon="🏢" label="الفرع"           value={invoice.branch_name ?? '—'}  />
        {invoice.cashier_name && (
          <MetaBox icon="👤" label="الكاشير" value={invoice.cashier_name} />
        )}
      </div>

      {/* ── Items Table ── */}
      <div className="a4-table-wrapper">
        <table className="a4-table">
          <thead>
            <tr>
              <th className="a4-th a4-th-num">#</th>
              <th className="a4-th a4-th-name">اسم الصنف</th>
              <th className="a4-th">الكمية</th>
              <th className="a4-th">سعر الوحدة</th>
              <th className="a4-th">خصم %</th>
              <th className="a4-th">ضريبة</th>
              <th className="a4-th a4-th-total">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.length === 0 && (
              <tr>
                <td colSpan={7} className="a4-td a4-td-empty">لا توجد أصناف</td>
              </tr>
            )}
            {invoice.items.map((item, i) => (
              <tr key={i} className={i % 2 === 0 ? 'a4-tr-even' : 'a4-tr-odd'}>
                <td className="a4-td a4-td-center">{i + 1}</td>
                <td className="a4-td a4-td-name">
                  <span className="a4-item-name">{item.name}</span>
                  {item.barcode && (
                    <span className="a4-item-barcode">{item.barcode}</span>
                  )}
                </td>
                <td className="a4-td a4-td-center">{item.qty}</td>
                <td className="a4-td a4-td-center">{money(item.unit_price, store.currency)}</td>
                <td className="a4-td a4-td-center">
                  {item.discount_pct > 0
                    ? <span className="a4-discount-badge">{item.discount_pct}%</span>
                    : '—'}
                </td>
                <td className="a4-td a4-td-center">{money(item.vat_amount, store.currency)}</td>
                <td className="a4-td a4-td-total">{money(item.line_total, store.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer: QR + Barcode + Totals ── */}
      <div className="a4-footer-grid">

        {/* QR + Barcode block */}
        <div className="a4-codes-block">
          <div className="a4-qr-wrapper">
            <QRCodeSVG
              value={invoice.zatca_qr || 'no-qr'}
              size={110}
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="a4-qr-label">رمز QR الضريبي (ZATCA Phase 2)</div>
          <div className="a4-barcode-wrapper">
            <BarcodeLine value={invoice.invoice_number} height={36} className="a4-barcode-svg" />
            <div className="a4-barcode-text">{invoice.invoice_number}</div>
          </div>
          <div className="a4-barcode-label">الباركود الخطي لرقم الفاتورة</div>
        </div>

        {/* Totals block */}
        <div className="a4-totals-block">
          <div className="a4-total-row">
            <span>المجموع الفرعي (قبل الضريبة)</span>
            <span>{money(invoice.subtotal_ex_vat, store.currency)}</span>
          </div>
          {invoice.total_discount > 0 && (
            <div className="a4-total-row a4-total-discount">
              <span>إجمالي الخصم</span>
              <span>- {money(invoice.total_discount, store.currency)}</span>
            </div>
          )}
          <div className="a4-total-row">
            <span>ضريبة القيمة المضافة (15%)</span>
            <span>{money(invoice.total_vat, store.currency)}</span>
          </div>
          <div className="a4-total-divider" />
          <div className="a4-total-grand">
            <span>الإجمالي المستحق</span>
            <span>{money(invoice.grand_total, store.currency)}</span>
          </div>
          {(invoice.change_due ?? 0) > 0 && (
            <div className="a4-total-row a4-total-change">
              <span>المبلغ المُعاد للعميل</span>
              <span>{money(invoice.change_due ?? 0, store.currency)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Page Footer ── */}
      <div className="a4-page-footer">
        <p>شكراً لتسوقكم معنا — نظام رصيد ERP</p>
        <p>متوافق مع متطلبات الفوترة الإلكترونية — هيئة الزكاة والضريبة والجمارك · المرحلة الثانية</p>
      </div>
    </div>
  );
});
A4PrintTarget.displayName = 'A4PrintTarget';

// ══════════════════════════════════════════════════════════════
//  MAIN MODAL COMPONENT
// ══════════════════════════════════════════════════════════════

const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  invoice, store, onClose, onAfterPrint, title = 'معاينة الفاتورة',
}) => {
  const thermalRef = useRef<HTMLDivElement>(null);
  const a4Ref      = useRef<HTMLDivElement>(null);

  // 80mm thermal print
  const handlePrintThermal = useReactToPrint({
    contentRef: thermalRef,
    documentTitle: `فاتورة-${invoice.invoice_number}`,
    onAfterPrint: () => onAfterPrint?.(),
    pageStyle: `
      @page { size: 80mm auto; margin: 0; }
      @media print {
        html, body { margin: 0; padding: 0; background: #fff; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `,
  } as any);

  // A4 print
  const handlePrintA4 = useReactToPrint({
    contentRef: a4Ref,
    documentTitle: `فاتورة-A4-${invoice.invoice_number}`,
    onAfterPrint: () => onAfterPrint?.(),
    pageStyle: `
      @page { size: A4 portrait; margin: 15mm 12mm; }
      @media print {
        html, body { margin: 0; padding: 0; background: #fff; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `,
  } as any);

  const statusBadge =
    invoice.status === 'refunded'
      ? { label: 'مرتجع',  bg: 'rgba(244,63,94,0.12)',   fg: '#e11d48', border: 'rgba(244,63,94,0.35)'   }
    : invoice.status === 'cancelled'
      ? { label: 'ملغاة',   bg: 'rgba(148,163,184,0.15)', fg: '#475569', border: 'rgba(148,163,184,0.4)'  }
      : { label: 'مدفوعة', bg: 'rgba(16,185,129,0.12)',  fg: '#059669', border: 'rgba(16,185,129,0.35)'  };

  return (
    <div
      dir="rtl"
      className="invoice-modal-overlay"
      style={{ fontFamily: "'Tajawal', sans-serif" }}
    >
      <style>{`
        @keyframes previewFadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes previewScaleIn {
          from { opacity:0; transform: translateY(16px) scale(.95); }
          to   { opacity:1; transform: translateY(0)    scale(1);   }
        }
        .invoice-modal-overlay { animation: previewFadeIn 0.22s ease both; }
        .invoice-modal-shell   { animation: previewScaleIn 0.3s cubic-bezier(.34,1.56,.64,1) both; }
      `}</style>

      {/* Backdrop */}
      <div className="invoice-modal-backdrop" onClick={onClose} />

      {/* Modal */}
      <div className="invoice-modal-shell">

        {/* Header */}
        <div className="invoice-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="invoice-modal-icon">
              <FileText size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.05rem', color: '#0f172a' }}>{title}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>راجع البيانات ثم اختر نوع الطباعة</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="invoice-modal-close-btn">
            <X size={16} color="#64748b" />
          </button>
        </div>

        {/* Scrollable A4 Preview */}
        <div className="invoice-modal-body">
          <div className="invoice-a4-sheet">

            {/* Store Header */}
            <div className="inv-header">
              <div className="inv-store-block">
                {store.logo_url
                  ? <img src={store.logo_url} alt="logo" className="inv-logo" />
                  : <div className="inv-logo-emoji">🏪</div>}
                <div>
                  <div className="inv-store-name">{store.name}</div>
                  {store.name_en && <div className="inv-store-name-en">{store.name_en}</div>}
                  <div className="inv-store-vat">
                    الرقم الضريبي: {store.vat_number || '—'}
                    {store.cr_number && <span> | س.ت: {store.cr_number}</span>}
                  </div>
                  {(store.address || store.phone) && (
                    <div className="inv-store-address">
                      {store.address}{store.phone && ` · ${store.phone}`}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div className="inv-type-label">فاتورة ضريبية مبسطة</div>
                <div className="inv-type-label-en">Simplified Tax Invoice</div>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.3rem 0.8rem',
                    background: statusBadge.bg,
                    color: statusBadge.fg,
                    border: `1px solid ${statusBadge.border}`,
                    borderRadius: 999,
                    fontSize: 12, fontWeight: 800,
                    marginTop: 6,
                  }}
                >
                  {statusBadge.label}
                </span>
              </div>
            </div>

            <div className="inv-divider" />

            {/* Meta grid */}
            <div className="inv-meta-grid">
              <MetaCell icon={<Hash size={13} />}       label="رقم الفاتورة"   value={invoice.invoice_number}     mono />
              <MetaCell icon={<Calendar size={13} />}   label="التاريخ والوقت" value={fmtDate(invoice.created_at)} />
              <MetaCell icon={<CreditCard size={13} />} label="طريقة الدفع"    value={invoice.payment_label}       />
              <MetaCell icon={<Building2 size={13} />}  label="الفرع"           value={invoice.branch_name ?? '—'} />
            </div>

            <div className="inv-section-title">تفاصيل الأصناف</div>

            {/* Items table */}
            <div className="inv-table-wrapper">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th className="inv-th inv-th-center">#</th>
                    <th className="inv-th inv-th-right" style={{ width: '38%' }}>الصنف</th>
                    <th className="inv-th inv-th-center">الكمية</th>
                    <th className="inv-th inv-th-center">السعر</th>
                    <th className="inv-th inv-th-center">خصم</th>
                    <th className="inv-th inv-th-center">ضريبة</th>
                    <th className="inv-th inv-th-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="inv-td-empty">لا توجد أصناف في هذه الفاتورة</td>
                    </tr>
                  )}
                  {invoice.items.map((item, i) => (
                    <tr key={i} className="inv-tr">
                      <td className="inv-td inv-td-center inv-td-muted">{i + 1}</td>
                      <td className="inv-td inv-td-right">
                        <div className="inv-item-name">{item.name}</div>
                        {item.barcode && (
                          <div className="inv-item-barcode">{item.barcode}</div>
                        )}
                      </td>
                      <td className="inv-td inv-td-center">{item.qty}</td>
                      <td className="inv-td inv-td-center">{money(item.unit_price, store.currency)}</td>
                      <td className="inv-td inv-td-center">
                        {item.discount_pct > 0
                          ? <span className="inv-discount-chip">{item.discount_pct}%</span>
                          : <span className="inv-td-muted">—</span>}
                      </td>
                      <td className="inv-td inv-td-center">{money(item.vat_amount, store.currency)}</td>
                      <td className="inv-td inv-td-left inv-td-bold">
                        {money(item.line_total, store.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom: QR + Totals */}
            <div className="inv-bottom-grid">
              {/* QR + Barcode */}
              <div className="inv-codes-panel">
                <div className="inv-qr-box">
                  <QRCodeSVG value={invoice.zatca_qr || 'no-qr-data'} size={104} level="M" />
                </div>
                <div className="inv-qr-caption">
                  رمز QR الضريبي (ZATCA Base64 TLV)
                </div>
                <div className="inv-barcode-box">
                  <BarcodeLine value={invoice.invoice_number} height={34} />
                </div>
                <div className="inv-barcode-number">{invoice.invoice_number}</div>
                <div className="inv-qr-caption">الباركود الخطي — رقم الفاتورة</div>
              </div>

              {/* Totals */}
              <div className="inv-totals-panel">
                <div className="inv-total-row">
                  <span>المجموع الفرعي</span>
                  <span>{money(invoice.subtotal_ex_vat, store.currency)}</span>
                </div>
                {invoice.total_discount > 0 && (
                  <div className="inv-total-row inv-total-discount">
                    <span>الخصم الإجمالي</span>
                    <span>- {money(invoice.total_discount, store.currency)}</span>
                  </div>
                )}
                <div className="inv-total-row">
                  <span>ضريبة القيمة المضافة (15%)</span>
                  <span>{money(invoice.total_vat, store.currency)}</span>
                </div>
                <div className="inv-total-sep" />
                <div className="inv-total-grand">
                  <span>الإجمالي النهائي</span>
                  <span>{money(invoice.grand_total, store.currency)}</span>
                </div>
                {(invoice.change_due ?? 0) > 0 && (
                  <div className="inv-total-row inv-total-change">
                    <span>المبلغ المُعاد</span>
                    <span>{money(invoice.change_due ?? 0, store.currency)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer note */}
            <div className="inv-footer-note">
              شكراً لتسوقكم معنا — نظام رصيد ERP · متوافق مع ZATCA المرحلة الثانية
              · {fmtDateShort(invoice.created_at)}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="invoice-modal-footer">
          <button onClick={onClose} className="inv-btn-close">
            إغلاق
          </button>
          <button onClick={() => handlePrintA4?.()} className="inv-btn-a4">
            <Download size={16} />
            طباعة A4
          </button>
          <button onClick={() => handlePrintThermal?.()} className="inv-btn-print">
            <Printer size={17} />
            طباعة حرارية 80mm
            <CheckCircle2 size={15} style={{ opacity: 0.8 }} />
          </button>
        </div>
      </div>

      {/* ─── Hidden print targets ─── */}
      <div style={{ position: 'absolute', left: '-99999px', top: 0, pointerEvents: 'none' }}>
        <ThermalReceipt ref={thermalRef} invoice={invoice} store={store} />
      </div>
      <div style={{ position: 'absolute', left: '-99999px', top: 0, pointerEvents: 'none' }}>
        <A4PrintTarget ref={a4Ref} invoice={invoice} store={store} />
      </div>
    </div>
  );
};

// ─── Internal helpers ────────────────────────────────────────

const MetaCell: React.FC<{
  icon: React.ReactNode; label: string; value: string; mono?: boolean;
}> = ({ icon, label, value, mono }) => (
  <div className="inv-meta-cell">
    <div className="inv-meta-label">{icon}{label}</div>
    <div className={`inv-meta-value${mono ? ' inv-meta-mono' : ''}`}>{value}</div>
  </div>
);

// A4-specific MetaBox
const MetaBox: React.FC<{
  icon: string; label: string; value: string; mono?: boolean;
}> = ({ icon, label, value, mono }) => (
  <div className="a4-meta-box">
    <span className="a4-meta-icon">{icon}</span>
    <div>
      <div className="a4-meta-label">{label}</div>
      <div className={`a4-meta-value${mono ? ' a4-meta-mono' : ''}`}>{value}</div>
    </div>
  </div>
);

export default InvoicePreviewModal;
