-- ============================================================
-- Control Panel (رصيد) — RLS Policies + Accounting Triggers
-- Double-Entry Bookkeeping | Audit Logging | Fiscal Guards
-- ============================================================

-- ─── ROW LEVEL SECURITY: ENABLE ────────────────────────────
ALTER TABLE organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods   ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties          ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger           ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;

-- ─── HELPER: Get current user's org_id ─────────────────────
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT org_id FROM user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ─── HELPER: Is fiscal period open? ────────────────────────
CREATE OR REPLACE FUNCTION is_period_open(period_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT status = 'OPEN' FROM fiscal_periods WHERE id = period_id;
$$;

-- ─── RLS POLICIES: organizations ───────────────────────────
CREATE POLICY org_member_select ON organizations FOR SELECT
  USING (id = get_my_org_id());

CREATE POLICY org_owner_update ON organizations FOR UPDATE
  USING (id = get_my_org_id() AND get_my_role() IN ('owner', 'admin'));

-- ─── RLS POLICIES: user_profiles ───────────────────────────
CREATE POLICY profiles_select ON user_profiles FOR SELECT
  USING (org_id = get_my_org_id());

CREATE POLICY profiles_own_update ON user_profiles FOR UPDATE
  USING (id = auth.uid());

-- ─── RLS POLICIES: Generic org isolation (reusable pattern) ─
-- accounts
CREATE POLICY accounts_org ON accounts FOR ALL USING (org_id = get_my_org_id());

-- fiscal_periods
CREATE POLICY periods_org ON fiscal_periods FOR ALL USING (org_id = get_my_org_id());

-- parties
CREATE POLICY parties_org ON parties FOR ALL USING (org_id = get_my_org_id());

-- products
CREATE POLICY products_org ON products FOR ALL USING (org_id = get_my_org_id());

-- invoices
CREATE POLICY invoices_org_select ON invoices FOR SELECT USING (org_id = get_my_org_id());
CREATE POLICY invoices_org_insert ON invoices FOR INSERT WITH CHECK (org_id = get_my_org_id());
CREATE POLICY invoices_org_update ON invoices FOR UPDATE
  USING (org_id = get_my_org_id() AND invoice_status IN ('DRAFT', 'PENDING'));
CREATE POLICY invoices_org_delete ON invoices FOR DELETE
  USING (org_id = get_my_org_id() AND invoice_status = 'DRAFT' AND get_my_role() IN ('owner','admin'));

-- invoice_lines (inherit through invoice)
CREATE POLICY invoice_lines_org ON invoice_lines FOR ALL
  USING (invoice_id IN (SELECT id FROM invoices WHERE org_id = get_my_org_id()));

-- transactions
CREATE POLICY transactions_org_select ON transactions FOR SELECT USING (org_id = get_my_org_id());
CREATE POLICY transactions_org_insert ON transactions FOR INSERT WITH CHECK (org_id = get_my_org_id());
CREATE POLICY transactions_org_update ON transactions FOR UPDATE
  USING (org_id = get_my_org_id() AND is_posted = FALSE);
CREATE POLICY transactions_org_delete ON transactions FOR DELETE
  USING (org_id = get_my_org_id() AND is_posted = FALSE AND get_my_role() IN ('owner','admin'));

-- transaction_lines
CREATE POLICY tx_lines_org ON transaction_lines FOR ALL
  USING (transaction_id IN (SELECT id FROM transactions WHERE org_id = get_my_org_id()));

-- ledger (read-only for non-owners; written only by triggers)
CREATE POLICY ledger_org_select ON ledger FOR SELECT USING (org_id = get_my_org_id());
CREATE POLICY ledger_org_insert ON ledger FOR INSERT WITH CHECK (org_id = get_my_org_id());

-- audit_logs (insert only, no delete)
CREATE POLICY audit_select ON audit_logs FOR SELECT USING (org_id = get_my_org_id());
CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (org_id = get_my_org_id());

-- attachments
CREATE POLICY attachments_org ON attachments FOR ALL USING (org_id = get_my_org_id());

-- ─── VIEWERS cannot insert/update/delete ───────────────────
CREATE POLICY viewer_no_insert_invoices ON invoices FOR INSERT
  WITH CHECK (get_my_role() != 'viewer');

CREATE POLICY viewer_no_insert_transactions ON transactions FOR INSERT
  WITH CHECK (get_my_role() != 'viewer');

-- ─────────────────────────────────────────────────────────────
-- DOUBLE-ENTRY BOOKKEEPING TRIGGER
-- Fires after an invoice is POSTED (status → CLEARED/REPORTED)
-- Creates balanced debit/credit entries automatically
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_double_entry_on_invoice()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ar_account_id   UUID;  -- Accounts Receivable (1200)
  v_rev_account_id  UUID;  -- Revenue (4100)
  v_vat_account_id  UUID;  -- VAT Payable (2300)
  v_transaction_id  UUID;
  v_period_id       UUID;
BEGIN
  -- Only fire when invoice becomes CLEARED or REPORTED (not on draft)
  IF NEW.invoice_status NOT IN ('CLEARED', 'REPORTED') THEN
    RETURN NEW;
  END IF;
  IF OLD.invoice_status IN ('CLEARED', 'REPORTED') THEN
    RETURN NEW; -- Already posted
  END IF;

  -- Resolve standard account codes for this org
  SELECT id INTO v_ar_account_id  FROM accounts WHERE org_id = NEW.org_id AND code = '1200' LIMIT 1;
  SELECT id INTO v_rev_account_id FROM accounts WHERE org_id = NEW.org_id AND code = '4100' LIMIT 1;
  SELECT id INTO v_vat_account_id FROM accounts WHERE org_id = NEW.org_id AND code = '2300' LIMIT 1;

  -- Get open fiscal period
  SELECT id INTO v_period_id
    FROM fiscal_periods
    WHERE org_id = NEW.org_id AND status = 'OPEN'
      AND start_date <= NEW.issue_date AND end_date >= NEW.issue_date
    LIMIT 1;

  -- Create the journal entry header
  INSERT INTO transactions (
    org_id, invoice_id, fiscal_period_id, entry_date,
    description, reference, is_posted, posted_at, created_by
  ) VALUES (
    NEW.org_id, NEW.id, v_period_id, NEW.issue_date,
    'Auto-entry: Invoice ' || NEW.invoice_number,
    NEW.invoice_number, TRUE, NOW(), NEW.created_by
  ) RETURNING id INTO v_transaction_id;

  -- LINE 1: DEBIT Accounts Receivable (Total Amount incl. VAT)
  IF v_ar_account_id IS NOT NULL THEN
    INSERT INTO transaction_lines (transaction_id, account_id, type, amount, description)
    VALUES (v_transaction_id, v_ar_account_id, 'DEBIT', NEW.total_amount, 'Receivable: ' || NEW.invoice_number);

    INSERT INTO ledger (org_id, account_id, fiscal_period_id, transaction_id, entry_date, description, debit, credit, reference)
    VALUES (NEW.org_id, v_ar_account_id, v_period_id, v_transaction_id, NEW.issue_date,
            'Invoice ' || NEW.invoice_number, NEW.total_amount, 0, NEW.invoice_number);
  END IF;

  -- LINE 2: CREDIT Revenue (Taxable Amount excl. VAT)
  IF v_rev_account_id IS NOT NULL THEN
    INSERT INTO transaction_lines (transaction_id, account_id, type, amount, description)
    VALUES (v_transaction_id, v_rev_account_id, 'CREDIT', NEW.taxable_amount, 'Revenue: ' || NEW.invoice_number);

    INSERT INTO ledger (org_id, account_id, fiscal_period_id, transaction_id, entry_date, description, debit, credit, reference)
    VALUES (NEW.org_id, v_rev_account_id, v_period_id, v_transaction_id, NEW.issue_date,
            'Invoice ' || NEW.invoice_number, 0, NEW.taxable_amount, NEW.invoice_number);
  END IF;

  -- LINE 3: CREDIT VAT Payable
  IF v_vat_account_id IS NOT NULL AND NEW.vat_amount > 0 THEN
    INSERT INTO transaction_lines (transaction_id, account_id, type, amount, description)
    VALUES (v_transaction_id, v_vat_account_id, 'CREDIT', NEW.vat_amount, 'VAT 15%: ' || NEW.invoice_number);

    INSERT INTO ledger (org_id, account_id, fiscal_period_id, transaction_id, entry_date, description, debit, credit, reference)
    VALUES (NEW.org_id, v_vat_account_id, v_period_id, v_transaction_id, NEW.issue_date,
            'VAT Invoice ' || NEW.invoice_number, 0, NEW.vat_amount, NEW.invoice_number);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_double_entry
  AFTER UPDATE OF invoice_status ON invoices
  FOR EACH ROW EXECUTE FUNCTION auto_double_entry_on_invoice();

-- ─── TRIGGER: Validate Balanced Transaction ─────────────────
-- Ensures total DEBITs == total CREDITs before posting
CREATE OR REPLACE FUNCTION validate_balanced_transaction()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total_debit  NUMERIC;
  v_total_credit NUMERIC;
BEGIN
  IF NEW.is_posted = TRUE AND OLD.is_posted = FALSE THEN
    SELECT
      SUM(CASE WHEN type = 'DEBIT'  THEN amount ELSE 0 END),
      SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END)
    INTO v_total_debit, v_total_credit
    FROM transaction_lines WHERE transaction_id = NEW.id;

    IF ABS(COALESCE(v_total_debit,0) - COALESCE(v_total_credit,0)) > 0.01 THEN
      RAISE EXCEPTION 'Unbalanced transaction: Debit=% Credit=%. Must be equal.',
        v_total_debit, v_total_credit;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_balance
  BEFORE UPDATE OF is_posted ON transactions
  FOR EACH ROW EXECUTE FUNCTION validate_balanced_transaction();

