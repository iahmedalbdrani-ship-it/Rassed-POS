// ============================================================
// Control Panel (رصيد) — Cloud Function: createInvoice
// Firebase Functions v2 | Admin SDK | ZATCA Phase 2
// ============================================================
//
// WHY A CLOUD FUNCTION AND NOT CLIENT-SIDE?
//   1. The Admin SDK bypasses Firestore security rules —
//      so this is the ONLY place that can write invoices.
//   2. The ICV counter must be incremented atomically
//      (no race conditions if two cashiers submit at once).
//   3. The private key for ECDSA signing must NEVER leave the server.
//   4. NTP time comes from the server — client clock cannot be spoofed.
//
// Deployment:
//   cd functions && npm run deploy
//   or: firebase deploy --only functions:createInvoice
// ============================================================

import { onCall, HttpsError }   from 'firebase-functions/v2/https';
import { setGlobalOptions }      from 'firebase-functions';
import * as admin                from 'firebase-admin';
import * as logger               from 'firebase-functions/logger';

// ─── Initialise Admin SDK (singleton) ────────────────────────
if (!admin.apps.length) {
  admin.initializeApp();
}

const db      = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

setGlobalOptions({ region: 'me-central1', maxInstances: 20 }); // Middle East region

// ─── Types ───────────────────────────────────────────────────

interface InvoiceLinePayload {
  description: string;
  quantity:    number;
  unit_price:  number;
  vat_exempt?: boolean;
}

interface CreateInvoicePayload {
  org_id:         string;
  customer_name?: string;
  customer_vat?:  string;
  invoice_type:   'STANDARD' | 'SIMPLIFIED';
  payment_method: 'cash' | 'card' | 'bank_transfer';
  invoice_date:   string;    // YYYY-MM-DD — used if provided; otherwise server date
  lines:          InvoiceLinePayload[];
  notes?:         string;
  device_id?:     string;    // zatca_devices.id — required for production
}

interface InvoiceLineResult {
  description: string;
  quantity:    number;
  unit_price:  number;
  subtotal:    number;
  vat_amount:  number;
  total:       number;
}

interface CreateInvoiceResult {
  success:        true;
  invoice_id:     string;
  invoice_number: string;
  uuid:           string;
  icv:            number;
  total:          number;
  vat_amount:     number;
  qr_code:        string;
  message:        string;
}

// ─── Validation ───────────────────────────────────────────────

/**
 * Manual validation (no external deps in Functions).
 * Throws HttpsError with a specific code so the UI can show
 * a relevant Snackbar message per error type.
 */
