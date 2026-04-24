// ============================================================
// Control Panel (رصيد) — useCheckoutTransaction Hook v2
//
// يدير كامل عملية البيع بشكل ذري (Atomic):
//   1. فحص حالة الاتصال (Online / Offline)
//   2. أونلاين → استدعاء process_invoice_with_stock عبر Supabase RPC
//   3. أوفلاين → حفظ الفاتورة في IndexedDB + رفعها عند عودة الإنترنت
//   4. إظهار تنبيه تفصيلي عند نقص المخزون
//   5. إشعار الـ UI بالنجاح + تشغيل الطباعة التلقائية
//   6. تصفير السلة + تحديث حالة الواجهة
// ============================================================

import { useState, useCallback } from 'react';
import supabase from '../lib/supabase';
import { saveInvoiceOffline } from '../lib/offlineDB';

// ─── Types ───────────────────────────────────────────────────

export interface SaleItem {
  id:            string;
  name:          string;
  name_en?:      string;
  barcode?:      string;
  qty:           number;
  unit_price:    number;   // Ex-VAT
  discount_pct:  number;   // 0..100
  vat_rate:      number;   // e.g. 15
  vat_amount:    number;
  line_total:    number;   // Inc-VAT
}

export interface SalePayload {
  invoice_number:   string;
  invoice_uuid:     string;
  cashier_id:       string;
  cashier_name:     string;
  branch_name:      string;
  items:            SaleItem[];
  subtotal_ex_vat:  number;
  total_discount:   number;
  total_vat:        number;
  grand_total:      number;
  payment_method:   string;
  payment_amount:   number;
  zatca_qr:         string;
}

export interface SaleResult {
  success:        boolean;
  invoice_id:     string;
  invoice_number: string;
  invoice_uuid:   string;
  grand_total:    number;
  total_vat:      number;
  status:         string;
  created_at:     string;
  /** هل تم الحفظ محلياً (أوفلاين)؟ */
  savedOffline?:  boolean;
}

/** Categorized error returned to the caller */
export interface SaleError {
  code:    'INSUFFICIENT_STOCK' | 'PRODUCT_NOT_FOUND' | 'INVALID_INPUT'
         | 'NETWORK' | 'INTERNAL' | 'UNKNOWN';
  message: string;   // Arabic user-facing message
  raw?:    string;   // Raw Postgres error for debugging
}

// ─── Error parser ─────────────────────────────────────────────

function parseSaleError(err: unknown): SaleError {
  const raw = err instanceof Error ? err.message : String(err);

  if (raw.includes('INSUFFICIENT_STOCK')) {
    const detail = raw.replace(/^.*INSUFFICIENT_STOCK:\s*/, '');
    return { code: 'INSUFFICIENT_STOCK', message: detail, raw };
  }
  if (raw.includes('PRODUCT_NOT_FOUND')) {
    return {
      code: 'PRODUCT_NOT_FOUND',
      message: 'أحد المنتجات في السلة غير موجود في قاعدة البيانات — يرجى إعادة تحميل الصفحة.',
      raw,
    };
  }
  if (raw.includes('INVALID_INPUT')) {
    return {
      code: 'INVALID_INPUT',
      message: 'بيانات الفاتورة غير مكتملة — تأكد من وجود أصناف في السلة.',
      raw,
    };
  }
  if (raw.includes('NetworkError') || raw.includes('Failed to fetch') || raw.includes('offline')) {
    return {
      code: 'NETWORK',
      message: 'لا يوجد اتصال بالإنترنت — تم حفظ الفاتورة محلياً.',
      raw,
    };
  }
  if (raw.includes('INTERNAL_ERROR')) {
    return {
      code: 'INTERNAL',
      message: 'خطأ داخلي في الخادم — يرجى المحاولة مرة أخرى أو التواصل مع الدعم.',
      raw,
    };
  }

  return {
    code: 'UNKNOWN',
    message: `حدث خطأ غير متوقع: ${raw.slice(0, 120)}`,
    raw,
  };
}

// ─── Hook state ───────────────────────────────────────────────

export type CheckoutPhase =
  | 'idle'           // لا توجد عملية جارية
  | 'validating'     // فحص المخزون
  | 'saving'         // حفظ في قاعدة البيانات
  | 'saving_offline' // حفظ محلي (وضع أوفلاين)
  | 'printing'       // تشغيل الطباعة
  | 'success'        // اكتمل بنجاح
  | 'success_offline'// اكتمل محلياً — سيُرفع لاحقاً
  | 'error';         // فشل

interface UseCheckoutState {
  phase:    CheckoutPhase;
  error:    SaleError | null;
  result:   SaleResult | null;
}

// ─── Hook ─────────────────────────────────────────────────────

