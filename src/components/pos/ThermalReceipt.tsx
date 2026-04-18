// ============================================================
// Control Panel (Raseed) — ThermalReceipt.tsx
// فاتورة ضريبية مبسطة متوافقة مع هيئة الزكاة والضريبة والجمارك (ZATCA Phase 2)
// ------------------------------------------------------------
// • عرض 80mm (طابعة حرارية)
// • QR Code بصيغة Base64 TLV (بدون Buffer — TextEncoder فقط)
// • Barcode خطي (1D) لرقم الفاتورة
// • forwardRef للتكامل مع react-to-print
// • معاينة زجاجية (Glassmorphism) / طباعة أحادية اللون (Monochrome)
// ============================================================

import { forwardRef, useMemo } from 'react';
import QRCode from 'react-qr-code';
import Barcode from 'react-barcode';
import type {
  CartItem,
  CartTotals,
  PaymentType,
  StoreSettings,
} from '../../types/pos';
import { fmt } from '../../constants/theme';

// ─── ثوابت ─────────────────────────────────────────────────
const SIMPLIFIED_INVOICE_LIMIT = 1000; // حد الفاتورة الضريبية المبسطة للمؤسسات (ر.س)
const VAT_RATE_LABEL = '15%';

// ─── تسميات طرق الدفع ─────────────────────────────────────
const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash: 'نقدي',
  mada: 'بطاقة مدى',
  visa: 'فيزا',
  mastercard: 'ماستركارد',
  apple_pay: 'آبل باي',
};

// ─── ZATCA TLV Encoder (Base64) ────────────────────────────
// ⚠️ لا تستخدم Buffer إطلاقاً داخل Vite/Electron.
// نستخدم TextEncoder + Uint8Array + btoa لضمان التوافق الكامل.
const encodeZatcaTLV = (
  sellerName: string,
  vatNumber: string,
  timestampISO: string,
  invoiceTotal: string,
  vatTotal: string
): string => {
  const encoder = new TextEncoder();

  const buildTLV = (tag: number, value: string): Uint8Array => {
    const valueBytes = encoder.encode(value);
    const tlv = new Uint8Array(2 + valueBytes.length);
    tlv[0] = tag;
    tlv[1] = valueBytes.length;
    tlv.set(valueBytes, 2);
    return tlv;
  };

  const tlvFields: Uint8Array[] = [
    buildTLV(1, sellerName),     // Tag 1: اسم المورد
    buildTLV(2, vatNumber),      // Tag 2: الرقم الضريبي
    buildTLV(3, timestampISO),   // Tag 3: وقت الإصدار ISO 8601
    buildTLV(4, invoiceTotal),   // Tag 4: الإجمالي شامل الضريبة
    buildTLV(5, vatTotal),       // Tag 5: قيمة الضريبة
  ];

  const totalLength = tlvFields.reduce((sum, field) => sum + field.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const field of tlvFields) {
    merged.set(field, offset);
    offset += field.length;
  }

  // تحويل Uint8Array إلى Base64 بدون Buffer
  let binary = '';
  for (let i = 0; i < merged.length; i += 1) {
    binary += String.fromCharCode(merged[i]);
  }
  return btoa(binary);
};

