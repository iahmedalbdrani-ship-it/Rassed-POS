-- ============================================================
-- Control Panel (رصيد) — Migration 007
-- ─ Extend invoice_status ENUM with 'REFUNDED'
-- ─ RLS policies for invoices / invoice_lines (POS workflow)
-- ─ Enable Supabase Realtime for the invoices feed
-- Run this in your Supabase SQL Editor.
-- ============================================================

-- ─── 1. Extend invoice_status enum ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_type        t
    JOIN   pg_enum        e   ON e.enumtypid = t.oid
    WHERE  t.typname = 'invoice_status'
    AND    e.enumlabel = 'REFUNDED'
  ) THEN
    ALTER TYPE invoice_status ADD VALUE 'REFUNDED';
  END IF;
END $$;

-- ─── 2. Make sure core invoice columns exist ────────────────
ALTER TABLE IF EXISTS invoices
  ADD COLUMN IF NOT EXISTS payment_means TEXT DEFAULT 'CASH',
  ADD COLUMN IF NOT EXISTS qr_code       TEXT;

-- ─── 3. RLS policies ────────────────────────────────────────
ALTER TABLE invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_all_authenticated"      ON invoices;
DROP POLICY IF EXISTS "invoice_lines_all_authenticated" ON invoice_lines;
DROP POLICY IF EXISTS "invoices_all_anon"               ON invoices;
DROP POLICY IF EXISTS "invoice_lines_all_anon"          ON invoice_lines;

CREATE POLICY "invoices_all_authenticated"
  ON invoices FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "invoice_lines_all_authenticated"
  ON invoice_lines FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- POS kiosks may operate with the anon key — allow read & write.
CREATE POLICY "invoices_all_anon"
  ON invoices FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "invoice_lines_all_anon"
  ON invoice_lines FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ─── 4. Realtime publication ────────────────────────────────
-- Add invoices & invoice_lines to the supabase_realtime publication
-- so clients can subscribe to INSERT / UPDATE / DELETE events.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'invoices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'invoice_lines'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE invoice_lines;
  END IF;
END $$;

-- ─── 5. Helpful indexes for the dashboard ───────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date_desc
  ON invoices (issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_number_trgm
  ON invoices USING gin (invoice_number gin_trgm_ops);

-- pg_trgm may not be enabled; guard:
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  END IF;
END $$;
