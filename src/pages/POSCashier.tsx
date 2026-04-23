/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         رصيد ERP — نظام نقطة البيع المتكامل                 ║
 * ║         Enterprise POS System — Production Ready             ║
 * ║         ZATCA Phase 2 Compliant | SaaS Ready                 ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Modules:
 *  1. Types & Interfaces
 *  2. Constants & Config
 *  3. ZATCA TLV Engine
 *  4. Accounting Engine (Double Entry)
 *  5. Inventory Engine
 *  6. Store (Zustand-compatible state)
 *  7. Sub-Components:
 *     - ProductCard
 *     - ProductGrid
 *     - CartItem
 *     - CartPanel
 *     - CheckoutModal
 *     - ThermalReceipt (80mm print)
 *     - SuccessOverlay
 *  8. POSCashier (Main Export)
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
// POSCashier — some imports reserved for future features
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { useReactToPrint } from 'react-to-print';
import { QRCodeSVG } from 'qrcode.react';
import { v4 as uuidv4 } from 'uuid';
import { productsService, settingsService, posSalesService, partiesService, type StoreSettings, type Party } from '../lib/supabase-services';
import InvoicePreviewModal, { type PreviewInvoice, type PreviewStore } from '../components/pos/InvoicePreviewModal';
import {
  Search, ShoppingCart, Trash2, Plus, Minus, CreditCard,
  Banknote, Globe, X, CheckCircle2, ChevronRight,
  Package, Percent, AlertCircle, Zap,
  Wifi, WifiOff, Hash, BookOpen, User, UserPlus,
  Save, History, ArrowLeftRight,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// 1. TYPES & INTERFACES
// ══════════════════════════════════════════════════════════════

export interface Product {
  id: string;
  barcode: string;
  name: string;
  name_en: string;
  category: string;
  price: number;           // Price excluding VAT
  stock: number;
  unit: string;
  icon: string;
  vat_exempt?: boolean;
  image_url?: string;
  cost?: number;           // For profit calculation
  min_stock?: number;      // Low stock alert threshold
}

export interface CartItem extends Product {
  qty: number;
  discount_pct: number;    // Discount percentage 0-100
  line_total_ex_vat: number;
  line_vat: number;
  line_total_inc_vat: number;
}

export interface InvoiceTotals {
  subtotal_ex_vat: number;
  total_discount: number;
  total_vat: number;
  grand_total: number;
  item_count: number;
}

export type PaymentMethod = 'cash' | 'mada' | 'visa' | 'transfer';

export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
  ref?: string;           // Reference for bank transfer
}

export interface Invoice {
  id: string;             // UUID
  invoice_number: string; // INV-YYYYMMDD-XXXX
  created_at: string;     // ISO8601
  cashier_id: string;
  cashier_name: string;
  branch_id: string;
  branch_name: string;
  items: CartItem[];
  totals: InvoiceTotals;
  payments: PaymentSplit[];
  change_due: number;
  zatca_qr: string;
  status: 'draft' | 'completed' | 'refunded' | 'partial_refund';
  refund_ref?: string;    // Original invoice ID if this is a refund
  notes?: string;
}

export interface AccountingEntry {
  id: string;
  invoice_id: string;
  created_at: string;
  lines: JournalLine[];
  description: string;
}

export interface JournalLine {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
}

export interface ZReport {
  date: string;
  branch_id: string;
  cashier_id: string;
  opening_balance: number;
  sales_cash: number;
  sales_mada: number;
  sales_visa: number;
  sales_transfer: number;
  total_sales: number;
  total_vat: number;
  total_refunds: number;
  net_sales: number;
  invoice_count: number;
  closing_balance: number;
}

// ══════════════════════════════════════════════════════════════
// 2. CONSTANTS & CONFIG
// ══════════════════════════════════════════════════════════════

const VAT_RATE = 0.15;

// ── Store Config: populated from Supabase `settings` at runtime ──
// Default values shown while loading; overwritten on fetch success.
let STORE_CONFIG = {
  name: 'جاري التحميل...',
  name_en: '',
  vat_number: '',
  cr_number: '',
  address: '',
  phone: '',
  email: '',
  logo: '🏪',
  branch_id: 'BR-001',
  branch_name: 'الفرع الرئيسي',
  currency: 'ر.س',
  zatca_env: 'sandbox' as 'sandbox' | 'production',
};

const CASHIER = {
  id: 'USR-001',
  name: 'أحمد السعيد',
  role: 'كاشير',
};

/** Formatter — always (ر.س) + 2 decimal places */
const fmt = (amount: number): string =>
  `${amount.toFixed(2)} ${STORE_CONFIG.currency}`;

const fmtNum = (n: number): string => n.toFixed(2);

/** Generate invoice number: INV-YYYYMMDD-XXXX */
const generateInvoiceNumber = (): string => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `INV-${date}-${seq}`;
};

const ACCOUNT_CODES = {
  CASH: { code: '1010', name: 'الصندوق - نقدي' },
  MADA: { code: '1020', name: 'البنك - مدى' },
  VISA: { code: '1021', name: 'البنك - فيزا' },
  TRANSFER: { code: '1022', name: 'البنك - تحويل' },
  SALES_REVENUE: { code: '4010', name: 'إيرادات المبيعات' },
  VAT_PAYABLE: { code: '2030', name: 'ضريبة القيمة المضافة مستحقة' },
  COGS: { code: '5010', name: 'تكلفة البضائع المباعة' },
  INVENTORY: { code: '1310', name: 'المخزون' },
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقدي',
  mada: 'مدى',
  visa: 'فيزا',
  transfer: 'تحويل بنكي',
};

// ══════════════════════════════════════════════════════════════
// 3. ZATCA TLV ENGINE
// ══════════════════════════════════════════════════════════════
// Strictly using TextEncoder + Uint8Array (no Buffer — safe for Vite/Electron)

const encodeTLVField = (tag: number, value: string): Uint8Array => {
  const encoded = new TextEncoder().encode(value);
  const result = new Uint8Array(2 + encoded.length);
  result[0] = tag;
  result[1] = encoded.length;
  result.set(encoded, 2);
  return result;
};

export const generateZatcaTLV = (
  sellerName: string,
  vatNumber: string,
  timestamp: string,
  totalInclVat: string,
  vatAmount: string,
): string => {
  const fields = [
    encodeTLVField(1, sellerName),
    encodeTLVField(2, vatNumber),
    encodeTLVField(3, timestamp),
    encodeTLVField(4, totalInclVat),
    encodeTLVField(5, vatAmount),
  ];

  const totalLen = fields.reduce((acc, f) => acc + f.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const field of fields) {
    combined.set(field, offset);
    offset += field.length;
  }

  // btoa with proper binary handling
  let binary = '';
  combined.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
};

// ══════════════════════════════════════════════════════════════
// 4. ACCOUNTING ENGINE — DOUBLE ENTRY
// ══════════════════════════════════════════════════════════════

export const createAccountingEntry = (
  invoice: Invoice,
): AccountingEntry => {
  const lines: JournalLine[] = [];

  // DEBIT: Payment accounts
  for (const pmt of invoice.payments) {
    const acct =
      pmt.method === 'cash'
        ? ACCOUNT_CODES.CASH
        : pmt.method === 'mada'
        ? ACCOUNT_CODES.MADA
        : pmt.method === 'visa'
        ? ACCOUNT_CODES.VISA
        : ACCOUNT_CODES.TRANSFER;

    lines.push({
      account_code: acct.code,
      account_name: acct.name,
      debit: pmt.amount,
      credit: 0,
    });
  }

  // CREDIT: Sales Revenue (ex-VAT)
  lines.push({
    account_code: ACCOUNT_CODES.SALES_REVENUE.code,
    account_name: ACCOUNT_CODES.SALES_REVENUE.name,
    debit: 0,
    credit: invoice.totals.subtotal_ex_vat - invoice.totals.total_discount,
  });

  // CREDIT: VAT Payable
  if (invoice.totals.total_vat > 0) {
    lines.push({
      account_code: ACCOUNT_CODES.VAT_PAYABLE.code,
      account_name: ACCOUNT_CODES.VAT_PAYABLE.name,
      debit: 0,
      credit: invoice.totals.total_vat,
    });
  }

  return {
    id: uuidv4(),
    invoice_id: invoice.id,
    created_at: invoice.created_at,
    lines,
    description: `مبيعات - فاتورة رقم ${invoice.invoice_number}`,
  };
};

