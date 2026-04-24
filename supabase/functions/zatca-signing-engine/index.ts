// ============================================================
// Control Panel (رصيد) — Supabase Edge Function
// zatca-signing-engine  |  محرك التوقيع الرقمي الشامل
//
// POST /functions/v1/zatca-signing-engine
// Authorization: Bearer <user_jwt>
// Body: { invoice_id: string }
//
// Flow:
//   1. جلب XML الخام من Storage + بيانات الفاتورة + الإعدادات
//   2. جلب بصمة الفاتورة السابقة (Invoice Chaining)
//   3. SHA-256 Hash + ECDSA Signing (Web Crypto API)
//   4. بناء ZATCA QR (TLV Base64) بدون Buffer
//   5. حقن التوقيع داخل XML (SignatureInformation)
//   6. إرسال للهيئة (ZATCA Reporting API) بـ Basic Auth
//   7. تحديث جدول invoices + حفظ XML الموقع في Storage
//
// ⚠️  Deno Environment — لا يوجد Node Buffer.
//     يستخدم TextEncoder + Uint8Array + Web Crypto API.
// ============================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── ZATCA API Endpoints ──────────────────────────────────────

const ZATCA_BASE: Record<string, string> = {
  sandbox:    'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

// ─── CORS ────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Response helpers ─────────────────────────────────────────

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

const fail = (msg: string, status = 400, details?: unknown) => {
  log(`❌ فشل: ${msg}`, details ?? '');
  return json({ success: false, error: msg, details }, status);
};

function log(...args: unknown[]) {
  console.log('[zatca-signing-engine]', new Date().toISOString(), ...args);
}

// ─── Types ───────────────────────────────────────────────────

interface InvoiceRow {
  id:                     string;
  uuid:                   string;
  invoice_number:         string;
  invoice_type:           'STANDARD' | 'SIMPLIFIED' | 'CREDIT_NOTE';
  xml_storage_path:       string | null;
  xml_content:            string | null;
  previous_invoice_hash:  string | null;
  invoice_hash:           string | null;
  icv:                    number;
  total_amount:           number;
  vat_amount:             number;
  subtotal:               number;
  status:                 string;
  org_id:                 string;
  created_at:             string;
}

interface SettingsRow {
  name_ar:          string;
  name_en:          string | null;
  vat_number:       string;
  cr_number:        string | null;
  x509_certificate: string | null;     // PEM or Base64 DER
  private_key_pem:  string | null;     // PKCS#8 PEM (encrypted via AES-GCM)
  zatca_env:        'sandbox' | 'production';
  pcsid:            string | null;     // Binary Security Token
  pcsid_secret:     string | null;     // ZATCA Secret
}

// ═════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ═════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Auth ────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return fail('Authorization مطلوب', 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) return fail('رمز المصادقة غير صالح', 401);

    // ── 2. Parse input ────────────────────────────────────────
    const body = await req.json() as { invoice_id?: string };
    const { invoice_id } = body;

    if (!invoice_id?.trim()) {
      return fail('invoice_id مطلوب في body الطلب', 400);
    }

    log('🚀 بدء المعالجة للفاتورة:', invoice_id);

    // ── 3. Load invoice ───────────────────────────────────────
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select(`
        id, uuid, invoice_number, invoice_type, status,
        xml_storage_path, xml_content, previous_invoice_hash,
        invoice_hash, icv, total_amount, vat_amount, subtotal,
        created_at, org_id
      `)
      .eq('id', invoice_id)
      .single<InvoiceRow>();

    if (invErr || !invoice) {
      return fail('الفاتورة غير موجودة', 404, invErr?.message);
    }

    if (!['DRAFT', 'PENDING', 'GENERATED'].includes(invoice.status)) {
      return fail(
        `لا يمكن توقيع فاتورة بحالة "${invoice.status}"`,
        409,
        { current_status: invoice.status },
      );
    }

    // ── 4. Load settings (certificate + key) ──────────────────
    const { data: settings, error: setErr } = await supabase
      .from('settings')
      .select(`
        name_ar, name_en, vat_number, cr_number,
        x509_certificate, private_key_pem, zatca_env,
        pcsid, pcsid_secret
      `)
      .eq('org_id', invoice.org_id)
      .single<SettingsRow>();

    if (setErr || !settings) {
      return fail('إعدادات المنشأة غير موجودة أو غير مكتملة', 404, setErr?.message);
    }

    if (!settings.x509_certificate || !settings.private_key_pem) {
      return fail('الشهادة الرقمية أو المفتاح الخاص غير موجودان في الإعدادات', 422);
    }

    if (!settings.pcsid || !settings.pcsid_secret) {
      return fail('بيانات PCSID غير مكتملة — يرجى إكمال تسجيل الجهاز', 422);
    }

    // ── 5. Load raw XML ───────────────────────────────────────
    let rawXml = invoice.xml_content ?? '';

    if (!rawXml && invoice.xml_storage_path) {
      log('📂 تحميل XML من Storage:', invoice.xml_storage_path);
      const { data: fileData, error: storErr } = await supabase
        .storage
        .from('invoices_xml')
        .download(invoice.xml_storage_path);

      if (storErr || !fileData) {
        return fail('فشل تحميل ملف XML من Storage', 500, storErr?.message);
      }
      rawXml = await fileData.text();
    }

    if (!rawXml?.trim()) {
      return fail('محتوى XML الفاتورة فارغ أو غير موجود', 422);
    }

    log('📄 XML محمل، الحجم:', rawXml.length, 'حرف');

    // ── 6. Decrypt private key ────────────────────────────────
    const encSecret = Deno.env.get('ZATCA_KEY_ENCRYPTION_SECRET') ?? '';
    if (!encSecret) {
      return fail('متغير البيئة ZATCA_KEY_ENCRYPTION_SECRET غير مضبوط', 500);
    }

    const privateKeyPem = await decryptAesGcm(settings.private_key_pem, encSecret);
    log('🔓 المفتاح الخاص تم فك تشفيره');

    // ── 7. Previous invoice hash (for chaining) ───────────────
    let previousHash = invoice.previous_invoice_hash;

    if (!previousHash) {
      // جلب hash آخر فاتورة مُرسلة من نفس المنشأة
      const { data: prev } = await supabase
        .from('invoices')
        .select('invoice_hash')
        .eq('org_id', invoice.org_id)
        .in('status', ['REPORTED', 'CLEARED'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      previousHash = prev?.invoice_hash ?? null;
    }

    if (!previousHash) {
      // أول فاتورة — نستخدم القيمة الافتراضية لهيئة الزكاة
      previousHash = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI4NTkyOTA1ZjU4ZWQ2NA==';
      log('ℹ️  استخدام hash الأول الافتراضي (أول فاتورة في السلسلة)');
    }

    log('🔗 hash الفاتورة السابقة:', previousHash.substring(0, 20) + '...');

    // ── 8. Canonicalize & Hash XML ────────────────────────────
    log('🔐 حساب SHA-256 للـ XML...');
    const canonicalXml  = canonicalizeXml(rawXml);
    const xmlBytes      = new TextEncoder().encode(canonicalXml);
    const hashBuffer    = await crypto.subtle.digest('SHA-256', xmlBytes);
    const invoiceHash   = uint8ToBase64(new Uint8Array(hashBuffer));

    log('✅ SHA-256 Hash:', invoiceHash.substring(0, 20) + '...');

    // ── 9. Sign with ECDSA P-256 ──────────────────────────────
    log('✍️  توقيع الـ Hash بـ ECDSA P-256...');
    const ecdsaSignature = await signEcdsa(hashBuffer, privateKeyPem);
    log('✅ التوقيع الرقمي:', ecdsaSignature.substring(0, 20) + '...');

    // ── 10. Build ZATCA QR (TLV Base64) ──────────────────────
    log('📱 بناء رمز QR الضريبي (TLV)...');
    const zatcaQr = buildZatcaQr({
      sellerName:  settings.name_ar,
      vatNumber:   settings.vat_number,
      timestamp:   invoice.created_at,
      totalAmount: invoice.total_amount,
      vatAmount:   invoice.vat_amount,
      hash:        invoiceHash,
      ecdsaSignature,
      certificate: settings.x509_certificate,
    });
    log('✅ QR TLV:', zatcaQr.substring(0, 20) + '...');

    // ── 11. Inject signature into XML ─────────────────────────
    log('💉 حقن التوقيع في XML...');
    const certBase64    = pemToBase64(settings.x509_certificate);
    const signedXml     = injectSignatureIntoXml(
      rawXml,
      invoiceHash,
      previousHash,
      ecdsaSignature,
      certBase64,
      zatcaQr,
    );

    const signedXmlBase64 = uint8ToBase64(new TextEncoder().encode(signedXml));
    log('✅ XML موقع، الحجم:', signedXml.length, 'حرف');

    // ── 12. Submit to ZATCA ───────────────────────────────────
    const env       = settings.zatca_env ?? 'sandbox';
    const baseUrl   = ZATCA_BASE[env];
    const isSimplified = invoice.invoice_type === 'SIMPLIFIED';
    const endpoint  = isSimplified
      ? `${baseUrl}/invoices/reporting/single`
      : `${baseUrl}/invoices/clearance/single`;

    // Basic Auth = Base64(PCSID:Secret)
    const authToken = uint8ToBase64(
      new TextEncoder().encode(`${settings.pcsid}:${settings.pcsid_secret}`),
    );

    log(`📡 إرسال إلى ZATCA [${env}]:`, endpoint);

    const zatcaResp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'Authorization':    `Basic ${authToken}`,
        'Accept-Version':   'V2',
        'Accept-Language':  'ar',
        'Clearance-Status': isSimplified ? '0' : '1',
      },
      body: JSON.stringify({
        invoiceHash:  invoiceHash,
        uuid:         invoice.uuid,
        invoice:      signedXmlBase64,
      }),
    });

    const zatcaData = await zatcaResp.json() as {
      requestID?:         string;
      reportingStatus?:   string;
      clearanceStatus?:   string;
      clearedInvoice?:    string;
      validationResults?: {
        status:           string;
        errorMessages?:   Array<{ code: string; message: string; category?: string; }>;
        warningMessages?: Array<{ code: string; message: string; }>;
      };
    };

    const reqId      = zatcaData.requestID ?? null;
    const errors     = zatcaData.validationResults?.errorMessages ?? [];
    const warnings   = zatcaData.validationResults?.warningMessages ?? [];

    let newStatus: string;
    if (isSimplified) {
      newStatus = zatcaData.reportingStatus === 'REPORTED' ? 'REPORTED' : 'REJECTED';
    } else {
      newStatus = zatcaData.clearanceStatus === 'CLEARED' ? 'CLEARED' : 'REJECTED';
    }

    log(`📋 رد الهيئة: ${newStatus} | الطلب: ${reqId ?? 'N/A'}`);

    // ── 13. Save signed XML to Storage ────────────────────────
    const signedPath = `${invoice.org_id}/${invoice.invoice_number}_signed.xml`;

    const { error: uploadErr } = await supabase
      .storage
      .from('invoices_xml')
      .upload(signedPath, signedXml, {
        contentType: 'application/xml',
        upsert:      true,
      });

    if (uploadErr) {
      log('⚠️  فشل حفظ XML الموقع في Storage:', uploadErr.message);
      // لا نوقف العملية — نكمل تحديث DB
    }

    // ── 14. Update invoice in DB ──────────────────────────────
    const updatePayload: Record<string, unknown> = {
      status:                 newStatus,
      invoice_hash:           invoiceHash,
      previous_invoice_hash:  previousHash,
      ecdsa_signature:        ecdsaSignature,
      zatca_qr:               zatcaQr,
      xml_content:            signedXml,
      xml_storage_path:       signedPath,
      zatca_request_id:       reqId,
      zatca_submitted_at:     new Date().toISOString(),
      zatca_env:              env,
    };

    if (zatcaData.clearedInvoice) {
      updatePayload.zatca_cleared_xml = zatcaData.clearedInvoice;
    }

    const { error: updateErr } = await supabase
      .from('invoices')
      .update(updatePayload)
      .eq('id', invoice_id);

    if (updateErr) {
      log('⚠️  خطأ في تحديث قاعدة البيانات:', updateErr.message);
    }

    // ── 15. Return result ─────────────────────────────────────
    if (newStatus === 'REJECTED') {
      return json({
        success:      false,
        status:       'REJECTED',
        request_id:   reqId,
        invoice_hash: invoiceHash,
        zatca_qr:     zatcaQr,
        errors,
        warnings,
        message:      'رفضت الهيئة الفاتورة — راجع قائمة الأخطاء.',
      }, 422);
    }

    return json({
      success:       true,
      status:        newStatus,
      request_id:    reqId,
      invoice_hash:  invoiceHash,
      zatca_qr:      zatcaQr,
      signed_path:   signedPath,
      warnings,
      message: isSimplified
        ? `✅ تم الإبلاغ عن الفاتورة بنجاح (Reporting) — الطلب: ${reqId}`
        : `✅ تم اعتماد الفاتورة من الهيئة (Clearance) — الطلب: ${reqId}`,
    });

  } catch (err: unknown) {
    const e = err as Error;
    console.error('[zatca-signing-engine] 💥 خطأ غير متوقع:', e.message, e.stack);
    return fail(`خطأ داخلي: ${e.message}`, 500);
  }
});

