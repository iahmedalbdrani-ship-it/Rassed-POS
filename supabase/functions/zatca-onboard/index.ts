// ============================================================
// رصيد ERP — Supabase Edge Function: zatca-onboard
// ZATCA Phase 2 Device Enrollment (CCSID → Compliance → PCSID)
// ============================================================
//
// POST /functions/v1/zatca-onboard
// Body: {
//   org_id       : string   — UUID من جدول organizations
//   device_name  : string   — اسم الجهاز (e.g. "كاشير فرع الرياض 1")
//   serial_number: string   — "1-<OrgName>-1"
//   otp          : string   — كود التحقق من منصة فاتورة (6 أرقام)
//   vat_number   : string   — الرقم الضريبي (15 رقم)
//   cr_number    : string   — السجل التجاري
//   org_name     : string   — اسم المنشأة
//   org_unit     : string   — اسم الفرع / الوحدة
//   street       : string   — العنوان
//   category     : string   — النشاط التجاري
//   zatca_env    : "sandbox" | "production"
// }
//
// Flow:
//   1. Generate ECDSA P-256 key pair
//   2. Build ZATCA-compliant CSR
//   3. POST /compliance → get CCSID + secret
//   4. Run 3 compliance-check invoices (required by ZATCA)
//   5. POST /production/csids → get PCSID
//   6. Save device record in zatca_devices table
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateZatcaKeyPairAndCSR } from '../../backend/src/modules/zatca/csr.ts';

const ZATCA_ENDPOINTS: Record<string, string> = {
  sandbox:    'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

// ZATCA required: exactly these 3 compliance invoice XMLs (simplified examples)
const COMPLIANCE_INVOICE_TYPES = [
  { type: 'standard',   label: 'Standard B2B Invoice'    },
  { type: 'simplified', label: 'Simplified B2C Invoice'  },
  { type: 'credit',     label: 'Credit Note'             },
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    // ── Auth check ──────────────────────────────────────────
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
    const body = await req.json() as {
      org_id: string; device_name: string; serial_number: string;
      otp: string; vat_number: string; cr_number: string;
      org_name: string; org_unit: string; street: string;
      category: string; zatca_env?: string;
    };

    const env = (body.zatca_env ?? 'sandbox') as 'sandbox' | 'production';
    const baseUrl = ZATCA_ENDPOINTS[env];

    log('🚀 بدء تسجيل الجهاز:', body.device_name);

    // ── Step 1: Generate key pair + CSR ─────────────────────
    log('⚙️  توليد زوج المفاتيح ECDSA P-256 وملف CSR...');
    const keyPair = await generateZatcaKeyPairAndCSR({
      vatNumber:          body.vat_number,
      crNumber:           body.cr_number,
      organizationName:   body.org_name,
      organizationUnit:   body.org_unit,
      streetAddress:      body.street,
      businessCategory:   body.category,
      deviceSerialNumber: body.serial_number,
      country:            'SA',
      invoiceType:        '1100',
    });

    // CSR must be sent as Base64 (without PEM headers)
    const csrBase64 = pemToBase64(keyPair.csrPem);
    log('✅ تم توليد CSR بنجاح');

    // ── Step 2: Get Compliance CSID (CCSID) ─────────────────
    log('📡 إرسال CSR للهيئة للحصول على شهادة الامتثال (CCSID)...');
    const ccsidResp = await zatcaPost(`${baseUrl}/compliance`, { csr: csrBase64 }, {
      'OTP': body.otp,
      'Accept-Version': 'V2',
    });

    if (!ccsidResp.binarySecurityToken) {
      throw new ZatcaOnboardError('CCSID_FAILED', 'فشل في الحصول على CCSID', ccsidResp);
    }

    const ccsid       = ccsidResp.binarySecurityToken as string;
    const ccsidSecret = ccsidResp.secret              as string;
    const ccsidReqId  = ccsidResp.requestID           as string;
    log('✅ تم استلام CCSID:', ccsidReqId);

    // ── Step 3: Compliance Invoice Checks ───────────────────
    // ZATCA requires testing 3 invoice types before issuing PCSID
    log('🧪 تشغيل اختبارات الفواتير التجريبية...');
    for (const invoiceType of COMPLIANCE_INVOICE_TYPES) {
      const testInvoice = buildMinimalComplianceInvoice(body, invoiceType.type);
      const testXmlB64  = btoa(testInvoice);
      const testHash    = await sha256Base64(new TextEncoder().encode(testInvoice));

      const endpoint = invoiceType.type === 'simplified'
        ? `${baseUrl}/invoices/reporting/single`
        : `${baseUrl}/invoices/clearance/single`;

      const testResp = await zatcaPost(
        endpoint,
        { invoiceHash: testHash, uuid: crypto.randomUUID(), invoice: testXmlB64 },
        {
          'Accept-Version':  'V2',
          'Accept-Language': 'ar',
          'Authorization':   `Basic ${btoa(`${ccsid}:${ccsidSecret}`)}`,
        },
        false, // don't throw on non-200 — compliance may return warnings
      );

      const status = testResp.validationResults?.status ?? testResp.reportingStatus ?? 'UNKNOWN';
      log(`  ${invoiceType.label}: ${status}`);

      if (status === 'ERROR') {
        const errors = testResp.validationResults?.errorMessages ?? [];
        throw new ZatcaOnboardError(
          'COMPLIANCE_CHECK_FAILED',
          `فشل اختبار ${invoiceType.label}`,
          errors,
        );
      }
    }
    log('✅ جميع اختبارات الامتثال نجحت');

    // ── Step 4: Get Production CSID (PCSID) ─────────────────
    log('🏭 طلب شهادة الإنتاج (PCSID)...');
    const pcsidResp = await zatcaPost(
      `${baseUrl}/production/csids`,
      { compliance_request_id: ccsidReqId },
      {
        'Accept-Version': 'V2',
        'Authorization':  `Basic ${btoa(`${ccsid}:${ccsidSecret}`)}`,
      },
    );

    if (!pcsidResp.binarySecurityToken) {
      throw new ZatcaOnboardError('PCSID_FAILED', 'فشل في الحصول على PCSID', pcsidResp);
    }

    const pcsid       = pcsidResp.binarySecurityToken as string;
    const pcsidSecret = pcsidResp.secret              as string;
    const pcsidReqId  = pcsidResp.requestID           as string;
    log('✅ تم استلام PCSID:', pcsidReqId);

    // ── Step 5: Persist to DB ────────────────────────────────
    log('💾 حفظ بيانات الجهاز في قاعدة البيانات...');

    // Encrypt private key before storage (AES-256-GCM with Supabase Vault or env key)
    const encKey    = Deno.env.get('ZATCA_KEY_ENCRYPTION_SECRET') ?? 'REPLACE_WITH_VAULT_KEY';
    const privateKeyEnc = await encryptPrivateKey(keyPair.privateKeyPem, encKey);

    const { data: device, error: dbErr } = await supabase
      .from('zatca_devices')
      .insert({
        org_id:            body.org_id,
        device_name:       body.device_name,
        serial_number:     body.serial_number,
        private_key_enc:   privateKeyEnc,
        public_key_pem:    keyPair.publicKeyPem,
        csr_pem:           keyPair.csrPem,
        ccsid,
        ccsid_secret:      ccsidSecret,
        ccsid_request_id:  ccsidReqId,
        ccsid_issued_at:   new Date().toISOString(),
        pcsid,
        pcsid_secret:      pcsidSecret,
        pcsid_request_id:  pcsidReqId,
        pcsid_issued_at:   new Date().toISOString(),
        status:            'production_ready',
        zatca_env:         env,
        enrolled_by:       user.id,
      })
      .select('id, device_name, status')
      .single();

    if (dbErr) throw new Error(`DB Error: ${dbErr.message}`);

    // Also initialise ICV counter for this org
    await supabase.rpc('zatca_next_icv', { p_org_id: body.org_id });

    log('🎉 تم تسجيل الجهاز بنجاح! ID:', device.id);

    return json({
      success:     true,
      device_id:   device.id,
      device_name: device.device_name,
      status:      device.status,
      message:     'تم تسجيل الجهاز وإصدار شهادة الإنتاج (PCSID) بنجاح',
    });

  } catch (err: unknown) {
    const e = err as Error & { code?: string; details?: unknown };
    console.error('❌ zatca-onboard error:', e.message, e.details ?? '');
    return json({
      success: false,
      error:   e.message,
      code:    e.code ?? 'UNKNOWN',
      details: (e as ZatcaOnboardError).details ?? null,
    }, 500);
  }
});

