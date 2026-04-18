# نظام رصيد ERP — Architecture Document
> Production-Ready Saudi ERP System | ZATCA Phase 2 Compliant

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     رصيد ERP System                         │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Dashboard │  │   POS    │  │Invoicing │  │Accounting│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐  ┌──────────┐                                 │
│  │Reporting │  │Settings  │                                 │
│  └──────────┘  └──────────┘                                 │
│                                                             │
│           React (Vite) + TypeScript Frontend                │
└─────────────────────────────────────────────────────────────┘
              │                        │
              ▼                        ▼
┌─────────────────────┐    ┌─────────────────────┐
│   Node.js Backend   │    │   Supabase / PG      │
│   (NestJS/Express)  │    │   PostgreSQL DB      │
│   TypeScript        │    │   (Source of Truth)  │
└─────────────────────┘    └─────────────────────┘
              │                        
              ▼                        
┌─────────────────────────────────────────┐
│         External Integrations           │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │  ZATCA   │  │  FATOORA Platform    │ │
│  │  Phase 2 │  │  (e-Invoice Portal)  │ │
│  └──────────┘  └──────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + Vite + TypeScript | SPA Interface |
| Styling | Tailwind CSS v4 + Custom CSS | Glassmorphism UI |
| Icons | Lucide React | UI Icons |
| Charts | Recharts | Financial Charts |
| Barcode | jsbarcode + qrcode | Invoice Codes |
| PDF | jsPDF + html2canvas | Invoice Export |
| Backend | Node.js + Express + TypeScript | REST API |
| ORM | Drizzle ORM | Type-safe DB |
| Database | PostgreSQL (Supabase) | Primary Data Store |
| Auth/Storage | Firebase | Auth + PDF Storage + FCM |
| Cache | Redis | Session + Rate Limiting |
| Queue | BullMQ | ZATCA Async Processing |

---

## 3. Module Architecture

```
src/
├── modules/
│   ├── accounting/          # محرك المحاسبة
│   │   ├── engine.ts        # Double Entry Engine
│   │   ├── accounts.ts      # Chart of Accounts
│   │   ├── journal.ts       # Journal Entries
│   │   └── balance.ts       # Trial Balance
│   │
│   ├── invoicing/           # نظام الفواتير
│   │   ├── invoice.ts       # Invoice CRUD
│   │   ├── generator.ts     # Invoice Generator
│   │   ├── qr.ts            # QR Code (ZATCA TLV)
│   │   └── pdf.ts           # PDF Export
│   │
│   ├── zatca/               # تكامل هيئة الزكاة
│   │   ├── client.ts        # ZATCA API Client
│   │   ├── signing.ts       # ECDSA Digital Signing
│   │   ├── xml.ts           # UBL 2.1 XML Generator
│   │   └── tlv.ts           # TLV QR Encoding
│   │
│   ├── fatoora/             # منصة فاتورة
│   │   ├── client.ts        # FATOORA API Client
│   │   └── tracker.ts       # Submission Tracker
│   │
│   ├── reporting/           # التقارير المالية
│   │   ├── income.ts        # Profit & Loss
│   │   ├── balance-sheet.ts # Balance Sheet
│   │   ├── trial-balance.ts # Trial Balance
│   │   └── cashflow.ts      # Cash Flow
│   │
│   └── pos/                 # نقطة البيع
│       ├── products.ts      # Products & Inventory
│       ├── cart.ts          # Cart Management
│       └── sale.ts          # Sale Processing
│
├── shared/
│   ├── db/                  # Database Connection
│   ├── types/               # TypeScript Types
│   ├── middleware/          # Auth, Validation
│   └── utils/               # Helpers
└── app.ts                   # Entry Point
```

---

## 4. Database Entity Relationship

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   companies  │────<│   fiscal_years   │     │    users     │
│   (tenants)  │     └──────────────────┘     │  (staff)     │
└──────┬───────┘                              └──────┬───────┘
       │                                             │
       ▼                                             ▼
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   accounts   │────<│ journal_entries  │     │  audit_logs  │
│ (CoA Tree)   │     │  (debit/credit)  │     └──────────────┘
└──────────────┘     └────────┬─────────┘
                              │
                              ▼
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  customers   │────<│    invoices      │────<│invoice_items │
└──────────────┘     └────────┬─────────┘     └──────────────┘
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
             ┌──────────┐        ┌──────────────┐
             │ zatca_   │        │  fatoora_    │
             │ submissions│      │  submissions │
             └──────────┘        └──────────────┘
