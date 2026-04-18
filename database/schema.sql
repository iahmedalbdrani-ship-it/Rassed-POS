-- ============================================================
-- Control Panel (رصيد) — Complete PostgreSQL Schema
-- Supabase / PostgreSQL  |  ZATCA Phase 2 Ready
-- ============================================================

-- ─── Extensions ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMS ─────────────────────────────────────────────────
CREATE TYPE transaction_type   AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE invoice_type       AS ENUM ('STANDARD', 'SIMPLIFIED', 'CREDIT_NOTE', 'DEBIT_NOTE');
CREATE TYPE invoice_status     AS ENUM ('DRAFT', 'PENDING', 'CLEARED', 'REPORTED', 'REJECTED', 'CANCELLED');
CREATE TYPE account_type       AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE fiscal_period_status AS ENUM ('OPEN', 'CLOSED', 'LOCKED');
CREATE TYPE attachment_type    AS ENUM ('PDF', 'XML', 'IMAGE', 'OTHER');

-- ─── ORGANIZATIONS ─────────────────────────────────────────
CREATE TABLE organizations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_ar           TEXT NOT NULL,
  name_en           TEXT,
  vat_number        TEXT NOT NULL UNIQUE,            -- الرقم الضريبي (15 digits)
  cr_number         TEXT,                             -- السجل التجاري
  address_street    TEXT,
  address_city      TEXT,
  address_country   TEXT DEFAULT 'SA',
  address_postal    TEXT,
  currency          TEXT DEFAULT 'SAR',
  zatca_env         TEXT DEFAULT 'sandbox' CHECK (zatca_env IN ('sandbox', 'production')),
  zatca_cert        TEXT,                             -- X.509 certificate PEM
  zatca_private_key TEXT,                             -- Encrypted ECDSA private key
  pih               TEXT DEFAULT 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjOTliNTk5Y2M3MDYzMDM0YjYxNzM4MWNhYzE5NjYxNjM5MA==',
  invoice_counter   BIGINT DEFAULT 0,
  fiscal_year_start TEXT DEFAULT '01-01',             -- MM-DD
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── USERS / PROFILES ──────────────────────────────────────
CREATE TABLE user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name       TEXT,
  role            TEXT DEFAULT 'accountant' CHECK (role IN ('owner','admin','accountant','viewer')),
  firebase_uid    TEXT UNIQUE,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CHART OF ACCOUNTS ─────────────────────────────────────
CREATE TABLE accounts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,                         -- e.g. "1100"
  name_ar      TEXT NOT NULL,
  name_en      TEXT,
  type         account_type NOT NULL,
  parent_id    UUID REFERENCES accounts(id),
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, code)
);

-- ─── FISCAL PERIODS ────────────────────────────────────────
CREATE TABLE fiscal_periods (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,                         -- e.g. "Q1 2025"
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  status       fiscal_period_status DEFAULT 'OPEN',
  closed_by    UUID REFERENCES user_profiles(id),
  closed_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT   no_overlap UNIQUE (org_id, start_date, end_date)
);

-- ─── CUSTOMERS / SUPPLIERS ─────────────────────────────────
CREATE TABLE parties (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('CUSTOMER', 'SUPPLIER', 'BOTH')),
  name_ar      TEXT NOT NULL,
  name_en      TEXT,
  vat_number   TEXT,
  cr_number    TEXT,
  email        TEXT,
  phone        TEXT,
  address      JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INVOICES ──────────────────────────────────────────────
CREATE TABLE invoices (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id               UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  party_id             UUID REFERENCES parties(id),
  fiscal_period_id     UUID REFERENCES fiscal_periods(id),

  -- ZATCA mandatory fields
  invoice_type         invoice_type NOT NULL DEFAULT 'STANDARD',
  invoice_status       invoice_status DEFAULT 'DRAFT',
  invoice_number       TEXT NOT NULL,                 -- Sequential number
  invoice_counter_value BIGINT,                       -- ICV
  uuid                 UUID DEFAULT uuid_generate_v4(),

  -- Dates
  issue_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  supply_date          DATE,
  due_date             DATE,

  -- Amounts (SAR)
  subtotal             NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount_amount      NUMERIC(18,2) DEFAULT 0,
  taxable_amount       NUMERIC(18,2) GENERATED ALWAYS AS (subtotal - COALESCE(discount_amount,0)) STORED,
  vat_rate             NUMERIC(5,2) DEFAULT 15.00,
  vat_amount           NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount         NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- ZATCA cryptographic fields
  invoice_hash         TEXT,                          -- SHA-256 of canonical XML
  previous_hash        TEXT,                          -- PIH — previous invoice hash
  qr_code              TEXT,                          -- Base64 TLV QR
  digital_signature    TEXT,                          -- ECDSA signature
  zatca_clearance_uuid TEXT,                          -- UUID returned by ZATCA
  zatca_response       JSONB,                         -- Full ZATCA API response
  xml_content          TEXT,                          -- UBL 2.1 XML (raw)
  xml_storage_path     TEXT,                          -- Firebase Storage path
  pdf_storage_path     TEXT,                          -- Firebase Storage path

  -- References for credit/debit notes
  original_invoice_id  UUID REFERENCES invoices(id),
  payment_means        TEXT DEFAULT 'BANK',           -- CASH, BANK, CREDIT_CARD

  notes                TEXT,
  created_by           UUID REFERENCES user_profiles(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (org_id, invoice_number)
);

-- ─── INVOICE LINES ─────────────────────────────────────────
CREATE TABLE invoice_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_number     INT NOT NULL,
  item_name_ar    TEXT NOT NULL,
  item_name_en    TEXT,
  item_code       TEXT,
  quantity        NUMERIC(18,4) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(18,4) NOT NULL,
  discount_pct    NUMERIC(5,2) DEFAULT 0,
  line_subtotal   NUMERIC(18,2) GENERATED ALWAYS AS (quantity * unit_price * (1 - COALESCE(discount_pct,0)/100)) STORED,
  vat_rate        NUMERIC(5,2) DEFAULT 15.00,
  vat_amount      NUMERIC(18,2),
  line_total      NUMERIC(18,2),
  unit_of_measure TEXT DEFAULT 'PCE'
);