// ═════════════════════════════════════════════════════════════
//  CRYPTO HELPERS — Deno Web Crypto API (no Node Buffer)
// ═════════════════════════════════════════════════════════════

/**
 * Uint8Array → Base64 string
 * يستخدم TextDecoder بدل Buffer.from().toString('base64')
 */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 string → Uint8Array
 */
function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * فك تشفير المفتاح الخاص المشفر بـ AES-256-GCM
 * الصيغة: base64(iv):base64(ciphertext)
 */
async function decryptAesGcm(encrypted: string, secret: string): Promise<string> {
  const parts = encrypted.split(':');
  if (parts.length < 2) {
    // إذا لم يكن مشفراً، أعده كما هو (PEM plain)
    return encrypted;
  }

  const [ivB64, ctB64] = parts;
  const iv = base64ToUint8(ivB64);
  const ct = base64ToUint8(ctB64);

  // استخدام أول 32 بايت من السر كمفتاح
  const keyBytes = new TextEncoder().encode(secret.padEnd(32, '0').slice(0, 32));

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plain);
}

/**
 * ECDSA P-256 Signing — يعيد Base64 للتوقيع
 * يدعم مفاتيح PKCS#8 PEM
 */
async function signEcdsa(hashBuffer: ArrayBuffer, privateKeyPem: string): Promise<string> {
  // نزع رأس وذيل PEM + فراغات
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemBody   = privateKeyPem
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '');

  const keyDer = base64ToUint8(pemBody);

  // استيراد المفتاح بصيغة PKCS#8 raw
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyDer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  // ECDSA بدون hash مسبق (نوقع الـ hash مباشرة باستخدام SHA-256)
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    cryptoKey,
    hashBuffer,
  );

  return uint8ToBase64(new Uint8Array(signature));
}

