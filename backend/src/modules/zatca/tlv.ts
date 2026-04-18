// ============================================================
// رصيد ERP — ZATCA TLV QR Code Generator
// Phase 2 Compliant | Browser + Node compatible
// ============================================================

export interface ZatcaQrFields {
  sellerName: string;          // Tag 1
  vatRegistrationNumber: string; // Tag 2
  timestamp: string;           // Tag 3 — ISO 8601
  invoiceTotal: string;        // Tag 4
  vatTotal: string;            // Tag 5
}

/**
 * Build a ZATCA-compliant TLV-encoded QR code value.
 * Works in both Node.js (Buffer) and browser (TextEncoder).
 */
export function buildZatcaTLV(fields: ZatcaQrFields): string {
  const entries: [number, string][] = [
    [1, fields.sellerName],
    [2, fields.vatRegistrationNumber],
    [3, fields.timestamp],
    [4, fields.invoiceTotal],
    [5, fields.vatTotal],
  ];

  const chunks: Uint8Array[] = entries.map(([tag, value]) => {
    const valueBytes = new TextEncoder().encode(value);
    const chunk = new Uint8Array(2 + valueBytes.length);
    chunk[0] = tag;
    chunk[1] = valueBytes.length;
    chunk.set(valueBytes, 2);
    return chunk;
  });

  const totalLen = chunks.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return btoa(Array.from(result).map(b => String.fromCharCode(b)).join(''));
}

/** Parse a ZATCA TLV Base64 string back into fields (for verification). */
export function parseTLV(base64: string): Partial<ZatcaQrFields> {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const dec = new TextDecoder();
  const out: Record<number, string> = {};
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i++];
    const len = bytes[i++];
    out[tag] = dec.decode(bytes.slice(i, i + len));
    i += len;
  }
  return {
    sellerName: out[1], vatRegistrationNumber: out[2],
    timestamp: out[3], invoiceTotal: out[4], vatTotal: out[5],
  };
}