-- ─── GENERAL LEDGER ACCOUNTS (الأستاذ العام) ───────────────
CREATE TABLE ledger (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES accounts(id),
  fiscal_period_id UUID REFERENCES fiscal_periods(id),
  transaction_id   UUID,                              -- FK set later after transactions table
  entry_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  description      TEXT,
  debit            NUMERIC(18,2) DEFAULT 0 CHECK (debit >= 0),
  credit           NUMERIC(18,2) DEFAULT 0 CHECK (credit >= 0),
  balance          NUMERIC(18,2),                     -- Running balance (computed by trigger)
  reference        TEXT,                              -- Invoice number or reference
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TRANSACTIONS (القيود المحاسبية) ───────────────────────
CREATE TABLE transactions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id       UUID REFERENCES invoices(id),
  fiscal_period_id UUID REFERENCES fiscal_periods(id),
  entry_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  description      TEXT NOT NULL,
  reference        TEXT,
  is_posted        BOOLEAN DEFAULT FALSE,             -- FALSE = draft
  posted_at        TIMESTAMPTZ,
  created_by       UUID REFERENCES user_profiles(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TRANSACTION LINES (بنود القيد المزدوج) ────────────────
CREATE TABLE transaction_lines (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES accounts(id),
  type           transaction_type NOT NULL,
  amount         NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  description    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK from ledger → transactions
ALTER TABLE ledger ADD CONSTRAINT ledger_transaction_fk
  FOREIGN KEY (transaction_id) REFERENCES transactions(id);

-- ─── AUDIT LOGS ────────────────────────────────────────────
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES user_profiles(id),
  action       TEXT NOT NULL,                         -- INSERT, UPDATE, DELETE, LOGIN, EXPORT
  table_name   TEXT,
  record_id    TEXT,
  old_data     JSONB,
  new_data     JSONB,
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ATTACHMENTS ───────────────────────────────────────────
CREATE TABLE attachments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id      UUID REFERENCES invoices(id) ON DELETE CASCADE,
  transaction_id  UUID REFERENCES transactions(id) ON DELETE CASCADE,
  type            attachment_type NOT NULL,
  file_name       TEXT NOT NULL,
  storage_path    TEXT NOT NULL,                      -- Firebase Storage path
  file_size_bytes BIGINT,
  mime_type       TEXT,
  retention_until DATE GENERATED ALWAYS AS (CURRENT_DATE + INTERVAL '10 years') STORED,
  uploaded_by     UUID REFERENCES user_profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INVENTORY (للـ POS) ───────────────────────────────────
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name_ar       TEXT NOT NULL,
  name_en       TEXT,
  barcode       TEXT,
  sku           TEXT,
  unit_price    NUMERIC(18,4) NOT NULL,
  cost_price    NUMERIC(18,4),
  vat_rate      NUMERIC(5,2) DEFAULT 15.00,
  stock_qty     NUMERIC(18,4) DEFAULT 0,
  min_stock_qty NUMERIC(18,4) DEFAULT 0,
  account_id    UUID REFERENCES accounts(id),         -- Revenue account
  image_path    TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, barcode)
);

-- ─── INDEXES ───────────────────────────────────────────────
CREATE INDEX idx_invoices_org_date     ON invoices(org_id, issue_date DESC);
CREATE INDEX idx_invoices_status       ON invoices(org_id, invoice_status);
CREATE INDEX idx_invoices_party        ON invoices(party_id);
CREATE INDEX idx_ledger_org_account    ON ledger(org_id, account_id);
CREATE INDEX idx_ledger_date           ON ledger(org_id, entry_date DESC);
CREATE INDEX idx_transactions_org      ON transactions(org_id, entry_date DESC);
CREATE INDEX idx_audit_logs_org        ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_products_barcode      ON products(org_id, barcode);

-- ─── UPDATED_AT TRIGGER ────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated  BEFORE UPDATE ON organizations  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_invoices_updated       BEFORE UPDATE ON invoices       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_transactions_updated   BEFORE UPDATE ON transactions   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated       BEFORE UPDATE ON products       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_parties_updated        BEFORE UPDATE ON parties        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_profiles_updated  BEFORE UPDATE ON user_profiles  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
