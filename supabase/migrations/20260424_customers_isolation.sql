-- ============================================================
-- رصيد — Customer Data Isolation Migration
-- Layer 1: Schema  |  Layer 2: RLS Policies
--
-- ملاحظة: يستخدم النظام org_id (وليس company_id) اتساقاً مع
-- بقية الجداول (invoices, products, accounts…)
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- LAYER 1: TABLE SCHEMA
-- ══════════════════════════════════════════════════════════════

-- 1-A: إنشاء الجدول إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS customers (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID        NOT NULL,                  -- عزل المؤسسة
  name        TEXT        NOT NULL,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  vat_number  TEXT,                                  -- الرقم الضريبي (اختياري)
  cr_number   TEXT,                                  -- رقم السجل التجاري
  notes       TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1-B: إضافة org_id إذا كان الجدول موجوداً بدونه
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS org_id UUID;

-- 1-C: Index للأداء (الاستعلام الرئيسي دائماً عبر org_id)
CREATE INDEX IF NOT EXISTS idx_customers_org_id
  ON customers (org_id);

CREATE INDEX IF NOT EXISTS idx_customers_org_name
  ON customers (org_id, name);

-- 1-D: Trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_customers_updated_at();

-- ══════════════════════════════════════════════════════════════
-- LAYER 2: ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════

-- 2-A: تفعيل RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- 2-B: حذف السياسات القديمة (clean slate)
DROP POLICY IF EXISTS "customers_select" ON customers;
DROP POLICY IF EXISTS "customers_insert" ON customers;
DROP POLICY IF EXISTS "customers_update" ON customers;
DROP POLICY IF EXISTS "customers_delete" ON customers;

-- 2-C: Helper Function — تجلب org_id للمستخدم الحالي
--       SECURITY DEFINER: تعمل بصلاحية owner لتجنب recursion في RLS
CREATE OR REPLACE FUNCTION get_current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM   user_profiles
  WHERE  id = auth.uid()
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION get_current_user_org_id() TO authenticated;

-- 2-D: SELECT — المستخدم يرى عملاء مؤسسته فقط
CREATE POLICY "customers_select" ON customers
  FOR SELECT
  USING (org_id = get_current_user_org_id());

-- 2-E: INSERT — يُلزَم بإدراج org_id الصحيح فقط
CREATE POLICY "customers_insert" ON customers
  FOR INSERT
  WITH CHECK (org_id = get_current_user_org_id());

-- 2-F: UPDATE — لا يُعدّل إلا عملاء مؤسسته
CREATE POLICY "customers_update" ON customers
  FOR UPDATE
  USING  (org_id = get_current_user_org_id())
  WITH CHECK (org_id = get_current_user_org_id());

-- 2-G: DELETE — لا يحذف إلا عملاء مؤسسته
CREATE POLICY "customers_delete" ON customers
  FOR DELETE
  USING (org_id = get_current_user_org_id());

-- 2-H: Service role تجاوز RLS (للعمليات الإدارية فقط)
GRANT ALL ON customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON customers TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- LAYER 2 — VERIFICATION QUERIES (للتشغيل اليدوي في Dashboard)
-- ══════════════════════════════════════════════════════════════

-- اختبار: RLS يمنع رؤية عملاء مؤسسة أخرى
-- SELECT * FROM customers WHERE org_id = '<other_org_id>';
-- النتيجة المتوقعة: 0 صفوف (RLS يحجب)

-- فحص السياسات الفعّالة
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'customers';
