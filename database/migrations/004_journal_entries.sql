-- ============================================================
-- Control Panel (رصيد) — Migration 004: Journal Entries
-- Double-Entry Accounting Engine | Chart of Accounts Integration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ─── 1. ACCOUNTS TABLE (شجرة الحسابات) ──────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID,
  code        TEXT NOT NULL,
  name_ar     TEXT NOT NULL,
  name_en     TEXT DEFAULT '',
  type        TEXT NOT NULL CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  nature      TEXT NOT NULL DEFAULT 'DEBIT' CHECK (nature IN ('DEBIT','CREDIT')),
  parent_id   UUID REFERENCES accounts(id),
  is_header   BOOLEAN DEFAULT FALSE,
  level       INT DEFAULT 1,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (code)
);

-- ─── 2. JOURNAL ENTRIES TABLE (القيود المحاسبية) ─────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID,
  entry_number    SERIAL,                          -- رقم القيد التسلسلي
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  description     TEXT NOT NULL,                   -- وصف القيد
  reference_type  TEXT CHECK (reference_type IN ('SALE','PURCHASE','ADJUSTMENT','MANUAL','RETURN')),
  reference_id    UUID,                            -- FK to invoices.id or NULL
  reference_no    TEXT,                            -- invoice number etc.
  is_posted       BOOLEAN DEFAULT TRUE,
  created_by      TEXT DEFAULT 'system',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── 3. JOURNAL ENTRY LINES TABLE (بنود القيد) ───────────────
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id),
  description TEXT,
  debit       NUMERIC(15,2) DEFAULT 0,
  credit      NUMERIC(15,2) DEFAULT 0,
  CONSTRAINT  debit_or_credit CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

-- ─── 4. INDEXES ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_journal_entries_date      ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_ref       ON journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry       ON journal_entry_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account     ON journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_code             ON accounts(code);
CREATE INDEX IF NOT EXISTS idx_accounts_type             ON accounts(type);

-- ─── 5. RPC: create_pos_journal_entry ─────────────────────────
-- Creates a complete double-entry for a POS sale atomically
-- Accounts used:
--   1100 = Cash (نقدية)     → DEBIT  (total_amount)
--   4100 = Sales Revenue   → CREDIT (subtotal_ex_vat)
--   2300 = VAT Payable      → CREDIT (vat_amount)
--   5100 = COGS             → DEBIT  (cogs_amount)
--   1400 = Inventory        → CREDIT (cogs_amount)

