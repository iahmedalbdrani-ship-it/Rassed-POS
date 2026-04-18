// ============================================================
// Control Panel (رصيد) — Invoice Preview Modal
// ─ A4 preview (White Glassmorphism) + hidden 80mm thermal
//   target for react-to-print.
// ─ ZATCA Phase 2: Base64 TLV QR rendered via qrcode.react.
// ─ 1D linear barcode for the invoice number (bottom).
// ─ Reusable from POSCashier (fresh sale) AND InvoicesPage
//   (re-preview of a historical invoice).
// ============================================================
//
// Placement: src/components/pos/InvoicePreviewModal.tsx
// ============================================================

import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { QRCodeSVG } from 'qrcode.react';
import {
  X, Printer, CheckCircle2, FileText, Hash, Building2,
  Calendar, CreditCard,
} from 'lucide-react';

// ─── Shared invoice shape (decoupled from DB / POS types) ────

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
  logo_url?:   string;         // URL — falls back to emoji
  currency:    string;         // e.g. "ر.س"
  zatca_env:   'sandbox' | 'production';
}

export interface PreviewInvoice {
  invoice_number: string;
  created_at:     string;      // ISO
  cashier_name?:  string;
  branch_name?:   string;
  items:          PreviewItem[];
  subtotal_ex_vat: number;
  total_discount:  number;
  total_vat:       number;
  grand_total:     number;
  payment_label:   string;     // "نقدي" | "مدى" | ...
  change_due?:     number;
  zatca_qr:        string;     // Base64 TLV string
  status?:         'paid' | 'refunded' | 'cancelled';
}

interface InvoicePreviewModalProps {
  invoice:  PreviewInvoice;
  store:    PreviewStore;
  onClose:  () => void;
  onAfterPrint?: () => void;   // Called once the browser print dialog closes.
  title?:   string;            // e.g. "معاينة الفاتورة" | "إعادة المعاينة"
}

// ─── Money formatter — keeps (ر.س) + 2 decimals ─────────────
const money = (n: number, currency: string) =>
  `${(Number.isFinite(n) ? n : 0).toFixed(2)} ${currency}`;

// ─── Date formatter (Arabic long) ───────────────────────────
const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ar-SA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
};