-- ─── TRIGGER: Fiscal Period Guard ──────────────────────────
CREATE OR REPLACE FUNCTION guard_closed_period()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.fiscal_period_id IS NOT NULL THEN
    IF NOT is_period_open(NEW.fiscal_period_id) THEN
      RAISE EXCEPTION 'Cannot post to a closed or locked fiscal period.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_period_guard_invoices
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION guard_closed_period();

CREATE TRIGGER trg_period_guard_transactions
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION guard_closed_period();

-- ─── TRIGGER: Audit Log (generic) ──────────────────────────
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org UUID;
BEGIN
  v_org := COALESCE(NEW.org_id, OLD.org_id);
  INSERT INTO audit_logs (org_id, user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    v_org,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id::TEXT, OLD.id::TEXT),
    CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_transactions
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- ─── TRIGGER: Invoice Counter (ICV) ────────────────────────
CREATE OR REPLACE FUNCTION set_invoice_counter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_counter BIGINT;
BEGIN
  UPDATE organizations
    SET invoice_counter = invoice_counter + 1
    WHERE id = NEW.org_id
    RETURNING invoice_counter INTO v_counter;
  NEW.invoice_counter_value := v_counter;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoice_counter
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_invoice_counter();

-- ─── TRIGGER: Stock update on invoice post ─────────────────
CREATE OR REPLACE FUNCTION update_stock_on_invoice()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.invoice_status IN ('CLEARED', 'REPORTED') AND
     OLD.invoice_status NOT IN ('CLEARED', 'REPORTED') THEN
    UPDATE products p
    SET stock_qty = stock_qty - il.quantity
    FROM invoice_lines il
    WHERE il.invoice_id = NEW.id
      AND il.item_code = p.sku
      AND p.org_id = NEW.org_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_update
  AFTER UPDATE OF invoice_status ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_stock_on_invoice();