// ─── مساعدة: تنسيق التاريخ YYYY-MM-DD HH:MM:SS ────────────
const formatInvoiceDateTime = (date: Date): string => {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

// ─── Props ─────────────────────────────────────────────────
export interface ThermalReceiptProps {
  cart: CartItem[];
  totals: CartTotals;
  invoiceNumber: string;
  settings: StoreSettings;
  paymentMethod: PaymentType;
  cashierName?: string;
  /** اختياري: لإصدار الفاتورة بوقت محدد بدلاً من "الآن" */
  issuedAt?: Date;
}

// ─── المكون الرئيسي ────────────────────────────────────────
export const ThermalReceipt = forwardRef<HTMLDivElement, ThermalReceiptProps>(
  (
    {
      cart,
      totals,
      invoiceNumber,
      settings,
      paymentMethod,
      cashierName = 'كاشير 1',
      issuedAt,
    },
    ref
  ) => {
    const issueDate = useMemo<Date>(
      () => issuedAt ?? new Date(),
      [issuedAt]
    );

    const issueDisplay = useMemo<string>(
      () => formatInvoiceDateTime(issueDate),
      [issueDate]
    );

    const issueISO = useMemo<string>(
      () => issueDate.toISOString(),
      [issueDate]
    );

    // قيمة الـ QR المشفّرة TLV → Base64
    const qrValue = useMemo<string>(
      () =>
        encodeZatcaTLV(
          settings.name,
          settings.vatNumber,
          issueISO,
          totals.total.toFixed(2),
          totals.taxAmount.toFixed(2)
        ),
      [
        settings.name,
        settings.vatNumber,
        issueISO,
        totals.total,
        totals.taxAmount,
      ]
    );

    const exceedsSimplifiedLimit = totals.total > SIMPLIFIED_INVOICE_LIMIT;

    return (
      <div
        ref={ref}
        dir="rtl"
        className={[
          // العرض الثابت للطابعة الحرارية 80mm
          'w-[80mm] max-w-[80mm] mx-auto',
          // المعاينة: شكل زجاجي فاخر
          'bg-white/60 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl ring-1 ring-white/40',
          // الطباعة: مونوكروم + بدون أي تأثيرات ولا حواف دائرية
          'print:bg-white print:backdrop-blur-none print:rounded-none print:shadow-none print:ring-0',
          // تنسيقات داخلية
          'text-black font-[\'Tajawal\'] text-[11px] leading-relaxed select-none',
          'p-5 print:p-2',
        ].join(' ')}
      >
        {/* ─── تحذير الفاتورة المبسطة (معاينة فقط) ─── */}
        {exceedsSimplifiedLimit && (
          <div
            className="print:hidden mb-3 rounded-2xl border border-amber-300 bg-amber-50/80 px-3 py-2 text-[10px] font-bold text-amber-800"
            role="alert"
          >
            تنبيه: للمبيعات فوق 1000 ريال للمؤسسات، يجب إصدار فاتورة ضريبية
            قياسية.
          </div>
        )}

        {/* ─── العنوان الرئيسي (إلزامي ZATCA) ─── */}
        <div className="text-center border-b-2 border-dashed border-black/70 pb-3 mb-3">
          <h1 className="text-[15px] font-black tracking-tight mb-2">
            فاتورة ضريبية مبسطة
          </h1>
          <h2 className="text-[13px] font-extrabold">{settings.name}</h2>
          {settings.nameEn && (
            <p className="text-[10px] font-semibold opacity-80">
              {settings.nameEn}
            </p>
          )}
          <p className="text-[10px] mt-1">{settings.address}</p>
          <p className="text-[10px]">هاتف: {settings.phone}</p>
          <div className="mt-2 pt-2 border-t border-dashed border-black/50">
            {settings.crNumber && (
              <p className="text-[10px]">
                س.ت: <span className="font-bold">{settings.crNumber}</span>
              </p>
            )}
            <p className="text-[10px] font-bold">
              الرقم الضريبي: {settings.vatNumber}
            </p>
          </div>
        </div>

        {/* ─── بيانات الفاتورة ─── */}
        <div className="border-b border-dashed border-black/50 pb-2 mb-3 space-y-1">
          <div className="flex justify-between">
            <span>رقم الفاتورة:</span>
            <span className="font-bold">{invoiceNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>تاريخ الإصدار:</span>
            <span className="font-mono" dir="ltr">
              {issueDisplay}
            </span>
          </div>
          <div className="flex justify-between">
            <span>الكاشير:</span>
            <span>{cashierName}</span>
          </div>
          <div className="flex justify-between">
            <span>طريقة الدفع:</span>
            <span className="font-bold">{PAYMENT_LABELS[paymentMethod]}</span>
          </div>
        </div>

        {/* ─── جدول الأصناف ─── */}
        <table className="w-full mb-3 text-[10.5px]">
          <thead>
            <tr className="border-b-2 border-black/70">
              <th className="text-right py-1 font-bold w-[40%]">الصنف</th>
              <th className="text-center py-1 font-bold w-[12%]">الكمية</th>
              <th className="text-center py-1 font-bold w-[23%]">سعر الوحدة</th>
              <th className="text-left py-1 font-bold w-[25%]">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item, index) => {
              const unitPriceInclVat =
                item.product.price * (1 + totals.taxRate);
              const lineTotalInclVat = unitPriceInclVat * item.quantity;
              return (
                <tr
                  key={`${item.product.id}-${index}`}
                  className="border-b border-dashed border-black/30 align-top"
                >
                  <td className="py-1.5 text-right break-words">
                    {item.product.name}
                    {item.notes && (
                      <div className="text-[9px] opacity-70">
                        ملاحظة: {item.notes}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 text-center font-bold">
                    {item.quantity}
                  </td>
                  <td className="py-1.5 text-center">
                    {fmt.format(unitPriceInclVat)}
                  </td>
                  <td className="py-1.5 text-left font-semibold">
                    {fmt.format(lineTotalInclVat)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ─── ملخص المبالغ (حسب اشتراطات ZATCA) ─── */}
        <div className="border-t-2 border-black/70 pt-2 space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span>الإجمالي غير شامل ضريبة القيمة المضافة:</span>
            <span className="font-semibold">{fmt.format(totals.subtotal)} ر.س</span>
          </div>

          {totals.discount > 0 && (
            <div className="flex justify-between">
              <span>الخصم:</span>
              <span className="font-semibold">
                - {fmt.format(totals.discount)} ر.س
              </span>
            </div>
          )}

          <div className="flex justify-between">
            <span>إجمالي ضريبة القيمة المضافة ({VAT_RATE_LABEL}):</span>
            <span className="font-semibold">
              {fmt.format(totals.taxAmount)} ر.س
            </span>
          </div>

          <div className="mt-2 pt-2 border-t-2 border-dashed border-black/70 flex justify-between items-center text-[13px] font-black">
            <span>الإجمالي المستحق (شامل الضريبة):</span>
            <span>{fmt.format(totals.total)} ر.س</span>
          </div>
        </div>

        {/* ─── QR Code (ZATCA TLV Base64) ─── */}
        <div className="mt-5 flex flex-col items-center gap-1">
          <p className="text-[9px] font-bold opacity-80">
            امسح الرمز للتحقق من الفاتورة
          </p>
          <div className="bg-white p-2 border border-black/20 print:border-black/40">
            <QRCode
              value={qrValue}
              size={110}
              level="M"
              bgColor="#FFFFFF"
              fgColor="#000000"
            />
          </div>
        </div>

        {/* ─── فاصل ─── */}
        <div className="mt-5 border-t border-dashed border-black/50" />

        {/* ─── Footer ─── */}
        <div className="mt-3 text-center">
          {settings.receiptFooter && (
            <p className="text-[10px] mb-1">{settings.receiptFooter}</p>
          )}
          <p className="text-[9px] opacity-70">
            ضريبة القيمة المضافة مُطبقة وفقاً لأنظمة هيئة الزكاة والضريبة والجمارك
          </p>
          <p className="text-[9px] opacity-70 mt-1">شكراً لزيارتكم</p>
        </div>

        {/* ─── Barcode خطي (1D) لرقم الفاتورة — في الأسفل ─── */}
        <div className="mt-4 flex flex-col items-center">
          <div className="bg-white px-1 py-1 print:p-0">
            <Barcode
              value={invoiceNumber}
              height={38}
              width={1.4}
              fontSize={10}
              margin={2}
              format="CODE128"
              background="#FFFFFF"
              lineColor="#000000"
              displayValue
            />
          </div>
        </div>

        {/* ─── علامة التوقيع ─── */}
        <div className="mt-3 text-center text-[8.5px] opacity-60">
          <span>🖨️ نظام Control Panel — رصيد</span>
        </div>

        {/* ─── خط القص ─── */}
        <div className="mt-4 border-t border-dashed border-black/60" />
      </div>
    );
  }
);

ThermalReceipt.displayName = 'ThermalReceipt';

export default ThermalReceipt;
