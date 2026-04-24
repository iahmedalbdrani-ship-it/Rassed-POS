-- ============================================================
-- Control Panel (رصيد) — Supabase Migration
-- process_invoice_with_stock: Atomic POS Sale RPC
--
-- تنفذ هذه الدالة عملية البيع كاملة في Transaction واحد:
--   1. التحقق من توافر المخزون
--   2. إنشاء سجل الفاتورة (invoices)
--   3. إدراج أسطر الفاتورة (invoice_lines)
--   4. خصم المخزون (products.stock)
--   5. تسجيل قيد محاسبي مزدوج (transactions + transaction_lines)
--
-- في حال فشل أي خطوة → ROLLBACK تلقائي (ATOMIC)
-- ============================================================

-- ─── Drop & Recreate ─────────────────────────────────────────
DROP FUNCTION IF EXISTS process_invoice_with_stock(jsonb);

-- ─── Main Function ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION process_invoice_with_stock(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Invoice fields
  v_invoice_number  text;
  v_invoice_uuid    text;
  v_cashier_id      text;
  v_cashier_name    text;
  v_branch_name     text;
  v_payment_method  text;
  v_payment_amount  numeric(12,2);
  v_subtotal_ex_vat numeric(12,2);
  v_total_discount  numeric(12,2);
  v_total_vat       numeric(12,2);
  v_grand_total     numeric(12,2);
  v_zatca_qr        text;
  v_now             timestamptz;
  v_issue_date      date;

  -- Inserted records
  v_invoice_id      uuid;
  v_tx_id           uuid;

  -- Loop vars
  v_item            jsonb;
  v_product_id      uuid;
  v_qty_requested   integer;
  v_current_stock   integer;
  v_product_name    text;
  v_line_num        integer;

  -- Accounting account IDs (fetched by code)
  v_cash_account_id       uuid;
  v_mada_account_id       uuid;
  v_revenue_account_id    uuid;
  v_vat_payable_id        uuid;
  v_debit_account_id      uuid;

BEGIN
  -- ── Unpack input ──────────────────────────────────────────
  v_invoice_number  := p_data->>'invoice_number';
  v_invoice_uuid    := COALESCE(p_data->>'invoice_uuid', gen_random_uuid()::text);
  v_cashier_id      := p_data->>'cashier_id';
  v_cashier_name    := COALESCE(p_data->>'cashier_name', 'كاشير');
  v_branch_name     := COALESCE(p_data->>'branch_name', 'الفرع الرئيسي');
  v_payment_method  := COALESCE(p_data->>'payment_method', 'cash');
  v_payment_amount  := COALESCE((p_data->>'payment_amount')::numeric, 0);
  v_subtotal_ex_vat := COALESCE((p_data->>'subtotal_ex_vat')::numeric, 0);
  v_total_discount  := COALESCE((p_data->>'total_discount')::numeric, 0);
  v_total_vat       := COALESCE((p_data->>'total_vat')::numeric, 0);
  v_grand_total     := COALESCE((p_data->>'grand_total')::numeric, 0);
  v_zatca_qr        := COALESCE(p_data->>'zatca_qr', '');
  v_now             := NOW();
  v_issue_date      := v_now::date;

  -- ── Validate required fields ──────────────────────────────
  IF v_invoice_number IS NULL OR v_invoice_number = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT: invoice_number مطلوب'
      USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_array_length(p_data->'items') = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: قائمة الأصناف فارغة'
      USING ERRCODE = 'P0001';
  END IF;

  -- ════════════════════════════════════════════════════════
  -- STEP 1: فحص المخزون لكل صنف قبل أي عملية كتابة
  -- ════════════════════════════════════════════════════════
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data->'items')
  LOOP
    v_product_id    := (v_item->>'id')::uuid;
    v_qty_requested := (v_item->>'qty')::integer;

    SELECT stock, name
      INTO v_current_stock, v_product_name
      FROM products
     WHERE id = v_product_id
       AND is_active = true
       FOR UPDATE;  -- Row-level lock for concurrency safety

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND: المنتج "%" غير موجود أو غير نشط', v_product_id
        USING ERRCODE = 'P0002';
    END IF;

    IF v_current_stock < v_qty_requested THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: مخزون "%" غير كافٍ. المطلوب: %, المتاح: %',
        v_product_name, v_qty_requested, v_current_stock
        USING ERRCODE = 'P0003';
    END IF;
  END LOOP;

  -- ════════════════════════════════════════════════════════
  -- STEP 2: إنشاء سجل الفاتورة
  -- ════════════════════════════════════════════════════════
  INSERT INTO invoices (
    uuid,
    invoice_number,
    invoice_type,
    invoice_status,
    issue_date,
    supply_date,
    subtotal,
    discount_amount,
    taxable_amount,
    vat_rate,
    vat_amount,
    total_amount,
    payment_means,
    qr_code,
    notes,
    created_at
  ) VALUES (
    v_invoice_uuid::uuid,
    v_invoice_number,
    'SIMPLIFIED',
    'REPORTED',
    v_issue_date,
    v_issue_date,
    v_subtotal_ex_vat,
    v_total_discount,
    v_subtotal_ex_vat - v_total_discount,
    15,
    v_total_vat,
    v_grand_total,
    CASE v_payment_method
      WHEN 'cash'       THEN '10'  -- Cash (UNTDID 4461)
      WHEN 'mada'       THEN '48'  -- Bank card
      WHEN 'visa'       THEN '48'
      WHEN 'mastercard' THEN '48'
      WHEN 'apple_pay'  THEN '48'
      ELSE '10'
    END,
    v_zatca_qr,
    format('كاشير: %s | فرع: %s | دفع: %s | مبلغ مدفوع: %s',
      v_cashier_name, v_branch_name, v_payment_method,
      v_payment_amount::text),
    v_now
  )
  RETURNING id INTO v_invoice_id;

  -- ════════════════════════════════════════════════════════
  -- STEP 3: إدراج أسطر الفاتورة
  -- ════════════════════════════════════════════════════════
  v_line_num := 1;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data->'items')
  LOOP
    INSERT INTO invoice_lines (
      invoice_id,
      line_number,
      item_name_ar,
      item_name_en,
      item_code,
      quantity,
      unit_price,
      discount_pct,
      vat_rate,
      vat_amount,
      line_total
    ) VALUES (
      v_invoice_id,
      v_line_num,
      v_item->>'name',
      v_item->>'name_en',
      COALESCE(v_item->>'barcode', v_item->>'id'),
      (v_item->>'qty')::integer,
      (v_item->>'unit_price')::numeric,
      COALESCE((v_item->>'discount_pct')::numeric, 0),
      COALESCE((v_item->>'vat_rate')::numeric, 15),
      (v_item->>'vat_amount')::numeric,
      (v_item->>'line_total')::numeric
    );

    v_line_num := v_line_num + 1;
  END LOOP;

  -- ════════════════════════════════════════════════════════
  -- STEP 4: خصم المخزون (atomic deduction)
  -- ════════════════════════════════════════════════════════
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data->'items')
  LOOP
    UPDATE products
       SET stock      = stock - (v_item->>'qty')::integer,
           updated_at = v_now
     WHERE id = (v_item->>'id')::uuid;

    IF NOT FOUND THEN
      -- This shouldn't happen (already checked), but be defensive
      RAISE EXCEPTION 'STOCK_UPDATE_FAILED: فشل تحديث مخزون المنتج %', v_item->>'id'
        USING ERRCODE = 'P0004';
    END IF;
  END LOOP;

  -- ════════════════════════════════════════════════════════
  -- STEP 5: تسجيل القيد المحاسبي المزدوج
  --  مدين: النقدية / المدفوعات الإلكترونية  (حساب 1100 أو 1150)
  --  دائن: إيرادات المبيعات               (حساب 4100)
  --  دائن: ضريبة القيمة المضافة الواجبة   (حساب 2300)
  -- ════════════════════════════════════════════════════════

  -- Fetch account IDs by code (graceful fallback if accounts table doesn't exist)
  BEGIN
    SELECT id INTO v_cash_account_id    FROM accounts WHERE code = '1100' LIMIT 1;
    SELECT id INTO v_mada_account_id    FROM accounts WHERE code = '1150' LIMIT 1;
    SELECT id INTO v_revenue_account_id FROM accounts WHERE code = '4100' LIMIT 1;
    SELECT id INTO v_vat_payable_id     FROM accounts WHERE code = '2300' LIMIT 1;
  EXCEPTION
    WHEN undefined_table THEN
      -- محاسبة غير مفعّلة بعد — نتخطى القيد بأمان
      v_revenue_account_id := NULL;
  END;

  IF v_revenue_account_id IS NOT NULL THEN
    -- اختر حساب المدين بناءً على طريقة الدفع
    v_debit_account_id := CASE
      WHEN v_payment_method = 'cash' THEN COALESCE(v_cash_account_id, v_revenue_account_id)
      ELSE COALESCE(v_mada_account_id, v_cash_account_id, v_revenue_account_id)
    END;

    -- إنشاء القيد الرئيسي
    INSERT INTO transactions (
      invoice_id,
      entry_date,
      description,
      reference,
      is_posted,
      posted_at
    ) VALUES (
      v_invoice_id,
      v_now::date,
      format('بيع نقطة البيع — %s', v_invoice_number),
      v_invoice_number,
      true,
      v_now
    )
    RETURNING id INTO v_tx_id;

    -- مدين: المبلغ الكلي شامل الضريبة (يدخل الصندوق / البنك)
    INSERT INTO transaction_lines (transaction_id, account_id, type, amount, description)
    VALUES (v_tx_id, v_debit_account_id, 'DEBIT', v_grand_total,
            format('استلام دفعة — %s', v_invoice_number));

    -- دائن: الإيراد (بدون ضريبة)
    INSERT INTO transaction_lines (transaction_id, account_id, type, amount, description)
    VALUES (v_tx_id, v_revenue_account_id, 'CREDIT',
            v_subtotal_ex_vat - v_total_discount,
            format('إيرادات مبيعات — %s', v_invoice_number));

    -- دائن: ضريبة القيمة المضافة
    IF v_vat_payable_id IS NOT NULL AND v_total_vat > 0 THEN
      INSERT INTO transaction_lines (transaction_id, account_id, type, amount, description)
      VALUES (v_tx_id, v_vat_payable_id, 'CREDIT', v_total_vat,
              format('ضريبة قيمة مضافة — %s', v_invoice_number));
    END IF;
  END IF;

  -- ════════════════════════════════════════════════════════
  -- RETURN: إعادة بيانات الفاتورة للـ Frontend
  -- ════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'success',         true,
    'invoice_id',      v_invoice_id,
    'invoice_number',  v_invoice_number,
    'invoice_uuid',    v_invoice_uuid,
    'grand_total',     v_grand_total,
    'total_vat',       v_total_vat,
    'status',          'REPORTED',
    'created_at',      v_now
  );

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;   -- re-raise INVALID_INPUT
  WHEN SQLSTATE 'P0002' THEN
    RAISE;   -- re-raise PRODUCT_NOT_FOUND
  WHEN SQLSTATE 'P0003' THEN
    RAISE;   -- re-raise INSUFFICIENT_STOCK
  WHEN SQLSTATE 'P0004' THEN
    RAISE;   -- re-raise STOCK_UPDATE_FAILED
  WHEN OTHERS THEN
    RAISE EXCEPTION 'INTERNAL_ERROR: %', SQLERRM
      USING ERRCODE = 'P0099';
END;
$$;

-- ─── Grant execute to authenticated users ────────────────────
GRANT EXECUTE ON FUNCTION process_invoice_with_stock(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION process_invoice_with_stock(jsonb) TO service_role;

-- ─── Comment ─────────────────────────────────────────────────
COMMENT ON FUNCTION process_invoice_with_stock(jsonb) IS
  'رصيد ERP — دالة ذرية تنفذ عملية البيع كاملة:
   فحص مخزون → إنشاء فاتورة → أسطر → خصم مخزون → قيد محاسبي.
   ترمي استثناءات محددة عند نقص المخزون أو بيانات غير صالحة.
   ZATCA Phase 2 Compliant.';