function validatePayload(data: unknown): CreateInvoicePayload {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'MISSING_PAYLOAD: البيانات مفقودة');
  }

  const p = data as Record<string, unknown>;

  // ── Required fields ──────────────────────────────────────
  if (!p.org_id || typeof p.org_id !== 'string' || p.org_id.trim() === '') {
    throw new HttpsError('invalid-argument', 'MISSING_ORG_ID: معرف المنشأة مطلوب');
  }

  if (!['STANDARD', 'SIMPLIFIED'].includes(p.invoice_type as string)) {
    throw new HttpsError(
      'invalid-argument',
      'INVALID_INVOICE_TYPE: نوع الفاتورة يجب أن يكون STANDARD أو SIMPLIFIED'
    );
  }

  if (!['cash', 'card', 'bank_transfer'].includes(p.payment_method as string)) {
    throw new HttpsError(
      'invalid-argument',
      'INVALID_PAYMENT_METHOD: طريقة الدفع غير صحيحة'
    );
  }

  // ── Invoice date ─────────────────────────────────────────
  const dateStr  = typeof p.invoice_date === 'string' ? p.invoice_date : '';
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (dateStr && !dateRegex.test(dateStr)) {
    throw new HttpsError('invalid-argument', 'INVALID_DATE: صيغة التاريخ يجب أن تكون YYYY-MM-DD');
  }

  // Prevent future-dating invoices (max 1 day ahead for timezone tolerance)
  if (dateStr) {
    const provided = new Date(dateStr);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (provided > tomorrow) {
      throw new HttpsError('invalid-argument', 'FUTURE_DATE: لا يمكن إصدار فاتورة بتاريخ مستقبلي');
    }
    // Prevent back-dating more than 1 year (ZATCA requirement)
    const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    if (provided < oneYearAgo) {
      throw new HttpsError('invalid-argument', 'OLD_DATE: لا يمكن إصدار فاتورة بتاريخ أقدم من سنة');
    }
  }

  // ── Invoice lines ─────────────────────────────────────────
  if (!Array.isArray(p.lines) || p.lines.length === 0) {
    throw new HttpsError('invalid-argument', 'MISSING_LINES: الفاتورة يجب أن تحتوي على بند واحد على الأقل');
  }

  if (p.lines.length > 100) {
    throw new HttpsError('invalid-argument', 'TOO_MANY_LINES: الفاتورة لا تقبل أكثر من 100 بند');
  }

  for (let i = 0; i < (p.lines as unknown[]).length; i++) {
    const line = (p.lines as Record<string, unknown>[])[i];

    if (!line.description || typeof line.description !== 'string' || line.description.trim() === '') {
      throw new HttpsError('invalid-argument', `INVALID_LINE_${i}: وصف البند ${i + 1} مطلوب`);
    }

    if (typeof line.quantity !== 'number' || line.quantity <= 0 || !Number.isFinite(line.quantity)) {
      throw new HttpsError('invalid-argument', `INVALID_LINE_${i}: كمية البند ${i + 1} يجب أن تكون أكبر من صفر`);
    }

    if (typeof line.unit_price !== 'number' || line.unit_price < 0 || !Number.isFinite(line.unit_price)) {
      throw new HttpsError('invalid-argument', `INVALID_LINE_${i}: سعر الوحدة ${i + 1} غير صحيح`);
    }

    if (line.unit_price === 0 && !line.vat_exempt) {
      throw new HttpsError('invalid-argument', `INVALID_LINE_${i}: سعر البند ${i + 1} لا يمكن أن يكون صفراً`);
    }
  }

  // ── Customer VAT format (if provided) ────────────────────
  if (p.customer_vat && typeof p.customer_vat === 'string') {
    if (!/^\d{15}$/.test(p.customer_vat)) {
      throw new HttpsError(
        'invalid-argument',
        'INVALID_CUSTOMER_VAT: الرقم الضريبي للعميل يجب أن يكون 15 رقماً'
      );
    }
  }

  return p as unknown as CreateInvoicePayload;
}

// ─── ICV Counter (Atomic) ─────────────────────────────────────

/**
 * Atomically increment and return the Invoice Counter Value (ICV).
 * Uses a Firestore transaction to guarantee no two invoices get the same ICV.
 */
async function getNextICV(orgId: string): Promise<number> {
  const counterRef = db.collection('invoice_counter').doc(orgId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    let current = 0;

    if (doc.exists) {
      current = (doc.data()?.current as number) ?? 0;
    } else {
      // First invoice for this org — initialise the counter
      tx.set(counterRef, { current: 0, created_at: FieldValue.serverTimestamp() });
    }

    const next = current + 1;
    tx.update(counterRef, {
      current:    next,
      updated_at: FieldValue.serverTimestamp(),
    });

    return next;
  });
}

// ─── Previous Invoice Hash (Chain) ───────────────────────────

const GENESIS_PIH =
  'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjOTliNTk5Y2M3MDYzMDM0YjYxNzM4MWNhYzE5NjYxNjM5MA==';

async function getPreviousInvoiceHash(orgId: string): Promise<string> {
  const snap = await db
    .collection('invoices')
    .where('org_id', '==', orgId)
    .orderBy('icv', 'desc')
    .limit(1)
    .get();

  if (snap.empty) return GENESIS_PIH;
  return (snap.docs[0].data().invoice_hash as string) ?? GENESIS_PIH;
}

// ─── UUID Generator (no crypto.randomUUID in Node 16) ────────
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── VAT Calculator ──────────────────────────────────────────
const VAT_RATE = 0.15;
const round    = (n: number) => Math.round(n * 100) / 100;

