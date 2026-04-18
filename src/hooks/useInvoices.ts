// ============================================================
// Control Panel (رصيد) — Firestore Invoice Hooks
// Real-time data | org-scoped | loading + error states
// ============================================================
//
// Placement: src/hooks/useInvoices.ts
//
// Usage:
//   const { invoices, loading, error } = useInvoices(orgId);
//   const { invoice, loading, error }  = useInvoiceById(invoiceId);
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, orderBy, limit,
  onSnapshot, doc, getDoc,
  type Query, type DocumentData, type FirestoreError,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../lib/firebase';

// ─── Types ───────────────────────────────────────────────────

export type ZatcaStatus     = 'cleared' | 'reported' | 'pending' | 'rejected' | 'warning';
export type InvoiceStatus   = 'DRAFT' | 'PENDING' | 'CLEARED' | 'REPORTED' | 'REJECTED' | 'CANCELLED';
export type PaymentMethod   = 'cash' | 'card' | 'bank_transfer';
export type InvoiceTypeEnum = 'STANDARD' | 'SIMPLIFIED';

export interface InvoiceItem {
  description: string;
  quantity:    number;
  unit_price:  number;
  subtotal:    number;
  vat_amount:  number;
  total:       number;
}

export interface Invoice {
  id:                    string;
  invoice_number:        string;
  uuid:                  string;
  icv:                   number;
  org_id:                string;
  created_by_uid:        string;
  created_by_name:       string;

  invoice_type:          InvoiceTypeEnum;
  payment_method:        PaymentMethod;

  org_name:              string;
  org_vat:               string;
  customer_name:         string;
  customer_vat?:         string | null;

  invoice_date:          string;       // YYYY-MM-DD
  invoice_time:          string;       // HH:MM:SS
  created_at:            Date;

  items:                 InvoiceItem[];
  subtotal:              number;
  vat_amount:            number;
  total:                 number;
  currency:              string;

  previous_invoice_hash: string;
  invoice_hash:          string | null;
  ecdsa_signature:       string | null;
  qr_code:               string;
  xml_content:           string | null;

  status:                InvoiceStatus;
  zatca_status:          ZatcaStatus;
  zatca_request_id:      string | null;
  zatca_submitted_at:    string | null;

  notes?:                string | null;
  device_id?:            string | null;
}

export interface CreateInvoiceLineInput {
  description: string;
  quantity:    number;
  unit_price:  number;
  vat_exempt?: boolean;
}

export interface CreateInvoiceInput {
  org_id:         string;
  customer_name?: string;
  customer_vat?:  string;
  invoice_type:   InvoiceTypeEnum;
  payment_method: PaymentMethod;
  invoice_date?:  string;
  lines:          CreateInvoiceLineInput[];
  notes?:         string;
  device_id?:     string;
}

export interface CreateInvoiceResult {
  success:        boolean;
  invoice_id?:    string;
  invoice_number?: string;
  uuid?:          string;
  icv?:           number;
  total?:         number;
  vat_amount?:    number;
  qr_code?:       string;
  message?:       string;
  /** Error code returned from Cloud Function — map to Arabic UI message */
  errorCode?:     string;
}

// ─── Error code → Arabic Snackbar message ────────────────────

export const INVOICE_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED:          'يجب تسجيل الدخول أولاً',
  PERMISSION_DENIED:        'ليس لديك صلاحية إصدار الفواتير',
  MISSING_PAYLOAD:          'البيانات المطلوبة مفقودة',
  MISSING_ORG_ID:           'معرف المنشأة مطلوب',
  INVALID_INVOICE_TYPE:     'نوع الفاتورة غير صحيح',
  INVALID_PAYMENT_METHOD:   'طريقة الدفع غير صحيحة',
  INVALID_DATE:             'صيغة التاريخ غير صحيحة (YYYY-MM-DD)',
  FUTURE_DATE:              'لا يمكن إصدار فاتورة بتاريخ مستقبلي',
  OLD_DATE:                 'لا يمكن إصدار فاتورة بتاريخ أقدم من سنة',
  MISSING_LINES:            'يجب إضافة بند واحد على الأقل',
  TOO_MANY_LINES:           'الفاتورة لا تقبل أكثر من 100 بند',
  INVALID_CUSTOMER_VAT:     'الرقم الضريبي للعميل يجب أن يكون 15 رقماً',
  ZERO_AMOUNT:              'المبلغ الإجمالي يجب أن يكون أكبر من صفر',
  USER_PROFILE_NOT_FOUND:   'ملف المستخدم غير موجود',
  ORG_NOT_FOUND:            'المنشأة غير موجودة',
  INVALID_ORG_VAT:          'الرقم الضريبي للمنشأة غير مكتمل',
  SERVER_ERROR:             'خطأ في الخادم، يرجى المحاولة مرة أخرى',
};

export function getInvoiceErrorMessage(rawError: string): string {
  // Extract the error code prefix (e.g. "PERMISSION_DENIED: ..." → "PERMISSION_DENIED")
  const code = rawError.split(':')[0].trim();
  return INVOICE_ERROR_MESSAGES[code] ?? rawError;
}

// ─── Snapshot → Invoice converter ────────────────────────────