```

---

## 5. Double Entry Accounting Engine

### Core Rules
```typescript
// Rule 1: Every transaction MUST balance
sum(debits) === sum(credits)  // ALWAYS

// Rule 2: Account Types
ASSET      → Debit increases, Credit decreases
LIABILITY  → Credit increases, Debit decreases
EQUITY     → Credit increases, Debit decreases
REVENUE    → Credit increases, Debit decreases
EXPENSE    → Debit increases, Credit decreases

// Rule 3: VAT is always 15% in Saudi Arabia
VAT_RATE = 0.15
```

### Invoice → Journal Entry Flow
```
Customer Sale (Cash):
DR  النقدية/Cash           1,150 SAR
  CR  المبيعات/Revenue           1,000 SAR
  CR  ضريبة القيمة المضافة/VAT     150 SAR

Customer Sale (Credit):
DR  المدينون/Accounts Receivable  1,150 SAR
  CR  المبيعات/Revenue                1,000 SAR
  CR  ضريبة القيمة المضافة/VAT          150 SAR
```

---

## 6. ZATCA Phase 2 Integration Flow

```
┌─────────────┐
│ Create      │
│ Invoice     │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────────────┐
│ Generate    │────>│ UBL 2.1 XML          │
│ XML         │     │ (Invoice Structure)  │
└──────┬──────┘     └──────────────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────────────┐
│ Digital     │────>│ ECDSA Signature      │
│ Signing     │     │ (SHA-256 + secp256k1)│
└──────┬──────┘     └──────────────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────────────┐
│ Generate    │────>│ TLV Encoded QR       │
│ QR Code     │     │ (Base64 Encoded)     │
└──────┬──────┘     └──────────────────────┘
       │
       ▼
┌─────────────┐
│ Submit to   │     Status:
│ ZATCA       │────>│ REPORTED ✓
│ Sandbox     │     │ CLEARED ✓
└─────────────┘     │ REJECTED ✗
                    │ WARNING ⚠
```

### TLV QR Code Fields (ZATCA Standard)
```
Tag 1: Seller Name (Arabic)
Tag 2: VAT Registration Number (15 digits)
Tag 3: Invoice Timestamp (ISO 8601)
Tag 4: Invoice Total (with VAT)
Tag 5: VAT Amount
```

---

## 7. API Endpoints

### Accounting
```
GET    /api/accounts              # Chart of Accounts Tree
POST   /api/accounts              # Create Account
PUT    /api/accounts/:id          # Update Account
GET    /api/journal-entries       # List Journal Entries
POST   /api/journal-entries       # Create Manual Entry
GET    /api/trial-balance         # Trial Balance Report
```

### Invoicing
```
GET    /api/invoices               # List Invoices
POST   /api/invoices               # Create Invoice
GET    /api/invoices/:id           # Get Invoice
GET    /api/invoices/:id/pdf       # Download PDF
GET    /api/invoices/:id/qr        # Get QR Code
POST   /api/invoices/:id/submit    # Submit to ZATCA
```

### POS
```
GET    /api/products               # List Products
POST   /api/sales                  # Process Sale
GET    /api/sales/today            # Today's Sales
```

### Reports
```
GET    /api/reports/profit-loss    # P&L Report
GET    /api/reports/balance-sheet  # Balance Sheet
GET    /api/reports/trial-balance  # Trial Balance
GET    /api/reports/cash-flow      # Cash Flow
```

---

## 8. Security Architecture

```
┌─────────────────────────────────────────────┐
│               Security Layers               │
│                                             │
│  L1: Firebase Authentication (JWT)          │
│  L2: Role-Based Access Control (RBAC)       │
│      ├── Admin   (full access)              │
│      ├── Accountant (accounts + reports)   │
│      └── Cashier  (POS only)               │
│  L3: Row-Level Security (Multi-Tenant)      │
│  L4: Audit Log (every action logged)        │
│  L5: ZATCA Certificate Encryption           │
└─────────────────────────────────────────────┘
```

---

## 9. Performance Targets

| Metric | Target |
|--------|--------|
| POS Transaction | < 200ms |
| Invoice Generation | < 500ms |
| Dashboard Load | < 1s |
| ZATCA Submission | < 3s |
| Report Generation | < 2s |

---

## 10. Multi-Tenant Architecture (Future SaaS)

```
company_id (UUID) → Row-Level Security on ALL tables
├── Schema isolation per tenant
├── Separate ZATCA certificates per company
├── Independent Chart of Accounts
└── Isolated audit logs
```

---
*نظام رصيد ERP — Control Panel v1.0*
*Compliant with ZATCA Phase 2 Standards*