// ═════════════════════════════════════════════════════════════
//  ZATCA QR — TLV Base64 Encoding (بدون Buffer)
// ═════════════════════════════════════════════════════════════

interface ZatcaQrFields {
  sellerName:    string;
  vatNumber:     string;
  timestamp:     string;     // ISO string
  totalAmount:   number;
  vatAmount:     number;
  hash:          string;     // Base64 SHA-256
  ecdsaSignature: string;    // Base64
  certificate:   string;     // PEM or Base64
}

/**
 * بناء ZATCA QR بتنسيق TLV المشفر بـ Base64
 * Tag: 1-byte, Length: 1-byte, Value: UTF-8 bytes
 * الحقول: 1=اسم البائع، 2=رقم ضريبي، 3=وقت، 4=إجمالي، 5=ضريبة
 *         6=Hash، 7=توقيع ECDSA، 8=شهادة X509
 */
function buildZatcaQr(fields: ZatcaQrFields): string {
  const enc = new TextEncoder();

  function tlvField(tag: number, value: string): Uint8Array {
    const valueBytes = enc.encode(value);
    const len = valueBytes.length;

    // TLV: [tag(1)] + [length(1)] + [value]
    const out = new Uint8Array(2 + len);
    out[0] = tag;
    out[1] = len;
    out.set(valueBytes, 2);
    return out;
  }

  const timestamp = new Date(fields.timestamp).toISOString();
  const total     = fields.totalAmount.toFixed(2);
  const vat       = fields.vatAmount.toFixed(2);

  // Extract certificate signature bytes (first 64 bytes of DER or PEM body)
  const certPublicKey = pemToBase64(fields.certificate).substring(0, 64);

  const tlvParts: Uint8Array[] = [
    tlvField(1, fields.sellerName),
    tlvField(2, fields.vatNumber),
    tlvField(3, timestamp),
    tlvField(4, total),
    tlvField(5, vat),
    tlvField(6, fields.hash),
    tlvField(7, fields.ecdsaSignature),
    tlvField(8, certPublicKey),
  ];

  // دمج كل الأجزاء في مصفوفة واحدة
  const totalLen = tlvParts.reduce((sum, p) => sum + p.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of tlvParts) {
    combined.set(part, offset);
    offset += part.length;
  }

  return uint8ToBase64(combined);
}

