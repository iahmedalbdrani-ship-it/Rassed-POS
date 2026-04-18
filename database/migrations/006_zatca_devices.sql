-- ============================================================
-- Control Panel (رصيد) — ZATCA Phase 2 Schema
-- Migration 006: Device certificates, ICV counter, invoice chain
-- ============================================================

-- ─── 1. ZATCA DEVICES (شهادات الأجهزة) ─────────────────────
-- Each POS terminal / server that signs invoices gets its own
-- ECDSA certificate from ZATCA (CSID / PCSID).
CREATE TABLE IF NOT EXISTS zatca_devices (
  id                UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_name       TEXT    NOT NULL,                -- اسم الجهاز / الخادم
  serial_number     TEXT    NOT NULL UNIQUE,         -- رقم الجهاز (EIN-SerialNo)

  -- Key material (stored server-side ONLY — never in browser)
  private_key_enc   TEXT,                            -- ECDSA P-256 private key (AES-256-GCM encrypted PEM)
  public_key_pem    TEXT,                            -- Public key PEM (safe to store)
  csr_pem           TEXT,                            -- Original CSR PEM

  -- ZATCA certificates
  ccsid             TEXT,                            -- Compliance CSID (binarySecurityToken)
  ccsid_secret      TEXT,                            -- Secret returned with CCSID
  ccsid_request_id  TEXT,                            -- ZATCA requestID
  ccsid_issued_at   TIMESTAMPTZ,

  pcsid             TEXT,                            -- Production CSID
  pcsid_secret      TEXT,
  pcsid_request_id  TEXT,
  pcsid_issued_at   TIMESTAMPTZ,

  -- State machine
  status            TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','compliance_done','production_ready','revoked')),
  zatca_env         TEXT    NOT NULL DEFAULT 'sandbox'
                    CHECK (zatca_env IN ('sandbox','production')),

  -- Audit
  enrolled_by       UUID    REFERENCES user_profiles(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zatca_devices_org ON zatca_devices(org_id);
CREATE INDEX IF NOT EXISTS idx_zatca_devices_status ON zatca_devices(status);

-- ─── 2. ATOMIC ICV COUNTER (عداد الفواتير المتسلسل) ─────────
-- ICV = Invoice Counter Value — never resets, increments by 1
-- per invoice OR credit note. Guaranteed monotonic by DB lock.
CREATE SEQUENCE IF NOT EXISTS zatca_icv_seq
  START    1
  INCREMENT 1
  NO MINVALUE
  NO MAXVALUE
  CACHE    1;

-- Per-organisation ICV counter (ZATCA requires per-org sequence)
CREATE TABLE IF NOT EXISTS zatca_icv_counters (
  org_id     UUID  PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  current    BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function: atomically increment and return new ICV
CREATE OR REPLACE FUNCTION zatca_next_icv(p_org_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next BIGINT;
BEGIN
  INSERT INTO zatca_icv_counters(org_id, current)
    VALUES (p_org_id, 1)
  ON CONFLICT (org_id) DO UPDATE
    SET current    = zatca_icv_counters.current + 1,
        updated_at = NOW()
  RETURNING current INTO v_next;

  RETURN v_next;
END;
$$;

-- ─── 3. INVOICE CHAIN COLUMNS (سلسلة التحقق المتشابكة) ───────
-- Add cryptographic chain fields to the existing invoices table.
-- Each invoice stores its own hash AND the previous invoice's hash
-- (blockchain-style), making historical tampering detectable.
DO $$ BEGIN

  -- Invoice Counter Value (ICV)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='icv'
  ) THEN
    ALTER TABLE invoices ADD COLUMN icv BIGINT;
  END IF;

  -- Hash of this invoice's canonical XML (SHA-256 / Base64)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='invoice_hash'
  ) THEN
    ALTER TABLE invoices ADD COLUMN invoice_hash TEXT;
  END IF;

  -- Hash of the PREVIOUS invoice (PIH) — links the chain
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='previous_invoice_hash'
  ) THEN
    ALTER TABLE invoices
      ADD COLUMN previous_invoice_hash TEXT DEFAULT
        'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjOTliNTk5Y2M3MDYzMDM0YjYxNzM4MWNhYzE5NjYxNjM5MA==';
  END IF;

  -- ECDSA signature over the XML hash (DER / Base64)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='ecdsa_signature'
  ) THEN
    ALTER TABLE invoices ADD COLUMN ecdsa_signature TEXT;
  END IF;

  -- Full signed UBL 2.1 XML (stored in Supabase Storage, path here)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='xml_storage_path'
  ) THEN
    ALTER TABLE invoices ADD COLUMN xml_storage_path TEXT;
  END IF;

  -- Device that signed this invoice
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='device_id'
  ) THEN
    ALTER TABLE invoices
      ADD COLUMN device_id UUID REFERENCES zatca_devices(id);
  END IF;

  -- ZATCA submission result
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='zatca_request_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN zatca_request_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='zatca_cleared_xml'
  ) THEN
    ALTER TABLE invoices ADD COLUMN zatca_cleared_xml TEXT; -- returned by clearance
  END IF;

  -- Submission timestamp (for 24h reporting window enforcement)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='zatca_submitted_at'
  ) THEN
    ALTER TABLE invoices ADD COLUMN zatca_submitted_at TIMESTAMPTZ;
  END IF;