function snapToInvoice(id: string, data: DocumentData): Invoice {
  return {
    id,
    invoice_number:        data.invoice_number        ?? '',
    uuid:                  data.uuid                  ?? '',
    icv:                   data.icv                   ?? 0,
    org_id:                data.org_id                ?? '',
    created_by_uid:        data.created_by_uid        ?? '',
    created_by_name:       data.created_by_name       ?? '',
    invoice_type:          data.invoice_type          ?? 'SIMPLIFIED',
    payment_method:        data.payment_method        ?? 'cash',
    org_name:              data.org_name              ?? '',
    org_vat:               data.org_vat               ?? '',
    customer_name:         data.customer_name         ?? 'عميل نقدي',
    customer_vat:          data.customer_vat          ?? null,
    invoice_date:          data.invoice_date          ?? '',
    invoice_time:          data.invoice_time          ?? '00:00:00',
    created_at:            data.created_at?.toDate()  ?? new Date(),
    items:                 data.items                 ?? [],
    subtotal:              data.subtotal              ?? 0,
    vat_amount:            data.vat_amount            ?? 0,
    total:                 data.total                 ?? 0,
    currency:              data.currency              ?? 'SAR',
    previous_invoice_hash: data.previous_invoice_hash ?? '',
    invoice_hash:          data.invoice_hash          ?? null,
    ecdsa_signature:       data.ecdsa_signature       ?? null,
    qr_code:               data.qr_code               ?? '',
    xml_content:           data.xml_content           ?? null,
    status:                data.status                ?? 'DRAFT',
    zatca_status:          data.zatca_status          ?? 'pending',
    zatca_request_id:      data.zatca_request_id      ?? null,
    zatca_submitted_at:    data.zatca_submitted_at    ?? null,
    notes:                 data.notes                 ?? null,
    device_id:             data.device_id             ?? null,
  };
}

// ─── Hook: useInvoices (real-time list) ───────────────────────

interface UseInvoicesOptions {
  pageSize?: number;
}

interface UseInvoicesReturn {
  invoices:    Invoice[];
  loading:     boolean;
  error:       string | null;
  /** Call to refresh (re-subscribe) */
  refresh:     () => void;
}

/**
 * Subscribe to the invoices collection for a given org in real-time.
 * Automatically unsubscribes when the component unmounts.
 *
 * @param orgId  - The organisation ID (from user profile)
 * @param options - pageSize (default 50)
 */
export function useInvoices(
  orgId: string | null | undefined,
  options: UseInvoicesOptions = {},
): UseInvoicesReturn {
  const { pageSize = 50 } = options;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [tick,     setTick]     = useState(0); // increment to force re-subscribe

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    // No org — clear and stop
    if (!orgId) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const q: Query<DocumentData> = query(
      collection(db, 'invoices'),
      where('org_id', '==', orgId),
      orderBy('icv', 'desc'),
      limit(pageSize),
    );

    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snapshot) => {
        const docs = snapshot.docs.map(d => snapToInvoice(d.id, d.data()));
        setInvoices(docs);
        setLoading(false);
        setError(null);
      },
      (err: FirestoreError) => {
        // Map Firestore error codes to Arabic messages
        const msg = err.code === 'permission-denied'
          ? 'ليس لديك صلاحية عرض الفواتير'
          : err.code === 'unavailable'
            ? 'تعذر الاتصال بالخادم، يرجى التحقق من الإنترنت'
            : `خطأ في جلب الفواتير: ${err.message}`;

        setError(msg);
        setLoading(false);
      },
    );

    // Cleanup: unsubscribe when org changes or component unmounts
    return () => unsubscribe();
  }, [orgId, pageSize, tick]);

  return { invoices, loading, error, refresh };
}

// ─── Hook: useInvoiceById (single document fetch) ────────────

interface UseInvoiceByIdReturn {
  invoice: Invoice | null;
  loading: boolean;
  error:   string | null;
  /** Manually re-fetch the document */
  refetch: () => void;
}

/**
 * Fetch a single invoice by its Firestore document ID.
 * Uses a one-time `getDoc` (not real-time) — suitable for preview modal.
 *
 * @param invoiceId - Firestore document ID
 */
export function useInvoiceById(invoiceId: string | null | undefined): UseInvoiceByIdReturn {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [tick,    setTick]    = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!invoiceId) {
      setInvoice(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getDoc(doc(db, 'invoices', invoiceId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setError('الفاتورة غير موجودة');
          setInvoice(null);
        } else {
          setInvoice(snapToInvoice(snap.id, snap.data()));
        }
        setLoading(false);
      })
      .catch((err: FirestoreError) => {
        if (cancelled) return;
        const msg = err.code === 'permission-denied'
          ? 'ليس لديك صلاحية عرض هذه الفاتورة'
          : `خطأ في جلب الفاتورة: ${err.message}`;
        setError(msg);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [invoiceId, tick]);

  return { invoice, loading, error, refetch };
}

// ─── Hook: useCreateInvoice ───────────────────────────────────

interface UseCreateInvoiceReturn {
  createInvoice: (input: CreateInvoiceInput) => Promise<CreateInvoiceResult>;
  creating:      boolean;
}

/**
 * Hook to call the `createInvoice` Cloud Function.
 * Returns the result with success/error info for Snackbar display.
 */
export function useCreateInvoice(): UseCreateInvoiceReturn {
  const [creating, setCreating] = useState(false);

  const createInvoice = useCallback(async (
    input: CreateInvoiceInput
  ): Promise<CreateInvoiceResult> => {
    setCreating(true);
    try {
      const functions        = getFunctions(undefined, 'me-central1');
      const createFn         = httpsCallable<CreateInvoiceInput, CreateInvoiceResult>(
        functions, 'createInvoice'
      );
      const result           = await createFn(input);
      return result.data;
    } catch (err: unknown) {
      // Firebase HttpsError has a `message` field with our error code prefix
      const raw     = (err as { message?: string })?.message ?? 'SERVER_ERROR';
      const code    = raw.split(':')[0].trim();
      const message = getInvoiceErrorMessage(raw);

      return { success: false, errorCode: code, message };
    } finally {
      setCreating(false);
    }
  }, []);

  return { createInvoice, creating };
}
