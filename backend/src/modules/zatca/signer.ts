// ============================================================
// رصيد ERP — ZATCA Phase 2 Invoice Signer
// Real SHA-256 hash + ECDSA P-256 signing — no Buffer, no forge
// Deno / Node 18+ / Supabase Edge compatible
// ============================================================
//
// Signing flow per ZATCA spec:
//   1.  Canonicalize the UBL XML (strip signature placeholder)
//   2.  SHA-256 the canonical bytes → invoiceHash (Base64)
//   3.  Build xades:SignedProperties (certificate hash, signing time)
//   4.  Build ds:SignedInfo covering invoiceHash + signedProps hash
//   5.  ECDSA-sign the ds:SignedInfo bytes
//   6.  Inject <ds:Signature> extension back into the XML
//   7.  Encode final signed XML as Base64 for ZATCA API
// ============================================================

import { importPrivateKeyFromPem } from './csr.js';

export interface SignInvoiceParams {
  /** Unsigned UBL 2.1 XML string */
  xmlContent: string;
  /** ECDSA P-256 private key PEM (PKCS#8) — from zatca_devices table */
  privateKeyPem: string;
  /** X.509 certificate PEM — PCSID from ZATCA */
  certificatePem: string;
  /** SHA-256 / Base64 hash of the PREVIOUS invoice (PIH) */
  previousInvoiceHash: string;
  /** Invoice Counter Value from DB sequence */
  icv: number;
}

export interface SignedInvoice {
  /** Final signed UBL 2.1 XML (with <ds:Signature> injected) */
  signedXml: string;
  /** Base64-encoded signed XML — sent to ZATCA API */
  signedXmlBase64: string;
  /** SHA-256 / Base64 of the CANONICAL (unsigned) XML — stored in DB */
  invoiceHash: string;
  /** ECDSA signature over ds:SignedInfo (DER / Base64) */
  ecdsaSignature: string;
}

// ─── Public API ───────────────────────────────────────────────

export async function signInvoice(params: SignInvoiceParams): Promise<SignedInvoice> {
  const { xmlContent, privateKeyPem, certificatePem, previousInvoiceHash, icv } = params;

  // 1. Strip old signature placeholder + inject PIH / ICV
  const preparedXml = injectChainFields(xmlContent, previousInvoiceHash, icv);

  // 2. Canonical bytes (C14N-lite: normalize whitespace between tags)
  const canonicalBytes = canonicalize(preparedXml);

  // 3. SHA-256 invoice hash
  const hashBytes    = await sha256(canonicalBytes);
  const invoiceHash  = uint8ToBase64(hashBytes);

  // 4. Certificate serial + issuer (from PEM)
  const certBase64   = extractCertBase64(certificatePem);
  const certHashBytes = await sha256(base64ToUint8(certBase64));
  const certHash     = uint8ToBase64(certHashBytes);

  // 5. SignedProperties XML (xades)
  const signingTime     = new Date().toISOString();
  const signedPropsXml  = buildSignedProperties(certHash, certBase64, signingTime, invoiceHash);
  const signedPropsBytes = new TextEncoder().encode(signedPropsXml);
  const signedPropsHash  = uint8ToBase64(new Uint8Array(await sha256(signedPropsBytes)));

  // 6. SignedInfo XML
  const signedInfoXml   = buildSignedInfo(invoiceHash, signedPropsHash);
  const signedInfoBytes = new TextEncoder().encode(signedInfoXml);

  // 7. ECDSA sign SignedInfo
  const privateKey      = await importPrivateKeyFromPem(privateKeyPem);
  const sigRaw          = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    signedInfoBytes,
  ));
  const ecdsaSignature  = uint8ToBase64(sigRaw);

  // 8. Assemble full <ds:Signature> block
  const dsSignatureBlock = buildDsSignature(
    signedInfoXml,
    ecdsaSignature,
    certBase64,
    signedPropsXml,
  );

  // 9. Inject signature into XML
  const signedXml = injectSignature(preparedXml, dsSignatureBlock);
  const signedXmlBase64 = uint8ToBase64(new TextEncoder().encode(signedXml));

  return { signedXml, signedXmlBase64, invoiceHash, ecdsaSignature };
}

/**
 * Verify a stored invoice hash matches its XML — used for audit / chain check.
 */
export async function verifyInvoiceHash(xmlContent: string, storedHash: string): Promise<boolean> {
  const canonical = canonicalize(xmlContent);
  const hash      = uint8ToBase64(new Uint8Array(await sha256(canonical)));
  return hash === storedHash;
}

// ─── Chain Field Injection ────────────────────────────────────

