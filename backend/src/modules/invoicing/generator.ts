// ============================================================
// رصيد ERP — Invoice Generator v2
// UBL 2.1 XML • Real SHA-256 • ZATCA Phase 2 Chain
// ============================================================

import { buildZatcaTLV }  from '../zatca/tlv.js';
import { calculateVat, VAT_RATE_SA } from '../accounting/engine.js';

export interface InvoiceLineInput {
  description: string;
  quantity:    number;
  unitPrice:   number;
  vatExempt?:  boolean;
}

export interface CreateInvoiceInput {
  companyId:    string;
  companyName:  string;
  companyVat:   string;
  companyStreet?:  string;
  companyCity?:    string;
  companyPostal?:  string;
  customerName?:   string;
  customerVat?:    string;
  invoiceDate:  string;  // YYYY-MM-DD
  invoiceTime?: string;  // HH:MM:SS
  lines:        InvoiceLineInput[];
  paymentMethod: 'cash' | 'card' | 'bank_transfer';
  invoiceType:  'standard' | 'simplified';
  notes?:       string;
  /**
   * SHA-256 / Base64 hash of the PREVIOUS invoice in the chain.
   * First invoice ever: NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjOTliNTk5Y2M3MDYzMDM0YjYxNzM4MWNhYzE5NjYxNjM5MA==
   */
  previousInvoiceHash?: string;
  /** Invoice Counter Value from DB — must be provided by server */
  icv?: number;
}

export interface GeneratedInvoice {
  invoiceNumber:        string;
  uuid:                 string;
  subtotal:             number;
  vatAmount:            number;
  total:                number;
  qrCode:               string;   // ZATCA TLV Base64
  xmlContent:           string;   // UBL 2.1 XML (unsigned — sign via signer.ts)
  invoiceHash:          string;   // SHA-256 / Base64 of canonical XML
  previousInvoiceHash:  string;   // PIH passed through to chain
  icv:                  number;
  items: Array<{
    description: string;
    quantity:    number;
    unitPrice:   number;
    vatAmount:   number;
    lineTotal:   number;
  }>;
}

// ─── ZATCA default PIH for first invoice ever ────────────────
export const ZATCA_GENESIS_PIH =
  'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjOTliNTk5Y2M3MDYzMDM0YjYxNzM4MWNhYzE5NjYxNjM5MA==';

// ─── Invoice / UUID generators ───────────────────────────────

export function generateInvoiceNumber(prefix = 'INV', year?: number, counter = 1): string {
  const y = year ?? new Date().getFullYear();
  return `${prefix}-${y}-${String(counter).padStart(5, '0')}`;
}