export function useCheckoutTransaction() {
  const [state, setState] = useState<UseCheckoutState>({
    phase:  'idle',
    error:  null,
    result: null,
  });

  /**
   * processCheckout — الدالة الرئيسية
   *
   * @param payload     — بيانات البيع الكاملة
   * @param onPrint     — callback يُطلق أمر الطباعة (react-to-print)
   * @param onSuccess   — callback يُفرّغ السلة ويحدث الـ UI
   */
  const processCheckout = useCallback(async (
    payload:   SalePayload,
    onPrint:   () => void,
    onSuccess: (result: SaleResult) => void,
  ) => {
    // Guard: لا تسمح بتشغيل متوازي
    if (state.phase !== 'idle' && state.phase !== 'error' && state.phase !== 'success' && state.phase !== 'success_offline') {
      return;
    }

    // ── Phase 1: Validating ──────────────────────────────────
    setState({ phase: 'validating', error: null, result: null });

    try {
      // ── فحص الاتصال بالإنترنت ────────────────────────────
      const isOnline = navigator.onLine;

      // ── وضع الأوفلاين: حفظ محلي ──────────────────────────
      if (!isOnline) {
        setState(s => ({ ...s, phase: 'saving_offline' }));

        await saveInvoiceOffline(payload);

        // بناء نتيجة وهمية للـ UI
        const offlineResult: SaleResult = {
          success:        true,
          invoice_id:     `offline_${Date.now()}`,
          invoice_number: payload.invoice_number,
          invoice_uuid:   payload.invoice_uuid,
          grand_total:    payload.grand_total,
          total_vat:      payload.total_vat,
          status:         'pending_sync',
          created_at:     new Date().toISOString(),
          savedOffline:   true,
        };

        // ── طباعة حتى في وضع أوفلاين ────────────────────
        setState(s => ({ ...s, phase: 'printing', result: offlineResult }));
        try { onPrint(); } catch {}

        setState({ phase: 'success_offline', error: null, result: offlineResult });
        onSuccess(offlineResult);
        return;
      }

      // ── وضع الأونلاين: Supabase RPC ─────────────────────
      setState(s => ({ ...s, phase: 'saving' }));

      const rpcPayload = {
        invoice_number:   payload.invoice_number,
        invoice_uuid:     payload.invoice_uuid,
        cashier_id:       payload.cashier_id,
        cashier_name:     payload.cashier_name,
        branch_name:      payload.branch_name,
        payment_method:   payload.payment_method,
        payment_amount:   payload.payment_amount,
        subtotal_ex_vat:  payload.subtotal_ex_vat,
        total_discount:   payload.total_discount,
        total_vat:        payload.total_vat,
        grand_total:      payload.grand_total,
        zatca_qr:         payload.zatca_qr,
        items: payload.items.map(item => ({
          id:           item.id,
          name:         item.name,
          name_en:      item.name_en ?? '',
          barcode:      item.barcode ?? '',
          qty:          item.qty,
          unit_price:   item.unit_price,
          discount_pct: item.discount_pct,
          vat_rate:     item.vat_rate,
          vat_amount:   item.vat_amount,
          line_total:   item.line_total,
        })),
      };

      const { data, error: rpcError } = await supabase
        .rpc('process_invoice_with_stock', { p_data: rpcPayload });

      if (rpcError) throw new Error(rpcError.message);
      if (!data || !data.success) throw new Error(data?.error ?? 'الدالة الذرية لم تُعِد نتيجة صالحة');

      const saleResult = data as SaleResult;

      // ── Phase 3: Printing ─────────────────────────────────
      setState(s => ({ ...s, phase: 'printing', result: saleResult }));
      try { onPrint(); } catch (printErr) {
        console.warn('[Checkout] Print failed (non-fatal):', printErr);
      }

      // ── Phase 4: Success ──────────────────────────────────
      setState({ phase: 'success', error: null, result: saleResult });
      onSuccess(saleResult);

    } catch (err: unknown) {
      // إذا فشل الأونلاين لسبب شبكي → حفظ محلياً كحل بديل
      const saleError = parseSaleError(err);

      if (saleError.code === 'NETWORK') {
        console.warn('[Checkout] فشل الاتصال — سيتم الحفظ محلياً');
        try {
          setState(s => ({ ...s, phase: 'saving_offline' }));
          await saveInvoiceOffline(payload);

          const offlineResult: SaleResult = {
            success:        true,
            invoice_id:     `offline_fallback_${Date.now()}`,
            invoice_number: payload.invoice_number,
            invoice_uuid:   payload.invoice_uuid,
            grand_total:    payload.grand_total,
            total_vat:      payload.total_vat,
            status:         'pending_sync',
            created_at:     new Date().toISOString(),
            savedOffline:   true,
          };

          setState(s => ({ ...s, phase: 'printing', result: offlineResult }));
          try { onPrint(); } catch {}

          setState({ phase: 'success_offline', error: null, result: offlineResult });
          onSuccess(offlineResult);
          return;
        } catch (offlineErr) {
          console.error('[Checkout] فشل الحفظ المحلي أيضاً:', offlineErr);
        }
      }

      console.error('[Checkout] Error:', saleError.code, saleError.raw);
      setState({ phase: 'error', error: saleError, result: null });
    }
  }, [state.phase]);

  /** إعادة الـ hook لحالة idle */
  const resetCheckout = useCallback(() => {
    setState({ phase: 'idle', error: null, result: null });
  }, []);

  // ─── Derived booleans ─────────────────────────────────────

  const isProcessing   = state.phase === 'validating' || state.phase === 'saving' || state.phase === 'saving_offline';
  const isPrinting     = state.phase === 'printing';
  const isSuccess      = state.phase === 'success';
  const isSuccessOffline = state.phase === 'success_offline';
  const hasError       = state.phase === 'error';

  const phaseLabel: Record<CheckoutPhase, string> = {
    idle:            'تأكيد وطباعة الفاتورة',
    validating:      'جارٍ التحقق من المخزون...',
    saving:          'جارٍ حفظ الفاتورة...',
    saving_offline:  'جارٍ الحفظ محلياً...',
    printing:        'جارٍ الطباعة...',
    success:         'تم البيع بنجاح ✓',
    success_offline: 'تم الحفظ محلياً ✓',
    error:           'حدث خطأ — أعد المحاولة',
  };

  return {
    // State
    phase:     state.phase,
    error:     state.error,
    result:    state.result,

    // Derived
    isProcessing,
    isPrinting,
    isSuccess,
    isSuccessOffline,
    hasError,

    // UI label for the confirm button
    buttonLabel: phaseLabel[state.phase],

    // Actions
    processCheckout,
    resetCheckout,
  };
}