// ─── Lightweight 1D barcode (SVG bars — no extra deps) ──────
// Used both in the A4 preview footer and in the hidden 80mm target.
const BarcodeLine: React.FC<{ value: string; height?: number; barWidth?: number }> = ({
  value, height = 42, barWidth = 1.5,
}) => {
  const bars: React.ReactNode[] = [];
  let x = 0;
  for (let i = 0; i < value.length; i++) {
    const w = ((value.charCodeAt(i) % 3) + 1) * barWidth;
    if (i % 2 === 0) {
      bars.push(
        <rect key={i} x={x} y={0} width={w} height={height} fill="#0f172a" />,
      );
    }
    x += w + barWidth;
  }
  return (
    <svg
      viewBox={`0 0 ${Math.max(200, x)} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      {bars}
    </svg>
  );
};

// ══════════════════════════════════════════════════════════════
//  80mm THERMAL RECEIPT — hidden print target
//  Pure inline styles so print CSS never has to find Tailwind.
// ══════════════════════════════════════════════════════════════

const ThermalReceipt = React.forwardRef<HTMLDivElement, {
  invoice: PreviewInvoice;
  store:   PreviewStore;
}>(({ invoice, store }, ref) => (
  <div
    ref={ref}
    dir="rtl"
    style={{
      width: '80mm',
      padding: '4mm 3mm',
      fontFamily: "'Tajawal', 'Courier New', monospace",
      fontSize: '10px',
      color: '#000',
      background: '#fff',
      lineHeight: 1.4,
    }}
  >
    {/* Header */}
    <div style={{ textAlign: 'center', marginBottom: 6 }}>
      {store.logo_url
        ? <img src={store.logo_url} alt="" style={{ maxHeight: 36, margin: '0 auto 2px' }} />
        : <div style={{ fontSize: 22, marginBottom: 2 }}>🏪</div>}
      <div style={{ fontSize: 14, fontWeight: 900 }}>{store.name}</div>
      {store.address && <div style={{ fontSize: 9, color: '#555' }}>{store.address}</div>}
      {store.phone   && <div style={{ fontSize: 9, color: '#555' }}>هاتف: {store.phone}</div>}
      <div style={{ fontSize: 9, color: '#555' }}>الرقم الضريبي: {store.vat_number}</div>
      {store.cr_number && <div style={{ fontSize: 9, color: '#555' }}>السجل التجاري: {store.cr_number}</div>}
    </div>

    <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

    <div style={{ textAlign: 'center', marginBottom: 4 }}>
      <div style={{ fontWeight: 'bold', fontSize: 11 }}>فاتورة ضريبية مبسطة</div>
      <div style={{ fontSize: 9 }}>رقم الفاتورة: {invoice.invoice_number}</div>
      <div style={{ fontSize: 9 }}>التاريخ: {fmtDate(invoice.created_at)}</div>
      {invoice.cashier_name && <div style={{ fontSize: 9 }}>الكاشير: {invoice.cashier_name}</div>}
      {invoice.branch_name  && <div style={{ fontSize: 9 }}>الفرع: {invoice.branch_name}</div>}
    </div>

    <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

    {/* Items */}
    <table style={{ width: '100%', fontSize: 9, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #000' }}>
          <th style={{ textAlign: 'right',  padding: '2px 0', width: '45%' }}>الصنف</th>
          <th style={{ textAlign: 'center', padding: '2px 0', width: '15%' }}>الكمية</th>
          <th style={{ textAlign: 'center', padding: '2px 0', width: '20%' }}>السعر</th>
          <th style={{ textAlign: 'left',   padding: '2px 0', width: '20%' }}>الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        {invoice.items.map((item, i) => (
          <tr key={i} style={{ borderBottom: '1px dotted #ddd' }}>
            <td style={{ padding: '2px 0' }}>{item.name}</td>
            <td style={{ padding: '2px 0', textAlign: 'center' }}>{item.qty}</td>
            <td style={{ padding: '2px 0', textAlign: 'center' }}>{item.unit_price.toFixed(2)}</td>
            <td style={{ padding: '2px 0', textAlign: 'left'   }}>{item.line_total.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>

    <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

    {/* Totals */}
    <div style={{ fontSize: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>المجموع (غير شامل):</span>
        <span>{invoice.subtotal_ex_vat.toFixed(2)} {store.currency}</span>
      </div>
      {invoice.total_discount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>الخصم:</span>
          <span>- {invoice.total_discount.toFixed(2)} {store.currency}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>ضريبة القيمة المضافة (15%):</span>
        <span>{invoice.total_vat.toFixed(2)} {store.currency}</span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontWeight: 'bold', fontSize: 12,
        borderTop: '1px solid #000', marginTop: 3, paddingTop: 3,
      }}>
        <span>الإجمالي المستحق:</span>
        <span>{invoice.grand_total.toFixed(2)} {store.currency}</span>
      </div>
    </div>

    <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

    {/* Payment */}
    <div style={{ fontSize: 9, marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>طريقة الدفع:</span>
        <span>{invoice.payment_label}</span>
      </div>
      {invoice.change_due !== undefined && invoice.change_due > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
          <span>المبلغ المُعاد:</span>
          <span>{invoice.change_due.toFixed(2)} {store.currency}</span>
        </div>
      )}
    </div>

    <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

    {/* QR — ZATCA Base64 TLV */}
    <div style={{ textAlign: 'center', margin: '6px 0' }}>
      <div style={{ fontSize: 9, marginBottom: 4, fontWeight: 'bold' }}>
        رمز الاستجابة السريعة الضريبي (ZATCA)
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <QRCodeSVG value={invoice.zatca_qr} size={80} level="M" />
      </div>
      <div style={{ fontSize: 8, color: '#555', marginTop: 2 }}>
        {store.zatca_env === 'sandbox' ? '(بيئة الاختبار)' : '(بيئة الإنتاج)'}
      </div>
    </div>

    <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

    {/* 1D Barcode — invoice number */}
    <div style={{ textAlign: 'center', margin: '6px 0' }}>
      <div style={{ fontSize: 8, color: '#555', marginBottom: 2 }}>رمز الفاتورة</div>
      <BarcodeLine value={invoice.invoice_number} height={40} />
      <div style={{ fontSize: 8, letterSpacing: 1, marginTop: 2 }}>
        {invoice.invoice_number}
      </div>
    </div>

    <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

    <div style={{ textAlign: 'center', fontSize: 9, marginTop: 6 }}>
      <div style={{ fontWeight: 'bold' }}>شكراً لتسوقكم معنا! 💛</div>
      <div style={{ color: '#555' }}>نظام رصيد ERP</div>
    </div>
  </div>
));
ThermalReceipt.displayName = 'ThermalReceipt';

// ══════════════════════════════════════════════════════════════
//  A4 PREVIEW + MODAL
// ══════════════════════════════════════════════════════════════

const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  invoice, store, onClose, onAfterPrint, title = 'معاينة الفاتورة',
}) => {
  const thermalRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: thermalRef,
    documentTitle: invoice.invoice_number,
    onAfterPrint: () => onAfterPrint?.(),
    // 80mm roll — let the printer driver choose paper; fall back to A4 for office printers.
    pageStyle: `
      @page { size: 80mm auto; margin: 0; }
      @media print {
        html, body { margin: 0; padding: 0; background: #fff; }
      }
    `,
  } as any);

  const statusBadge = invoice.status === 'refunded'
    ? { label: 'مرتجع', bg: 'rgba(244,63,94,0.12)', fg: '#e11d48', border: 'rgba(244,63,94,0.35)' }
    : invoice.status === 'cancelled'
      ? { label: 'ملغاة', bg: 'rgba(148,163,184,0.15)', fg: '#475569', border: 'rgba(148,163,184,0.4)' }
      : { label: 'مدفوعة', bg: 'rgba(16,185,129,0.12)', fg: '#059669', border: 'rgba(16,185,129,0.35)' };

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed', inset: 0, zIndex: 2500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
        fontFamily: "'Tajawal', sans-serif",
        animation: 'previewFadeIn 0.25s ease both',
      }}
    >
      {/* local keyframes — no tailwind dependency for the modal chrome */}
      <style>{`
        @keyframes previewFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes previewScaleIn {
          from { opacity: 0; transform: translateY(14px) scale(.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);   }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(15,23,42,0.55)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      />

      {/* Modal shell */}
      <div
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: 820, maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(255,253,245,0.95) 100%)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          border: '1.5px solid rgba(255,255,255,0.6)',
          borderRadius: '2.5rem',
          boxShadow: '0 32px 80px rgba(0,0,0,0.22)',
          animation: 'previewScaleIn 0.3s cubic-bezier(.34,1.56,.64,1) both',
          overflow: 'hidden',
        }}
      >
        {/* Modal header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1.1rem 1.5rem',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            background: 'rgba(255,255,255,0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 42, height: 42,
              borderRadius: '1rem',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', boxShadow: '0 6px 18px rgba(245,158,11,0.35)',
            }}>
              <FileText size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.05rem', color: '#0f172a' }}>{title}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                راجع البيانات ثم اضغط "تأكيد وطباعة"
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              background: 'rgba(0,0,0,0.05)', border: 'none',
              width: 36, height: 36, borderRadius: 999,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} color="#64748b" />
          </button>
        </div>

        {/* Scrollable A4 preview */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '1.5rem',
            background: 'linear-gradient(180deg, rgba(245,247,252,0.4), rgba(255,255,255,0.2))',
          }}
        >
          {/* A4 sheet */}
          <div
            id="invoice-a4-preview"
            style={{
              width: '100%', maxWidth: 680, margin: '0 auto',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.88), rgba(255,255,255,0.78))',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.8)',
              borderRadius: '2.5rem',
              padding: '2.25rem',
              boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
              color: '#0f172a',
            }}
          >
            {/* Top — logo + status */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              gap: '1rem', marginBottom: '1.25rem',
            }}>
              <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center' }}>
                {store.logo_url
                  ? <img src={store.logo_url} alt="logo" style={{
                      width: 56, height: 56, objectFit: 'contain',
                      borderRadius: '1rem',
                      background: 'rgba(255,255,255,0.6)',
                      padding: 4, border: '1px solid rgba(0,0,0,0.05)',
                    }}/>
                  : <div style={{
                      width: 56, height: 56, borderRadius: '1rem',
                      background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 28,
                    }}>🏪</div>}
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{store.name}</div>
                  {store.name_en && (
                    <div style={{ fontSize: 12, color: '#64748b', letterSpacing: 0.3 }}>
                      {store.name_en}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    <span>الرقم الضريبي: {store.vat_number || '—'}</span>
                    {store.cr_number && (
                      <>
                        <span style={{ margin: '0 6px' }}>|</span>
                        <span>السجل التجاري: {store.cr_number}</span>
                      </>
                    )}
                  </div>
                  {(store.address || store.phone) && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {store.address} {store.phone && `· ${store.phone}`}
                    </div>
                  )}
                </div>
              </div>

              <div style={{
                padding: '0.4rem 0.9rem',
                background: statusBadge.bg,
                color: statusBadge.fg,
                border: `1px solid ${statusBadge.border}`,
                borderRadius: 999,
                fontSize: 12, fontWeight: 800,
              }}>
                {statusBadge.label}
              </div>
            </div>

            {/* Invoice meta grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))',
              gap: '0.75rem',
              padding: '0.9rem 1rem',
              background: 'rgba(255,255,255,0.55)',
              border: '1px solid rgba(0,0,0,0.05)',
              borderRadius: '1.25rem',
              marginBottom: '1.25rem',
            }}>
              <MetaCell
                icon={<Hash size={14} />}
                label="رقم الفاتورة"
                value={invoice.invoice_number}
                mono
              />
              <MetaCell
                icon={<Calendar size={14} />}
                label="التاريخ والوقت"
                value={fmtDate(invoice.created_at)}
              />
              <MetaCell
                icon={<CreditCard size={14} />}
                label="طريقة الدفع"
                value={invoice.payment_label}
              />
              <MetaCell
                icon={<Building2 size={14} />}
                label="الفرع"
                value={invoice.branch_name ?? '—'}
              />
            </div>

            <div style={{ fontSize: '1rem', fontWeight: 900, margin: '0 0 0.6rem' }}>
              فاتورة ضريبية مبسطة
            </div>

            {/* Items table */}
            <div style={{
              overflow: 'hidden',
              borderRadius: '1.25rem',
              border: '1px solid rgba(0,0,0,0.06)',
              marginBottom: '1.25rem',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(245,158,11,0.08)' }}>
                    <th style={thCell}>#</th>
                    <th style={{ ...thCell, textAlign: 'right', width: '40%' }}>الصنف</th>
                    <th style={thCell}>الكمية</th>
                    <th style={thCell}>السعر</th>
                    <th style={thCell}>خصم %</th>
                    <th style={thCell}>الضريبة</th>
                    <th style={{ ...thCell, textAlign: 'left' }}>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                      <td style={tdCell}>{i + 1}</td>
                      <td style={{ ...tdCell, textAlign: 'right' }}>
                        <div style={{ fontWeight: 700 }}>{item.name}</div>
                        {item.barcode && (
                          <div style={{ fontSize: 10, color: '#94a3b8', direction: 'ltr' }}>
                            {item.barcode}
                          </div>
                        )}
                      </td>
                      <td style={tdCell}>{item.qty}</td>
                      <td style={tdCell}>{money(item.unit_price, store.currency)}</td>
                      <td style={tdCell}>{item.discount_pct || 0}%</td>
                      <td style={tdCell}>{money(item.vat_amount, store.currency)}</td>
                      <td style={{ ...tdCell, textAlign: 'left', fontWeight: 800 }}>
                        {money(item.line_total, store.currency)}
                      </td>
                    </tr>
                  ))}
                  {invoice.items.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ ...tdCell, textAlign: 'center', color: '#94a3b8', padding: 16 }}>
                        لا توجد أصناف
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals block */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1rem',
              alignItems: 'end',
            }}>
              <div>
                {/* QR code + linear barcode */}
                <div style={{
                  display: 'flex', gap: '1rem', alignItems: 'center',
                  padding: '0.9rem 1rem',
                  background: 'rgba(255,255,255,0.6)',
                  border: '1px solid rgba(0,0,0,0.05)',
                  borderRadius: '1.25rem',
                }}>
                  <div style={{
                    background: '#fff', padding: 6, borderRadius: 12,
                    border: '1px solid rgba(0,0,0,0.06)',
                    display: 'flex',
                  }}>
                    <QRCodeSVG value={invoice.zatca_qr} size={96} level="M" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                      ZATCA Base64 TLV
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>
                      رمز الاستجابة السريعة الضريبي
                    </div>
                    <BarcodeLine value={invoice.invoice_number} height={38} />
                    <div style={{
                      fontSize: 11, color: '#475569', marginTop: 4,
                      letterSpacing: 1, textAlign: 'center',
                    }}>
                      {invoice.invoice_number}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{
                padding: '1rem 1.1rem',
                background: 'linear-gradient(145deg, rgba(15,23,42,0.94), rgba(30,41,59,0.94))',
                borderRadius: '1.5rem',
                color: '#fff',
              }}>
                <TotalRow
                  label="الإجمالي الفرعي"
                  value={money(invoice.subtotal_ex_vat, store.currency)}
                />
                {invoice.total_discount > 0 && (
                  <TotalRow
                    label="الخصم"
                    value={`- ${money(invoice.total_discount, store.currency)}`}
                    accent="#fb7185"
                  />
                )}
                <TotalRow
                  label="ضريبة القيمة المضافة (15%)"
                  value={money(invoice.total_vat, store.currency)}
                />
                <div style={{
                  borderTop: '1px dashed rgba(255,255,255,0.2)',
                  margin: '0.5rem 0',
                }} />
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontWeight: 900, fontSize: '1.2rem',
                }}>
                  <span style={{ color: '#fcd34d' }}>الإجمالي النهائي</span>
                  <span>{money(invoice.grand_total, store.currency)}</span>
                </div>
              </div>
            </div>

            <div style={{
              marginTop: '1.5rem', textAlign: 'center',
              fontSize: 12, color: '#94a3b8',
            }}>
              شكراً لتسوقكم معنا — نظام رصيد ERP • متوافق مع ZATCA Phase 2
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: 'flex', gap: '0.75rem',
            padding: '1rem 1.5rem',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            background: 'rgba(255,255,255,0.55)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '0.9rem',
              borderRadius: '1rem',
              border: '1.5px solid rgba(0,0,0,0.08)',
              background: 'rgba(255,255,255,0.85)',
              color: '#475569', fontWeight: 700, fontSize: '0.9rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            إغلاق
          </button>
          <button
            onClick={() => handlePrint?.()}
            style={{
              flex: 2.4, padding: '0.9rem',
              borderRadius: '1rem', border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff', fontWeight: 900, fontSize: '1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              boxShadow: '0 10px 28px rgba(245,158,11,0.35)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Printer size={18} />
            تأكيد وطباعة الفاتورة
            <CheckCircle2 size={16} style={{ opacity: 0.75 }} />
          </button>
        </div>
      </div>

      {/* ─── Hidden 80mm thermal target for react-to-print ─── */}
      <div style={{ position: 'absolute', left: '-10000px', top: 0 }}>
        <ThermalReceipt ref={thermalRef} invoice={invoice} store={store} />
      </div>
    </div>
  );
};

// ─── Internal presentational helpers ────────────────────────
const thCell: React.CSSProperties = {
  padding: '0.65rem 0.6rem',
  textAlign: 'center',
  fontWeight: 800,
  fontSize: 12,
  color: '#92400e',
};
const tdCell: React.CSSProperties = {
  padding: '0.6rem',
  textAlign: 'center',
  fontSize: 13,
  color: '#0f172a',
};

const MetaCell: React.FC<{
  icon:  React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}> = ({ icon, label, value, mono }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      color: '#94a3b8', fontSize: 11, fontWeight: 700,
    }}>
      {icon}
      {label}
    </div>
    <div style={{
      fontWeight: 800, color: '#0f172a', marginTop: 2,
      fontSize: 13,
      fontFamily: mono ? "'Courier New', monospace" : 'inherit',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {value}
    </div>
  </div>
);

const TotalRow: React.FC<{ label: string; value: string; accent?: string }> = ({
  label, value, accent,
}) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between',
    padding: '0.35rem 0', fontSize: 13,
    color: accent ?? '#cbd5e1',
  }}>
    <span>{label}</span>
    <span style={{ fontWeight: 800, color: accent ?? '#fff' }}>{value}</span>
  </div>
);

export default InvoicePreviewModal;