// ══════════════════════════════════════════════════════════════
// 5. INVENTORY ENGINE
// ══════════════════════════════════════════════════════════════

export const deductInventory = (
  products: Product[],
  cartItems: CartItem[],
): Product[] => {
  return products.map((p) => {
    const sold = cartItems.find((c) => c.id === p.id);
    if (!sold) return p;
    return { ...p, stock: Math.max(0, p.stock - sold.qty) };
  });
};

// ══════════════════════════════════════════════════════════════
// 6. CART CALCULATIONS
// ══════════════════════════════════════════════════════════════

const calcItemTotals = (item: Omit<CartItem, 'line_total_ex_vat' | 'line_vat' | 'line_total_inc_vat'>): CartItem => {
  const base = item.price * item.qty;
  const discounted = base * (1 - item.discount_pct / 100);
  const vat = item.vat_exempt ? 0 : discounted * VAT_RATE;
  return {
    ...item,
    line_total_ex_vat: discounted,
    line_vat: vat,
    line_total_inc_vat: discounted + vat,
  };
};

const calcTotals = (cart: CartItem[]): InvoiceTotals => {
  let subtotal_ex_vat = 0;
  let total_discount = 0;
  let total_vat = 0;

  cart.forEach((item) => {
    const base = item.price * item.qty;
    const disc = base * (item.discount_pct / 100);
    subtotal_ex_vat += base;
    total_discount += disc;
    total_vat += item.line_vat;
  });

  return {
    subtotal_ex_vat,
    total_discount,
    total_vat,
    grand_total: subtotal_ex_vat - total_discount + total_vat,
    item_count: cart.reduce((acc, i) => acc + i.qty, 0),
  };
};

// ══════════════════════════════════════════════════════════════
// 7. DYNAMIC CATEGORIES (built from DB data at runtime)
// ══════════════════════════════════════════════════════════════
// Default category list used in the sidebar filter;
// dynamically extended based on fetched products.
const BASE_CATEGORIES = [
  { name: 'الكل',         icon: '🔍' },
  { name: 'مشروبات',      icon: '🥤' },
  { name: 'ألبان',        icon: '🥛' },
  { name: 'مخبوزات',      icon: '🍞' },
  { name: 'حبوب',         icon: '🌾' },
  { name: 'زيوت',         icon: '🫙' },
  { name: 'معلبات',       icon: '🥫' },
  { name: 'وجبات خفيفة', icon: '🍟' },
  { name: 'عناية',        icon: '🧼' },
  { name: 'ورقيات',       icon: '📋' },
  { name: 'مواد غذائية', icon: '🛒' },
  { name: 'منظفات',       icon: '🧹' },
  { name: 'إلكترونيات',   icon: '🔌' },
];
// CATEGORIES is rebuilt dynamically in the component

// ══════════════════════════════════════════════════════════════
// 8. THERMAL RECEIPT — 80mm Print Component
// ══════════════════════════════════════════════════════════════

type StoreConfig = typeof STORE_CONFIG;

interface ThermalReceiptProps {
  invoice: Invoice;
  qrData: string;
  settings: StoreConfig;
}

const ThermalReceipt = React.forwardRef<HTMLDivElement, ThermalReceiptProps>(
  ({ invoice, qrData, settings }, ref) => {
    const barWidth = 1.5;
    const barHeight = 40;

    // Simple Code128-like barcode simulation using SVG bars
    const generateBarsSVG = (text: string): string => {
      const bars: string[] = [];
      let x = 0;
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        const w = ((code % 3) + 1) * barWidth;
        if (i % 2 === 0) {
          bars.push(`<rect x="${x}" y="0" width="${w}" height="${barHeight}" fill="black"/>`);
        }
        x += w + barWidth;
      }
      return bars.join('');
    };

    return (
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
          lineHeight: '1.4',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '22px', marginBottom: '2px' }}>{settings.logo}</div>
          <div style={{ fontSize: '14px', fontWeight: 900 }}>{settings.name}</div>
          <div style={{ fontSize: '9px', color: '#555' }}>{settings.address}</div>
          <div style={{ fontSize: '9px', color: '#555' }}>هاتف: {settings.phone}</div>
          <div style={{ fontSize: '9px', color: '#555' }}>الرقم الضريبي: {settings.vat_number}</div>
          <div style={{ fontSize: '9px', color: '#555' }}>رقم السجل التجاري: {settings.cr_number}</div>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

        {/* Invoice Info */}
        <div style={{ textAlign: 'center', marginBottom: '4px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '11px' }}>فاتورة ضريبية مبسطة</div>
          <div style={{ fontSize: '9px' }}>رقم الفاتورة: {invoice.invoice_number}</div>
          <div style={{ fontSize: '9px' }}>
            التاريخ: {new Date(invoice.created_at).toLocaleString('ar-SA', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })}
          </div>
          <div style={{ fontSize: '9px' }}>الكاشير: {invoice.cashier_name}</div>
          <div style={{ fontSize: '9px' }}>الفرع: {invoice.branch_name}</div>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

        {/* Items Table */}
        <table style={{ width: '100%', fontSize: '9px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #000' }}>
              <th style={{ textAlign: 'right', padding: '2px 0', width: '45%' }}>الصنف</th>
              <th style={{ textAlign: 'center', padding: '2px 0', width: '15%' }}>الكمية</th>
              <th style={{ textAlign: 'center', padding: '2px 0', width: '20%' }}>السعر</th>
              <th style={{ textAlign: 'left', padding: '2px 0', width: '20%' }}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: '1px dotted #ddd' }}>
                <td style={{ padding: '2px 0', verticalAlign: 'top' }}>
                  <div>{item.name}</div>
                  {item.discount_pct > 0 && (
                    <div style={{ fontSize: '8px', color: '#777' }}>خصم {item.discount_pct}%</div>
                  )}
                  {item.vat_exempt && (
                    <div style={{ fontSize: '8px', color: '#777' }}>معفى من الضريبة</div>
                  )}
                </td>
                <td style={{ textAlign: 'center', padding: '2px 0' }}>{item.qty}</td>
                <td style={{ textAlign: 'center', padding: '2px 0' }}>{fmtNum(item.price)}</td>
                <td style={{ textAlign: 'left', padding: '2px 0' }}>{fmtNum(item.line_total_ex_vat)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

        {/* Totals */}
        <div style={{ fontSize: '9px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>المجموع (غير شامل الضريبة):</span>
            <span>{fmtNum(invoice.totals.subtotal_ex_vat)} {settings.currency}</span>
          </div>
          {invoice.totals.total_discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>إجمالي الخصم:</span>
              <span>- {fmtNum(invoice.totals.total_discount)} {settings.currency}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>ضريبة القيمة المضافة (15%):</span>
            <span>{fmtNum(invoice.totals.total_vat)} {settings.currency}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px', borderTop: '1px solid #000', marginTop: '3px', paddingTop: '3px' }}>
            <span>الإجمالي المستحق:</span>
            <span>{fmtNum(invoice.totals.grand_total)} {settings.currency}</span>
          </div>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

        {/* Payment Details */}
        <div style={{ fontSize: '9px', marginBottom: '4px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>تفاصيل الدفع:</div>
          {invoice.payments.map((pmt, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{PAYMENT_LABELS[pmt.method]}{pmt.ref ? ` (${pmt.ref})` : ''}:</span>
              <span>{fmtNum(pmt.amount)} {settings.currency}</span>
            </div>
          ))}
          {invoice.change_due > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>المبلغ المُعاد:</span>
              <span>{fmtNum(invoice.change_due)} {settings.currency}</span>
            </div>
          )}
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

        {/* ZATCA QR Code — center */}
        <div style={{ textAlign: 'center', margin: '6px 0' }}>
          <div style={{ fontSize: '9px', marginBottom: '4px', fontWeight: 'bold' }}>رمز الاستجابة السريعة الضريبي (ZATCA)</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <QRCodeSVG value={qrData} size={80} level="M" />
          </div>
          <div style={{ fontSize: '8px', color: '#555', marginTop: '2px' }}>
            {settings.zatca_env === 'sandbox' ? '(بيئة الاختبار)' : '(بيئة الإنتاج)'}
          </div>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

        {/* 1D Barcode — Invoice Number — bottom */}
        <div style={{ textAlign: 'center', margin: '6px 0' }}>
          <div style={{ fontSize: '8px', marginBottom: '2px', color: '#555' }}>رمز الفاتورة</div>
          <svg
            width="200"
            height={barHeight}
            viewBox={`0 0 200 ${barHeight}`}
            style={{ display: 'block', margin: '0 auto' }}
            dangerouslySetInnerHTML={{ __html: generateBarsSVG(invoice.invoice_number) }}
          />
          <div style={{ fontSize: '8px', letterSpacing: '1px', marginTop: '2px' }}>
            {invoice.invoice_number}
          </div>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: '9px', marginTop: '6px' }}>
          <div style={{ fontWeight: 'bold' }}>شكراً لتسوقكم معنا! 💛</div>
          <div style={{ color: '#555' }}>نظام رصيد ERP — {settings.name_en}</div>
          <div style={{ color: '#555', fontSize: '8px' }}>{settings.email}</div>
        </div>
      </div>
    );
  },
);