// ═════════════════════════════════════════════════════════════
//  XML HELPERS
// ═════════════════════════════════════════════════════════════

/**
 * Canonical XML — تطبيع الفراغات وإزالة الـ XML declaration
 * للحصول على hash ثابت قابل للتحقق
 */
function canonicalizeXml(xml: string): string {
  return xml
    .replace(/<\?xml[^?]*\?>\s*/g, '')          // إزالة XML declaration
    .replace(/\r\n/g, '\n')                      // توحيد نهايات الأسطر
    .replace(/\r/g, '\n')
    .replace(/<SignatureValue>[^<]*<\/SignatureValue>/g,
             '<SignatureValue></SignatureValue>')  // إفراغ أي توقيع سابق
    .replace(/<X509Certificate>[^<]*<\/X509Certificate>/g,
             '<X509Certificate></X509Certificate>')
    .trim();
}

/**
 * حقن قيم التوقيع داخل وسوم XML
 * يدعم البنية المعيارية لـ ZATCA UBL 2.1
 */
function injectSignatureIntoXml(
  xml:           string,
  invoiceHash:   string,
  previousHash:  string,
  signature:     string,
  certBase64:    string,
  zatcaQr:       string,
): string {
  let result = xml;

  // ── حقن Hash الفاتورة الحالية ────────────────────────────
  result = result.replace(
    /<cbc:PIH>.*?<\/cbc:PIH>/s,
    `<cbc:PIH>${invoiceHash}</cbc:PIH>`,
  );

  // إذا لم يوجد وسم PIH أضفه
  if (!result.includes('<cbc:PIH>')) {
    result = result.replace(
      '</cbc:InvoiceTypeCode>',
      `</cbc:InvoiceTypeCode>\n    <cbc:PIH>${invoiceHash}</cbc:PIH>`,
    );
  }

  // ── حقن Hash الفاتورة السابقة ────────────────────────────
  result = result.replace(
    /<cbc:PDI>.*?<\/cbc:PDI>/s,
    `<cbc:PDI>${previousHash}</cbc:PDI>`,
  );

  // ── حقن التوقيع الرقمي ───────────────────────────────────
  result = result.replace(
    /<ds:SignatureValue[^>]*>.*?<\/ds:SignatureValue>/s,
    `<ds:SignatureValue>${signature}</ds:SignatureValue>`,
  );

  // Fallback — إذا لم يوجد وسم SignatureValue
  if (!result.includes('<ds:SignatureValue>')) {
    result = injectSignatureBlock(result, invoiceHash, signature, certBase64);
  }

  // ── حقن شهادة X.509 ──────────────────────────────────────
  result = result.replace(
    /<ds:X509Certificate>.*?<\/ds:X509Certificate>/s,
    `<ds:X509Certificate>${certBase64}</ds:X509Certificate>`,
  );

  // ── حقن QR في الـ UBL extension ──────────────────────────
  result = result.replace(
    /<cbc:EmbeddedDocumentBinaryObject[^>]*>.*?<\/cbc:EmbeddedDocumentBinaryObject>/s,
    `<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${zatcaQr}</cbc:EmbeddedDocumentBinaryObject>`,
  );

  // Fallback — إضافة QR extension إذا لم يوجد
  if (!result.includes('EmbeddedDocumentBinaryObject')) {
    result = result.replace(
      '</ext:UBLExtensions>',
      `  <ext:UBLExtension>
      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:ext:ZATCA-QR</ext:ExtensionURI>
      <ext:ExtensionContent>
        <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${zatcaQr}</cbc:EmbeddedDocumentBinaryObject>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>`,
    );
  }

  return result;
}

