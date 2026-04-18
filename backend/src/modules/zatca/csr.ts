// ============================================================
// رصيد ERP — ZATCA Phase 2 CSR Generator
// Deno / Node.js / Supabase Edge compatible (no Buffer / no forge)
// Generates ECDSA P-256 key pair + ZATCA-compliant CSR (PKCS#10)
// ============================================================
//
// ZATCA CSR Requirements:
//   Algorithm : EC P-256 (secp256r1) + SHA-256
//   Subject   : C=SA, O=<orgName>, OU=<unit>, CN=<EIN-serialNo>
//   Extensions:
//     SubjectAltName (critical):
//       DN: 2.16.840.1.114564.1.1.1 = <EIN>          (رقم ضريبي)
//           2.16.840.1.114564.1.1.2 = <CRN>          (سجل تجاري)
//           2.16.840.1.114564.1.1.3 = <OTP>          (كود التحقق — فقط للإنتاج)
//           2.16.840.1.114564.1.1.4 = <streetAddress> (العنوان)
//           2.16.840.1.114564.1.1.5 = <businessCategory> (نشاط تجاري)
//           2.16.840.1.114564.1.1.6 = <organizationUnit>
//           2.16.840.1.114564.1.1.7 = <country>
//           2.16.840.1.114564.1.1.8 = <invoiceType>   (1100 / 0100 / etc.)
// ============================================================

export interface ZatcaCsrInput {
  /** رقم ضريبي (15 digits) */
  vatNumber: string;
  /** رقم السجل التجاري */
  crNumber: string;
  /** اسم المنشأة بالعربي أو الإنجليزي */
  organizationName: string;
  /** اسم الوحدة / الفرع */
  organizationUnit: string;
  /** العنوان */
  streetAddress: string;
  /** النشاط التجاري */
  businessCategory: string;
  /** رمز البلد */
  country?: string;
  /** رقم تسلسلي للجهاز (e.g. "1-Device-1") */
  deviceSerialNumber: string;
  /**
   * نوع الفاتورة (4-bit flags):
   *   bit3=simplified, bit2=standard, bit1=creditNote, bit0=debitNote
   *   "1100" = simplified + standard (most common for POS)
   */
  invoiceType?: string;
}

export interface ZatcaKeyPair {
  privateKeyPem: string;   // PKCS#8 PEM
  publicKeyPem: string;    // SPKI PEM
  csrPem: string;          // PKCS#10 PEM
  /** Raw CryptoKey handles — for immediate signing in the same runtime */
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Generate an ECDSA P-256 key pair and a ZATCA-compliant CSR.
 * Works in Deno, Node.js 18+ (Web Crypto), and Supabase Edge.
 */
export async function generateZatcaKeyPairAndCSR(input: ZatcaCsrInput): Promise<ZatcaKeyPair> {
  // 1. Generate non-extractable (for signing) + extractable (for export) key pair
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,   // extractable — needed to export PEM for storage
    ['sign', 'verify'],
  );

  // 2. Export keys to PEM
  const privateKeyPem = await exportPrivateKeyPem(keyPair.privateKey);
  const publicKeyPem  = await exportPublicKeyPem(keyPair.publicKey);

  // 3. Build CSR
  const csrPem = await buildCsr(input, keyPair.privateKey, keyPair.publicKey);

  return {
    privateKeyPem,
    publicKeyPem,
    csrPem,
    privateKey: keyPair.privateKey,
    publicKey:  keyPair.publicKey,
  };
}

/**
 * Import an existing PEM private key back into a CryptoKey.
 * Used when loading a stored key from Supabase Vault.
 */
