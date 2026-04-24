// ============================================================
// Control Panel (رصيد) — Offline Database (Dexie.js / IndexedDB)
//
// الجداول:
//   offline_invoices  — فواتير محفوظة محلياً عند انقطاع الإنترنت
//   products_cache    — نسخة محلية من المنتجات للبحث بدون إنترنت
// ============================================================

import Dexie, { type Table } from 'dexie';
import type { SalePayload } from '../hooks/useCheckoutTransaction';

// ─── Types ────────────────────────────────────────────────────

export interface OfflineInvoice {
  /** مفتاح محلي تلقائي */
  localId?:    number;
  /** UUID الفاتورة — نفسه الذي سيُرسل لـ Supabase */
  invoice_uuid: string;
  /** Payload كاملة جاهزة للرفع */
  payload:     SalePayload;
  /** وقت الحفظ المحلي */
  savedAt:     number;   // Date.now()
  /** عدد محاولات الرفع الفاشلة */
  retries:     number;
  /** حالة المزامنة */
  syncStatus:  'pending' | 'syncing' | 'failed';
}

export interface CachedProduct {
  id:          string;
  name:        string;
  name_en?:    string;
  barcode?:    string;
  unit_price:  number;
  vat_rate:    number;
  stock_qty:   number;
  category?:   string;
  cachedAt:    number;   // Date.now()
}

// ─── Database Class ───────────────────────────────────────────

class RaseedOfflineDB extends Dexie {
  offline_invoices!: Table<OfflineInvoice, number>;
  products_cache!:   Table<CachedProduct, string>;

  constructor() {
    super('raseed_offline_v1');

    this.version(1).stores({
      // localId → auto-increment PK
      offline_invoices: '++localId, invoice_uuid, savedAt, syncStatus',
      // id → product UUID as PK
      products_cache:   'id, barcode, name, cachedAt',
    });
  }
}

// ─── Singleton ────────────────────────────────────────────────

export const db = new RaseedOfflineDB();

// ─── Helper Functions ─────────────────────────────────────────

/**
 * حفظ فاتورة محلياً عند الانقطاع
 */
export async function saveInvoiceOffline(payload: SalePayload): Promise<number> {
  const localId = await db.offline_invoices.add({
    invoice_uuid: payload.invoice_uuid,
    payload,
    savedAt:    Date.now(),
    retries:    0,
    syncStatus: 'pending',
  });
  console.info('[OfflineDB] Invoice saved locally:', payload.invoice_number, '→ localId:', localId);
  return localId as number;
}

/**
 * استرجاع جميع الفواتير المعلقة
 */
export async function getPendingInvoices(): Promise<OfflineInvoice[]> {
  return db.offline_invoices
    .where('syncStatus')
    .anyOf(['pending', 'failed'])
    .toArray();
}

/**
 * تحديث حالة فاتورة بعد الرفع
 */
export async function markInvoiceSynced(localId: number): Promise<void> {
  await db.offline_invoices.delete(localId);
  console.info('[OfflineDB] Invoice synced and removed:', localId);
}

/**
 * تسجيل فشل رفع فاتورة
 */
export async function markInvoiceFailed(localId: number): Promise<void> {
  await db.offline_invoices
    .where('localId').equals(localId)
    .modify(inv => {
      inv.retries++;
      inv.syncStatus = inv.retries >= 5 ? 'failed' : 'pending';
    });
}

/**
 * مزامنة المنتجات من Supabase إلى الكاش المحلي
 */
export async function cacheProducts(products: CachedProduct[]): Promise<void> {
  const now = Date.now();
  await db.products_cache.bulkPut(
    products.map(p => ({ ...p, cachedAt: now }))
  );
  console.info('[OfflineDB] Products cached:', products.length);
}

/**
 * البحث في المنتجات المحلية (للعمل بدون إنترنت)
 */
export async function searchCachedProducts(query: string): Promise<CachedProduct[]> {
  const q = query.trim().toLowerCase();
  if (!q) return db.products_cache.limit(50).toArray();

  // بحث بالاسم أو الباركود
  return db.products_cache
    .filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.barcode ?? '').includes(q)
    )
    .limit(30)
    .toArray();
}

/**
 * عدد الفواتير المعلقة (للـ badge)
 */
export async function countPendingInvoices(): Promise<number> {
  return db.offline_invoices
    .where('syncStatus')
    .anyOf(['pending', 'failed'])
    .count();
}