// ─── Helpers ─────────────────────────────────────────────────

async function zatcaPost(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  throwOnError = true,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    JSON.stringify(body),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok && throwOnError) {
    throw new ZatcaOnboardError(
      'API_ERROR',
      `ZATCA API ${res.status}: ${res.statusText}`,
      data,
    );
  }
  return data;
}

function pemToBase64(pem: string): string {
  return pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
}

async function sha256Base64(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

/** Minimal UBL 2.1 XML for compliance testing — real data not required */
function buildMinimalComplianceInvoice(
  meta: { vat_number: string; org_name: string },
  type: string,
): string {
  const isCredit     = type === 'credit';
  const isSimplified = type === 'simplified';
  const typeCode     = isCredit ? '381' : isSimplified ? '388' : '388';
  const profileId    = isSimplified ? 'reporting:1.0' : 'clearance:1.0';
  const subType      = isCredit ? '0200000' : isSimplified ? '0200000' : '0100000';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>${profileId}</cbc:ProfileID>
  <cbc:ID>TEST-${Date.now()}</cbc:ID>
  <cbc:UUID>${crypto.randomUUID()}</cbc:UUID>
  <cbc:IssueDate>${new Date().toISOString().split('T')[0]}</cbc:IssueDate>
  <cbc:IssueTime>${new Date().toISOString().split('T')[1].split('.')[0]}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${subType}">${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${meta.org_name}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${meta.vat_number}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party><cac:PartyName><cbc:Name>عميل تجريبي</cbc:Name></cac:PartyName></cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">15.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">100.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">15.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID><cbc:Percent>15.00</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">100.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">100.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">115.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">115.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">100.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>منتج تجريبي</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="SAR">100.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

/**
 * AES-256-GCM encrypt the private key PEM.
 * In production, replace with Supabase Vault / KMS.
 */
async function encryptPrivateKey(pem: string, secret: string): Promise<string> {
  const keyMat  = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret.padEnd(32, '0').slice(0, 32)),
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const iv      = crypto.getRandomValues(new Uint8Array(12));
  const enc     = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    keyMat,
    new TextEncoder().encode(pem),
  );
  // Format: base64(iv) + ':' + base64(ciphertext)
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  return `${b64(iv)}:${b64(new Uint8Array(enc))}`;
}

class ZatcaOnboardError extends Error {
  code: string;
  details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name    = 'ZatcaOnboardError';
    this.code    = code;
    this.details = details;
  }
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
  console.log('[zatca-onboard]', ...args);
}
