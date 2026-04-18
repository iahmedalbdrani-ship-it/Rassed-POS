// ============================================================
// رصيد ERP — Supabase Edge Function: zatca-submit
// ZATCA Phase 2 Invoice Submission (Clearance + Reporting)
// ============================================================
//
// POST /functions/v1/zatca-submit
// Body: {
//   invoice_id : string   — UUID من جدول invoices
//   device_id  : string   — UUID من جدول zatca_devices
// }
//
// Flow:
//   1. Load invoice from DB (must be PENDING and have invoice_hash)
//   2. Load device PCSID + decrypted private key from DB
//   3. Sign invoice XML (ECDSA P-256)
//   4. Determine submission type:
//      - B2B (standard + amount > threshold) → Clearance (sync, must clear before printing)
//      - B2C (simplified)                    → Reporting (async, 24h window)
//   5. Submit to ZATCA API
//   6. Update invoice status + store requestId + cleared XML
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { signInvoice }   from '../../backend/src/modules/zatca/signer.ts';

const ZATCA_ENDPOINTS: Record<string, string> = {
  sandbox:    'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    // ── Auth ────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    // ── Parse input ─────────────────────────────────────────
    const { invoice_id, device_id } = await req.json() as {
      invoice_id: string;
      device_id:  string;
    };

    if (!invoice_id || !device_id) {
      return json({ error: 'invoice_id و device_id مطلوبان' }, 400);
    }

    // ── Load invoice ────────────────────────────────────────
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select(`
        id, uuid, invoice_number, invoice_type, status,
        xml_content, invoice_hash, previous_invoice_hash, icv,
        total_amount, vat_amount, subtotal,
        created_at, org_id
      `)
      .eq('id', invoice_id)
      .single();

    if (invErr || !invoice) {
      return json({ error: 'الفاتورة غير موجودة', details: invErr?.message }, 404);
    }

    // Guard: only submit PENDING invoices
    if (!['DRAFT', 'PENDING'].includes(invoice.status)) {
      return json({
        error:   `لا يمكن إرسال فاتورة بحالة ${invoice.status}`,
        current: invoice.status,
      }, 409);
    }

    if (!invoice.invoice_hash) {
      return json({ error: 'الفاتورة لم يتم ختمها بعد (invoice_hash مفقود)' }, 422);
    }

    // ── Load device ─────────────────────────────────────────
    const { data: device, error: devErr } = await supabase
      .from('zatca_devices')
      .select('pcsid, pcsid_secret, private_key_enc, public_key_pem, zatca_env, status')
      .eq('id', device_id)
      .eq('org_id', invoice.org_id)
      .single();

    if (devErr || !device) {
      return json({ error: 'الجهاز غير موجود أو غير مرتبط بهذه المنشأة' }, 404);
    }

    if (device.status !== 'production_ready') {
      return json({ error: `الجهاز غير جاهز للإنتاج. الحالة: ${device.status}` }, 422);
    }

    // ── Decrypt private key ──────────────────────────────────
    const encKey = Deno.env.get('ZATCA_KEY_ENCRYPTION_SECRET') ?? 'REPLACE_WITH_VAULT_KEY';
    const privateKeyPem = await decryptPrivateKey(device.private_key_enc, encKey);

    // ── Sign invoice (if not already signed) ────────────────
    log('🖊️  توقيع الفاتورة:', invoice.invoice_number);

    const signed = await signInvoice({
      xmlContent:          invoice.xml_content,
      privateKeyPem,
      certificatePem:      base64ToPem(device.pcsid, 'CERTIFICATE'),
      previousInvoiceHash: invoice.previous_invoice_hash,
      icv:                 invoice.icv ?? 1,
    });

    // ── Determine submission type ────────────────────────────
    const isSimplified = invoice.invoice_type === 'SIMPLIFIED';
    const env          = device.zatca_env as 'sandbox' | 'production';
    const baseUrl      = ZATCA_ENDPOINTS[env];

    const endpoint = isSimplified
      ? `${baseUrl}/invoices/reporting/single`
      : `${baseUrl}/invoices/clearance/single`;

    const authToken = btoa(`${device.pcsid}:${device.pcsid_secret}`);

    log(`📡 إرسال ${isSimplified ? 'تقرير' : 'اعتماد'} الفاتورة لهيئة الزكاة...`);

    // ── Submit to ZATCA ──────────────────────────────────────
    const zatcaResp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'Authorization':   `Basic ${authToken}`,
        'Accept-Version':  'V2',
        'Accept-Language': 'ar',
        'Clearance-Status': isSimplified ? '0' : '1',
      },
      body: JSON.stringify({
        invoiceHash: signed.invoiceHash,
        uuid:        invoice.uuid,
        invoice:     signed.signedXmlBase64,
      }),
    });

    const zatcaData = await zatcaResp.json() as {
      requestID?:         string;
      reportingStatus?:   string;
      clearanceStatus?:   string;
      validationResults?: {
        status:          string;
        errorMessages?:  Array<{ code: string; message: string }>;
        warningMessages?: Array<{ code: string; message: string }>;
      };
      clearedInvoice?:    string;
    };

    const reqId   = zatcaData.requestID ?? null;
    const valStatus = zatcaData.validationResults?.status ?? null;
    const errors  = zatcaData.validationResults?.errorMessages ?? [];

    // Determine new invoice status
    let newStatus: string;
    if (isSimplified) {
      newStatus = zatcaData.reportingStatus === 'REPORTED' ? 'REPORTED' : 'REJECTED';
    } else {
      newStatus = zatcaData.clearanceStatus === 'CLEARED' ? 'CLEARED' : 'REJECTED';
    }

    log(`📋 نتيجة الهيئة: ${newStatus}`, valStatus ? `(${valStatus})` : '');

    // ── Update invoice in DB ─────────────────────────────────
    const updatePayload: Record<string, unknown> = {
      status:             newStatus,
      ecdsa_signature:    signed.ecdsaSignature,
      xml_content:        signed.signedXml,       // replace with signed version
      device_id,
      zatca_request_id:   reqId,
      zatca_submitted_at: new Date().toISOString(),
    };

    if (zatcaData.clearedInvoice) {
      updatePayload.zatca_cleared_xml = zatcaData.clearedInvoice;
    }

    await supabase
      .from('invoices')
      .update(updatePayload)
      .eq('id', invoice_id);

    // ── Return result ────────────────────────────────────────
    if (newStatus === 'REJECTED') {
      return json({
        success:    false,
        status:     'REJECTED',
        request_id: reqId,
        errors,
        warnings:   zatcaData.validationResults?.warningMessages ?? [],
        message:    'رفضت الهيئة الفاتورة. راجع قائمة الأخطاء.',
      }, 422);
    }

    return json({
      success:      true,
      status:       newStatus,
      request_id:   reqId,
      invoice_hash: signed.invoiceHash,
      warnings:     zatcaData.validationResults?.warningMessages ?? [],
      message:      isSimplified
        ? 'تم إبلاغ الهيئة بالفاتورة المبسطة بنجاح (Reporting ✅)'
        : 'تم اعتماد الفاتورة من الهيئة (Clearance ✅) — يمكن الآن طباعتها',
    });

  } catch (err: unknown) {
    const e = err as Error;
    console.error('❌ zatca-submit error:', e.message);
    return json({ success: false, error: e.message }, 500);
  }
});

// ─── Helpers ─────────────────────────────────────────────────

/** Decrypt AES-256-GCM encrypted private key */
async function decryptPrivateKey(encrypted: string, secret: string): Promise<string> {
  const [ivB64, ctB64] = encrypted.split(':');
  const iv  = base64ToUint8(ivB64);
  const ct  = base64ToUint8(ctB64);

  const keyMat = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret.padEnd(32, '0').slice(0, 32)),
    'AES-GCM',
    false,
    ['decrypt'],
  );

  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, keyMat, ct);
  return new TextDecoder().decode(plain);
}

function base64ToPem(b64: string, label: string): string {
  const lines = b64.match(/.{1,64}/g)!.join('\n');
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function log(...args: unknown[]) {
  console.log('[zatca-submit]', ...args);
}