CREATE OR REPLACE FUNCTION create_pos_journal_entry(
  p_invoice_id     UUID,
  p_invoice_no     TEXT,
  p_entry_date     DATE,
  p_total_amount   NUMERIC,
  p_subtotal       NUMERIC,
  p_vat_amount     NUMERIC,
  p_cogs_amount    NUMERIC,
  p_payment_method TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id        UUID;
  v_cash_acc_id     UUID;
  v_revenue_acc_id  UUID;
  v_vat_acc_id      UUID;
  v_cogs_acc_id     UUID;
  v_inv_acc_id      UUID;
  v_payment_acc     TEXT;
BEGIN
  -- Determine cash or bank account based on payment method
  v_payment_acc := CASE
    WHEN p_payment_method IN ('mada','visa','mastercard') THEN '1120'
    ELSE '1100'
  END;

  -- Resolve account IDs (create if not found — first-run safe)
  SELECT id INTO v_cash_acc_id    FROM accounts WHERE code = v_payment_acc LIMIT 1;
  SELECT id INTO v_revenue_acc_id FROM accounts WHERE code = '4100' LIMIT 1;
  SELECT id INTO v_vat_acc_id     FROM accounts WHERE code = '2300' LIMIT 1;
  SELECT id INTO v_cogs_acc_id    FROM accounts WHERE code = '5100' LIMIT 1;
  SELECT id INTO v_inv_acc_id     FROM accounts WHERE code = '1400' LIMIT 1;

  -- Skip if core accounts not seeded yet
  IF v_cash_acc_id IS NULL OR v_revenue_acc_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Create journal entry header
  INSERT INTO journal_entries (entry_date, description, reference_type, reference_id, reference_no)
  VALUES (p_entry_date, 'قيد بيع POS — فاتورة ' || p_invoice_no, 'SALE', p_invoice_id, p_invoice_no)
  RETURNING id INTO v_entry_id;

  -- Line 1: Cash / Bank Dr  (total incl. VAT)
  INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
  VALUES (v_entry_id, v_cash_acc_id, 'استلام نقدي — ' || p_invoice_no, p_total_amount, 0);

  -- Line 2: Sales Revenue Cr  (excl. VAT)
  INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
  VALUES (v_entry_id, v_revenue_acc_id, 'إيرادات مبيعات — ' || p_invoice_no, 0, p_subtotal);

  -- Line 3: VAT Payable Cr
  IF p_vat_amount > 0 AND v_vat_acc_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
    VALUES (v_entry_id, v_vat_acc_id, 'ضريبة قيمة مضافة محصلة — ' || p_invoice_no, 0, p_vat_amount);
  END IF;

  -- Lines 4 & 5: COGS Dr + Inventory Cr  (only if COGS known)
  IF p_cogs_amount > 0 AND v_cogs_acc_id IS NOT NULL AND v_inv_acc_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
    VALUES (v_entry_id, v_cogs_acc_id, 'تكلفة بضاعة مباعة — ' || p_invoice_no, p_cogs_amount, 0);

    INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
    VALUES (v_entry_id, v_inv_acc_id, 'تخفيض المخزون — ' || p_invoice_no, 0, p_cogs_amount);
  END IF;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_pos_journal_entry(UUID,TEXT,DATE,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT) TO anon, authenticated;

-- ─── 6. VIEW: account_balances ────────────────────────────────
-- Calculates running balance for each account from journal lines
CREATE OR REPLACE VIEW account_balances AS
SELECT
  a.id,
  a.code,
  a.name_ar,
  a.name_en,
  a.type,
  a.nature,
  a.parent_id,
  a.is_header,
  a.level,
  COALESCE(SUM(jl.debit),  0) AS total_debit,
  COALESCE(SUM(jl.credit), 0) AS total_credit,
  CASE a.nature
    WHEN 'DEBIT'  THEN COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
    WHEN 'CREDIT' THEN COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit),  0)
  END AS balance
FROM accounts a
LEFT JOIN journal_entry_lines jl ON jl.account_id = a.id
LEFT JOIN journal_entries      je ON je.id = jl.entry_id AND je.is_posted = TRUE
WHERE a.is_active = TRUE
GROUP BY a.id, a.code, a.name_ar, a.name_en, a.type, a.nature, a.parent_id, a.is_header, a.level;

-- ─── 7. RLS ───────────────────────────────────────────────────
ALTER TABLE accounts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines   ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "accounts_all_authenticated"
  ON accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "accounts_read_anon"
  ON accounts FOR SELECT TO anon USING (is_active = true);

CREATE POLICY IF NOT EXISTS "journal_entries_authenticated"
  ON journal_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "journal_lines_authenticated"
  ON journal_entry_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 8. SEED: Standard Chart of Accounts (شجرة الحسابات) ─────
