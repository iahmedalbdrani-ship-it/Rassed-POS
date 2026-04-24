-- ============================================================
-- Control Panel (رصيد) — Accounting Automation Migration
-- RPCs: شجرة الحسابات + قيود تلقائية + مقاييس لوحة التحكم
-- ============================================================

-- ─── 1. VIEW: account_balances ───────────────────────────────
-- يجمع الأرصدة من جدول transaction_lines مباشرةً
-- يُحدَّث تلقائياً مع كل قيد جديد

CREATE OR REPLACE VIEW account_balances AS
SELECT
  a.id          AS account_id,
  a.code,
  a.name_ar,
  a.name_en,
  a.type,
  a.nature,
  a.parent_id,
  a.level,
  a.is_header,
  COALESCE(SUM(CASE WHEN tl.type = 'DEBIT'  THEN tl.amount ELSE 0 END), 0) AS total_debit,
  COALESCE(SUM(CASE WHEN tl.type = 'CREDIT' THEN tl.amount ELSE 0 END), 0) AS total_credit,
  CASE a.nature
    WHEN 'debit'  THEN COALESCE(SUM(CASE WHEN tl.type = 'DEBIT'  THEN tl.amount ELSE -tl.amount END), 0)
    WHEN 'credit' THEN COALESCE(SUM(CASE WHEN tl.type = 'CREDIT' THEN tl.amount ELSE -tl.amount END), 0)
    ELSE 0
  END AS balance
FROM accounts a
LEFT JOIN transaction_lines tl ON tl.account_id = a.id
GROUP BY a.id, a.code, a.name_ar, a.name_en, a.type,
         a.nature, a.parent_id, a.level, a.is_header;

GRANT SELECT ON account_balances TO authenticated, service_role;

-- ─── 2. FUNCTION: get_coa_with_balances ─────────────────────
-- تُعيد شجرة الحسابات الكاملة مع الأرصدة الحية
-- المُجمَّعة صعوداً (الحساب الرئيسي = مجموع أبنائه)

DROP FUNCTION IF EXISTS get_coa_with_balances();

