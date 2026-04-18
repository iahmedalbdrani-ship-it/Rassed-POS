// ============================================================
// Raseed POS - Thermal Receipt Component (80mm)
// ============================================================

import { forwardRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import Barcode from 'react-barcode';
import type { CartItem, CartTotals, PaymentType, StoreSettings } from '../../types/pos';
import { fmt } from '../../constants/theme';

// ─── ZATCA TLV Encoder ─────────────────────────────────────
const generateZatcaTLV = (
  seller: string,
  vatNo: string,
  time: string,
  total: string,
  vat: string
): string => {
  const encoder = new TextEncoder();
  
  const getTLV = (tag: number, value: string): Uint8Array => {
    const valBuf = encoder.encode(value);
    const tagBuf = new Uint8Array([tag]);
    const lenBuf = new Uint8Array([valBuf.length]);
    const combined = new Uint8Array(tagBuf.length + lenBuf.length + valBuf.length);
    combined.set(tagBuf);
    combined.set(lenBuf, tagBuf.length);
    combined.set(valBuf, tagBuf.length + lenBuf.length);
    return combined;
  };

  const tags = [
    getTLV(1, seller),   // Seller Name
    getTLV(2, vatNo),   // VAT Number
    getTLV(3, time),    // Timestamp
    getTLV(4, total),   // Total Amount
    getTLV(5, vat),     // VAT Amount
  ];

  const totalLength = tags.reduce((acc, curr) => acc + curr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const tagData of tags) {
    result.set(tagData, offset);
    offset += tagData.length;
  }

  return btoa(Array.from(result).map((b) => String.fromCharCode(b)).join(''));
};

// ─── Payment Method Labels ─────────────────────────────────
const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash: 'نقدي',
  mada: 'بطاقة مدى',
  visa: 'فيزا',
  mastercard: 'ماستركارد',
  apple_pay: 'آبل باي',
};

// ─── Receipt Component ──────────────────────────────────────
interface ReceiptProps {
  cart: CartItem[];
  totals: CartTotals;
  invoiceNumber: string;
  settings: StoreSettings;
  paymentMethod: PaymentType;
  cashierName?: string;
}

export const ThermalReceipt = forwardRef<HTMLDivElement, ReceiptProps>(
  ({ cart, totals, invoiceNumber, settings, paymentMethod, cashierName = 'كاشير 1' }, ref) => {
    const timestamp = new Date().toISOString();
    const formattedDate = new Date().toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = new Date().toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // Generate ZATCA QR Code
    const qrValue = generateZatcaTLV(
      settings.name,
      settings.vatNumber,
      timestamp,
      totals.total.toFixed(2),
      totals.taxAmount.toFixed(2)
    );

    return (
      <div
        ref={ref}
        className="p-4 w-[80mm] bg-white text-black font-['Tajawal'] text-[11px] select-none"
        dir="rtl"
      >
        {/* Store Header */}
        <div className="text-center border-b-2 border-dashed border-slate-300 pb-4 mb-4">
          <h1 className="text-base font-black mb-1">{settings.name}</h1>
          <p className="text-[10px] text-slate-600">{settings.address}</p>
          <p className="text-[10px] text-slate-600">هاتف: {settings.phone}</p>
          <div className="my-2 border-t border-b border-dashed border-slate-300 py-1">
            <p className="text-[10px]">س.ت: {settings.crNumber}</p>
            <p className="text-[10px] font-bold">الرقم الضريبي: {settings.vatNumber}</p>
          </div>
        </div>

        {/* Invoice Info */}
        <div className="border-b border-dashed border-slate-300 pb-3 mb-3">
          <div className="flex justify-between mb-1">
            <span>رقم الفاتورة:</span>
            <span className="font-bold">{invoiceNumber}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span>التاريخ:</span>
            <span>{formattedDate}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span>الوقت:</span>
            <span>{formattedTime}</span>
          </div>
          <div className="flex justify-between">
            <span>الكاشير:</span>
            <span>{cashierName}</span>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full mb-4">
          <thead>
            <tr className="border-b-2 border-slate-300">
              <th className="text-right py-1 font-bold">الصنف</th>
              <th className="text-center py-1 font-bold">الكمية</th>
              <th className="text-left py-1 font-bold">السعر</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item, index) => (
              <tr key={index} className="border-b border-dashed border-slate-200">
                <td className="py-2 text-right">{item.product.name}</td>
                <td className="py-2 text-center">{item.quantity}</td>
                <td className="py-2 text-left">{fmt.format(item.product.price * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="border-t-2 border-slate-300 pt-3 space-y-1">
          <div className="flex justify-between">
            <span>المجموع الفرعي:</span>
            <span>{fmt.format(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>الضريبة (15%):</span>
            <span>{fmt.format(totals.taxAmount)}</span>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>الخصم:</span>
              <span>- {fmt.format(totals.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-black border-t-2 border-dashed border-slate-300 pt-2 mt-2">
            <span>الإجمالي:</span>
            <span>{fmt.format(totals.total)}</span>
          </div>
          <div className="flex justify-between text-sm mt-2 bg-slate-100 p-2 rounded">
            <span>طريقة الدفع:</span>
            <span className="font-bold">{PAYMENT_LABELS[paymentMethod]}</span>
          </div>
        </div>

        {/* VAT Summary */}
        <div className="mt-4 p-2 bg-slate-50 rounded text-[10px]">
          <p className="text-center font-bold mb-1">ملخص الضريبة</p>
          <div className="flex justify-between">
            <span>ضريبة القيمة المضافة (15%):</span>
            <span>{fmt.format(totals.taxAmount)}</span>
          </div>
        </div>

        {/* ZATCA QR Code & Barcode */}
        <div className="mt-6 flex flex-col items-center gap-4">
          <div className="bg-white p-2 rounded border border-slate-200">
            <QRCodeCanvas 
              value={qrValue} 
              size={100}
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="bg-white p-2 rounded border border-slate-200">
            <Barcode
              value={invoiceNumber}
              height={30}
              fontSize={9}
              margin={2}
              format="CODE128"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-dashed border-slate-300 text-center">
          <p className="text-[10px] text-slate-600 mb-2">{settings.receiptFooter}</p>
          <p className="text-[9px] text-slate-400">
            ضريبة القيمة المضافة مُطبقة وفقاً لأنظمة هيئة الزكاة والدخل
          </p>
          <div className="mt-3 flex justify-center gap-4 text-[9px] text-slate-400">
            <span>🖨️ نظام رصيد</span>
            <span>v1.0.0</span>
          </div>
        </div>

        {/* Cut Line */}
        <div className="mt-6 border-t border-dashed border-slate-300" />
      </div>
    );
  }
);

ThermalReceipt.displayName = 'ThermalReceipt';