/**
 * حقن كتلة Signature كاملة داخل XML إذا لم تكن موجودة
 */
function injectSignatureBlock(
  xml:        string,
  hash:       string,
  signature:  string,
  certBase64: string,
): string {
  const sigBlock = `
  <ext:UBLExtension>
    <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:ext:ZATCA-Digital-Signature</ext:ExtensionURI>
    <ext:ExtensionContent>
      <sig:UBLDocumentSignatures
        xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2"
        xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2"
        xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">
        <sac:SignatureInformation>
          <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
          <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
          <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">
            <ds:SignedInfo>
              <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
              <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>
              <ds:Reference Id="invoiceSignedData" URI="">
                <ds:Transforms>
                  <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                    <ds:XPath xmlns:n1="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
                      not(//ancestor-or-self::ext:UBLExtensions)
                    </ds:XPath>
                  </ds:Transform>
                  <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                </ds:Transforms>
                <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                <ds:DigestValue>${hash}</ds:DigestValue>
              </ds:Reference>
            </ds:SignedInfo>
            <ds:SignatureValue>${signature}</ds:SignatureValue>
            <ds:KeyInfo>
              <ds:X509Data>
                <ds:X509Certificate>${certBase64}</ds:X509Certificate>
              </ds:X509Data>
            </ds:KeyInfo>
          </ds:Signature>
        </sac:SignatureInformation>
      </sig:UBLDocumentSignatures>
    </ext:ExtensionContent>
  </ext:UBLExtension>`;

  // أضف قبل الوسم الأول </ext:UBLExtensions>
  return xml.replace('</ext:UBLExtensions>', sigBlock + '\n</ext:UBLExtensions>');
}

/**
 * استخراج جسم Base64 من PEM مع نزع الترويسة
 */
function pemToBase64(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s/g, '');
}