export function generateUUID(): string {
  // Use Web Crypto for standard UUID v4
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback (never hits Buffer)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── SHA-256 (Browser + Deno + Node 18+, NO Buffer) ──────────

export async function sha256Base64(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return uint8ToBase64(new Uint8Array(hash));
}

// ─── Main invoice builder ─────────────────────────────────────

export async function createInvoice(input: CreateInvoiceInput): Promise<GeneratedInvoice> {
  const uuid          = generateUUID();
  const icv           = input.icv ?? 1;
  const pih           = input.previousInvoiceHash ?? ZATCA_GENESIS_PIH;
  const invoiceDate   = input.invoiceDate;
  const invoiceTime   = input.invoiceTime ?? '00:00:00';
  const timestamp     = `${invoiceDate}T${invoiceTime}Z`;
  const invoiceNumber = generateInvoiceNumber('INV', new Date(invoiceDate).getFullYear(), icv);

  // ── Calculate line totals ────────────────────────────────
  const items = input.lines.map(line => {
    const lineSubtotal = Math.round(line.quantity * line.unitPrice * 100) / 100;
    const vatCalc      = line.vatExempt
      ? { subtotal: lineSubtotal, vat: 0, total: lineSubtotal }
      : calculateVat(lineSubtotal);
    return {
      description: line.description,
      quantity:    line.quantity,
      unitPrice:   line.unitPrice,
      vatAmount:   vatCalc.vat,
      lineTotal:   vatCalc.total,
    };
  });

  const subtotal  = round(items.reduce((s, i) => s + (i.lineTotal - i.vatAmount), 0));
  const vatAmount = round(items.reduce((s, i) => s + i.vatAmount, 0));
  const total     = round(subtotal + vatAmount);

  // ── ZATCA TLV QR ─────────────────────────────────────────
  const qrCode = buildZatcaTLV({
    sellerName:            input.companyName,
    vatRegistrationNumber: input.companyVat,
    timestamp,
    invoiceTotal:          total.toFixed(2),
    vatTotal:              vatAmount.toFixed(2),
  });

  // ── UBL 2.1 XML (unsigned — signer.ts adds the <ds:Signature>) ─
  const xmlContent = buildUBLXml({
    invoiceNumber, uuid, timestamp, invoiceDate, invoiceTime,
    input, items, subtotal, vatAmount, total, pih, icv,
  });

  // ── Real SHA-256 hash of canonical XML ───────────────────
  const canonicalBytes = new TextEncoder().encode(
    xmlContent.replace(/<\?xml[^?]*\?>\s*/i, '')
  );
  const invoiceHash = await sha256Base64(canonicalBytes);

  return {
    invoiceNumber, uuid, subtotal, vatAmount, total,
    qrCode, xmlContent, invoiceHash,
    previousInvoiceHash: pih,
    icv,
    items,
  };
}

// ─── Credit Note (إشعار دائن) builder ────────────────────────
// ZATCA prohibits deleting invoices.
// ALL cancellations MUST go through a Credit Note.

export interface CreditNoteInput {
  originalInvoiceId:     string;
  originalInvoiceNumber: string;
  reason:                string;
  companyId:             string;
  companyName:           string;
  companyVat:            string;
  cancelledDate:         string;  // YYYY-MM-DD
  cancelledAmount:       number;  // original total
  cancelledVat:          number;  // original VAT
  previousInvoiceHash:   string;
  icv:                   number;
}

export async function createCreditNote(input: CreditNoteInput): Promise<GeneratedInvoice> {
  const uuid          = generateUUID();
  const timestamp     = `${input.cancelledDate}T00:00:00Z`;
  const creditNumber  = generateInvoiceNumber('CN', new Date(input.cancelledDate).getFullYear(), input.icv);

  const subtotal  = round(input.cancelledAmount - input.cancelledVat);
  const vatAmount = round(input.cancelledVat);
  const total     = round(input.cancelledAmount);

  const qrCode = buildZatcaTLV({
    sellerName:            input.companyName,
    vatRegistrationNumber: input.companyVat,
    timestamp,
    invoiceTotal:          `-${total.toFixed(2)}`,   // negative = credit
    vatTotal:              `-${vatAmount.toFixed(2)}`,
  });

  const items = [{
    description: `إلغاء الفاتورة ${input.originalInvoiceNumber} — ${input.reason}`,
    quantity:    -1,
    unitPrice:   total,
    vatAmount:   -vatAmount,
    lineTotal:   -total,
  }];

  const xmlContent = buildCreditNoteXml({
    creditNumber, uuid, timestamp, cancelledDate: input.cancelledDate,
    input, subtotal, vatAmount, total, icv: input.icv,
    pih: input.previousInvoiceHash,
  });

  const canonicalBytes = new TextEncoder().encode(
    xmlContent.replace(/<\?xml[^?]*\?>\s*/i, '')
  );
  const invoiceHash = await sha256Base64(canonicalBytes);

  return {
    invoiceNumber: creditNumber, uuid, subtotal: -subtotal,
    vatAmount: -vatAmount, total: -total, qrCode, xmlContent,
    invoiceHash, previousInvoiceHash: input.previousInvoiceHash,
    icv: input.icv, items,
  };
}

// ─── UBL 2.1 XML Builders ────────────────────────────────────

interface XmlParams {
  invoiceNumber: string; uuid: string; timestamp: string;
  invoiceDate: string;   invoiceTime: string;
  input: CreateInvoiceInput;
  items: GeneratedInvoice['items'];
  subtotal: number; vatAmount: number; total: number;
  pih: string; icv: number;
}

function buildUBLXml(p: XmlParams): string {
  const { invoiceNumber, uuid, timestamp, invoiceDate, invoiceTime, input, items, subtotal, vatAmount, total, pih, icv } = p;
  const isSimplified = input.invoiceType === 'simplified';

  const lineItems = items.map((item, i) => `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="PCE">${item.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="SAR">${(item.lineTotal - item.vatAmount).toFixed(2)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="SAR">${item.vatAmount.toFixed(2)}</cbc:TaxAmount>
      </cac:TaxTotal>
      <cac:Item><cbc:Name>${esc(item.description)}</cbc:Name></cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="SAR">${item.unitPrice.toFixed(2)}</cbc:PriceAmount>
        <cbc:BaseQuantity unitCode="PCE">1</cbc:BaseQuantity>
      </cac:Price>
    </cac:InvoiceLine>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:ProfileID>${isSimplified ? 'reporting:1.0' : 'clearance:1.0'}</cbc:ProfileID>
  <cbc:ID>${esc(invoiceNumber)}</cbc:ID>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${invoiceDate}</cbc:IssueDate>
  <cbc:IssueTime>${invoiceTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${isSimplified ? '0200000' : '0100000'}">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cbc:PIH>${esc(pih)}</cbc:PIH>
  <cbc:ICV>${icv}</cbc:ICV>
  ${input.notes ? `<cbc:Note>${esc(input.notes)}</cbc:Note>` : ''}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="CRN">${esc(input.companyVat)}</cbc:ID></cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(input.companyStreet ?? 'شارع الملك فهد')}</cbc:StreetName>
        <cbc:CityName>${esc(input.companyCity ?? 'الرياض')}</cbc:CityName>
        <cbc:PostalZone>${esc(input.companyPostal ?? '12345')}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(input.companyVat)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(input.companyName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(input.customerName ?? 'عميل نقدي')}</cbc:Name></cac:PartyName>
      ${input.customerVat ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(input.customerVat)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${paymentCode(input.paymentMethod)}</cbc:PaymentMeansCode>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${vatAmount.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${subtotal.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${vatAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${(VAT_RATE_SA * 100).toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">${total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lineItems}
</Invoice>`;
}

interface CreditXmlParams {
  creditNumber: string; uuid: string; timestamp: string;
  cancelledDate: string; input: CreditNoteInput;
  subtotal: number; vatAmount: number; total: number;
  icv: number; pih: string;
}

function buildCreditNoteXml(p: CreditXmlParams): string {
  const { creditNumber, uuid, cancelledDate, input, subtotal, vatAmount, total, icv, pih } = p;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${esc(creditNumber)}</cbc:ID>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${cancelledDate}</cbc:IssueDate>
  <cbc:IssueTime>00:00:00</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0200000">381</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cbc:PIH>${esc(pih)}</cbc:PIH>
  <cbc:ICV>${icv}</cbc:ICV>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${esc(input.originalInvoiceNumber)}</cbc:ID>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(input.companyVat)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(input.companyName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party><cac:PartyName><cbc:Name>عميل نقدي</cbc:Name></cac:PartyName></cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">-${vatAmount.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">-${subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">-${subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">-${total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">-${total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">-1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">-${subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc('إلغاء: ' + input.originalInvoiceNumber + ' — ' + input.reason)}</cbc:Name>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="SAR">${total.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

// ─── Utils ────────────────────────────────────────────────────

const round = (n: number) => Math.round(n * 100) / 100;

function paymentCode(method: string): number {
  return method === 'cash' ? 10 : method === 'card' ? 48 : 42;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function uint8ToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