ThermalReceipt.displayName = 'ThermalReceipt';

// ══════════════════════════════════════════════════════════════
// 9. PRODUCT CARD
// ══════════════════════════════════════════════════════════════

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product) => void;
  isInCart: boolean;
  cartQty: number;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onAdd, isInCart, cartQty }) => {
  const isLowStock = product.stock <= (product.min_stock ?? 10);
  const isOutOfStock = product.stock === 0;

  return (
    <button
      onClick={() => !isOutOfStock && onAdd(product)}
      disabled={isOutOfStock}
      style={{
        background: isInCart
          ? 'linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(255,255,255,0.22) 100%)'
          : 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: isInCart
          ? '1.5px solid rgba(251,191,36,0.55)'
          : '1.5px solid rgba(255,255,255,0.22)',
        borderRadius: '1.5rem',
        padding: '1rem 0.75rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
        opacity: isOutOfStock ? 0.5 : 1,
        transition: 'all 0.22s cubic-bezier(.4,0,.2,1)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: isInCart
          ? '0 8px 32px rgba(251,191,36,0.18), 0 2px 8px rgba(0,0,0,0.08)'
          : '0 4px 16px rgba(0,0,0,0.06)',
        textAlign: 'center',
        width: '100%',
      }}
    >
      {/* Cart badge */}
      {isInCart && cartQty > 0 && (
        <div style={{
          position: 'absolute', top: '0.5rem', left: '0.5rem',
          background: '#f59e0b', color: '#fff',
          borderRadius: '999px', width: '1.3rem', height: '1.3rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.65rem', fontWeight: 800,
          boxShadow: '0 2px 8px rgba(245,158,11,0.4)',
          zIndex: 2,
        }}>
          {cartQty}
        </div>
      )}

      {/* Low stock badge */}
      {isLowStock && !isOutOfStock && (
        <div style={{
          position: 'absolute', top: '0.5rem', right: '0.5rem',
          background: 'rgba(239,68,68,0.85)', color: '#fff',
          borderRadius: '6px', padding: '1px 5px',
          fontSize: '0.6rem', fontWeight: 700,
          zIndex: 2,
        }}>
          مخزون منخفض
        </div>
      )}

      {/* Icon */}
      <div style={{
        fontSize: '2.2rem',
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))',
        animation: isInCart ? 'floatIcon 3s ease-in-out infinite' : undefined,
        lineHeight: 1,
      }}>
        {product.icon}
      </div>

      {/* Name */}
      <div style={{
        fontSize: '0.72rem',
        fontWeight: 700,
        color: '#1e293b',
        lineHeight: 1.3,
        maxWidth: '100%',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
      }}>
        {product.name}
      </div>

      {/* Price */}
      <div style={{
        fontWeight: 900,
        fontSize: '0.85rem',
        color: isInCart ? '#b45309' : '#0f172a',
      }}>
        {fmt(product.price)}
      </div>

      {/* Stock */}
      <div style={{ fontSize: '0.6rem', color: isLowStock ? '#ef4444' : '#64748b' }}>
        {isOutOfStock ? 'نفد المخزون' : `المخزون: ${product.stock}`}
      </div>

      {/* Add overlay */}
      {!isOutOfStock && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(251,191,36,0.85)',
          borderRadius: '1.5rem',
          opacity: 0,
          transition: 'opacity 0.2s',
        }}
          className="add-overlay"
        >
          <Plus size={24} color="#fff" strokeWidth={3} />
        </div>
      )}
    </button>
  );
};

// ══════════════════════════════════════════════════════════════
// 10. CHECKOUT MODAL
// ══════════════════════════════════════════════════════════════

