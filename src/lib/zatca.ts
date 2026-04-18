// ============================================================
// Control Panel (رصيد) — ZATCA Phase 2 Integration Module
// UBL 2.1 XML | ECDSA Signing | TLV QR | API Client
// Compliant with ZATCA E-Invoicing Implementation Standards v2.3
// ============================================================

import crypto from 'crypto';

// ─── ZATCA Environment Toggle ────────────────────────────────
export type ZatcaEnvironment = 'sandbox' | 'production';

const ZATCA_ENDPOINTS: Record<ZatcaEnvironment, { clearance: string; reporting: string; onboarding: string }> = {
  sandbox: {
    clearance:  'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/invoices/clearance/single',
    reporting:  'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/invoices/reporting/single',
    onboarding: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/compliance',
  },
  production: {
    clearance:  'https://gw-fatoora.zatca.gov.sa/e-invoicing/core/invoices/clearance/single',
    reporting:  'https://gw-fatoora.zatca.gov.sa/e-invoicing/core/invoices/reporting/single',
    onboarding: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core/compliance',
  },
};

// ─── Types ───────────────────────────────────────────────────
export interface ZatcaOrg {
  name_ar: string;
  vat_number: string;
  cr_number?: string;
  address: {
    street: string;
    city: string;
    country: string;
    postal: string;
    building_number?: string;
    district?: string;
  };
  certificate_pem: string;    // X.509 PEM
  private_key_pem: string;    // ECDSA private key PEM
  pih: string;                // Previous Invoice Hash (Base64)
}

export interface ZatcaInvoiceLine {
  id: number;
  item_name: string;
  item_code?: string;
  quantity: number;
  unit_price: number;
  discount_amount?: number;
  vat_rate: number;
  unit_of_measure?: string;
}

export interface ZatcaInvoiceData {
  uuid: string;
  invoice_counter_value: number;   // ICV
  invoice_number: string;
  invoice_type: 'STANDARD' | 'SIMPLIFIED' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  issue_date: string;              // YYYY-MM-DD
  issue_time: string;              // HH:MM:SS
  supply_date?: string;
  due_date?: string;
  currency: string;
  payment_means: string;           // BANK, CASH, CREDIT_CARD
  buyer?: {
    name: string;
    vat_number?: string;
    address?: { street?: string; city?: string; country?: string; postal?: string };
  };
  lines: ZatcaInvoiceLine[];
  subtotal: number;
  discount_total: number;
  taxable_amount: number;
  vat_amount: number;
  total_amount: number;
  notes?: string;
  original_invoice_uuid?: string;   // For credit/debit notes
}

export interface ZatcaSignedInvoice {
  xml_unsigned: string;
  xml_signed: string;
  invoice_hash: string;           // SHA-256 Base64
  digital_signature: string;      // ECDSA signature Base64
  qr_code: string;                // TLV Base64
}

export interface ZatcaApiResponse {
  validationResults?: {
    status: 'PASS' | 'WARNING' | 'ERROR';
    infoMessages: Array<{ type: string; code: string; category: string; message: string }>;
    warningMessages: Array<{ type: string; code: string; category: string; message: string }>;
    errorMessages: Array<{ type: string; code: string; category: string; message: string }>;
  };
  reportingStatus?: 'REPORTED' | 'NOT_REPORTED';
  clearanceStatus?: 'CLEARED' | 'NOT_CLEARED';
  clearedInvoice?: string;         // Base64 signed XML returned by ZATCA
  uuid?: string;
}

// ═══════════════════════════════════════════════════════════
// ── 1. XML GENERATION (UBL 2.1) ────────────────────────────
// ═══════════════════════════════════════════════════════════

/**
 * Generates a ZATCA-compliant UBL 2.1 XML invoice
 * Supports Standard (B2B) and Simplified (B2C) invoice types
 */
