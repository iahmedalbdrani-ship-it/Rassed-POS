// ============================================================
// Control Panel (رصيد) — useOnlineStatus Hook
//
// يراقب حالة الاتصال بالإنترنت ويُطلق auto-sync صامت
// عند العودة للإنترنت.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import supabase from '../lib/supabase';
import {
  getPendingInvoices,
  markInvoiceSynced,
  markInvoiceFailed,
  countPendingInvoices,
} from '../lib/offlineDB';

// ─── Types ────────────────────────────────────────────────────

export interface OnlineStatusState {
  isOnline:        boolean;
  pendingCount:    number;   // عدد الفواتير المعلقة
  isSyncing:       boolean;  // مزامنة جارية
  lastSyncedAt:    number | null;
}

// ─── Hook ─────────────────────────────────────────────────────

export function useOnlineStatus(): OnlineStatusState & {
  triggerSync: () => Promise<void>;
} {
  const [isOnline, setIsOnline]         = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing]       = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const syncLockRef = useRef(false);   // مانع التشغيل المتزامن

  // ── تحديث عداد الفواتير المعلقة ──────────────────────────
  const refreshPendingCount = useCallback(async () => {
    const count = await countPendingInvoices();
    setPendingCount(count);
  }, []);

  // ── دالة المزامنة الصامتة ─────────────────────────────────
  const triggerSync = useCallback(async () => {
    if (syncLockRef.current || !navigator.onLine) return;
    syncLockRef.current = true;
    setIsSyncing(true);

    try {
      const pending = await getPendingInvoices();
      if (pending.length === 0) {
        setIsSyncing(false);
        syncLockRef.current = false;
        return;
      }

      console.info(`[AutoSync] رفع ${pending.length} فاتورة معلقة...`);

      for (const inv of pending) {
        try {
          const rpcPayload = {
            invoice_number:  inv.payload.invoice_number,
            invoice_uuid:    inv.payload.invoice_uuid,
            cashier_id:      inv.payload.cashier_id,
            cashier_name:    inv.payload.cashier_name,
            branch_name:     inv.payload.branch_name,
            payment_method:  inv.payload.payment_method,
            payment_amount:  inv.payload.payment_amount,
            subtotal_ex_vat: inv.payload.subtotal_ex_vat,
            total_discount:  inv.payload.total_discount,
            total_vat:       inv.payload.total_vat,
            grand_total:     inv.payload.grand_total,
            zatca_qr:        inv.payload.zatca_qr,
            items: inv.payload.items.map(item => ({
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

          const { data, error } = await supabase
            .rpc('process_invoice_with_stock', { p_data: rpcPayload });

          if (error || !data?.success) {
            console.warn('[AutoSync] فشل رفع الفاتورة:', inv.invoice_uuid, error?.message);
            if (inv.localId !== undefined) {
              await markInvoiceFailed(inv.localId);
            }
          } else {
            if (inv.localId !== undefined) {
              await markInvoiceSynced(inv.localId);
            }
            console.info('[AutoSync] ✓ تمت مزامنة:', inv.payload.invoice_number);
          }
        } catch (err) {
          console.warn('[AutoSync] خطأ في رفع فاتورة:', err);
          if (inv.localId !== undefined) {
            await markInvoiceFailed(inv.localId);
          }
        }
      }

      setLastSyncedAt(Date.now());
      await refreshPendingCount();
    } finally {
      setIsSyncing(false);
      syncLockRef.current = false;
    }
  }, [refreshPendingCount]);

  // ── مراقبة حالة الاتصال ──────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // تأخير بسيط لضمان استقرار الاتصال
      setTimeout(() => {
        triggerSync();
      }, 1500);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    // تحميل أولي للعداد
    refreshPendingCount();

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [triggerSync, refreshPendingCount]);

  // ── تحديث دوري للعداد (كل 30 ثانية) ────────────────────
  useEffect(() => {
    const interval = setInterval(refreshPendingCount, 30_000);
    return () => clearInterval(interval);
  }, [refreshPendingCount]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncedAt,
    triggerSync,
  };
}
