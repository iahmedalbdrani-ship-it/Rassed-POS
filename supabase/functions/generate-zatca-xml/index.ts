// ============================================================
// Control Panel (رصيد) — Supabase Edge Function
// generate-zatca-xml  |  UBL 2.1 Simplified Tax Invoice Builder
// ZATCA Phase 2 — Simplified Invoice (InvoiceTypeCode: 388 / SubTypeCode: 0200000)
// Deno/TypeScript — No Node.js Buffer; uses TextEncoder + Uint8Array
// ============================================================
//
// POST /functions/v1/generate-zatca-xml
// Headers: Authorization: Bearer <user_jwt>
// Body JSON:
//   {
//     invoice_id : string   — UUID من جدول invoices
//     save_to_storage?: boolean  — حفظ XML في Storage (افتراضي: true)
//   }
//
// Returns JSON:
//   {
//     success     : boolean
//     xml_string  : string          — XML كاملة كـ string
//     storage_path?: string         — مسار الملف في Supabase Storage
//     storage_url?: string          — رابط عام قابل للتنزيل
//   }
// ============================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Types ───────────────────────────────────────────────────

interface InvoiceLine {
  id:           string;
  line_number:  number;
  item_name_ar: string;
  item_name_en: string | null;
  item_code:    string | null;
  quantity:     number;
  unit_price:   number;
  discount_pct: number;
  line_subtotal: number;
  vat_rate:     number;
  vat_amount:   number;
  line_total:   number;
}

interface InvoiceRow {
  id:                   string;
  uuid:                 string;
  invoice_number:       string;
  invoice_counter_value: number;
  invoice_type:         'STANDARD' | 'SIMPLIFIED' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  payment_means:        string;
  issue_date:           string;
  supply_date:          string | null;
  due_date:             string | null;
  subtotal:             number;
  discount_amount:      number;
  taxable_amount:       number;
  vat_rate:             number;
  vat_amount:           number;
  total_amount:         number;
  notes:                string | null;
  previous_hash:        string | null;
  org_id:               string;
  invoice_lines:        InvoiceLine[];
}

interface SettingsRow {
  name_ar:    string;
  name_en:    string | null;
  vat_number: string;
  cr_number:  string | null;
  address:    string | null;
  city:       string | null;
  phone:      string | null;
  email:      string | null;
  zatca_env:  'sandbox' | 'production' | null;
}

// ─── CORS Headers ─────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// ─── Helpers ──────────────────────────────────────────────────

/** تنسيق رقم كـ 0.00 (مطلوب ZATCA) */
function fmt(n: number | null | undefined): string {
  return (Number(n) || 0).toFixed(2);
}

/** استبدال المحارف الخاصة في XML */
function escXml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** تحويل التاريخ لصيغة YYYY-MM-DD */
function isoDate(d: string | null | undefined): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  return d.slice(0, 10);
}

/** رمز نوع الفاتورة للـ UBL (ZATCA) */
function invoiceTypeCode(type: InvoiceRow['invoice_type']): { code: string; name: string } {
  switch (type) {
    case 'CREDIT_NOTE':  return { code: '381', name: '0200000' };
    case 'DEBIT_NOTE':   return { code: '383', name: '0200000' };
    case 'SIMPLIFIED':
    default:             return { code: '388', name: '0200000' };
  }
}

/** رمز وسيلة الدفع بالمعيار UBL */
function paymentMeansCode(method: string): string {
  const map: Record<string, string> = {
    CASH:        '10',
    BANK:        '42',
    CREDIT_CARD: '48',
    card:        '48',
    cash:        '10',
  };
  return map[method] ?? '10';
}

// ─── QR Code (TLV Base64) — بدون Buffer ───────────────────────
//
// ZATCA TLV Format:
//   Tag 1: اسم المورد
//   Tag 2: الرقم الضريبي
//   Tag 3: تاريخ ووقت الفاتورة
//   Tag 4: إجمالي الفاتورة شامل الضريبة
//   Tag 5: مجموع الضريبة

function buildTlvEntry(tag: number, value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  const result  = new Uint8Array(2 + encoded.length);
  result[0]     = tag;
  result[1]     = encoded.length;
  result.set(encoded, 2);
  return result;
}