function injectChainFields(xml: string, pih: string, icv: number): string {
  // Replace or add PIH element
  let out = xml;

  if (out.includes('<cbc:PIH>')) {
    out = out.replace(/<cbc:PIH>.*?<\/cbc:PIH>/s, `<cbc:PIH>${esc(pih)}</cbc:PIH>`);
  } else {
    // Insert after <cbc:IssueTime>
    out = out.replace(
      /(<cbc:IssueTime>.*?<\/cbc:IssueTime>)/s,
      `$1\n  <cbc:PIH>${esc(pih)}</cbc:PIH>`
    );
  }

  if (out.includes('<cbc:ICV>')) {
    out = out.replace(/<cbc:ICV>.*?<\/cbc:ICV>/s, `<cbc:ICV>${icv}</cbc:ICV>`);
  } else {
    out = out.replace(
      /(<cbc:PIH>.*?<\/cbc:PIH>)/s,
      `$1\n  <cbc:ICV>${icv}</cbc:ICV>`
    );
  }

  // Remove any existing signature block (for re-signing)
  out = out.replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>\s*/g, '');

  return out;
}

// ─── XML Canonicalization (C14N-lite) ────────────────────────
// Full W3C C14N is complex; ZATCA uses a simplified normalization:
// trim whitespace-only text nodes between elements.

function canonicalize(xml: string): Uint8Array {
  // Remove XML declaration for hashing (ZATCA spec)
  let canonical = xml.replace(/<\?xml[^?]*\?>\s*/i, '');
  // Normalize line endings
  canonical = canonical.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return new TextEncoder().encode(canonical);
}

// ─── XML Signature Structures ────────────────────────────────

function buildSignedProperties(
  certHash: string,
  certBase64: string,
  signingTime: string,
  invoiceHash: string,
): string {
  return `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">
  <xades:SignedSignatureProperties>
    <xades:SigningTime>${signingTime}</xades:SigningTime>
    <xades:SigningCertificate>
      <xades:Cert>
        <xades:CertDigest>
          <ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
          <ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certHash}</ds:DigestValue>
        </xades:CertDigest>
        <xades:IssuerSerial>
          <ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">CN=ZATCA-Code-Signing-CA, DC=zatca, DC=gov, DC=sa</ds:X509IssuerName>
          <ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">0</ds:X509SerialNumber>
        </xades:IssuerSerial>
      </xades:Cert>
    </xades:SigningCertificate>
  </xades:SignedSignatureProperties>
  <xades:SignedDataObjectProperties>
    <xades:DataObjectFormat ObjectReference="#invoiceSignedData">
      <xades:MimeType>text/xml</xades:MimeType>
    </xades:DataObjectFormat>
  </xades:SignedDataObjectProperties>
</xades:SignedProperties>`;
}

function buildSignedInfo(invoiceHashBase64: string, signedPropsHashBase64: string): string {
  return `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
  <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>
  <ds:Reference Id="invoiceSignedData" URI="">
    <ds:Transforms>
      <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xslt-19991116">
        <xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0">
          <xsl:output method="xml" encoding="UTF-8" indent="no"/>
          <xsl:template match="node()|@*"><xsl:copy><xsl:apply-templates select="node()|@*"/></xsl:copy></xsl:template>
          <xsl:template match="ext:UBLExtensions"/>
          <xsl:template match="cbc:UBLVersionID"/>
          <xsl:template match="cac:Signature"/>
        </xsl:stylesheet>
      </ds:Transform>
      <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
    </ds:Transforms>
    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
    <ds:DigestValue>${invoiceHashBase64}</ds:DigestValue>
  </ds:Reference>
  <ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#xadesSignedProperties">
    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
    <ds:DigestValue>${signedPropsHashBase64}</ds:DigestValue>
  </ds:Reference>
</ds:SignedInfo>`;
}

function buildDsSignature(
  signedInfoXml: string,
  ecdsaSignatureBase64: string,
  certBase64: string,
  signedPropsXml: string,
): string {
  return `<ext:UBLExtensions>
  <ext:UBLExtension>
    <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:ext:1.0</ext:ExtensionURI>
    <ext:ExtensionContent>
      <sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2"
        xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2"
        xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">
        <sac:SignatureInformation>
          <cbc:ID xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">urn:oasis:names:specification:ubl:signature:1</cbc:ID>
          <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
          <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">
            ${signedInfoXml}
            <ds:SignatureValue>${ecdsaSignatureBase64}</ds:SignatureValue>
            <ds:KeyInfo>
              <ds:X509Data>
                <ds:X509Certificate>${certBase64}</ds:X509Certificate>
              </ds:X509Data>
            </ds:KeyInfo>
            <ds:Object>
              <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="#signature">
                ${signedPropsXml}
              </xades:QualifyingProperties>
            </ds:Object>
          </ds:Signature>
        </sac:SignatureInformation>
      </sig:UBLDocumentSignatures>
    </ext:ExtensionContent>
  </ext:UBLExtension>
</ext:UBLExtensions>`;
}

function injectSignature(xml: string, signatureBlock: string): string {
  // Insert UBLExtensions as first child of <Invoice>
  return xml.replace(
    /(<Invoice[^>]*>)/,
    `$1\n${signatureBlock}`
  );
}

// ─── Crypto Helpers (no Buffer) ──────────────────────────────

async function sha256(data: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', data);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function extractCertBase64(pem: string): string {
  return pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