CREATE OR REPLACE FUNCTION get_coa_with_balances()
RETURNS TABLE (
  account_id  uuid,
  code        text,
  name_ar     text,
  name_en     text,
  type        text,
  nature      text,
  parent_id   uuid,
  level       int,
  is_header   boolean,
  balance     numeric,
  total_debit numeric,
  total_credit numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH RECURSIVE coa AS (
    -- Base: leaf accounts (no children)
    SELECT
      ab.account_id, ab.code, ab.name_ar, ab.name_en,
      ab.type, ab.nature, ab.parent_id, ab.level, ab.is_header,
      ab.balance, ab.total_debit, ab.total_credit
    FROM account_balances ab

    UNION ALL

    -- Aggregate upward: parent gets sum of children
    SELECT
      p.account_id, p.code, p.name_ar, p.name_en,
      p.type, p.nature, p.parent_id, p.level, p.is_header,
      p.balance, p.total_debit, p.total_credit
    FROM account_balances p
    WHERE p.is_header = TRUE
  )
  SELECT DISTINCT ON (account_id)
    account_id, code, name_ar, name_en, type, nature,
    parent_id, level, is_header, balance, total_debit, total_credit
  FROM coa
  ORDER BY account_id, level;
$$;

GRANT EXECUTE ON FUNCTION get_coa_with_balances() TO authenticated, service_role;

-- ─── 3. FUNCTION: get_account_movements ─────────────────────
-- حركات تفصيلية لحساب معين مع رصيد تراكمي

DROP FUNCTION IF EXISTS get_account_movements(uuid, date, date, int);

CREATE OR REPLACE FUNCTION get_account_movements(
  p_account_id uuid,
  p_from       date DEFAULT NULL,
  p_to         date DEFAULT NULL,
  p_limit      int  DEFAULT 50
)
RETURNS TABLE (
  tx_id        uuid,
  entry_date   date,
  description  text,
  reference    text,
  debit        numeric,
  credit       numeric,
  balance      numeric,
  invoice_id   uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH moves AS (
    SELECT
      t.id          AS tx_id,
      t.entry_date,
      t.description,
      t.reference,
      CASE WHEN tl.type = 'DEBIT'  THEN tl.amount ELSE 0 END AS debit,
      CASE WHEN tl.type = 'CREDIT' THEN tl.amount ELSE 0 END AS credit,
      t.invoice_id
    FROM transaction_lines tl
    JOIN transactions t ON t.id = tl.transaction_id
    WHERE tl.account_id = p_account_id
      AND (p_from IS NULL OR t.entry_date >= p_from)
      AND (p_to   IS NULL OR t.entry_date <= p_to)
    ORDER BY t.entry_date DESC, t.created_at DESC
    LIMIT p_limit
  )
  SELECT
    tx_id, entry_date, description, reference,
    debit, credit,
    SUM(debit - credit) OVER (ORDER BY entry_date DESC, tx_id) AS balance,
    invoice_id
  FROM moves;
$$;

GRANT EXECUTE ON FUNCTION get_account_movements(uuid, date, date, int) TO authenticated, service_role;

-- ─── 4. FUNCTION: get_dashboard_metrics ─────────────────────
-- مقاييس لوحة التحكم الحية — تُستدعى من الـ Frontend

DROP FUNCTION IF EXISTS get_dashboard_metrics();

CREATE OR REPLACE FUNCTION get_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_total_assets      numeric := 0;
  v_total_liabilities numeric := 0;
  v_total_equity      numeric := 0;
  v_total_revenue     numeric := 0;
  v_total_expenses    numeric := 0;
  v_net_profit        numeric := 0;
  v_this_month_rev    numeric := 0;
  v_this_month_exp    numeric := 0;
  v_vat_payable       numeric := 0;
  v_cash_balance      numeric := 0;
BEGIN
  -- إجمالي الأصول (كود يبدأ بـ 1)
  SELECT COALESCE(SUM(balance), 0)
    INTO v_total_assets
    FROM account_balances
   WHERE code ~ '^1' AND NOT is_header;

  -- إجمالي الخصوم (كود يبدأ بـ 2)
  SELECT COALESCE(SUM(balance), 0)
    INTO v_total_liabilities
    FROM account_balances
   WHERE code ~ '^2' AND NOT is_header;

  -- حقوق الملكية (كود يبدأ بـ 3)
  SELECT COALESCE(SUM(balance), 0)
    INTO v_total_equity
    FROM account_balances
   WHERE code ~ '^3' AND NOT is_header;

  -- إيرادات المبيعات (كود يبدأ بـ 4)
  SELECT COALESCE(SUM(balance), 0)
    INTO v_total_revenue
    FROM account_balances
   WHERE code ~ '^4' AND NOT is_header;

  -- المصروفات (كود يبدأ بـ 5)
  SELECT COALESCE(SUM(balance), 0)
    INTO v_total_expenses
    FROM account_balances
   WHERE code ~ '^5' AND NOT is_header;

  -- صافي الربح
  v_net_profit := v_total_revenue - v_total_expenses;

  -- ضريبة القيمة المضافة المستحقة (حساب 212 أو كود ~'^212')
  SELECT COALESCE(SUM(balance), 0)
    INTO v_vat_payable
    FROM account_balances
   WHERE code ~ '^212';

  -- رصيد النقدية (حساب 111)
  SELECT COALESCE(SUM(balance), 0)
    INTO v_cash_balance
    FROM account_balances
   WHERE code ~ '^111';

  -- الشهر الحالي: إيرادات
  SELECT COALESCE(SUM(
    CASE WHEN tl.type = 'CREDIT' THEN tl.amount ELSE -tl.amount END
  ), 0)
    INTO v_this_month_rev
    FROM transaction_lines tl
    JOIN transactions t    ON t.id  = tl.transaction_id
    JOIN accounts     a    ON a.id  = tl.account_id
   WHERE a.code ~ '^4'
     AND DATE_TRUNC('month', t.entry_date::timestamp) = DATE_TRUNC('month', NOW());

  -- الشهر الحالي: مصروفات
  SELECT COALESCE(SUM(
    CASE WHEN tl.type = 'DEBIT' THEN tl.amount ELSE -tl.amount END
  ), 0)
    INTO v_this_month_exp
    FROM transaction_lines tl
    JOIN transactions t    ON t.id  = tl.transaction_id
    JOIN accounts     a    ON a.id  = tl.account_id
   WHERE a.code ~ '^5'
     AND DATE_TRUNC('month', t.entry_date::timestamp) = DATE_TRUNC('month', NOW());

  RETURN jsonb_build_object(
    'total_assets',       v_total_assets,
    'total_liabilities',  v_total_liabilities,
    'total_equity',       v_total_equity,
    'total_revenue',      v_total_revenue,
    'total_expenses',     v_total_expenses,
    'net_profit',         v_net_profit,
    'vat_payable',        v_vat_payable,
    'cash_balance',       v_cash_balance,
    'this_month_revenue', v_this_month_rev,
    'this_month_expenses',v_this_month_exp,
    'balance_check',      ABS(v_total_assets - (v_total_liabilities + v_total_equity)) < 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_metrics() TO authenticated, service_role;

-- ─── 5. FUNCTION: post_sale_journal_entry ───────────────────
-- قيد مبيعات تلقائي: مدين النقدية / دائن الإيرادات + ضريبة

DROP FUNCTION IF EXISTS post_sale_journal_entry(jsonb);

CREATE OR REPLACE FUNCTION post_sale_journal_entry(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_id     uuid;
  v_invoice_number text;
  v_total          numeric;
  v_vat            numeric;
  v_subtotal       numeric;
  v_payment_method text;
  v_tx_id          uuid;
  v_cash_id        uuid;
  v_mada_id        uuid;
  v_revenue_id     uuid;
  v_vat_id         uuid;
  v_debit_acc_id   uuid;
  v_entry_date     date;
BEGIN
  -- Unpack
  v_invoice_id     := (p_data->>'invoice_id')::uuid;
  v_invoice_number := p_data->>'invoice_number';
  v_total          := (p_data->>'grand_total')::numeric;
  v_vat            := (p_data->>'vat_amount')::numeric;
  v_subtotal       := v_total - v_vat;
  v_payment_method := COALESCE(p_data->>'payment_method', 'cash');
  v_entry_date     := COALESCE((p_data->>'entry_date')::date, CURRENT_DATE);

  -- Fetch account IDs
  SELECT id INTO v_cash_id    FROM accounts WHERE code = '111' LIMIT 1;
  SELECT id INTO v_mada_id    FROM accounts WHERE code = '113' LIMIT 1;  -- Mada/Card → Receivable
  SELECT id INTO v_revenue_id FROM accounts WHERE code = '41'  LIMIT 1;
  SELECT id INTO v_vat_id     FROM accounts WHERE code = '212' LIMIT 1;

  IF v_revenue_id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: حساب الإيرادات (41) غير موجود'
      USING ERRCODE = 'P0010';
  END IF;

  -- Pick debit account based on payment method
  v_debit_acc_id := CASE
    WHEN v_payment_method = 'cash' THEN COALESCE(v_cash_id, v_revenue_id)
    ELSE COALESCE(v_mada_id, v_cash_id, v_revenue_id)
  END;

  -- Create transaction header
  INSERT INTO transactions (invoice_id, entry_date, description, reference, is_posted, posted_at)
  VALUES (v_invoice_id, v_entry_date,
          format('مبيعات نقطة البيع — %s', v_invoice_number),
          v_invoice_number, true, NOW())
  RETURNING id INTO v_tx_id;

  -- DEBIT: cash/receivable (full amount inc VAT)
  INSERT INTO transaction_lines (transaction_id, account_id, type, amount, description)
  VALUES (v_tx_id, v_debit_acc_id, 'DEBIT', v_total,
          format('استلام — %s', v_invoice_number));

  -- CREDIT: revenue (ex VAT)
  INSERT INTO transaction_lines (transaction_id, account_id, type, amount, description)
  VALUES (v_tx_id, v_revenue_id, 'CREDIT', v_subtotal,
          format('إيراد مبيعات — %s', v_invoice_number));

  -- CREDIT: VAT payable
  IF v_vat_id IS NOT NULL AND v_vat > 0 THEN
    INSERT INTO transaction_lines (transaction_id, account_id, type, amount, description)
    VALUES (v_tx_id, v_vat_id, 'CREDIT', v_vat,
            format('ضريبة مبيعات — %s', v_invoice_number));
  END IF;

  RETURN jsonb_build_object(
    'success',         true,
    'transaction_id',  v_tx_id,
    'invoice_number',  v_invoice_number,
    'total',           v_total,
    'revenue',         v_subtotal,
    'vat',             v_vat
  );
END;
$$;

GRANT EXECUTE ON FUNCTION post_sale_journal_entry(jsonb) TO authenticated, service_role;

-- ─── 6. FUNCTION: post_expense_journal_entry ────────────────
-- قيد مصروف: مدين حساب المصروف المختص / دائن النقدية

DROP FUNCTION IF EXISTS post_expense_journal_entry(jsonb);

CREATE OR REPLACE FUNCTION post_expense_journal_entry(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expense_account_id uuid;
  v_expense_code       text;
  v_amount             numeric;
  v_vat_amount         numeric;
  v_description        text;
  v_reference          text;
  v_payment_method     text;
  v_entry_date         date;
  v_tx_id              uuid;
  v_cash_id            uuid;
  v_vat_input_id       uuid;
  v_credit_acc_id      uuid;
BEGIN
  -- Unpack
  v_expense_code       := p_data->>'expense_account_code';
  v_amount             := (p_data->>'amount')::numeric;
  v_vat_amount         := COALESCE((p_data->>'vat_amount')::numeric, 0);
  v_description        := COALESCE(p_data->>'description', 'مصروف');
  v_reference          := COALESCE(p_data->>'reference', '');
  v_payment_method     := COALESCE(p_data->>'payment_method', 'cash');
  v_entry_date         := COALESCE((p_data->>'entry_date')::date, CURRENT_DATE);

  -- Fetch accounts
  SELECT id INTO v_expense_account_id FROM accounts WHERE code = v_expense_code LIMIT 1;
  SELECT id INTO v_cash_id            FROM accounts WHERE code = '111'          LIMIT 1;
  SELECT id INTO v_vat_input_id       FROM accounts WHERE code = '115'          LIMIT 1; -- VAT Input

  IF v_expense_account_id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: حساب المصروف "%" غير موجود', v_expense_code
      USING ERRCODE = 'P0010';
  END IF;

  IF v_cash_id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: حساب النقدية (111) غير موجود'
      USING ERRCODE = 'P0010';
  END IF;

  -- Pick credit account
  v_credit_acc_id := v_cash_id;  -- دائماً من النقدية (يمكن توسيعه لاحقاً)

  -- Create transaction
  INSERT INTO transactions (entry_date, description, reference, is_posted, posted_at)
  VALUES (v_entry_date, v_description, v_reference, true, NOW())
  RETURNING id INTO v_tx_id;

  -- DEBIT: expense account
  INSERT INTO transaction_lines (transaction_id, account_id, type, amount, description)
  VALUES (v_tx_id, v_expense_account_id, 'DEBIT', v_amount, v_description);

  -- DEBIT: VAT input (if any)
  IF v_vat_input_id IS NOT NULL AND v_vat_amount > 0 THEN
    INSERT INTO transaction_lines (transaction_id, account_id, type, amount, description)
    VALUES (v_tx_id, v_vat_input_id, 'DEBIT', v_vat_amount,
            format('ضريبة مدخلات — %s', v_description));
  END IF;

  -- CREDIT: cash (total amount incl. VAT)
  INSERT INTO transaction_lines (transaction_id, account_id, type, amount, description)
  VALUES (v_tx_id, v_credit_acc_id, 'CREDIT', v_amount + v_vat_amount,
          format('صرف نقدي — %s', v_description));

  RETURN jsonb_build_object(
    'success',        true,
    'transaction_id', v_tx_id,
    'amount',         v_amount,
    'vat_amount',     v_vat_amount,
    'account_code',   v_expense_code
  );
END;
$$;

GRANT EXECUTE ON FUNCTION post_expense_journal_entry(jsonb) TO authenticated, service_role;

-- ─── 7. FUNCTION: generate_child_account_code ───────────────
-- توليد كود الحساب الفرعي تلقائياً

DROP FUNCTION IF EXISTS generate_child_account_code(text);

CREATE OR REPLACE FUNCTION generate_child_account_code(p_parent_code text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_max_code text;
  v_next     int;
  v_base     text;
BEGIN
  -- الكود الأعلى رقماً بين أبناء هذا الحساب
  SELECT MAX(code)
    INTO v_max_code
    FROM accounts
   WHERE code LIKE (p_parent_code || '%')
     AND code != p_parent_code
     AND LENGTH(code) = LENGTH(p_parent_code) + 1;

  IF v_max_code IS NULL THEN
    -- لا يوجد أبناء بعد → الكود الأول
    RETURN p_parent_code || '1';
  ELSE
    v_next := (RIGHT(v_max_code, 1))::int + 1;
    IF v_next > 9 THEN
      -- تجاوز 9 → أضف خانة (مثلاً 1199 → 11100)
      RETURN p_parent_code || '10';
    END IF;
    RETURN p_parent_code || v_next::text;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_child_account_code(text) TO authenticated, service_role;

-- ─── Comments ────────────────────────────────────────────────
COMMENT ON VIEW account_balances IS
  'رصيد حي لكل حساب من transaction_lines — يُحدَّث تلقائياً مع كل قيد.';

COMMENT ON FUNCTION get_dashboard_metrics() IS
  'مقاييس لوحة التحكم الحية: أصول (1xx) + إيرادات (4xx) + مصروفات (5xx).';
