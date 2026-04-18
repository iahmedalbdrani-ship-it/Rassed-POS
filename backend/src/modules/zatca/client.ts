// ============================================================
// رصيد ERP — ZATCA API Client
// Sandbox + Production | Phase 2 (Clearance & Reporting)
// ============================================================

export type ZatcaEnv = 'sandbox' | 'production';
export type ZatcaSubmissionType = 'clearance' | 'reporting';

export interface ZatcaCredentials {
  certificateContent: string;   // Base64 PEM
  privateKeyContent: string;    // Base64 PEM (encrypted)
  secretKey: string;            // For simplified invoices
}

export interface ZatcaSubmitResult {
  requestId: string;
  status: 'REPORTED' | 'CLEARED' | 'REJECTED' | 'WARNING';
  validationResults?: {
    infoMessages?: ZatcaMessage[];
    warningMessages?: ZatcaMessage[];
    errorMessages?: ZatcaMessage[];
    status: 'PASS' | 'WARNING' | 'ERROR';
  };
  clearedInvoice?: string;  // Returned on clearance
  reportingStatus?: string;
}

interface ZatcaMessage {
  type: string; code: string; category: string; message: string; status: string;
}

const ENDPOINTS: Record<ZatcaEnv, string> = {
  sandbox:    'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

export class ZatcaClient {
  private baseUrl: string;
  private credentials: ZatcaCredentials;

  constructor(env: ZatcaEnv, credentials: ZatcaCredentials) {
    this.baseUrl = ENDPOINTS[env];
    this.credentials = credentials;
  }

  /** Submit a B2B invoice for clearance (فواتير الشركات — المبلغ > 1000 ر.س) */
  async clearInvoice(params: {
    invoiceHash: string;
    uuid: string;
    invoice: string;  // Base64 encoded XML
  }): Promise<ZatcaSubmitResult> {
    return this.post('/invoices/clearance/single', params, {
      'Accept-Version': 'V2',
      'Accept-Language': 'ar',
    });
  }

  /** Submit a B2C simplified invoice for reporting (فاتورة مبسطة) */
  async reportInvoice(params: {
    invoiceHash: string;
    uuid: string;
    invoice: string;  // Base64 encoded XML
  }): Promise<ZatcaSubmitResult> {
    return this.post('/invoices/reporting/single', params, {
      'Accept-Version': 'V2',
      'Accept-Language': 'ar',
    });
  }

  /** Compliance check — validate CSID before going live */
  async checkCompliance(params: { csr: string }): Promise<{ requestID: string; dispositionMessage: string; binarySecurityToken: string }> {
    return this.post('/compliance', params);
  }

  private async post(path: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<any> {
    const token = btoa(`${this.credentials.certificateContent}:${this.credentials.secretKey}`);

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${token}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: response.statusText }));
      throw new ZatcaError(response.status, err.message ?? 'ZATCA request failed', err);
    }

    return response.json();
  }
}

export class ZatcaError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ZatcaError';
  }
}