-- ─── DEFAULT CHART OF ACCOUNTS (insert after org creation) ──
CREATE OR REPLACE FUNCTION seed_default_accounts(p_org_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO accounts (org_id, code, name_ar, name_en, type) VALUES
    -- Assets
    (p_org_id, '1100', 'الصندوق',              'Cash',                        'ASSET'),
    (p_org_id, '1110', 'البنك',                'Bank',                        'ASSET'),
    (p_org_id, '1200', 'ذمم مدينة',            'Accounts Receivable',         'ASSET'),
    (p_org_id, '1300', 'المخزون',              'Inventory',                   'ASSET'),
    (p_org_id, '1400', 'مصروفات مدفوعة مقدماً','Prepaid Expenses',            'ASSET'),
    -- Liabilities
    (p_org_id, '2100', 'ذمم دائنة',            'Accounts Payable',            'LIABILITY'),
    (p_org_id, '2200', 'قروض قصيرة الأجل',    'Short-term Loans',            'LIABILITY'),
    (p_org_id, '2300', 'ضريبة القيمة المضافة', 'VAT Payable',                 'LIABILITY'),
    (p_org_id, '2400', 'مستحقات الموظفين',    'Accrued Salaries',            'LIABILITY'),
    -- Equity
    (p_org_id, '3100', 'رأس المال',            'Capital',                     'EQUITY'),
    (p_org_id, '3200', 'الأرباح المحتجزة',    'Retained Earnings',           'EQUITY'),
    -- Revenue
    (p_org_id, '4100', 'إيرادات المبيعات',    'Sales Revenue',               'REVENUE'),
    (p_org_id, '4200', 'إيرادات أخرى',        'Other Revenue',               'REVENUE'),
    -- Expenses
    (p_org_id, '5100', 'تكلفة البضاعة المباعة','Cost of Goods Sold',          'EXPENSE'),
    (p_org_id, '5200', 'مصروفات الرواتب',     'Salary Expenses',             'EXPENSE'),
    (p_org_id, '5300', 'مصروفات الإيجار',     'Rent Expenses',               'EXPENSE'),
    (p_org_id, '5400', 'مصروفات أخرى',        'Other Expenses',              'EXPENSE')
  ON CONFLICT (org_id, code) DO NOTHING;
END;
$$;