function uint8ToBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function buildZatcaQrCode(params: {
  sellerName:    string;
  vatNumber:     string;
  issueDateTime: string; // ISO 8601
  totalAmount:   string; // 0.00 format
  vatAmount:     string; // 0.00 format
}): string {
  const t1 = buildTlvEntry(1, params.sellerName);
  const t2 = buildTlvEntry(2, params.vatNumber);
  const t3 = buildTlvEntry(3, params.issueDateTime);
  const t4 = buildTlvEntry(4, params.totalAmount);
  const t5 = buildTlvEntry(5, params.vatAmount);

  const merged = new Uint8Array(
    t1.length + t2.length + t3.length + t4.length + t5.length,
  );
  let offset = 0;
  for (const chunk of [t1, t2, t3, t4, t5]) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return uint8ToBase64(merged);
}

// ─── SHA-256 Hash (للـ PIH والتحقق) ──────────────────────────

async function sha256Base64(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  return uint8ToBase64(new Uint8Array(hashBuf));
}

// ─── XML Builder — UBL 2.1 Simplified Invoice ─────────────────

function buildZatcaXml(params: {
  invoice:   InvoiceRow;
  settings:  SettingsRow;
  qrCode:    string;
  invoiceHash: string;
}): string {
  const { invoice, settings, qrCode, invoiceHash } = params;
  const { code: typeCode, name: typeName } = invoiceTypeCode(invoice.invoice_type);
  const issueDateTime = `${isoDate(invoice.issue_date)}T00:00:00`;
  const supplyDate    = isoDate(invoice.supply_date ?? invoice.issue_date);
  const pih           = invoice.previous_hash
    ?? 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjOTljMmYxN2Y0OGJjYWJiN2UyZDc4MzYxNTljNGU1MmI=';

  // ── حساب مجاميع السطور للتحقق من الدقة ──────────────────────
  let linesVatTotal     = 0;
  let linesTaxableTotal = 0;
  let linesTotalAmount  = 0;

  for (const ln of invoice.invoice_lines) {
    const qty      = Number(ln.quantity);
    const price    = Number(ln.unit_price);
    const discPct  = Number(ln.discount_pct) || 0;
    const subTotal = Math.round((qty * price * (1 - discPct / 100)) * 100) / 100;
    const vatRate  = Number(ln.vat_rate) / 100;
    const vatAmt   = Math.round(subTotal * vatRate * 100) / 100;
    const lineTotal = Math.round((subTotal + vatAmt) * 100) / 100;

    linesVatTotal     += vatAmt;
    linesTaxableTotal += subTotal;
    linesTotalAmount  += lineTotal;
  }

  // جعل المجاميع متطابقة مع الفاتورة (أسبقية لحقول الفاتورة لتجنب رفض ZATCA)
  const taxableAmount = Number(invoice.taxable_amount) || linesTaxableTotal;
  const vatAmount     = Number(invoice.vat_amount)     || linesVatTotal;
  const totalAmount   = Number(invoice.total_amount)   || linesTotalAmount;
  const discAmount    = Number(invoice.discount_amount) || 0;

  // ── بناء سطور الفاتورة ────────────────────────────────────
  const linesXml = invoice.invoice_lines.map((ln) => {
    const qty      = Number(ln.quantity);
    const price    = Number(ln.unit_price);
    const discPct  = Number(ln.discount_pct) || 0;
    const subTotal = Math.round((qty * price * (1 - discPct / 100)) * 100) / 100;
    const vatRate  = Number(ln.vat_rate) / 100;
    const vatAmt   = Math.round(subTotal * vatRate * 100) / 100;
    const lineTotal = Math.round((subTotal + vatAmt) * 100) / 100;
    const netPrice  = Math.round((price * (1 - discPct / 100)) * 100) / 100;
    const discAmt   = Math.round((price - netPrice) * 100) / 100;
    const vatRatePct = Number(ln.vat_rate);

    return `    <cac:InvoiceLine>
      <cbc:ID>${ln.line_number}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="PCE">${fmt(qty)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="SAR">${fmt(subTotal)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="SAR">${fmt(vatAmt)}</cbc:TaxAmount>
        <cbc:RoundingAmount currencyID="SAR">${fmt(lineTotal)}</cbc:RoundingAmount>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${escXml(ln.item_name_ar)}</cbc:Name>${ln.item_name_en ? `
        <cbc:Description>${escXml(ln.item_name_en)}</cbc:Description>` : ''}${ln.item_code ? `
        <cac:SellersItemIdentification>
          <cbc:ID>${escXml(ln.item_code)}</cbc:ID>
        </cac:SellersItemIdentification>` : ''}
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${fmt(vatRatePct)}</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="SAR">${fmt(netPrice)}</cbc:PriceAmount>
        <cbc:BaseQuantity unitCode="PCE">1.00</cbc:BaseQuantity>${discAmt > 0 ? `
        <cac:AllowanceCharge>
          <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
          <cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason>
          <cbc:Amount currencyID="SAR">${fmt(discAmt)}</cbc:Amount>
        </cac:AllowanceCharge>` : ''}
      </cac:Price>
    </cac:InvoiceLine>`;
  }).join('\n');

  // ── التحقق من وجود خصم على مستوى الفاتورة ────────────────
  const headerDiscountXml = discAmount > 0 ? `
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="SAR">${fmt(discAmount)}</cbc:Amount>
    <cac:TaxCategory>
      <cbc:ID>S</cbc:ID>
      <cbc:Percent>${fmt(Number(invoice.vat_rate))}</cbc:Percent>
      <cac:TaxScheme>
        <cbc:ID>VAT</cbc:ID>
      </cac:TaxScheme>
    </cac:TaxCategory>
  </cac:AllowanceCharge>` : '';

  // ── XML الكامل ────────────────────────────────────────────
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">

  <!-- ═══════════════════════════════════════════════════════
       UBL Extensions (Digital Signature Placeholder)
       يتم تعبئتها لاحقاً عند التوقيع الرقمي في zatca-submit
  ════════════════════════════════════════════════════════ -->
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>
      <ext:ExtensionContent>
        <sig:UBLDocumentSignatures
          xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2"
          xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2"
          xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">
          <sac:SignatureInformation>
            <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
            <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:1</sbc:ReferencedSignatureID>
            <ds:Signature Id="signature" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
              <ds:SignedInfo>
                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>
                <ds:Reference Id="invoiceSignedData" URI="">
                  <ds:Transforms>
                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                      <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>
                    </ds:Transform>
                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                      <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>
                    </ds:Transform>
                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                      <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath>
                    </ds:Transform>
                    <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                  </ds:Transforms>
                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                  <ds:DigestValue>${invoiceHash}</ds:DigestValue>
                </ds:Reference>
                <ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">
                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                  <ds:DigestValue></ds:DigestValue>
                </ds:Reference>
              </ds:SignedInfo>
              <ds:SignatureValue></ds:SignatureValue>
              <ds:KeyInfo>
                <ds:X509Data>
                  <ds:X509Certificate></ds:X509Certificate>
                </ds:X509Data>
              </ds:KeyInfo>
              <ds:Object>
                <xades:QualifyingProperties Target="signature"
                  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">
                  <xades:SignedProperties Id="xadesSignedProperties">
                    <xades:SignedSignatureProperties>
                      <xades:SigningTime>${new Date().toISOString()}</xades:SigningTime>
                      <xades:SigningCertificate>
                        <xades:Cert>
                          <xades:CertDigest>
                            <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                            <ds:DigestValue></ds:DigestValue>
                          </xades:CertDigest>
                          <xades:IssuerSerial>
                            <ds:X509IssuerName></ds:X509IssuerName>
                            <ds:X509SerialNumber></ds:X509SerialNumber>
                          </xades:IssuerSerial>
                        </xades:Cert>
                      </xades:SigningCertificate>
                    </xades:SignedSignatureProperties>
                  </xades:SignedProperties>
                </xades:QualifyingProperties>
              </ds:Object>
            </ds:Signature>
          </sac:SignatureInformation>
        </sig:UBLDocumentSignatures>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <!-- ═══════════════════════ Header Fields ════════════════════ -->
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>urn:gs1:order:reporting:1.0</cbc:CustomizationID>
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escXml(invoice.invoice_number)}</cbc:ID>
  <cbc:UUID>${invoice.uuid}</cbc:UUID>
  <cbc:IssueDate>${isoDate(invoice.issue_date)}</cbc:IssueDate>
  <cbc:IssueTime>00:00:00</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${typeName}">${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cbc:LineCountNumeric>${invoice.invoice_lines.length}</cbc:LineCountNumeric>

  <!-- ═══════════════════════ Additional Documents ═════════════ -->
  <!-- ICV — Invoice Counter Value -->
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${invoice.invoice_counter_value}</cbc:UUID>
  </cac:AdditionalDocumentReference>

  <!-- PIH — Previous Invoice Hash -->
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${pih}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>

  <!-- QR Code — TLV Base64 -->
  <cac:AdditionalDocumentReference>
    <cbc:ID>QR</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${qrCode}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>

  <!-- ═══════════════════════ Signature ════════════════════════ -->
  <cac:Signature>
    <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
    <cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>
  </cac:Signature>

  <!-- ═══════════════════════ Supplier (المورد) ════════════════ -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${escXml(settings.cr_number ?? '')}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${escXml(settings.address ?? 'غير محدد')}</cbc:StreetName>
        <cbc:CityName>${escXml(settings.city ?? 'الرياض')}</cbc:CityName>
        <cbc:PostalZone>00000</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escXml(settings.vat_number)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escXml(settings.name_ar)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- ═══════════════════════ Customer (العميل) ═══════════════ -->
  <!-- الفاتورة المبسطة: العميل مجهول (B2C) -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:CityName>غير محدد</cbc:CityName>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>مستهلك عام</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <!-- ═══════════════════════ Delivery ════════════════════════ -->
  <cac:Delivery>
    <cbc:ActualDeliveryDate>${supplyDate}</cbc:ActualDeliveryDate>
  </cac:Delivery>

  <!-- ═══════════════════════ Payment Means ═══════════════════ -->
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${paymentMeansCode(invoice.payment_means)}</cbc:PaymentMeansCode>
  </cac:PaymentMeans>

  <!-- ═══════════════════════ Header Allowance ════════════════ -->${headerDiscountXml}

  <!-- ═══════════════════════ Tax Total ═══════════════════════ -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${fmt(vatAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${fmt(taxableAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${fmt(vatAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${fmt(Number(invoice.vat_rate))}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <!-- ═══════════════════════ Legal Monetary Total ════════════ -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${fmt(taxableAmount + discAmount)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${fmt(taxableAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${fmt(totalAmount)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="SAR">${fmt(discAmount)}</cbc:AllowanceTotalAmount>
    <cbc:PrepaidAmount currencyID="SAR">0.00</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="SAR">${fmt(totalAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <!-- ═══════════════════════ Invoice Lines ═══════════════════ -->
${linesXml}

</Invoice>`;
}

// ─── Main Handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // ── Preflight CORS ──────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Unauthorized: مطلوب توكن المصادقة', 401);
    }

    const supabase: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // التحقق من صحة المستخدم
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) {
      return errorResponse('Unauthorized: توكن غير صالح', 401);
    }

    // ── Parse Body ──────────────────────────────────────────────
    if (req.method !== 'POST') {
      return errorResponse('Method Not Allowed', 405);
    }

    const body = await req.json() as {
      invoice_id:       string;
      save_to_storage?: boolean;
    };

    const { invoice_id, save_to_storage = true } = body;

    if (!invoice_id) {
      return errorResponse('invoice_id مطلوب في جسم الطلب', 400);
    }

    log(`🏗️  توليد XML للفاتورة: ${invoice_id}`);

    // ── 1. جلب بيانات الفاتورة وبنودها ─────────────────────────
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select(`
        id, uuid, invoice_number, invoice_counter_value,
        invoice_type, payment_means,
        issue_date, supply_date, due_date,
        subtotal, discount_amount, taxable_amount,
        vat_rate, vat_amount, total_amount,
        notes, previous_hash, org_id,
        invoice_lines (
          id, line_number,
          item_name_ar, item_name_en, item_code,
          quantity, unit_price, discount_pct,
          line_subtotal, vat_rate, vat_amount, line_total
        )
      `)
      .eq('id', invoice_id)
      .single();

    if (invErr || !invoice) {
      return errorResponse(
        `الفاتورة غير موجودة: ${invErr?.message ?? 'not found'}`,
        404,
      );
    }

    if (!invoice.invoice_lines || invoice.invoice_lines.length === 0) {
      return errorResponse('الفاتورة لا تحتوي على بنود (invoice_lines فارغة)', 422);
    }

    // ── 2. جلب إعدادات المنشأة ──────────────────────────────────
    const { data: settings, error: settErr } = await supabase
      .from('settings')
      .select('name_ar, name_en, vat_number, cr_number, address, city, phone, email, zatca_env')
      .eq('org_id', invoice.org_id)
      .single();

    if (settErr || !settings) {
      return errorResponse(
        `إعدادات المنشأة غير موجودة: ${settErr?.message ?? 'not found'}`,
        404,
      );
    }

    if (!settings.vat_number || settings.vat_number.length !== 15) {
      return errorResponse(
        'الرقم الضريبي للمنشأة غير صحيح — يجب أن يكون 15 رقماً',
        422,
      );
    }

    // ── 3. بناء QR Code (TLV Base64) ────────────────────────────
    const issueDateTime = `${isoDate(invoice.issue_date)}T00:00:00`;
    const qrCode = buildZatcaQrCode({
      sellerName:    settings.name_ar,
      vatNumber:     settings.vat_number,
      issueDateTime,
      totalAmount:   fmt(Number(invoice.total_amount)),
      vatAmount:     fmt(Number(invoice.vat_amount)),
    });

    // ── 4. حساب Hash مؤقت (سيُستبدل بالـ hash الحقيقي عند التوقيع) ──
    const tempHash = await sha256Base64(
      `${invoice.uuid}${invoice.invoice_number}${isoDate(invoice.issue_date)}`,
    );

    // ── 5. بناء XML ─────────────────────────────────────────────
    const xmlString = buildZatcaXml({
      invoice:     invoice as InvoiceRow,
      settings:    settings as SettingsRow,
      qrCode,
      invoiceHash: tempHash,
    });

    log(`✅ XML مُوَلَّد بنجاح (${xmlString.length} حرف، ${invoice.invoice_lines.length} سطر)`);

    // ── 6. حفظ في Storage ───────────────────────────────────────
    let storagePath: string | undefined;
    let storageUrl: string | undefined;

    if (save_to_storage) {
      const bucket      = 'invoices_xml';
      const fileName    = `${invoice.invoice_number.replace(/\//g, '-')}_${invoice.uuid}.xml`;
      const folderPath  = `${invoice.org_id}/${fileName}`;
      const xmlBytes    = new TextEncoder().encode(xmlString);

      // التأكد من وجود الـ Bucket (يُنشأ تلقائياً إن لم يكن موجوداً)
      await supabase.storage.createBucket(bucket, { public: false }).catch(() => {
        // الـ Bucket موجود بالفعل — تجاهل الخطأ
      });

      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(folderPath, xmlBytes, {
          contentType: 'application/xml',
          upsert:      true,
        });

      if (uploadErr) {
        log(`⚠️  فشل حفظ XML في Storage: ${uploadErr.message} — سيتم إرجاع XML فقط`);
      } else {
        storagePath = folderPath;
        log(`📦 تم حفظ XML: ${storagePath}`);

        // إنشاء رابط موقوت (1 ساعة)
        const { data: signedUrl } = await supabase.storage
          .from(bucket)
          .createSignedUrl(folderPath, 3600);

        storageUrl = signedUrl?.signedUrl;

        // ── 7. تحديث سجل الفاتورة بمسار الملف ──────────────────
        await supabase
          .from('invoices')
          .update({
            xml_content:      xmlString,
            xml_storage_path: storagePath,
            updated_at:       new Date().toISOString(),
          })
          .eq('id', invoice_id);

        log(`🔄 تم تحديث سجل الفاتورة بمسار XML`);
      }
    }

    // ── الاستجابة النهائية ───────────────────────────────────────
    return new Response(
      JSON.stringify({
        success:      true,
        invoice_id,
        invoice_number: invoice.invoice_number,
        xml_string:   xmlString,
        qr_code:      qrCode,
        ...(storagePath && { storage_path: storagePath }),
        ...(storageUrl  && { storage_url:  storageUrl  }),
        meta: {
          lines_count:    invoice.invoice_lines.length,
          taxable_amount: fmt(Number(invoice.taxable_amount)),
          vat_amount:     fmt(Number(invoice.vat_amount)),
          total_amount:   fmt(Number(invoice.total_amount)),
          generated_at:   new Date().toISOString(),
        },
      }),
      {
        status:  200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
        },
      },
    );

  } catch (err: unknown) {
    const e = err as Error;
    console.error('❌ generate-zatca-xml error:', e.message, e.stack);
    return errorResponse(`خطأ داخلي في الخادم: ${e.message}`, 500);
  }
});

// ─── Utility Functions ────────────────────────────────────────

function errorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    },
  );
}

function log(...args: unknown[]): void {
  console.log('[generate-zatca-xml]', ...args);
}