function calcLines(lines: InvoiceLinePayload[]): {
  items:     InvoiceLineResult[];
  subtotal:  number;
  vatAmount: number;
  total:     number;
} {
  const items = lines.map(l => {
    const subtotal  = round(l.quantity * l.unit_price);
    const vatAmount = l.vat_exempt ? 0 : round(subtotal * VAT_RATE);
    return {
      description: l.description.trim(),
      quantity:    l.quantity,
      unit_price:  l.unit_price,
      subtotal,
      vat_amount:  vatAmount,
      total:       round(subtotal + vatAmount),
    };
  });

  const subtotal  = round(items.reduce((s, i) => s + i.subtotal,   0));
  const vatAmount = round(items.reduce((s, i) => s + i.vat_amount, 0));

  return { items, subtotal, vatAmount, total: round(subtotal + vatAmount) };
}

// ─── TLV QR Code (server-side, no Buffer) ────────────────────
function buildTLV(
  seller: string, vatNo: string, time: string,
  total: string, vat: string
): string {
  const enc = new TextEncoder();
  const tag = (t: number, v: string) => {
    const b = enc.encode(v);
    return new Uint8Array([t, b.length, ...b]);
  };
  const chunks = [tag(1, seller), tag(2, vatNo), tag(3, time), tag(4, total), tag(5, vat)];
  const buf    = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return Buffer.from(buf).toString('base64');
}

// ─── Invoice Number Generator ─────────────────────────────────
function buildInvoiceNumber(prefix: string, year: number, icv: number): string {
  return `${prefix}-${year}-${String(icv).padStart(5, '0')}`;
}

// ─── MAIN CLOUD FUNCTION ─────────────────────────────────────