export function generateUBLXml(org: ZatcaOrg, invoice: ZatcaInvoiceData): string {
  const isSimplified = invoice.invoice_type === 'SIMPLIFIED';
  const isCreditNote = invoice.invoice_type === 'CREDIT_NOTE';
  const isDebitNote  = invoice.invoice_type === 'DEBIT_NOTE';

  const invoiceTypeCode = isSimplified ? '388' : '380';
  const subtypeCode     = isSimplified ? '0200000' : '0100000';

  const linesXml = invoice.lines.map(line => {
    const lineNet = +(line.quantity * line.unit_price - (line.discount_amount ?? 0)).toFixed(2);
    const lineVat = +(lineNet * line.vat_rate / 100).toFixed(2);
    return `
    <cac:InvoiceLine>
      <cbc:ID>${line.id}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${line.unit_of_measure ?? 'PCE'}">${line.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${invoice.currency}">${lineNet.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${invoice.currency}">${lineVat.toFixed(2)}</cbc:TaxAmount>
        <cbc:RoundingAmount currencyID="${invoice.currency}">${(lineNet + lineVat).toFixed(2)}</cbc:RoundingAmount>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${escapeXml(line.item_name)}</cbc:Name>
        ${line.item_code ? `<cac:SellersItemIdentification><cbc:ID>${escapeXml(line.item_code)}</cbc:ID></cac:SellersItemIdentification>` : ''}
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${line.vat_rate.toFixed(2)}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${invoice.currency}">${line.unit_price.toFixed(4)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2"
  xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2"
  xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">

  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>
      <ext:ExtensionContent>
        <sig:UBLDocumentSignatures>
          <sac:SignatureInformation>
            <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
            <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
            <ds:Signature Id="signature">
              <!-- SIGNATURE_PLACEHOLDER -->
            </ds:Signature>
          </sac:SignatureInformation>
        </sig:UBLDocumentSignatures>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoice.invoice_number)}</cbc:ID>
  <cbc:UUID>${invoice.uuid}</cbc:UUID>
  <cbc:IssueDate>${invoice.issue_date}</cbc:IssueDate>
  <cbc:IssueTime>${invoice.issue_time}</cbc:IssueTime>
  ${invoice.due_date ? `<cbc:DueDate>${invoice.due_date}</cbc:DueDate>` : ''}
  <cbc:InvoiceTypeCode name="${subtypeCode}">${invoiceTypeCode}</cbc:InvoiceTypeCode>
  ${invoice.notes ? `<cbc:Note languageID="ar">${escapeXml(invoice.notes)}</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>

  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${invoice.invoice_counter_value}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${org.pih}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>

  ${isCreditNote || isDebitNote ? `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${invoice.original_invoice_uuid ?? ''}</cbc:ID>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>` : ''}

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${escapeXml(org.cr_number ?? '')}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(org.address.street)}</cbc:StreetName>
        <cbc:BuildingNumber>${escapeXml(org.address.building_number ?? '0000')}</cbc:BuildingNumber>
        <cbc:PlotIdentification>${escapeXml(org.address.district ?? '')}</cbc:PlotIdentification>
        <cbc:CityName>${escapeXml(org.address.city)}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(org.address.postal)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(org.vat_number)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(org.name_ar)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>

  ${!isSimplified && invoice.buyer ? `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(invoice.buyer.address?.street ?? '')}</cbc:StreetName>
        <cbc:CityName>${escapeXml(invoice.buyer.address?.city ?? '')}</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>${escapeXml(invoice.buyer.address?.country ?? 'SA')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${invoice.buyer.vat_number ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(invoice.buyer.vat_number)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(invoice.buyer.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>` : ''}

  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${escapeXml(invoice.payment_means)}</cbc:PaymentMeansCode>
  </cac:PaymentMeans>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${invoice.vat_amount.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${invoice.currency}">${invoice.taxable_amount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${invoice.currency}">${invoice.vat_amount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>15.00</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${invoice.currency}">${invoice.subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${invoice.currency}">${invoice.taxable_amount.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${invoice.currency}">${invoice.total_amount.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${invoice.currency}">${invoice.discount_total.toFixed(2)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${invoice.currency}">${invoice.total_amount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  ${linesXml}
</Invoice>`;
}

// ═══════════════════════════════════════════════════════════
// ── 2. HASHING ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

/**
 * Compute canonical SHA-256 hash of the invoice XML
 * Returns Base64-encoded hash (required by ZATCA)
 */
export function computeInvoiceHash(xmlContent: string): string {
  // Remove signature placeholder before hashing
  const canonical = xmlContent
    .replace(/<ds:Signature[\s\S]*?<\/ds:Signature>/g, '<ds:Signature/>')
    .trim();

  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest();
  return hash.toString('base64');
}

// ═══════════════════════════════════════════════════════════
// ── 3. ECDSA DIGITAL SIGNATURE ──────────────────────────────
// ═══════════════════════════════════════════════════════════

/**
 * Sign the invoice hash using ECDSA-sha256 with the org's private key
 * Returns Base64-encoded DER signature
 */
export function signInvoice(invoiceHash: string, privateKeyPem: string): string {
  const sign = crypto.createSign('SHA256');
  sign.update(Buffer.from(invoiceHash, 'base64'));
  const signatureBuffer = sign.sign(privateKeyPem, 'base64');
  return signatureBuffer;
}

/**
 * Embed signature into the XML (replaces SIGNATURE_PLACEHOLDER)
 */
export function embedSignatureInXml(
  xmlUnsigned: string,
  invoiceHash: string,
  signature: string,
  certificatePem: string
): string {
  // Extract certificate content (strip PEM headers)
  const certContent = certificatePem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\s/g, '');

  const certHash = crypto.createHash('sha256').update(Buffer.from(certContent, 'base64')).digest('base64');

  const signatureBlock = `
  <ds:SignedInfo>
    <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
    <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>
    <ds:Reference Id="invoiceSignedData" URI="">
      <ds:Transforms>
        <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
          <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>
        </ds:Transform>
        <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
      </ds:Transforms>
      <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
      <ds:DigestValue>${invoiceHash}</ds:DigestValue>
    </ds:Reference>
  </ds:SignedInfo>
  <ds:SignatureValue>${signature}</ds:SignatureValue>
  <ds:KeyInfo>
    <ds:X509Data>
      <ds:X509Certificate>${certContent}</ds:X509Certificate>
    </ds:X509Data>
  </ds:KeyInfo>
  <ds:Object>
    <xades:QualifyingProperties Target="signature">
      <xades:SignedProperties Id="xadesSignedProperties">
        <xades:SignedSignatureProperties>
          <xades:SigningTime>${new Date().toISOString()}</xades:SigningTime>
          <xades:SigningCertificate>
            <xades:Cert>
              <xades:CertDigest>
                <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                <ds:DigestValue>${certHash}</ds:DigestValue>
              </xades:CertDigest>
            </xades:Cert>
          </xades:SigningCertificate>
        </xades:SignedSignatureProperties>
      </xades:SignedProperties>
    </xades:QualifyingProperties>
  </ds:Object>`;

  return xmlUnsigned.replace('<!-- SIGNATURE_PLACEHOLDER -->', signatureBlock);
}

// ═══════════════════════════════════════════════════════════
// ── 4. QR CODE (TLV Base64) ─────────────────────────────────
// ═══════════════════════════════════════════════════════════

/**
 * Build TLV (Tag-Length-Value) QR code per ZATCA specification
 *
 * Tag definitions:
 *  1 = Seller Name
 *  2 = VAT Registration Number
 *  3 = Timestamp (ISO 8601)
 *  4 = Invoice Total (incl. VAT)
 *  5 = VAT Total
 *  6 = Invoice Hash (SHA-256)
 *  7 = ECDSA Signature
 *  8 = ECDSA Public Key
 *  9 = ZATCA Certificate Signature
 */
export function generateTLVQrCode(params: {
  seller_name: string;
  vat_number: string;
  timestamp: string;       // ISO 8601
  total_amount: number;
  vat_amount: number;
  invoice_hash: string;
  digital_signature: string;
  certificate_pem: string;
}): string {
  function tlvEntry(tag: number, value: string): Buffer {
    const valueBuffer = Buffer.from(value, 'utf8');
    const tagBuffer   = Buffer.alloc(1);
    const lenBuffer   = Buffer.alloc(1);
    tagBuffer.writeUInt8(tag);
    lenBuffer.writeUInt8(valueBuffer.length);
    return Buffer.concat([tagBuffer, lenBuffer, valueBuffer]);
  }

  const certContent = params.certificate_pem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\s/g, '');

  const tlv = Buffer.concat([
    tlvEntry(1, params.seller_name),
    tlvEntry(2, params.vat_number),
    tlvEntry(3, params.timestamp),
    tlvEntry(4, params.total_amount.toFixed(2)),
    tlvEntry(5, params.vat_amount.toFixed(2)),
    tlvEntry(6, params.invoice_hash),
    tlvEntry(7, params.digital_signature),
    tlvEntry(8, certContent.slice(0, 255)),   // Public key (truncated for QR size)
  ]);

  return tlv.toString('base64');
}

// ═══════════════════════════════════════════════════════════
// ── 5. MAIN SIGNING PIPELINE ────────────────────────────────
// ═══════════════════════════════════════════════════════════

/**
 * Full ZATCA signing workflow:
 * 1. Generate UBL XML
 * 2. Compute hash
 * 3. Sign with ECDSA
 * 4. Embed signature
 * 5. Generate TLV QR
 */
export async function signZatcaInvoice(
  org: ZatcaOrg,
  invoice: ZatcaInvoiceData
): Promise<ZatcaSignedInvoice> {
  // Step 1: Generate unsigned XML
  const xmlUnsigned = generateUBLXml(org, invoice);

  // Step 2: Compute SHA-256 hash
  const invoiceHash = computeInvoiceHash(xmlUnsigned);

  // Step 3: ECDSA sign
  const digitalSignature = signInvoice(invoiceHash, org.private_key_pem);

  // Step 4: Embed signature into XML
  const xmlSigned = embedSignatureInXml(xmlUnsigned, invoiceHash, digitalSignature, org.certificate_pem);

  // Step 5: Generate TLV QR
  const qrCode = generateTLVQrCode({
    seller_name:       org.name_ar,
    vat_number:        org.vat_number,
    timestamp:         `${invoice.issue_date}T${invoice.issue_time}`,
    total_amount:      invoice.total_amount,
    vat_amount:        invoice.vat_amount,
    invoice_hash:      invoiceHash,
    digital_signature: digitalSignature,
    certificate_pem:   org.certificate_pem,
  });

  return { xml_unsigned: xmlUnsigned, xml_signed: xmlSigned, invoice_hash: invoiceHash, digital_signature: digitalSignature, qr_code: qrCode };
}

// ═══════════════════════════════════════════════════════════
// ── 6. ZATCA API CLIENT ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════

export class ZatcaApiClient {
  private env: ZatcaEnvironment;
  private username: string;    // ZATCA Integration ID (CSID)
  private password: string;    // ZATCA Secret (CSPK)

  constructor(env: ZatcaEnvironment, username: string, password: string) {
    this.env      = env;
    this.username = username;
    this.password = password;
  }

  private get headers() {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return {
      'Authorization':     `Basic ${credentials}`,
      'Content-Type':      'application/json',
      'Accept':            'application/json',
      'Accept-Language':   'en',
      'Accept-Version':    'V2',
      'Clearance-Status':  '1',
    };
  }

  /**
   * Clearance API — for B2B Standard Invoices
   * ZATCA validates and stamps the invoice
   */
  async clearInvoice(signedXml: string, invoiceHash: string, uuid: string): Promise<ZatcaApiResponse> {
    const body = {
      invoiceHash,
      uuid,
      invoice: Buffer.from(signedXml).toString('base64'),
    };

    const res = await fetch(ZATCA_ENDPOINTS[this.env].clearance, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    const data = await res.json() as ZatcaApiResponse;

    if (!res.ok) {
      throw new Error(`ZATCA Clearance failed [${res.status}]: ${JSON.stringify(data)}`);
    }
    return data;
  }

  /**
   * Reporting API — for B2C Simplified Invoices
   * ZATCA only records (no clearance stamp returned)
   */
  async reportInvoice(signedXml: string, invoiceHash: string, uuid: string): Promise<ZatcaApiResponse> {
    const body = {
      invoiceHash,
      uuid,
      invoice: Buffer.from(signedXml).toString('base64'),
    };

    const res = await fetch(ZATCA_ENDPOINTS[this.env].reporting, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    const data = await res.json() as ZatcaApiResponse;

    if (!res.ok) {
      throw new Error(`ZATCA Reporting failed [${res.status}]: ${JSON.stringify(data)}`);
    }
    return data;
  }
}

// ═══════════════════════════════════════════════════════════
// ── 7. COMPLETE INVOICE SUBMISSION WORKFLOW ─────────────────
// ═══════════════════════════════════════════════════════════

/**
 * End-to-end: Sign → Submit to ZATCA → Return result
 * This function runs on the Backend (Supabase Edge Function / Node.js)
 * Never expose private keys to the frontend!
 */
export async function processAndSubmitInvoice(
  org: ZatcaOrg,
  invoice: ZatcaInvoiceData,
  zatcaClient: ZatcaApiClient
): Promise<{
  signed: ZatcaSignedInvoice;
  response: ZatcaApiResponse;
  new_pih: string;
}> {
  // 1. Sign
  const signed = await signZatcaInvoice(org, invoice);

  // 2. Submit (B2B clearance vs B2C reporting)
  let response: ZatcaApiResponse;
  if (invoice.invoice_type === 'SIMPLIFIED') {
    response = await zatcaClient.reportInvoice(signed.xml_signed, signed.invoice_hash, invoice.uuid);
  } else {
    response = await zatcaClient.clearInvoice(signed.xml_signed, signed.invoice_hash, invoice.uuid);
  }

  // 3. New PIH = current invoice hash (chain for next invoice)
  const new_pih = signed.invoice_hash;

  return { signed, response, new_pih };
}

// ─── Utility ─────────────────────────────────────────────────
function escapeXml(str: string): string {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

// ─── Supabase Edge Function wrapper (deploy to /functions/v1/zatca-submit)
// ─── This keeps private keys secure on the server side
export const zatcaEdgeFunctionHandler = `
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { signZatcaInvoice, ZatcaApiClient, processAndSubmitInvoice } from './zatca_module.ts';

serve(async (req) => {
  const { invoice_id } = await req.json();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Fetch invoice + org securely (server-side only)
  const { data: inv } = await supabase.from('invoices').select('*, organizations(*)').eq('id', invoice_id).single();
  const org = inv.organizations;

  // Build ZatcaOrg (private keys stored encrypted in org record)
  const zatcaOrg = {
    name_ar: org.name_ar, vat_number: org.vat_number, pih: org.pih,
    certificate_pem: org.zatca_cert, private_key_pem: org.zatca_private_key,
    address: { street: org.address_street, city: org.address_city, country: 'SA', postal: org.address_postal ?? '' },
  };

  const zatcaEnv = org.zatca_env ?? 'sandbox';
  const client = new ZatcaApiClient(zatcaEnv, Deno.env.get('ZATCA_CSID')!, Deno.env.get('ZATCA_CSPK')!);

  const invoiceData = { ...inv, lines: inv.invoice_lines };
  const { signed, response, new_pih } = await processAndSubmitInvoice(zatcaOrg, invoiceData, client);

  // Update invoice + new PIH in DB
  await supabase.from('invoices').update({
    invoice_hash: signed.invoice_hash, qr_code: signed.qr_code,
    digital_signature: signed.digital_signature, xml_content: signed.xml_signed,
    zatca_response: response,
    invoice_status: response.clearanceStatus === 'CLEARED' ? 'CLEARED' : 'REPORTED',
  }).eq('id', invoice_id);

  await supabase.from('organizations').update({ pih: new_pih }).eq('id', org.id);

  return new Response(JSON.stringify({ success: true, qr_code: signed.qr_code }), { headers: { 'Content-Type': 'application/json' } });
});
`;