export async function importPrivateKeyFromPem(pem: string): Promise<CryptoKey> {
  const der = pemToDer(pem);
  return crypto.subtle.importKey(
    'pkcs8', der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

// ─── PEM Helpers ──────────────────────────────────────────────

async function exportPrivateKeyPem(key: CryptoKey): Promise<string> {
  const der = await crypto.subtle.exportKey('pkcs8', key);
  return derToPem(der, 'EC PRIVATE KEY');
}

async function exportPublicKeyPem(key: CryptoKey): Promise<string> {
  const der = await crypto.subtle.exportKey('spki', key);
  return derToPem(der, 'PUBLIC KEY');
}

function derToPem(der: ArrayBuffer, label: string): string {
  const b64 = uint8ToBase64(new Uint8Array(der));
  const lines = b64.match(/.{1,64}/g)!.join('\n');
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  return base64ToUint8(b64).buffer;
}

// ─── CSR Builder (PKCS#10 / RFC 2986) ────────────────────────
// We hand-craft the ASN.1 DER rather than depend on node-forge or
// @peculiar/x509, so the code runs in any Web Crypto environment.

async function buildCsr(
  input: ZatcaCsrInput,
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<string> {
  const country  = input.country ?? 'SA';
  const cn       = `${input.vatNumber}-${input.deviceSerialNumber}`;
  const invType  = input.invoiceType ?? '1100';

  // ── Build Subject ──────────────────────────────────────────
  // RDN sequence: C, O, OU, CN
  const subject = buildRdnSequence([
    { oid: OID.countryName,          value: country },
    { oid: OID.organizationName,     value: input.organizationName },
    { oid: OID.organizationalUnit,   value: input.organizationUnit },
    { oid: OID.commonName,           value: cn },
  ]);

  // ── Encode SubjectPublicKeyInfo ────────────────────────────
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', publicKey));

  // ── Build Extensions (ZATCA custom OIDs) ─────────────────
  // SubjectAltName (SAN) is the carrier for all ZATCA custom fields
  const zatcaExtensions: Array<{ oid: string; value: string }> = [
    { oid: '2.16.840.1.114564.1.1.1', value: input.vatNumber },
    { oid: '2.16.840.1.114564.1.1.2', value: input.crNumber },
    { oid: '2.16.840.1.114564.1.1.4', value: input.streetAddress },
    { oid: '2.16.840.1.114564.1.1.5', value: input.businessCategory },
    { oid: '2.16.840.1.114564.1.1.6', value: input.organizationUnit },
    { oid: '2.16.840.1.114564.1.1.7', value: country },
    { oid: '2.16.840.1.114564.1.1.8', value: invType },
  ];

  const sanValue     = buildSanFromZatcaOids(zatcaExtensions);
  const extensions   = buildExtensionsAttribute(sanValue);

  // ── CertificationRequestInfo ───────────────────────────────
  const certReqInfo = asn1Sequence([
    asn1Integer(new Uint8Array([0x00])),  // version = 0
    subject,
    spki,
    asn1Tagged(0, false, extensions),    // [0] IMPLICIT Attributes
  ]);

  // ── Sign the CertificationRequestInfo ─────────────────────
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      certReqInfo,
    )
  );

  // ECDSA raw (r||s) → DER sequence
  const sigDer = ecdsaRawToDer(sig);

  // ── CertificationRequest ───────────────────────────────────
  // SEQUENCE { certReqInfo, signatureAlgorithm, signature }
  const signatureAlgorithm = asn1Sequence([
    asn1Oid(OID.ecdsaWithSha256),
    // No parameters for ECDSA
  ]);

  const csr = asn1Sequence([
    certReqInfo,
    signatureAlgorithm,
    asn1BitString(sigDer),
  ]);

  return derToPem(csr.buffer, 'CERTIFICATE REQUEST');
}

// ─── ASN.1 / DER Primitives ───────────────────────────────────

const OID = {
  countryName:        '2.5.4.6',
  organizationName:   '2.5.4.10',
  organizationalUnit: '2.5.4.11',
  commonName:         '2.5.4.3',
  ecPublicKey:        '1.2.840.10045.2.1',
  p256:               '1.2.840.10045.3.1.7',
  ecdsaWithSha256:    '1.2.840.10045.4.3.2',
  subjectAltName:     '2.5.29.17',
  extensionRequest:   '1.2.840.113549.1.9.14',
};

function encodeOid(oidStr: string): Uint8Array {
  const parts = oidStr.split('.').map(Number);
  const bytes: number[] = [40 * parts[0] + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let n = parts[i];
    const chunk: number[] = [n & 0x7f];
    n >>= 7;
    while (n) { chunk.unshift((n & 0x7f) | 0x80); n >>= 7; }
    bytes.push(...chunk);
  }
  return new Uint8Array(bytes);
}

function asn1Oid(oidStr: string): Uint8Array {
  const enc = encodeOid(oidStr);
  return new Uint8Array([0x06, enc.length, ...enc]);
}

function asn1Integer(bytes: Uint8Array): Uint8Array {
  return tlv(0x02, bytes);
}

function asn1BitString(data: Uint8Array): Uint8Array {
  // prefix 0x00 = no unused bits
  return tlv(0x03, new Uint8Array([0x00, ...data]));
}

function asn1Utf8String(s: string): Uint8Array {
  const enc = new TextEncoder().encode(s);
  return tlv(0x0c, enc);
}

function asn1PrintableString(s: string): Uint8Array {
  return tlv(0x13, new TextEncoder().encode(s));
}

function asn1Sequence(parts: Uint8Array[]): Uint8Array {
  const content = concat(parts);
  return tlv(0x30, content);
}

function asn1Set(parts: Uint8Array[]): Uint8Array {
  return tlv(0x31, concat(parts));
}

function asn1Tagged(tag: number, constructed: boolean, value: Uint8Array): Uint8Array {
  const tagByte = 0xa0 | tag | (constructed ? 0x20 : 0);
  return tlv(tagByte, value);
}

function tlv(tag: number, value: Uint8Array): Uint8Array {
  const len = encodeLength(value.length);
  return new Uint8Array([tag, ...len, ...value]);
}

function encodeLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  let tmp = n;
  while (tmp > 0) { bytes.unshift(tmp & 0xff); tmp >>= 8; }
  return [0x80 | bytes.length, ...bytes];
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

// ─── RDN / Subject Builder ────────────────────────────────────

interface Rdn { oid: string; value: string }

function buildRdnSequence(rdns: Rdn[]): Uint8Array {
  const sets = rdns.map(({ oid, value }) => {
    const isCountry = (oid === OID.countryName);
    const strEnc    = isCountry ? asn1PrintableString(value) : asn1Utf8String(value);
    const atv       = asn1Sequence([asn1Oid(oid), strEnc]);
    return asn1Set([atv]);
  });
  return asn1Sequence(sets);
}

// ─── ZATCA SAN (SubjectAltName with custom OIDs) ──────────────
// Each ZATCA field is encoded as an otherName in the SAN.
// otherName: [0] { OID, [0] UTF8String }

function buildSanFromZatcaOids(fields: Array<{ oid: string; value: string }>): Uint8Array {
  const entries = fields.map(({ oid, value }) => {
    const oidEnc   = asn1Oid(oid);
    const valEnc   = asn1Tagged(0, true, asn1Utf8String(value));  // [0] EXPLICIT
    const inner    = concat([oidEnc, valEnc]);
    return asn1Tagged(0, true, inner);  // [0] IMPLICIT otherName
  });
  const sanSeq = asn1Sequence(entries);
  return sanSeq;
}

function buildExtensionsAttribute(sanValue: Uint8Array): Uint8Array {
  // Extension: { OID(subjectAltName), critical=false, OCTET STRING(sanValue) }
  const sanExtension = asn1Sequence([
    asn1Oid(OID.subjectAltName),
    tlv(0x04, sanValue),  // OCTET STRING wrapping the SAN SEQUENCE
  ]);

  const extensionsValue = asn1Sequence([sanExtension]);

  // extensionRequest attribute: { OID(extensionRequest), SET { SEQUENCE { extensions } } }
  return concat([
    asn1Oid(OID.extensionRequest),
    asn1Set([extensionsValue]),
  ]);
}

// ─── ECDSA Signature Conversion ──────────────────────────────
// Web Crypto returns raw (r||s) 64 bytes; ASN.1 needs DER SEQUENCE

function ecdsaRawToDer(raw: Uint8Array): Uint8Array {
  const r = raw.slice(0, 32);
  const s = raw.slice(32, 64);

  function encodeSigPart(part: Uint8Array): Uint8Array {
    // Prepend 0x00 if high bit set (unsigned integer rule)
    const padded = part[0] & 0x80 ? new Uint8Array([0, ...part]) : part;
    return asn1Integer(padded);
  }

  return asn1Sequence([encodeSigPart(r), encodeSigPart(s)]);
}

// ─── Base64 Helpers (no Buffer) ──────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