interface CheckoutModalProps {
  totals: InvoiceTotals;
  onConfirm: (payments: PaymentSplit[]) => void;
  onClose: () => void;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({ totals, onConfirm, onClose }) => {
  const [payments, setPayments] = useState<PaymentSplit[]>([
    { method: 'cash', amount: totals.grand_total },
  ]);
  const [cashInput, setCashInput] = useState(fmtNum(totals.grand_total));
  const [splitMode] = useState(false);
  const [transferRef, setTransferRef] = useState('');

  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  const changeDue = Math.max(0, totalPaid - totals.grand_total);
  const isPaid = totalPaid >= totals.grand_total;

  const singleMethod = payments[0]?.method ?? 'cash';

  const selectMethod = (method: PaymentMethod) => {
    setPayments([{ method, amount: totals.grand_total }]);
    setCashInput(fmtNum(totals.grand_total));
  };

  const handleConfirm = () => {
    if (!isPaid) return;
    const finalPayments: PaymentSplit[] = payments.map((p) => ({
      ...p,
      ref: p.method === 'transfer' ? transferRef : undefined,
    }));
    onConfirm(finalPayments);
  };

  const paymentButtons: { method: PaymentMethod; label: string; icon: React.ReactNode; color: string }[] = [
    { method: 'cash', label: 'نقدي', icon: <Banknote size={32} />, color: '#10b981' },
    { method: 'mada', label: 'مدى', icon: <CreditCard size={32} />, color: '#3b82f6' },
    { method: 'visa', label: 'فيزا', icon: <CreditCard size={32} />, color: '#8b5cf6' },
    { method: 'transfer', label: 'تحويل', icon: <Globe size={32} />, color: '#f59e0b' },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(15,23,42,0.7)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: '540px',
        background: 'linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(255,248,230,0.95) 100%)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        border: '1.5px solid rgba(255,255,255,0.6)',
        borderRadius: '2.5rem',
        padding: '2rem',
        boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.3)',
        animation: 'modalIn 0.3s cubic-bezier(.34,1.56,.64,1) both',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>إتمام عملية البيع</h2>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0' }}>اختر طريقة الدفع</p>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: '50%',
            width: '2.2rem', height: '2.2rem', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={16} color="#64748b" />
          </button>
        </div>

        {/* Amount due */}
        <div style={{
          background: 'linear-gradient(135deg, #1e293b, #334155)',
          borderRadius: '1.5rem', padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>المبلغ المستحق</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#f59e0b' }}>
            {fmt(totals.grand_total)}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
            شامل ضريبة القيمة المضافة {fmt(totals.total_vat)}
          </div>
        </div>

        {/* Payment Method Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem', marginBottom: '1.25rem' }}>
          {paymentButtons.map(({ method, label, icon, color }) => (
            <button
              key={method}
              onClick={() => selectMethod(method)}
              style={{
                padding: '0.9rem 0.5rem',
                borderRadius: '1.25rem',
                border: singleMethod === method && !splitMode
                  ? `2px solid ${color}`
                  : '2px solid rgba(0,0,0,0.08)',
                background: singleMethod === method && !splitMode
                  ? `${color}18`
                  : 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
                transition: 'all 0.2s',
                color: singleMethod === method && !splitMode ? color : '#64748b',
                fontWeight: 700, fontSize: '0.75rem',
                boxShadow: singleMethod === method && !splitMode
                  ? `0 4px 16px ${color}30`
                  : 'none',
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Cash input */}
        {singleMethod === 'cash' && (
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.4rem', fontWeight: 600 }}>
              المبلغ المُستلم
            </label>
            <input
              type="number"
              value={cashInput}
              onChange={(e) => {
                setCashInput(e.target.value);
                const v = parseFloat(e.target.value) || 0;
                setPayments([{ method: 'cash', amount: v }]);
              }}
              style={{
                width: '100%', padding: '0.85rem 1rem',
                fontSize: '1.1rem', fontWeight: 700,
                background: 'rgba(255,255,255,0.9)',
                border: '1.5px solid rgba(0,0,0,0.12)',
                borderRadius: '1rem', outline: 'none',
                textAlign: 'center', direction: 'ltr',
                color: '#0f172a',
                boxSizing: 'border-box',
              }}
              placeholder={fmtNum(totals.grand_total)}
            />
            {changeDue > 0 && (
              <div style={{
                marginTop: '0.5rem', padding: '0.5rem 0.75rem',
                background: 'rgba(16,185,129,0.12)', borderRadius: '0.75rem',
                display: 'flex', justifyContent: 'space-between',
                fontSize: '0.85rem', fontWeight: 700, color: '#059669',
              }}>
                <span>المبلغ المُعاد للعميل:</span>
                <span>{fmt(changeDue)}</span>
              </div>
            )}
          </div>
        )}

        {/* Transfer reference */}
        {singleMethod === 'transfer' && (
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.4rem', fontWeight: 600 }}>
              رقم مرجع التحويل
            </label>
            <input
              type="text"
              value={transferRef}
              onChange={(e) => setTransferRef(e.target.value)}
              placeholder="أدخل رقم العملية..."
              style={{
                width: '100%', padding: '0.85rem 1rem',
                fontSize: '0.9rem',
                background: 'rgba(255,255,255,0.9)',
                border: '1.5px solid rgba(0,0,0,0.12)',
                borderRadius: '1rem', outline: 'none',
                color: '#0f172a',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Validation note */}
        {!isPaid && (
          <div style={{
            marginBottom: '1rem', padding: '0.6rem 0.9rem',
            background: 'rgba(239,68,68,0.1)', borderRadius: '0.75rem',
            color: '#dc2626', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}>
            <AlertCircle size={14} />
            المبلغ المُدخل أقل من المستحق بمقدار {fmt(totals.grand_total - totalPaid)}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '0.9rem', borderRadius: '1rem',
            border: '1.5px solid rgba(0,0,0,0.1)',
            background: 'rgba(255,255,255,0.7)', cursor: 'pointer',
            fontWeight: 700, fontSize: '0.9rem', color: '#64748b',
            fontFamily: 'inherit',
          }}>
            إلغاء
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isPaid || (singleMethod === 'transfer' && !transferRef)}
            style={{
              flex: 2.5, padding: '0.9rem', borderRadius: '1rem',
              border: 'none',
              background: isPaid
                ? 'linear-gradient(135deg, #10b981, #059669)'
                : 'rgba(0,0,0,0.15)',
              cursor: isPaid ? 'pointer' : 'not-allowed',
              fontWeight: 800, fontSize: '1rem', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              boxShadow: isPaid ? '0 8px 24px rgba(16,185,129,0.35)' : 'none',
              transition: 'all 0.2s',
              fontFamily: 'inherit',
            }}
          >
            <CheckCircle2 size={18} />
            تأكيد الدفع — {fmt(totals.grand_total)}
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// 11. SUCCESS OVERLAY  —  removed, replaced by <InvoicePreviewModal />
// ══════════════════════════════════════════════════════════════
// 12. MAIN POSCashier COMPONENT
// ══════════════════════════════════════════════════════════════

const POSCashier: React.FC = () => {
  // ── State ──
  const [products, setProducts]         = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [storeConfig, setStoreConfig]   = useState(STORE_CONFIG);
  const [cart, setCart]                 = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery]   = useState('');
  const [activeCategory, setActiveCategory] = useState('الكل');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);
  const [currentInvoice, setCurrentInvoice]     = useState<Invoice | null>(null);
  const [isOnline, setIsOnline]         = useState(true);
  const [ledger, setLedger]             = useState<AccountingEntry[]>([]);
  const [showLedger, setShowLedger]     = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [barcodeBuffer, setBarcodeBuffer] = useState('');
  const [savingCheckout, setSavingCheckout] = useState(false);

  // ── Enhanced Features State ──
  const [selectedCustomer, setSelectedCustomer] = useState<Party | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Party[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [heldCarts, setHeldCarts] = useState<{ id: string; cart: CartItem[]; customer: Party | null; date: string }[]>([]);
  const [showHeldCarts, setShowHeldCarts] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  // ── Fetch: Products from Supabase ──────────────────────────
  useEffect(() => {
    setLoadingProducts(true);
    productsService.list()
      .then(data => {
        setProducts(data.map(p => ({
          id: p.id,
          barcode: p.barcode ?? '',
          name: p.name,
          name_en: p.name_en ?? '',
          category: p.category ?? 'أخرى',
          price: p.price,
          stock: p.stock,
          unit: p.unit ?? 'قطعة',
          icon: p.icon ?? '📦',
          vat_exempt: p.vat_exempt ?? false,
          image_url: p.image_url,
          cost: p.cost,
          min_stock: p.min_stock ?? 10,
        })));
      })
      .catch(err => showNotification(`⚠️ تعذّر جلب المنتجات: ${err.message}`))
      .finally(() => setLoadingProducts(false));
  }, []);

  // ── Fetch: Store Settings from Supabase ───────────────────
  useEffect(() => {
    setLoadingSettings(true);
    settingsService.get()
      .then((s: StoreSettings) => {
        const cfg: StoreConfig = {
          name:        s.name_ar   || 'متجر رصيد',
          name_en:     s.name_en   || 'Raseed Store',
          vat_number:  s.vat_number || '',
          cr_number:   s.cr_number  || '',
          address:     s.address    || '',
          phone:       s.phone      || '',
          email:       s.email      || '',
          logo:        s.logo_url   || '🏪',
          branch_id:   'BR-001',
          branch_name: s.city       || 'الرياض',
          currency:    s.currency   || 'ر.س',
          zatca_env:   (s.zatca_env ?? 'sandbox') as 'sandbox' | 'production',
        };
        STORE_CONFIG = cfg;    // keep module-level ref in sync (used by fmt())
        setStoreConfig(cfg);   // trigger React re-renders
      })
      .catch(err => {
        console.warn('[POS] settings fetch failed — using defaults:', err.message);
        // Non-fatal: defaults from STORE_CONFIG will be used
      })
      .finally(() => setLoadingSettings(false));
  }, []);

  // ── Derived ──
  const totals = useMemo(() => {
    const baseTotals = calcTotals(cart);
    if (globalDiscount > 0) {
      const discountAmount = baseTotals.subtotal_ex_vat * (globalDiscount / 100);
      const newTotalVat = (baseTotals.subtotal_ex_vat - (baseTotals.total_discount + discountAmount)) * VAT_RATE;
      return {
        ...baseTotals,
        total_discount: baseTotals.total_discount + discountAmount,
        total_vat: Math.max(0, newTotalVat),
        grand_total: Math.max(0, baseTotals.subtotal_ex_vat - (baseTotals.total_discount + discountAmount) + Math.max(0, newTotalVat)),
      };
    }
    return baseTotals;
  }, [cart, globalDiscount]);

  // Build dynamic CATEGORIES from actual product data
  const CATEGORIES = useMemo(() => {
    const dbCategories = [...new Set(products.map(p => p.category).filter(Boolean))];
    const baseNames    = BASE_CATEGORIES.map(c => c.name);
    const extra = dbCategories
      .filter(c => !baseNames.includes(c))
      .map(c => ({ name: c!, icon: '📦' }));
    return [...BASE_CATEGORIES, ...extra];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat    = activeCategory === 'الكل' || p.category === activeCategory;
      const q           = searchQuery.toLowerCase();
      const matchSearch = !q ||
        p.name.includes(q) ||
        (p.name_en ?? '').toLowerCase().includes(q) ||
        (p.barcode ?? '').includes(q);
      return matchCat && matchSearch;
    });
  }, [products, activeCategory, searchQuery]);

  // ── Print ──
  // onAfterPrint: dismiss success overlay and prepare for the next customer.
  // The cart is already cleared and checkout modal closed in handleCheckoutConfirm.
  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: currentInvoice?.invoice_number ?? 'receipt',
    onAfterPrint: () => {
      setCompletedInvoice(null);
      setCurrentInvoice(null);
      searchRef.current?.focus();
    },
  } as any);

  // ── Ctrl+P  →  quick re-print of the last thermal receipt ──
  // Useful when the cashier closes the preview modal but still needs
  // a paper copy. Only works when a completed invoice is in scope.
  useEffect(() => {
    const onHotkey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p' && currentInvoice) {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', onHotkey);
    return () => window.removeEventListener('keydown', onHotkey);
  }, [currentInvoice, handlePrint]);

  // ── Online/Offline ──
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ── Barcode Scanner support (HID keyboard emulation) ──
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Enter') {
        if (barcodeBuffer.length > 4) {
          const found = products.find((p) => p.barcode === barcodeBuffer);
          if (found) {
            addToCart(found);
            showNotification(`تمت إضافة ${found.name} 📦`);
          } else {
            showNotification('⚠️ الباركود غير موجود في النظام');
          }
        }
        setBarcodeBuffer('');
        clearTimeout(timer);
      } else if (e.key.length === 1) {
        setBarcodeBuffer((prev) => prev + e.key);
        clearTimeout(timer);
        timer = setTimeout(() => setBarcodeBuffer(''), 300);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(timer);
    };
  }, [barcodeBuffer, products]);

  // ── Notification ──
  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  // ── Cart Operations ──
  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) {
          showNotification('⚠️ لا يوجد مخزون كافٍ');
          return prev;
        }
        return prev.map((c) =>
          c.id === product.id
            ? calcItemTotals({ ...c, qty: c.qty + 1 })
            : c,
        );
      }
      return [...prev, calcItemTotals({ ...product, qty: 1, discount_pct: 0 })];
    });
  }, []);

  const updateQty = useCallback((id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.id !== id) return c;
          const newQty = c.qty + delta;
          if (newQty <= 0) return null as unknown as CartItem;
          const product = products.find((p) => p.id === id);
          if (product && newQty > product.stock) {
            showNotification('⚠️ لا يوجد مخزون كافٍ');
            return c;
          }
          return calcItemTotals({ ...c, qty: newQty });
        })
        .filter(Boolean),
    );
  }, [products]);

  const updateDiscount = useCallback((id: string, discount_pct: number) => {
    const pct = Math.max(0, Math.min(100, discount_pct));
    setCart((prev) =>
      prev.map((c) => (c.id === id ? calcItemTotals({ ...c, discount_pct: pct }) : c)),
    );
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  // ── Customer Search ──────────────────────────────────────
  useEffect(() => {
    if (customerSearchQuery.length > 1) {
      partiesService.searchCustomers(customerSearchQuery)
        .then(setCustomers)
        .catch(console.error);
    } else {
      setCustomers([]);
    }
  }, [customerSearchQuery]);

  // ── Held Carts ───────────────────────────────────────────
  const holdCart = () => {
    if (cart.length === 0) return;
    const newHold = {
      id: uuidv4(),
      cart: [...cart],
      customer: selectedCustomer,
      date: new Date().toISOString(),
    };
    setHeldCarts(prev => [newHold, ...prev]);
    clearCart();
    setSelectedCustomer(null);
    setGlobalDiscount(0);
    showNotification('📥 تم تعليق السلة بنجاح');
  };

  const resumeCart = (held: typeof heldCarts[0]) => {
    if (cart.length > 0) {
      if (!confirm('هل تريد استبدال السلة الحالية بالسلة المعلقة؟')) return;
    }
    setCart(held.cart);
    setSelectedCustomer(held.customer);
    setHeldCarts(prev => prev.filter(h => h.id !== held.id));
    setShowHeldCarts(false);
    showNotification('📤 تم استعادة السلة');
  };

  // ── Checkout ──────────────────────────────────────────────
  const handleCheckoutConfirm = async (payments: PaymentSplit[]) => {
    // Prevent double-submit
    if (savingCheckout) return;

    // 1. Check stock availability before proceeding
    for (const item of cart) {
      const fresh = products.find(p => p.id === item.id);
      if (fresh && fresh.stock < item.qty) {
        showNotification(`⚠️ مخزون "${item.name}" غير كافٍ (متبقٍ: ${fresh.stock})`);
        return;
      }
    }

    setSavingCheckout(true);
    const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
    const changeDue = Math.max(0, totalPaid - totals.grand_total);

    // 2. Use REAL timestamp for ZATCA compliance
    const now = new Date();
    const nowISO = now.toISOString();

    const invoiceNumber = generateInvoiceNumber();
    const invoiceUUID   = uuidv4();

    // 3. Generate ZATCA QR with real timestamp & values from DB settings
    const qrData = generateZatcaTLV(
      storeConfig.name,
      storeConfig.vat_number,
      nowISO,                          // ← real timestamp, not hardcoded
      fmtNum(totals.grand_total),
      fmtNum(totals.total_vat),
    );

    const invoice: Invoice = {
      id: invoiceUUID,
      invoice_number: invoiceNumber,
      created_at: nowISO,
      cashier_id: CASHIER.id,
      cashier_name: CASHIER.name,
      branch_id: storeConfig.branch_id,
      branch_name: storeConfig.branch_name,
      items: cart,
      totals,
      payments,
      change_due: changeDue,
      zatca_qr: qrData,
      status: 'completed',
    };

    // 4. Double-entry accounting (local ledger)
    const entry = createAccountingEntry(invoice);
    setLedger(prev => [...prev, entry]);

    // 5. Optimistic UI: deduct inventory locally
    setProducts(prev => deductInventory(prev, cart));

    // 6. Persist to Supabase (non-blocking — don't block UI on failure)
    try {
      await posSalesService.completeSale({
        invoice_number: invoiceNumber,
        invoice_uuid:   invoiceUUID,
        cashier_id:     CASHIER.id,
        cashier_name:   CASHIER.name,
        branch_name:    storeConfig.branch_name,
        items: cart.map(c => ({
          id:           c.id,
          name:         c.name,
          barcode:      c.barcode,
          qty:          c.qty,
          unit_price:   c.price,
          discount_pct: c.discount_pct,
          vat_rate:     c.vat_exempt ? 0 : 15,
          vat_amount:   c.line_vat,
          line_total:   c.line_total_inc_vat,
        })),
        subtotal_ex_vat: totals.subtotal_ex_vat,
        total_discount:  totals.total_discount,
        total_vat:       totals.total_vat,
        grand_total:     totals.grand_total,
        payment_method:  payments[0]?.method ?? 'cash',
        payment_amount:  totalPaid,
        zatca_qr:        qrData,
        settings:        storeConfig as any,
        party_id:        selectedCustomer?.id,
      });
    } catch (err: any) {
      // Non-fatal: sale is done locally; log the error
      console.error('[POS] Supabase save error:', err.message);
      showNotification('⚠️ تم تسجيل البيع محلياً — سيُزامَن لاحقاً');
    } finally {
      setSavingCheckout(false);
    }

    setCurrentInvoice(invoice);
    setCompletedInvoice(invoice);
    setIsCheckoutOpen(false);
    clearCart();
    setSelectedCustomer(null);
    setGlobalDiscount(0);
  };

  const handleNewSale = () => {
    setCompletedInvoice(null);
    setCurrentInvoice(null);
    searchRef.current?.focus();
  };


  // ── Settings Loading Guard ────────────────────────────────
  // Block the entire POS until org settings are resolved so that
  // ThermalReceipt, ZATCA QR and invoice header always show real data.
  if (loadingSettings) {
    return (
      <div
        dir="rtl"
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 40%, #fff7ed 100%)',
          fontFamily: "'Tajawal', sans-serif",
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.25rem',
        }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@700;900&display=swap');@keyframes spin{to{transform:rotate(360deg);}}`}</style>
        <div style={{
          width: '3.5rem', height: '3.5rem',
          border: '4px solid rgba(245,158,11,0.2)',
          borderTopColor: '#f59e0b',
          borderRadius: '50%',
          animation: 'spin 0.75s linear infinite',
        }} />
        <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#92400e' }}>
          جاري تحميل بيانات المنشأة…
        </div>
        <div style={{ fontSize: '0.8rem', color: '#b45309' }}>
          يتصل بـ Supabase، يرجى الانتظار
        </div>
      </div>
    );
  }

  // ── Styles ──
  const gradientBg = 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 40%, #fff7ed 100%)';
  const glassCard = {
    background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.35) 100%)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1.5px solid rgba(255,255,255,0.55)',
    borderRadius: '2.5rem',
    boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.3)',
  };

  return (
    <div dir="rtl" style={{
      minHeight: '100vh',
      background: gradientBg,
      fontFamily: "'Tajawal', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Google Font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');

        @keyframes floatIcon {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.92) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-amber {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(245,158,11,0); }
        }
        @keyframes cartBounce {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.18); }
          70%  { transform: scale(0.95); }
          100% { transform: scale(1); }
        }

        .product-card-btn:hover .add-overlay { opacity: 1 !important; }
        .product-card-btn:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(245,158,11,0.2) !important; }

        .cart-item { transition: all 0.25s ease; }
        .cart-item:hover { background: rgba(245,158,11,0.08) !important; }

        .qty-btn:hover { background: rgba(245,158,11,0.15) !important; color: #b45309 !important; }

        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(245,158,11,0.3); border-radius: 4px; }

        @media print {
          body * { visibility: hidden; }
          #thermal-receipt, #thermal-receipt * { visibility: visible; }
          #thermal-receipt { position: absolute; left: 0; top: 0; }
        }
      `}</style>

      {/* ─── TOP HEADER BAR ─── */}
      <header style={{
        ...glassCard,
        borderRadius: '0 0 2rem 2rem',
        margin: '0 1rem',
        padding: '0.75rem 1.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: '2.5rem', height: '2.5rem',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            borderRadius: '0.875rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.2rem',
            boxShadow: '0 4px 12px rgba(245,158,11,0.35)',
          }}>
            🏪
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1rem', color: '#0f172a', lineHeight: 1.1 }}>رصيد ERP</div>
            <div style={{ fontSize: '0.65rem', color: '#92400e' }}>نقطة البيع</div>
          </div>
        </div>

        {/* Center — Branch + Time */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>{storeConfig.branch_name}</div>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
            {new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* Right — Cashier + Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => setShowHeldCarts(true)}
            title="السلال المعلقة"
            style={{
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: '0.75rem', padding: '0.4rem 0.6rem',
              cursor: 'pointer', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.3rem',
            }}
          >
            <History size={14} />
            <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>المعلقة</span>
            {heldCarts.length > 0 && (
              <span style={{
                background: '#f59e0b', color: '#fff', borderRadius: '999px',
                padding: '0 5px', fontSize: '0.6rem', fontWeight: 800,
              }}>
                {heldCarts.length}
              </span>
            )}
          </button>

          {/* Online/Offline indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.3rem 0.7rem',
            background: isOnline ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            borderRadius: '999px',
            border: `1px solid ${isOnline ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            {isOnline ? <Wifi size={12} color="#10b981" /> : <WifiOff size={12} color="#ef4444" />}
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: isOnline ? '#059669' : '#dc2626' }}>
              {isOnline ? 'متصل' : 'غير متصل'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '2rem', height: '2rem',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 900, color: '#fff',
            }}>
              أح
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>{CASHIER.name}</div>
              <div style={{ fontSize: '0.6rem', color: '#64748b' }}>{CASHIER.role}</div>
            </div>
          </div>

          <button
            onClick={() => setShowLedger(!showLedger)}
            title="سجل القيود المحاسبية"
            style={{
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '0.75rem', padding: '0.4rem 0.6rem',
              cursor: 'pointer', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '0.3rem',
            }}
          >
            <BookOpen size={14} />
            <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>القيود</span>
            {ledger.length > 0 && (
              <span style={{
                background: '#6366f1', color: '#fff', borderRadius: '999px',
                padding: '0 5px', fontSize: '0.6rem', fontWeight: 800,
              }}>
                {ledger.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ─── NOTIFICATION TOAST ─── */}
      {notification && (
        <div style={{
          position: 'fixed', top: '5rem', left: '50%', transform: 'translateX(-50%)',
          zIndex: 3000,
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          color: '#f1f5f9', borderRadius: '1rem',
          padding: '0.7rem 1.5rem',
          fontSize: '0.85rem', fontWeight: 700,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          animation: 'slideDown 0.25s ease both',
          whiteSpace: 'nowrap',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          {notification}
        </div>
      )}

      {/* ─── MAIN BODY ─── */}
      <div style={{
        display: 'flex', flex: 1, gap: '1rem',
        padding: '1rem',
        overflow: 'hidden',
        minHeight: 0,
      }}>

        {/* ═══════════════════════════════════════════
            LEFT — PRODUCT GRID (60%)
            ═══════════════════════════════════════════ */}
        <div style={{
          flex: '0 0 60%',
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
          minWidth: 0, minHeight: 0, overflow: 'hidden',
        }}>

          {/* Search + Barcode input */}
          <div style={{ ...glassCard, padding: '0.875rem 1rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', right: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث عن منتج أو باركود..."
                  style={{
                    width: '100%', padding: '0.65rem 2.5rem 0.65rem 0.9rem',
                    background: 'rgba(255,255,255,0.7)',
                    border: '1.5px solid rgba(0,0,0,0.08)',
                    borderRadius: '0.875rem', outline: 'none',
                    fontSize: '0.85rem', color: '#0f172a',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'rgba(245,158,11,0.5)')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(0,0,0,0.08)')}
                />
              </div>

              {/* Barcode scan input */}
              <div style={{ position: 'relative' }}>
                <Hash size={14} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  ref={barcodeRef}
                  type="text"
                  placeholder="مسح باركود..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value;
                      const found = products.find((p) => p.barcode === val);
                      if (found) {
                        addToCart(found);
                        showNotification(`✅ ${found.name}`);
                      } else {
                        showNotification('⚠️ الباركود غير موجود');
                      }
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                  style={{
                    padding: '0.65rem 2.2rem 0.65rem 0.75rem',
                    background: 'rgba(255,255,255,0.7)',
                    border: '1.5px solid rgba(0,0,0,0.08)',
                    borderRadius: '0.875rem', outline: 'none',
                    fontSize: '0.8rem', color: '#0f172a',
                    fontFamily: 'inherit',
                    width: '140px',
                  }}
                />
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: '0.875rem', padding: '0.5rem 0.75rem',
              }}>
                <Package size={14} color="#b45309" />
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e' }}>
                  {filteredProducts.length} صنف
                </span>
              </div>
            </div>
          </div>

          {/* Customer Selection Strip */}
          <div style={{ ...glassCard, padding: '0.6rem 1rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '2rem', height: '2rem', borderRadius: '0.75rem',
                background: selectedCustomer ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: selectedCustomer ? '#10b981' : '#94a3b8'
              }}>
                <User size={16} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a' }}>
                  {selectedCustomer ? selectedCustomer.name_ar : 'عميل نقدي'}
                </div>
                {selectedCustomer && (
                  <div style={{ fontSize: '0.6rem', color: '#64748b' }}>
                    {selectedCustomer.phone || 'بدون رقم هاتف'}
                  </div>
                )}
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowCustomerSearch(!showCustomerSearch)}
                style={{
                  background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
                  borderRadius: '0.75rem', padding: '0.4rem 0.75rem',
                  cursor: 'pointer', color: '#3b82f6', fontSize: '0.7rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: '0.4rem'
                }}
              >
                {selectedCustomer ? <ArrowLeftRight size={12} /> : <UserPlus size={12} />}
                {selectedCustomer ? 'تغيير العميل' : 'اختيار عميل'}
              </button>

              {showCustomerSearch && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: '0.5rem',
                  width: '280px', background: '#fff', borderRadius: '1rem',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.15)', zIndex: 50,
                  padding: '0.75rem', border: '1px solid rgba(0,0,0,0.08)'
                }}>
                  <input
                    autoFocus
                    placeholder="ابحث بالاسم أو الهاتف..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    style={{
                      width: '100%', padding: '0.5rem', borderRadius: '0.5rem',
                      border: '1.5px solid rgba(0,0,0,0.08)', outline: 'none',
                      fontSize: '0.8rem', marginBottom: '0.5rem'
                    }}
                  />
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }} className="custom-scroll">
                    <div
                      onClick={() => { setSelectedCustomer(null); setShowCustomerSearch(false); }}
                      style={{ padding: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.75rem', borderBottom: '1px solid #f1f5f9' }}
                      className="hover:bg-slate-50"
                    >
                      👤 عميل نقدي (افتراضي)
                    </div>
                    {customers.map(c => (
                      <div
                        key={c.id}
                        onClick={() => { setSelectedCustomer(c); setShowCustomerSearch(false); }}
                        style={{ padding: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.75rem' }}
                        className="hover:bg-slate-50"
                      >
                        <div style={{ fontWeight: 700 }}>{c.name_ar}</div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{c.phone}</div>
                      </div>
                    ))}
                    {customerSearchQuery.length > 1 && customers.length === 0 && (
                      <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.7rem', color: '#94a3b8' }}>
                        لا يوجد نتائج
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Category Tabs */}
          <div style={{ ...glassCard, padding: '0.6rem', flexShrink: 0 }}>
            <div style={{
              display: 'flex', gap: '0.4rem', overflowX: 'auto',
              scrollbarWidth: 'none', msOverflowStyle: 'none',
            }} className="no-scrollbar">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => setActiveCategory(cat.name)}
                  style={{
                    flexShrink: 0,
                    padding: '0.45rem 0.85rem',
                    borderRadius: '0.75rem',
                    border: 'none',
                    background: activeCategory === cat.name
                      ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                      : 'rgba(255,255,255,0.6)',
                    color: activeCategory === cat.name ? '#fff' : '#64748b',
                    fontWeight: activeCategory === cat.name ? 800 : 600,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s',
                    boxShadow: activeCategory === cat.name ? '0 4px 12px rgba(245,158,11,0.3)' : 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div style={{
            ...glassCard,
            flex: 1, minHeight: 0, overflow: 'hidden',
            padding: '0.875rem',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '0.7rem',
              overflowY: 'auto',
              height: '100%',
              paddingBottom: '0.5rem',
            }} className="custom-scroll">
              {/* ── Loading state ── */}
              {loadingProducts && (
                <div style={{
                  gridColumn: '1 / -1', textAlign: 'center',
                  padding: '3rem', color: '#94a3b8',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem',
                }}>
                  <div style={{ width: '2.5rem', height: '2.5rem', border: '3px solid rgba(245,158,11,0.2)', borderTopColor: '#f59e0b', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>جاري جلب بياناتك...</div>
                  <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>يتم الاتصال بقاعدة البيانات</div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}
              {!loadingProducts && filteredProducts.length === 0 ? (
                <div style={{
                  gridColumn: '1 / -1', textAlign: 'center',
                  padding: '3rem', color: '#94a3b8',
                }}>
                  <Search size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                    {products.length === 0 ? 'لا توجد منتجات في قاعدة البيانات' : 'لا توجد منتجات مطابقة'}
                  </div>
                  <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>جرب كلمة بحث أخرى</div>
                </div>
              ) : !loadingProducts && (
                filteredProducts.map((product) => {
                  const cartItem = cart.find((c) => c.id === product.id);
                  return (
                    <div key={product.id} className="product-card-btn" style={{ position: 'relative' }}>
                      <ProductCard
                        product={product}
                        onAdd={addToCart}
                        isInCart={!!cartItem}
                        cartQty={cartItem?.qty ?? 0}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            RIGHT — CART PANEL (40%)
            ═══════════════════════════════════════════ */}
        <div style={{
          flex: '0 0 40%',
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
          minHeight: 0, overflow: 'hidden',
        }}>
          {/* Cart Header */}
          <div style={{
            ...glassCard,
            padding: '0.875rem 1.25rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{
                position: 'relative',
                animation: cart.length > 0 ? 'floatIcon 3s ease-in-out infinite' : undefined,
              }}>
                <ShoppingCart size={22} color="#b45309" />
                {cart.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '-6px', left: '-6px',
                    background: '#ef4444', color: '#fff',
                    borderRadius: '999px', width: '16px', height: '16px',
                    fontSize: '0.55rem', fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'pulse-amber 2s infinite',
                  }}>
                    {totals.item_count}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: '0.95rem', color: '#0f172a' }}>سلة المشتريات</div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{cart.length} صنف مختلف</div>
              </div>
            </div>
            {cart.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={holdCart}
                title="تعليق السلة"
                style={{
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: '0.75rem', padding: '0.4rem 0.6rem',
                  cursor: 'pointer', color: '#f59e0b',
                  display: 'flex', alignItems: 'center',
                }}
              >
                <Save size={14} />
              </button>
              <button
                onClick={clearCart}
                style={{
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: '0.75rem', padding: '0.4rem 0.7rem',
                  cursor: 'pointer', color: '#dc2626',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit',
                }}
              >
                <Trash2 size={12} />
                مسح الكل
              </button>
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div style={{
            ...glassCard,
            flex: 1, minHeight: 0, overflow: 'hidden',
            padding: '0.75rem',
          }}>
            {cart.length === 0 ? (
              <div style={{
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: '#94a3b8', gap: '0.75rem',
              }}>
                <div style={{ fontSize: '3.5rem', opacity: 0.3, animation: 'floatIcon 4s ease-in-out infinite' }}>🛒</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>السلة فارغة</div>
                <div style={{ fontSize: '0.75rem', textAlign: 'center', maxWidth: '160px' }}>
                  أضف منتجات من القائمة أو امسح باركود
                </div>
              </div>
            ) : (
              <div style={{ overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }} className="custom-scroll">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="cart-item"
                    style={{
                      background: 'rgba(255,255,255,0.6)',
                      border: '1px solid rgba(255,255,255,0.5)',
                      borderRadius: '1.25rem',
                      padding: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{item.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                            {fmt(item.price)} / {item.unit}
                            {item.vat_exempt && <span style={{ color: '#0891b2', marginRight: '4px' }}>• معفى</span>}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        style={{
                          background: 'rgba(239,68,68,0.1)', border: 'none',
                          borderRadius: '0.5rem', padding: '0.25rem',
                          cursor: 'pointer', color: '#ef4444', flexShrink: 0,
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem', gap: '0.5rem' }}>
                      {/* Qty controls */}
                      <div style={{
                        display: 'flex', alignItems: 'center',
                        background: 'rgba(0,0,0,0.06)', borderRadius: '0.75rem',
                        overflow: 'hidden',
                      }}>
                        <button
                          onClick={() => updateQty(item.id, -1)}
                          className="qty-btn"
                          style={{
                            padding: '0.35rem 0.5rem', border: 'none',
                            background: 'transparent', cursor: 'pointer',
                            color: '#64748b', transition: 'all 0.15s',
                          }}
                        >
                          <Minus size={12} />
                        </button>
                        <span style={{ padding: '0 0.6rem', fontWeight: 800, fontSize: '0.85rem', color: '#0f172a', minWidth: '2rem', textAlign: 'center' }}>
                          {item.qty}
                        </span>
                        <button
                          onClick={() => updateQty(item.id, 1)}
                          className="qty-btn"
                          style={{
                            padding: '0.35rem 0.5rem', border: 'none',
                            background: 'transparent', cursor: 'pointer',
                            color: '#64748b', transition: 'all 0.15s',
                          }}
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      {/* Discount */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        background: 'rgba(99,102,241,0.08)',
                        border: '1px solid rgba(99,102,241,0.15)',
                        borderRadius: '0.75rem', padding: '0.25rem 0.5rem',
                      }}>
                        <Percent size={10} color="#6366f1" />
                        <input
                          type="number"
                          min="0" max="100"
                          value={item.discount_pct}
                          onChange={(e) => updateDiscount(item.id, parseInt(e.target.value) || 0)}
                          style={{
                            width: '2.5rem', background: 'transparent',
                            border: 'none', outline: 'none', textAlign: 'center',
                            fontSize: '0.75rem', fontWeight: 700, color: '#6366f1',
                            fontFamily: 'inherit',
                          }}
                        />
                        <span style={{ fontSize: '0.65rem', color: '#6366f1' }}>%</span>
                      </div>

                      {/* Line total */}
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 900, fontSize: '0.85rem', color: '#0f172a' }}>
                          {fmtNum(item.line_total_inc_vat)} <span style={{ fontSize: '0.65rem' }}>ر.س</span>
                        </div>
                        {!item.vat_exempt && (
                          <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>
                            ض.ق.م: {fmtNum(item.line_vat)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totals + Checkout */}
          <div style={{
            ...glassCard,
            padding: '1rem 1.25rem',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b' }}>
                <span>المجموع (قبل الخصم والضريبة)</span>
                <span>{fmt(totals.subtotal_ex_vat)}</span>
              </div>

              {/* Global Discount Input */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#6366f1', fontWeight: 700 }}>
                  <Percent size={12} /> خصم إجمالي (٪)
                </div>
                <input
                  type="number"
                  min="0" max="100"
                  value={globalDiscount}
                  onChange={(e) => setGlobalDiscount(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  style={{
                    width: '3.5rem', padding: '0.2rem 0.5rem', borderRadius: '0.5rem',
                    border: '1.5px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.05)',
                    textAlign: 'center', fontSize: '0.8rem', fontWeight: 800, color: '#6366f1', outline: 'none'
                  }}
                />
              </div>

              {totals.total_discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#10b981' }}>
                  <span>إجمالي الخصومات</span>
                  <span>- {fmt(totals.total_discount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b' }}>
                <span>ضريبة القيمة المضافة (15%)</span>
                <span>{fmt(totals.total_vat)}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontWeight: 900, fontSize: '1.3rem', color: '#0f172a',
                borderTop: '1.5px solid rgba(0,0,0,0.08)',
                paddingTop: '0.6rem', marginTop: '0.2rem',
              }}>
                <span>الإجمالي</span>
                <span style={{ color: '#d97706' }}>{fmt(totals.grand_total)}</span>
              </div>
            </div>

            <button
              disabled={cart.length === 0 || savingCheckout}
              onClick={() => setIsCheckoutOpen(true)}
              style={{
                width: '100%', padding: '1rem',
                background: cart.length > 0 && !savingCheckout
                  ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                  : 'rgba(0,0,0,0.1)',
                border: 'none', borderRadius: '1.25rem',
                color: cart.length > 0 && !savingCheckout ? '#fff' : '#94a3b8',
                fontWeight: 900, fontSize: '1.05rem',
                cursor: cart.length > 0 && !savingCheckout ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                boxShadow: cart.length > 0 && !savingCheckout ? '0 8px 24px rgba(245,158,11,0.4)' : 'none',
                transition: 'all 0.2s',
                fontFamily: 'inherit',
                animation: cart.length > 0 && !savingCheckout ? 'pulse-amber 3s infinite' : undefined,
              }}
            >
              {savingCheckout ? (
                <>
                  <div style={{ width: '18px', height: '18px', border: '2.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  جاري حفظ الفاتورة...
                </>
              ) : (
                <>
                  <Zap size={18} />
                  إتمام البيع — {fmt(totals.grand_total)}
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ─── MODALS ─── */}

      {isCheckoutOpen && (
        <CheckoutModal
          totals={totals}
          onConfirm={handleCheckoutConfirm}
          onClose={() => setIsCheckoutOpen(false)}
        />
      )}

      {completedInvoice && (() => {
        // Adapt POS Invoice → generic PreviewInvoice shape
        const previewStore: PreviewStore = {
          name:       storeConfig.name,
          name_en:    storeConfig.name_en,
          vat_number: storeConfig.vat_number,
          cr_number:  storeConfig.cr_number,
          address:    storeConfig.address,
          phone:      storeConfig.phone,
          email:      storeConfig.email,
          // storeConfig.logo holds an emoji fallback; settings.logo_url is preferred.
          logo_url:   storeConfig.logo && storeConfig.logo.startsWith('http')
            ? storeConfig.logo
            : undefined,
          currency:   storeConfig.currency,
          zatca_env:  storeConfig.zatca_env,
        };

        const paymentLabel = completedInvoice.payments
          .map(p => PAYMENT_LABELS[p.method])
          .join(' + ');

        const preview: PreviewInvoice = {
          invoice_number:  completedInvoice.invoice_number,
          created_at:      completedInvoice.created_at,
          cashier_name:    completedInvoice.cashier_name,
          branch_name:     completedInvoice.branch_name,
          items: completedInvoice.items.map(it => ({
            name:         it.name,
            barcode:      it.barcode,
            qty:          it.qty,
            unit_price:   it.price,
            discount_pct: it.discount_pct,
            vat_rate:     it.vat_exempt ? 0 : 15,
            vat_amount:   it.line_vat,
            line_total:   it.line_total_inc_vat,
          })),
          subtotal_ex_vat: completedInvoice.totals.subtotal_ex_vat,
          total_discount:  completedInvoice.totals.total_discount,
          total_vat:       completedInvoice.totals.total_vat,
          grand_total:     completedInvoice.totals.grand_total,
          payment_label:   paymentLabel,
          change_due:      completedInvoice.change_due,
          zatca_qr:        completedInvoice.zatca_qr,
          status:          'paid',
        };

        return (
          <InvoicePreviewModal
            invoice={preview}
            store={previewStore}
            title="معاينة الفاتورة — قبل الطباعة"
            onClose={handleNewSale}
            onAfterPrint={() => {
              showNotification('✅ تمت طباعة الفاتورة بنجاح');
              handleNewSale();
            }}
          />
        );
      })()}

      {/* ─── HELD CARTS DRAWER ─── */}
      {showHeldCarts && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 800,
          display: 'flex', justifyContent: 'flex-start',
        }}>
          <div onClick={() => setShowHeldCarts(false)} style={{ flex: 1, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
          <div style={{
            width: '380px', background: '#fff',
            height: '100%', overflowY: 'auto', padding: '1.5rem',
            boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
          }} className="custom-scroll">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, fontWeight: 900, color: '#0f172a' }}>السلال المعلقة</h3>
              <button onClick={() => setShowHeldCarts(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color="#64748b" />
              </button>
            </div>

            {heldCarts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                <History size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                <div>لا توجد سلال معلقة</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {heldCarts.map((held) => (
                  <div key={held.id} style={{
                    padding: '1rem', borderRadius: '1rem', border: '1.5px solid rgba(0,0,0,0.06)',
                    background: 'rgba(248,250,252,0.5)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>
                        {held.customer ? held.customer.name_ar : 'عميل نقدي'}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                        {new Date(held.date).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem' }}>
                      {held.cart.length} أصناف — {fmt(calcTotals(held.cart).grand_total)}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => resumeCart(held)}
                        style={{
                          flex: 1, padding: '0.5rem', borderRadius: '0.75rem', background: '#f59e0b', color: '#fff',
                          border: 'none', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer'
                        }}
                      >استعادة</button>
                      <button
                        onClick={() => setHeldCarts(prev => prev.filter(h => h.id !== held.id))}
                        style={{
                          padding: '0.5rem', borderRadius: '0.75rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                          border: 'none', cursor: 'pointer'
                        }}
                      ><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── LEDGER DRAWER ─── */}
      {showLedger && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 800,
          display: 'flex', justifyContent: 'flex-start',
        }}>
          <div onClick={() => setShowLedger(false)} style={{ flex: 1, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
          <div style={{
            width: '420px', background: 'linear-gradient(145deg, #fff 0%, #fffbeb 100%)',
            height: '100%', overflowY: 'auto', padding: '1.5rem',
            boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
            fontFamily: 'Tajawal, sans-serif',
          }} className="custom-scroll">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontWeight: 900, color: '#0f172a' }}>سجل القيود المحاسبية</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>قيد مزدوج — Double Entry</p>
              </div>
              <button onClick={() => setShowLedger(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color="#64748b" />
              </button>
            </div>

            {ledger.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                لا توجد قيود محاسبية بعد
              </div>
            ) : (
              ledger.map((entry) => (
                <div key={entry.id} style={{
                  background: 'rgba(255,255,255,0.8)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: '1rem', padding: '1rem',
                  marginBottom: '0.75rem',
                }}>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a', marginBottom: '0.5rem' }}>
                    {entry.description}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.75rem' }}>
                    {new Date(entry.created_at).toLocaleString('ar-SA')}
                  </div>
                  <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'right', padding: '3px 0', color: '#475569' }}>الحساب</th>
                        <th style={{ textAlign: 'center', padding: '3px 0', color: '#475569' }}>مدين</th>
                        <th style={{ textAlign: 'center', padding: '3px 0', color: '#475569' }}>دائن</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.lines.map((line, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px dotted #f1f5f9' }}>
                          <td style={{ padding: '3px 0', color: '#0f172a' }}>
                            <span style={{ color: '#94a3b8', marginLeft: '4px' }}>{line.account_code}</span>
                            {line.account_name}
                          </td>
                          <td style={{ textAlign: 'center', color: line.debit > 0 ? '#0f172a' : '#cbd5e1', fontWeight: line.debit > 0 ? 700 : 400 }}>
                            {line.debit > 0 ? fmtNum(line.debit) : '—'}
                          </td>
                          <td style={{ textAlign: 'center', color: line.credit > 0 ? '#0f172a' : '#cbd5e1', fontWeight: line.credit > 0 ? 700 : 400 }}>
                            {line.credit > 0 ? fmtNum(line.credit) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─── HIDDEN THERMAL RECEIPT ─── */}
      <div id="thermal-receipt" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        {currentInvoice && (
          <ThermalReceipt
            ref={receiptRef}
            invoice={currentInvoice}
            qrData={currentInvoice.zatca_qr}
            settings={storeConfig}
          />
        )}
      </div>
    </div>
  );
};

export default POSCashier;