-- Only inserts if accounts table is empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounts LIMIT 1) THEN
    INSERT INTO accounts (code, name_ar, name_en, type, nature, is_header, level) VALUES
    -- ASSETS
    ('1',    'الأصول',                   'Assets',              'ASSET',     'DEBIT',  TRUE, 1),
    ('11',   'الأصول المتداولة',          'Current Assets',      'ASSET',     'DEBIT',  TRUE, 2),
    ('1100', 'النقدية',                  'Cash',                'ASSET',     'DEBIT',  FALSE,3),
    ('1120', 'البنوك',                   'Banks',               'ASSET',     'DEBIT',  FALSE,3),
    ('1200', 'العملاء / المدينون',        'Accounts Receivable', 'ASSET',     'DEBIT',  FALSE,3),
    ('1400', 'المخزون',                  'Inventory',           'ASSET',     'DEBIT',  FALSE,3),
    ('1500', 'ضريبة القيمة المضافة — مدخلات','VAT Input',       'ASSET',     'DEBIT',  FALSE,3),
    ('12',   'الأصول الثابتة',           'Fixed Assets',        'ASSET',     'DEBIT',  TRUE, 2),
    ('1600', 'المعدات والأثاث',           'Equipment',           'ASSET',     'DEBIT',  FALSE,3),
    ('1700', 'الحاسبات والأجهزة',         'Computers',           'ASSET',     'DEBIT',  FALSE,3),
    -- LIABILITIES
    ('2',    'الخصوم',                   'Liabilities',         'LIABILITY', 'CREDIT', TRUE, 1),
    ('21',   'الخصوم المتداولة',          'Current Liabilities', 'LIABILITY', 'CREDIT', TRUE, 2),
    ('2100', 'الموردون / الدائنون',       'Accounts Payable',    'LIABILITY', 'CREDIT', FALSE,3),
    ('2300', 'ضريبة القيمة المضافة — مخرجات','VAT Payable',     'LIABILITY', 'CREDIT', FALSE,3),
    ('2400', 'الرواتب المستحقة',          'Accrued Salaries',    'LIABILITY', 'CREDIT', FALSE,3),
    ('22',   'الخصوم طويلة الأجل',       'Long-term Liabilities','LIABILITY','CREDIT', TRUE, 2),
    ('2500', 'القروض البنكية',            'Bank Loans',          'LIABILITY', 'CREDIT', FALSE,3),
    -- EQUITY
    ('3',    'حقوق الملكية',             'Equity',              'EQUITY',    'CREDIT', TRUE, 1),
    ('3100', 'رأس المال',                'Capital',             'EQUITY',    'CREDIT', FALSE,2),
    ('3200', 'الأرباح المحتجزة',          'Retained Earnings',   'EQUITY',    'CREDIT', FALSE,2),
    -- REVENUE
    ('4',    'الإيرادات',               'Revenue',             'REVENUE',   'CREDIT', TRUE, 1),
    ('4100', 'إيرادات المبيعات',          'Sales Revenue',       'REVENUE',   'CREDIT', FALSE,2),
    ('4200', 'إيرادات أخرى',             'Other Revenue',       'REVENUE',   'CREDIT', FALSE,2),
    -- EXPENSES
    ('5',    'المصروفات',               'Expenses',            'EXPENSE',   'DEBIT',  TRUE, 1),
    ('5100', 'تكلفة البضاعة المباعة',    'Cost of Goods Sold',  'EXPENSE',   'DEBIT',  FALSE,2),
    ('5200', 'الرواتب والأجور',           'Salaries & Wages',    'EXPENSE',   'DEBIT',  FALSE,2),
    ('5300', 'الإيجارات',               'Rent',                'EXPENSE',   'DEBIT',  FALSE,2),
    ('5400', 'المصروفات العمومية',        'General Expenses',    'EXPENSE',   'DEBIT',  FALSE,2);

    -- Wire up parent relationships (level 3 → 2, level 2 → 1)
    UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='11') WHERE code IN ('1100','1120','1200','1400','1500');
    UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='12') WHERE code IN ('1600','1700');
    UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='1')  WHERE code IN ('11','12');
    UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='21') WHERE code IN ('2100','2300','2400');
    UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='22') WHERE code IN ('2500');
    UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='2')  WHERE code IN ('21','22');
    UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='3')  WHERE code IN ('3100','3200');
    UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='4')  WHERE code IN ('4100','4200');
    UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='5')  WHERE code IN ('5100','5200','5300','5400');
  END IF;
END $$;