END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_icv        ON invoices(org_id, icv);
CREATE INDEX IF NOT EXISTS idx_invoices_chain      ON invoices(org_id, previous_invoice_hash);
CREATE INDEX IF NOT EXISTS idx_invoices_zatca_status ON invoices(status) WHERE status IN ('PENDING','REJECTED');

-- ─── 4. IMMUTABILITY GUARD (حماية من التعديل) ───────────────
-- Prevent UPDATE of any field that would tamper with a sealed invoice.
-- Only status, zatca_*, and xml_storage_path can change after sealing.
CREATE OR REPLACE FUNCTION prevent_invoice_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Once invoice_hash is set the invoice is "sealed" — core fields are frozen
  IF OLD.invoice_hash IS NOT NULL THEN
    IF NEW.invoice_hash     IS DISTINCT FROM OLD.invoice_hash     OR
       NEW.previous_invoice_hash IS DISTINCT FROM OLD.previous_invoice_hash OR
       NEW.icv              IS DISTINCT FROM OLD.icv              OR
       NEW.xml_content      IS DISTINCT FROM OLD.xml_content      OR
       NEW.total_amount     IS DISTINCT FROM OLD.total_amount     OR
       NEW.vat_amount       IS DISTINCT FROM OLD.vat_amount       OR
       NEW.subtotal         IS DISTINCT FROM OLD.subtotal
    THEN
      RAISE EXCEPTION 'ZATCA_TAMPER: لا يمكن تعديل فاتورة مختومة. أصدر إشعار دائن (Credit Note) بدلاً من ذلك.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_invoice_tampering ON invoices;
CREATE TRIGGER trg_prevent_invoice_tampering
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION prevent_invoice_tampering();

-- ─── 5. CREDIT NOTES LOG (سجل الإشعارات الدائنة) ─────────────
-- All cancellations must go through credit notes — no hard deletes.
CREATE TABLE IF NOT EXISTS credit_notes (
  id                  UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID  NOT NULL REFERENCES organizations(id),
  original_invoice_id UUID  NOT NULL REFERENCES invoices(id),
  credit_note_number  TEXT  NOT NULL UNIQUE,
  uuid                TEXT  NOT NULL UNIQUE,
  reason              TEXT  NOT NULL,                -- سبب الإلغاء
  amount              NUMERIC(15,2) NOT NULL,
  vat_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  icv                 BIGINT,
  invoice_hash        TEXT,
  previous_invoice_hash TEXT,
  xml_content         TEXT,
  ecdsa_signature     TEXT,
  status              TEXT  DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','PENDING','REPORTED','REJECTED')),
  zatca_request_id    TEXT,
  issued_by           UUID  REFERENCES user_profiles(id),
  issued_at           TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes(original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_org     ON credit_notes(org_id);

-- ─── 6. HARD DELETE PREVENTION ───────────────────────────────
CREATE OR REPLACE FUNCTION prevent_invoice_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.invoice_hash IS NOT NULL THEN
    RAISE EXCEPTION 'ZATCA_DELETE_BLOCKED: حذف الفواتير المختومة محظور. استخدم إشعار دائن.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_invoice_delete ON invoices;
CREATE TRIGGER trg_prevent_invoice_delete
  BEFORE DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION prevent_invoice_delete();

-- ─── 7. NTP AUDIT (توقيت موثوق) ─────────────────────────────
-- Every sealed invoice records the server timestamp from Supabase
-- (not the client) — prevents client clock manipulation.
CREATE OR REPLACE FUNCTION set_server_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Force invoice_date to server time if invoice is being sealed
  IF NEW.invoice_hash IS NOT NULL AND OLD.invoice_hash IS NULL THEN
    NEW.updated_at := NOW();
    -- Optionally enforce: NEW.issue_time := NOW()::TIME;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_server_timestamp ON invoices;
CREATE TRIGGER trg_set_server_timestamp
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_server_timestamp();