export const createInvoice = onCall<CreateInvoicePayload, Promise<CreateInvoiceResult>>(
  {
    region:       'me-central1',
    maxInstances: 20,
    timeoutSeconds: 30,
    enforceAppCheck: false,   // set to true after App Check is configured
  },
  async (request) => {
    // ── 1. Authentication check ────────────────────────────
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'UNAUTHENTICATED: يجب تسجيل الدخول أولاً'
      );
    }

    const callerUid = request.auth.uid;
    logger.info('createInvoice called', { uid: callerUid });

    try {
      // ── 2. Validate payload ──────────────────────────────
      const payload = validatePayload(request.data);

      // ── 3. Verify caller belongs to the org ──────────────
      const profileSnap = await db.collection('user_profiles').doc(callerUid).get();

      if (!profileSnap.exists) {
        throw new HttpsError('not-found', 'USER_PROFILE_NOT_FOUND: ملف المستخدم غير موجود');
      }

      const profile = profileSnap.data()!;

      if (profile.org_id !== payload.org_id) {
        throw new HttpsError(
          'permission-denied',
          'PERMISSION_DENIED: ليس لديك صلاحية إصدار فواتير لهذه المنشأة'
        );
      }

      // Viewers cannot create invoices
      if (profile.role === 'viewer') {
        throw new HttpsError(
          'permission-denied',
          'PERMISSION_DENIED: دور المشاهد لا يملك صلاحية إصدار الفواتير'
        );
      }

      // ── 4. Load organisation data (VAT number, name) ─────
      const orgSnap = await db.collection('organizations').doc(payload.org_id).get();

      if (!orgSnap.exists) {
        throw new HttpsError('not-found', 'ORG_NOT_FOUND: المنشأة غير موجودة');
      }

      const org     = orgSnap.data()!;
      const orgName = (org.name_ar as string) ?? 'منشأة رصيد';
      const orgVat  = org.vat_number as string;

      if (!orgVat || !/^\d{15}$/.test(orgVat)) {
        throw new HttpsError(
          'failed-precondition',
          'INVALID_ORG_VAT: الرقم الضريبي للمنشأة غير مكتمل. أكمل بيانات المنشأة أولاً.'
        );
      }

      // ── 5. Atomic ICV + previous hash ────────────────────
      const [icv, previousHash] = await Promise.all([
        getNextICV(payload.org_id),
        getPreviousInvoiceHash(payload.org_id),
      ]);

      // ── 6. Use server timestamp (NTP) ─────────────────────
      // The invoice date comes from the client (for historical entry),
      // but the `created_at` timestamp is always from the server.
      const serverDate  = new Date();
      const invoiceDate = payload.invoice_date
        ? payload.invoice_date
        : serverDate.toISOString().split('T')[0];
      const invoiceTime = serverDate.toISOString().split('T')[1].split('.')[0];
      const timestamp   = `${invoiceDate}T${invoiceTime}Z`;

      // ── 7. Generate UUID + invoice number ─────────────────
      const uuid          = generateUUID();
      const invoiceYear   = new Date(invoiceDate).getFullYear();
      const invoicePrefix = payload.invoice_type === 'SIMPLIFIED' ? 'SINV' : 'INV';
      const invoiceNumber = buildInvoiceNumber(invoicePrefix, invoiceYear, icv);

      // ── 8. Calculate totals ───────────────────────────────
      const { items, subtotal, vatAmount, total } = calcLines(payload.lines);

      if (total <= 0) {
        throw new HttpsError(
          'invalid-argument',
          'ZERO_AMOUNT: المبلغ الإجمالي للفاتورة يجب أن يكون أكبر من صفر'
        );
      }

      // ── 9. Generate ZATCA TLV QR Code ────────────────────
      const qrCode = buildTLV(orgName, orgVat, timestamp, total.toFixed(2), vatAmount.toFixed(2));

      // ── 10. Build Firestore document ──────────────────────
      const invoiceRef = db.collection('invoices').doc(); // auto ID

      const invoiceDoc: Record<string, unknown> = {
        // Identity
        id:                invoiceRef.id,
        invoice_number:    invoiceNumber,
        uuid,
        icv,
        org_id:            payload.org_id,
        created_by_uid:    callerUid,
        created_by_name:   profile.full_name ?? profile.email ?? callerUid,

        // Type
        invoice_type:    payload.invoice_type,   // STANDARD | SIMPLIFIED
        payment_method:  payload.payment_method,

        // Parties
        org_name:        orgName,
        org_vat:         orgVat,
        customer_name:   payload.customer_name?.trim() ?? 'عميل نقدي',
        customer_vat:    payload.customer_vat ?? null,

        // Dates (server time — ZATCA requires NTP)
        invoice_date:    invoiceDate,
        invoice_time:    invoiceTime,
        created_at:      FieldValue.serverTimestamp(),
        updated_at:      FieldValue.serverTimestamp(),

        // Financial
        items,
        subtotal,
        vat_amount:      vatAmount,
        total,
        currency:        'SAR',

        // ZATCA chain
        previous_invoice_hash: previousHash,
        invoice_hash:          null,  // filled by zatca-submit Edge Function after signing
        ecdsa_signature:       null,
        qr_code:               qrCode,
        xml_content:           null,  // filled after signing

        // Status
        status:       'DRAFT',
        zatca_status: 'pending',
        zatca_request_id:  null,
        zatca_submitted_at: null,

        // Optional
        notes:          payload.notes?.trim() ?? null,
        device_id:      payload.device_id ?? null,
      };

      // ── 11. Write to Firestore (Admin SDK bypasses rules) ─
      await invoiceRef.set(invoiceDoc);

      logger.info('Invoice created', {
        invoice_id:     invoiceRef.id,
        invoice_number: invoiceNumber,
        org_id:         payload.org_id,
        icv,
        total,
        uid:            callerUid,
      });

      // ── 12. Return success result to client ───────────────
      return {
        success:        true,
        invoice_id:     invoiceRef.id,
        invoice_number: invoiceNumber,
        uuid,
        icv,
        total,
        vat_amount:     vatAmount,
        qr_code:        qrCode,
        message:        `تم إصدار الفاتورة ${invoiceNumber} بنجاح`,
      };

    } catch (err: unknown) {
      // Re-throw HttpsErrors as-is (they carry the right code for the client)
      if (err instanceof HttpsError) throw err;

      // Log unexpected errors and return a generic message
      logger.error('createInvoice unexpected error', err);
      throw new HttpsError(
        'internal',
        'SERVER_ERROR: خطأ داخلي في الخادم. يرجى المحاولة مرة أخرى.'
      );
    }
  }
);
