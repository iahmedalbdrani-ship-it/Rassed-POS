-- ============================================================
-- رصيد (Raseed) — Migration 008: Full RBAC + Granular RLS
-- ─────────────────────────────────────────────────────────
-- الأدوار: owner | supervisor | cashier | customer
-- المبدأ:  JWT custom claims (أداء) + SECURITY DEFINER helpers
-- الفصل:   كل سياسة تفصل بين (tenant_id) و(role) في آن واحد
--
-- ⚠️  يجب تشغيله بالترتيب بعد 007_invoices_refunded_and_realtime.sql
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║  PART 0 — ARCHITECTURE EXPLANATION (اقرأ أولاً)         ║
-- ╠══════════════════════════════════════════════════════════╣
-- ║                                                          ║
-- ║  كيف تعمل دوال Supabase في الـ RLS؟                      ║
-- ║                                                          ║
-- ║  auth.uid()  → UUID للمستخدم الحالي من الـ JWT token     ║
-- ║  auth.jwt()  → كامل payload الـ JWT كـ jsonb             ║
-- ║                                                          ║
-- ║  المشكلة مع get_my_role() الحالية:                       ║
-- ║    كل policy تستدعي SELECT من user_profiles              ║
-- ║    = N queries إضافية على كل request                     ║
-- ║                                                          ║
-- ║  الحل (JWT Custom Claims):                               ║
-- ║    نضيف app_role و tenant_id داخل JWT نفسه               ║
-- ║    عبر Supabase Auth Hook (لا DB query على الإطلاق)      ║
-- ║                                                          ║
-- ║  JWT Structure المستهدف:                                 ║
-- ║  {                                                       ║
-- ║    "sub": "uuid-of-user",                                ║
-- ║    "app_role": "owner",          ← نقرأه مباشرة          ║
-- ║    "tenant_id": "uuid-of-org"    ← tenant isolation      ║
-- ║  }                                                       ║
-- ║                                                          ║
-- ║  قراءة الدور بدون DB:                                    ║
-- ║    auth.jwt() ->> 'app_role'                             ║
-- ║    (auth.jwt() ->> 'tenant_id')::uuid                    ║
-- ║                                                          ║
-- ╚══════════════════════════════════════════════════════════╝


-- ============================================================
-- PART 1 — ENUM & TABLE: user_roles
-- ============================================================

-- ─── 1.1 Role Enum ──────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM ('owner', 'supervisor', 'cashier', 'customer');
  END IF;
END $$;

-- ─── 1.2 user_roles table ───────────────────────────────────
-- جدول الصلاحيات المركزي — مرتبط مع auth.users وجدول organizations
CREATE TABLE IF NOT EXISTS user_roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role        app_role    NOT NULL DEFAULT 'cashier',
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  -- الصلاحيات التفصيلية (يمكن تجاوز الـ defaults لاحقاً)
  can_view_reports        BOOLEAN NOT NULL DEFAULT FALSE,
  can_approve_invoices    BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_users        BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete_drafts       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Metadata
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_org UNIQUE (user_id, org_id)
);

-- ─── 1.3 Sync defaults per role ─────────────────────────────
-- يُطبَّق تلقائياً عند إنشاء أو تعديل دور
CREATE OR REPLACE FUNCTION sync_role_permissions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  CASE NEW.role
    WHEN 'owner' THEN
      NEW.can_view_reports     := TRUE;
      NEW.can_approve_invoices := TRUE;
      NEW.can_manage_users     := TRUE;
      NEW.can_delete_drafts    := TRUE;
    WHEN 'supervisor' THEN
      NEW.can_view_reports     := TRUE;
      NEW.can_approve_invoices := TRUE;
      NEW.can_manage_users     := FALSE;
      NEW.can_delete_drafts    := FALSE;
    WHEN 'cashier' THEN
      NEW.can_view_reports     := FALSE;
      NEW.can_approve_invoices := FALSE;
      NEW.can_manage_users     := FALSE;
      NEW.can_delete_drafts    := TRUE;   -- مسوداته فقط
    WHEN 'customer' THEN
      NEW.can_view_reports     := FALSE;
      NEW.can_approve_invoices := FALSE;
      NEW.can_manage_users     := FALSE;
      NEW.can_delete_drafts    := FALSE;
  END CASE;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_role_permissions
  BEFORE INSERT OR UPDATE OF role ON user_roles
  FOR EACH ROW EXECUTE FUNCTION sync_role_permissions();

-- ─── 1.4 customer_id column on invoices ─────────────────────
-- ربط الفاتورة بـ auth.uid() للعميل (بوابة العملاء)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'SALES'
    CHECK (invoice_type IN ('SALES','PURCHASE','CREDIT_NOTE','SALARY','DRAFT'));

-- ─── 1.5 Indexes ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_roles_user   ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org    ON user_roles(org_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role   ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_invoices_cashier  ON invoices(created_by, org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_user_id);


-- ============================================================
-- PART 2 — JWT CUSTOM CLAIMS HOOK
-- يُنفَّذ في Supabase Dashboard → Authentication → Hooks
-- ============================================================

-- ─── 2.1 Hook function (تُسجَّل في Auth Hooks) ──────────────
-- لا تستدعيها مباشرة — Supabase يستدعيها لحظة إصدار JWT
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID;
  v_claims    jsonb;
  v_org_id    UUID;
  v_role      TEXT;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims  := event -> 'claims';

  -- Fetch role and org for this user
  SELECT ur.org_id::text, ur.role::text
    INTO v_org_id, v_role
    FROM user_roles ur
    WHERE ur.user_id = v_user_id
      AND ur.is_active = TRUE
    LIMIT 1;

  -- Inject custom claims into JWT payload
  IF v_role IS NOT NULL THEN
    v_claims := v_claims
      || jsonb_build_object('app_role',  v_role)
      || jsonb_build_object('tenant_id', v_org_id::text);
  END IF;

  RETURN jsonb_build_object('claims', v_claims);
END;
$$;

-- Grant required for the hook
GRANT USAGE  ON SCHEMA public              TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC, anon, authenticated;


-- ============================================================
-- PART 3 — FAST HELPER FUNCTIONS (SECURITY DEFINER)
-- تقرأ من JWT → لا DB query → أداء ممتاز
-- ============================================================

-- ─── 3.1 Get role from JWT ───────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- المسار السريع: اقرأ من JWT claim مباشرةً
  SELECT COALESCE(
    auth.jwt() ->> 'app_role',
    -- Fallback للتوافق مع الجلسات القديمة
    (SELECT role::text FROM user_roles
     WHERE user_id = auth.uid() AND is_active = TRUE LIMIT 1)
  );
$$;

-- ─── 3.2 Get tenant_id from JWT ─────────────────────────────
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'tenant_id')::uuid,
    (SELECT org_id FROM user_roles
     WHERE user_id = auth.uid() AND is_active = TRUE LIMIT 1)
  );
$$;

-- ─── 3.3 Shortcut checks ────────────────────────────────────
CREATE OR REPLACE FUNCTION is_owner()      RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT get_my_role() = 'owner'; $$;
CREATE OR REPLACE FUNCTION is_supervisor() RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT get_my_role() IN ('owner','supervisor'); $$;
CREATE OR REPLACE FUNCTION is_cashier()    RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT get_my_role() IN ('owner','supervisor','cashier'); $$;
CREATE OR REPLACE FUNCTION is_customer()   RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT get_my_role() = 'customer'; $$;

-- ─── 3.4 Tenant isolation check ─────────────────────────────
-- الدالة الأساسية: هل السجل ينتمي لشركة المستخدم الحالي؟
CREATE OR REPLACE FUNCTION is_my_tenant(record_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT record_org_id = get_my_org_id();
$$;


-- ============================================================
-- PART 4 — DROP OLD PERMISSIVE POLICIES
-- نحذف السياسات القديمة الشاملة قبل إضافة الدقيقة
-- ============================================================

-- organizations
DROP POLICY IF EXISTS org_member_select    ON organizations;
DROP POLICY IF EXISTS org_owner_update     ON organizations;

-- user_profiles
DROP POLICY IF EXISTS profiles_select      ON user_profiles;
DROP POLICY IF EXISTS profiles_own_update  ON user_profiles;

-- invoices (migration 007 + rls_and_triggers)
DROP POLICY IF EXISTS "invoices_all_authenticated"      ON invoices;
DROP POLICY IF EXISTS "invoices_all_anon"               ON invoices;
DROP POLICY IF EXISTS "invoices_org_select"             ON invoices;
DROP POLICY IF EXISTS "invoices_org_insert"             ON invoices;
DROP POLICY IF EXISTS "invoices_org_update"             ON invoices;
DROP POLICY IF EXISTS "invoices_org_delete"             ON invoices;
DROP POLICY IF EXISTS "viewer_no_insert_invoices"       ON invoices;

-- invoice_lines
DROP POLICY IF EXISTS "invoice_lines_all_authenticated" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_all_anon"          ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_org"               ON invoice_lines;

-- transactions
DROP POLICY IF EXISTS "transactions_org_select"         ON transactions;
DROP POLICY IF EXISTS "transactions_org_insert"         ON transactions;
DROP POLICY IF EXISTS "transactions_org_update"         ON transactions;
DROP POLICY IF EXISTS "transactions_org_delete"         ON transactions;
DROP POLICY IF EXISTS "viewer_no_insert_transactions"   ON transactions;

-- accounts, journal
DROP POLICY IF EXISTS "accounts_org"                    ON accounts;
DROP POLICY IF EXISTS "accounts_all_authenticated"      ON accounts;
DROP POLICY IF EXISTS "accounts_read_anon"              ON accounts;
DROP POLICY IF EXISTS "journal_entries_authenticated"   ON journal_entries;
DROP POLICY IF EXISTS "journal_lines_authenticated"     ON journal_entry_lines;


-- ============================================================
-- PART 5 — RLS: user_roles (المالك فقط يدير المستخدمين)
-- ============================================================

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- SELECT: كل أعضاء المؤسسة يرون قائمة الأعضاء
CREATE POLICY "ur_select_org_members"
  ON user_roles FOR SELECT
  TO authenticated
  USING (is_my_tenant(org_id));

-- INSERT: المالك فقط يضيف مستخدمين جدد لشركته
CREATE POLICY "ur_insert_owner_only"
  ON user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    is_my_tenant(org_id)
    AND is_owner()
  );

-- UPDATE: المالك فقط يعدّل الأدوار
CREATE POLICY "ur_update_owner_only"
  ON user_roles FOR UPDATE
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND is_owner()
  )
  WITH CHECK (
    is_my_tenant(org_id)
    AND is_owner()
  );

-- DELETE: المالك فقط يحذف المستخدمين
-- حماية إضافية: لا يحذف نفسه (حتى لا تبقى الشركة بلا مالك)
CREATE POLICY "ur_delete_owner_only"
  ON user_roles FOR DELETE
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND is_owner()
    AND user_id <> auth.uid()    -- لا يحذف نفسه
  );


-- ============================================================
-- PART 6 — RLS: organizations
-- ============================================================

-- SELECT: كل أعضاء الشركة
CREATE POLICY "org_tenant_select"
  ON organizations FOR SELECT
  TO authenticated
  USING (id = get_my_org_id());

-- UPDATE: المالك فقط (اسم الشركة، الاشتراك، إلخ)
CREATE POLICY "org_owner_update"
  ON organizations FOR UPDATE
  TO authenticated
  USING (id = get_my_org_id() AND is_owner())
  WITH CHECK (id = get_my_org_id() AND is_owner());

-- DELETE: ممنوع تماماً على مستوى RLS (يتم عبر Supabase Admin API فقط)
CREATE POLICY "org_no_delete"
  ON organizations FOR DELETE
  TO authenticated
  USING (FALSE);


-- ============================================================
-- PART 7 — RLS: invoices (أدق جزء في النظام)
-- ============================================================

-- ─── 7.1 SELECT ─────────────────────────────────────────────

-- المالك: يرى جميع فواتير شركته
CREATE POLICY "inv_select_owner"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND is_owner()
  );

-- المشرف: يرى جميع الفواتير (لكن ليس فواتير الرواتب الداخلية بشكل اختياري)
CREATE POLICY "inv_select_supervisor"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND get_my_role() = 'supervisor'
  );

-- الكاشير: يرى فقط الفواتير التي أنشأها هو بنفسه
CREATE POLICY "inv_select_cashier_own"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND get_my_role() = 'cashier'
    AND created_by = auth.uid()::text
  );

-- العميل: يرى فقط فواتيره الخاصة (بوابة العملاء)
CREATE POLICY "inv_select_customer_own"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    get_my_role() = 'customer'
    AND customer_user_id = auth.uid()
  );

-- ─── 7.2 INSERT ─────────────────────────────────────────────

-- المالك والمشرف: يمكنهم إنشاء أي نوع فاتورة
CREATE POLICY "inv_insert_owner_supervisor"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    is_my_tenant(org_id)
    AND get_my_role() IN ('owner', 'supervisor')
  );

-- الكاشير: يُنشئ فقط مسودات مبيعات (DRAFT + SALES)
CREATE POLICY "inv_insert_cashier_draft_sales_only"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    is_my_tenant(org_id)
    AND get_my_role() = 'cashier'
    AND invoice_status = 'DRAFT'
    AND invoice_type   = 'SALES'
    AND created_by     = auth.uid()::text  -- يُسجَّل باسمه تلقائياً
  );

-- العميل: ممنوع من الإنشاء نهائياً
CREATE POLICY "inv_insert_customer_blocked"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() <> 'customer'
  );

-- ─── 7.3 UPDATE ─────────────────────────────────────────────

-- المالك: يعدّل أي فاتورة في أي حالة
CREATE POLICY "inv_update_owner_all"
  ON invoices FOR UPDATE
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND is_owner()
  )
  WITH CHECK (
    is_my_tenant(org_id)
    AND is_owner()
  );

-- المشرف: يعدّل (يعتمد) الفواتير — لكن لا يعدّل فواتيراً معتمدة مسبقاً
-- يستطيع تغيير الحالة من PENDING → CLEARED
CREATE POLICY "inv_update_supervisor_approve"
  ON invoices FOR UPDATE
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND get_my_role() = 'supervisor'
    AND invoice_status IN ('DRAFT', 'PENDING')  -- فقط قبل الاعتماد النهائي
  )
  WITH CHECK (
    is_my_tenant(org_id)
    AND get_my_role() = 'supervisor'
    -- يمنع المشرف من خفض الحالة بعد الاعتماد
    AND invoice_status IN ('PENDING', 'CLEARED')
  );

-- الكاشير: يعدّل فقط مسوداته الخاصة (ما لم تُعتمد)
CREATE POLICY "inv_update_cashier_own_draft"
  ON invoices FOR UPDATE
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND get_my_role() = 'cashier'
    AND created_by = auth.uid()::text
    AND invoice_status = 'DRAFT'    -- بعد الإرسال للاعتماد لا يعدّل
  )
  WITH CHECK (
    is_my_tenant(org_id)
    AND get_my_role() = 'cashier'
    AND invoice_status = 'DRAFT'    -- لا يرفع الحالة بنفسه
  );

-- العميل: ممنوع من التعديل نهائياً (READ-ONLY)
CREATE POLICY "inv_update_customer_blocked"
  ON invoices FOR UPDATE
  TO authenticated
  USING (get_my_role() <> 'customer');

-- ─── 7.4 DELETE ─────────────────────────────────────────────

-- المالك: يحذف فقط المسودات (الفواتير المعتمدة محمية بالـ trigger)
CREATE POLICY "inv_delete_owner_drafts_only"
  ON invoices FOR DELETE
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND is_owner()
    AND invoice_status = 'DRAFT'
  );

-- المشرف والكاشير والعميل: ممنوعون من الحذف نهائياً
CREATE POLICY "inv_delete_others_blocked"
  ON invoices FOR DELETE
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND get_my_role() = 'owner'   -- نفس الـ policy أعلاه — تُطبَّق فقط للـ owner
  );


-- ============================================================
-- PART 8 — RLS: invoice_lines
-- ============================================================

-- SELECT: يرث نفس منطق الفواتير (عبر subquery)
CREATE POLICY "il_select_owner_supervisor"
  ON invoice_lines FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices
      WHERE is_my_tenant(org_id)
        AND get_my_role() IN ('owner','supervisor')
    )
  );

CREATE POLICY "il_select_cashier_own"
  ON invoice_lines FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices
      WHERE is_my_tenant(org_id)
        AND get_my_role() = 'cashier'
        AND created_by = auth.uid()::text
    )
  );

CREATE POLICY "il_select_customer_own"
  ON invoice_lines FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices
      WHERE get_my_role() = 'customer'
        AND customer_user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: بنفس قيود الفاتورة الأم
CREATE POLICY "il_write_owner_supervisor"
  ON invoice_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM invoices
      WHERE is_my_tenant(org_id)
        AND get_my_role() IN ('owner','supervisor')
    )
  );

CREATE POLICY "il_write_cashier_own_draft"
  ON invoice_lines FOR ALL
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices
      WHERE is_my_tenant(org_id)
        AND get_my_role() = 'cashier'
        AND created_by = auth.uid()::text
        AND invoice_status = 'DRAFT'
    )
  );

-- العميل: لا كتابة على invoice_lines
CREATE POLICY "il_customer_read_only"
  ON invoice_lines FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() <> 'customer');


-- ============================================================
-- PART 9 — RLS: transactions / journal_entries (القيود)
-- ============================================================

-- ─── transactions ────────────────────────────────────────────

-- SELECT: المالك والمشرف يرون الكل، الكاشير يرى ما أنشأه
CREATE POLICY "tx_select_owner_supervisor"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND get_my_role() IN ('owner','supervisor')
  );

CREATE POLICY "tx_select_cashier_own"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND get_my_role() = 'cashier'
    AND created_by = auth.uid()::text
  );

-- INSERT: المالك والمشرف يُنشئون أي قيد، الكاشير فقط مسودات
CREATE POLICY "tx_insert_owner_supervisor"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    is_my_tenant(org_id)
    AND get_my_role() IN ('owner','supervisor')
  );

CREATE POLICY "tx_insert_cashier_unposted"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    is_my_tenant(org_id)
    AND get_my_role() = 'cashier'
    AND is_posted = FALSE          -- مسودة فقط
  );

-- UPDATE: المشرف يعتمد (is_posted: false → true)، الكاشير يعدّل مسوداته فقط
CREATE POLICY "tx_update_owner"
  ON transactions FOR UPDATE
  TO authenticated
  USING  (is_my_tenant(org_id) AND is_owner())
  WITH CHECK (is_my_tenant(org_id) AND is_owner());

CREATE POLICY "tx_update_supervisor_approve"
  ON transactions FOR UPDATE
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND get_my_role() = 'supervisor'
  )
  WITH CHECK (
    is_my_tenant(org_id)
    AND get_my_role() = 'supervisor'
    -- المشرف يعتمد القيود لكن لا يُلغي اعتمادها
    -- (is_posted لا يتراجع من TRUE إلى FALSE)
  );

CREATE POLICY "tx_update_cashier_unposted_own"
  ON transactions FOR UPDATE
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND get_my_role() = 'cashier'
    AND created_by = auth.uid()::text
    AND is_posted = FALSE
  )
  WITH CHECK (
    is_my_tenant(org_id)
    AND get_my_role() = 'cashier'
    AND is_posted = FALSE   -- لا يُغيّر is_posted بنفسه
  );

-- DELETE: المالك فقط على القيود غير المعتمدة
CREATE POLICY "tx_delete_owner_unposted"
  ON transactions FOR DELETE
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND is_owner()
    AND is_posted = FALSE
  );

-- المشرف والكاشير: ممنوع من الحذف
CREATE POLICY "tx_delete_others_blocked"
  ON transactions FOR DELETE
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND is_owner()    -- نفس الـ owner فقط
  );

-- ─── transaction_lines ───────────────────────────────────────
CREATE POLICY "txl_owner_supervisor_all"
  ON transaction_lines FOR ALL
  TO authenticated
  USING (
    transaction_id IN (
      SELECT id FROM transactions
      WHERE is_my_tenant(org_id)
        AND get_my_role() IN ('owner','supervisor')
    )
  );

CREATE POLICY "txl_cashier_own_unposted"
  ON transaction_lines FOR ALL
  TO authenticated
  USING (
    transaction_id IN (
      SELECT id FROM transactions
      WHERE is_my_tenant(org_id)
        AND get_my_role() = 'cashier'
        AND created_by = auth.uid()::text
        AND is_posted = FALSE
    )
  );

-- ─── journal_entries / journal_entry_lines ────────────────────
CREATE POLICY "je_owner_supervisor_all"
  ON journal_entries FOR ALL
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND get_my_role() IN ('owner','supervisor')
  );

CREATE POLICY "je_cashier_insert_only"
  ON journal_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    is_my_tenant(org_id)
    AND get_my_role() = 'cashier'
    AND is_posted = FALSE
  );

CREATE POLICY "jel_owner_supervisor_all"
  ON journal_entry_lines FOR ALL
  TO authenticated
  USING (
    entry_id IN (
      SELECT id FROM journal_entries
      WHERE is_my_tenant(org_id)
        AND get_my_role() IN ('owner','supervisor')
    )
  );


-- ============================================================
-- PART 10 — RLS: accounts / fiscal_periods / products
-- ============================================================

-- accounts: الكاشير يقرأ فقط (لا تعديل)
CREATE POLICY "acc_select_all_members"
  ON accounts FOR SELECT
  TO authenticated
  USING (is_my_tenant(org_id));

CREATE POLICY "acc_write_owner_supervisor"
  ON accounts FOR INSERT
  TO authenticated
  WITH CHECK (is_my_tenant(org_id) AND get_my_role() IN ('owner','supervisor'));

CREATE POLICY "acc_update_owner_supervisor"
  ON accounts FOR UPDATE
  TO authenticated
  USING (is_my_tenant(org_id) AND get_my_role() IN ('owner','supervisor'));

CREATE POLICY "acc_delete_owner_only"
  ON accounts FOR DELETE
  TO authenticated
  USING (is_my_tenant(org_id) AND is_owner());

-- fiscal_periods: المالك والمشرف فقط
CREATE POLICY "fp_select_all_members"
  ON fiscal_periods FOR SELECT
  TO authenticated
  USING (is_my_tenant(org_id));

CREATE POLICY "fp_write_owner_supervisor"
  ON fiscal_periods FOR INSERT
  TO authenticated
  WITH CHECK (is_my_tenant(org_id) AND get_my_role() IN ('owner','supervisor'));

CREATE POLICY "fp_close_owner_only"
  ON fiscal_periods FOR UPDATE
  TO authenticated
  USING (is_my_tenant(org_id) AND is_owner());

-- products / inventory: الكاشير يقرأ فقط
CREATE POLICY "prod_select_org"
  ON products FOR SELECT
  TO authenticated
  USING (is_my_tenant(org_id));

CREATE POLICY "prod_write_owner_supervisor"
  ON products FOR ALL
  TO authenticated
  USING (is_my_tenant(org_id) AND get_my_role() IN ('owner','supervisor'))
  WITH CHECK (is_my_tenant(org_id) AND get_my_role() IN ('owner','supervisor'));


-- ============================================================
-- PART 11 — RLS: ledger / audit_logs (أمان قانوني)
-- ============================================================

-- ledger: قراءة للمالك والمشرف، كتابة عبر triggers فقط
CREATE POLICY "ledger_select_owner_supervisor"
  ON ledger FOR SELECT
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND get_my_role() IN ('owner','supervisor')
  );

-- لا يُسمح لأي authenticated user بالكتابة المباشرة في ledger
-- الكتابة تتم فقط عبر SECURITY DEFINER triggers
CREATE POLICY "ledger_insert_triggers_only"
  ON ledger FOR INSERT
  TO authenticated
  WITH CHECK (FALSE);   -- يُرفع بواسطة الـ trigger (SECURITY DEFINER يتجاوز RLS)

-- audit_logs: قراءة للمالك فقط، لا حذف أبداً
CREATE POLICY "audit_select_owner"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND is_owner()
  );

CREATE POLICY "audit_insert_triggers_only"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (FALSE);   -- trigger فقط

CREATE POLICY "audit_no_delete"
  ON audit_logs FOR DELETE
  TO authenticated
  USING (FALSE);        -- ممنوع نهائياً لأسباب قانونية (audit trail)

-- user_profiles: المالك يرى الكل، الباقون يرون أنفسهم
CREATE POLICY "up_select_owner_all"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    is_my_tenant(org_id)
    AND (is_owner() OR id = auth.uid())
  );

CREATE POLICY "up_update_own_only"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND org_id = get_my_org_id()  -- لا يغيّر انتماءه لشركة أخرى
  );


-- ============================================================
-- PART 12 — TRIGGER: حماية الفواتير المعتمدة من الحذف
-- طبقة حماية إضافية فوق RLS (defense in depth)
-- ============================================================

CREATE OR REPLACE FUNCTION guard_approved_invoice_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.invoice_status NOT IN ('DRAFT') THEN
    RAISE EXCEPTION
      'SECURITY: لا يمكن حذف الفاتورة [%] بحالة [%]. الفواتير المعتمدة محمية قانونياً.',
      OLD.invoice_number, OLD.invoice_status
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_guard_approved_delete
  BEFORE DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION guard_approved_invoice_delete();


-- ============================================================
-- PART 13 — TRIGGER: منع تعديل is_posted للخلف
-- يمنع الكاشير من إلغاء اعتماد قيد بعد نشره
-- ============================================================

CREATE OR REPLACE FUNCTION guard_is_posted_rollback()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_posted = TRUE AND NEW.is_posted = FALSE THEN
    -- المالك فقط مسموح له في حالات الطوارئ (عبر Admin API)
    IF get_my_role() <> 'owner' THEN
      RAISE EXCEPTION
        'SECURITY: لا يمكن إلغاء اعتماد القيد [%]. تواصل مع المالك.',
        OLD.id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_posted_rollback_tx
  BEFORE UPDATE OF is_posted ON transactions
  FOR EACH ROW EXECUTE FUNCTION guard_is_posted_rollback();

CREATE TRIGGER trg_guard_posted_rollback_je
  BEFORE UPDATE OF is_posted ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION guard_is_posted_rollback();


-- ============================================================
-- PART 14 — SUMMARY VIEW (للمطورين والاختبار)
-- ============================================================

CREATE OR REPLACE VIEW rbac_policy_summary AS
SELECT
  tablename,
  policyname,
  cmd        AS operation,
  roles,
  qual       AS using_expr,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'user_roles','organizations','invoices','invoice_lines',
    'transactions','transaction_lines','journal_entries',
    'journal_entry_lines','accounts','ledger','audit_logs',
    'products','fiscal_periods','user_profiles'
  )
ORDER BY tablename, cmd, policyname;

COMMENT ON VIEW rbac_policy_summary IS
  'عرض تشخيصي لجميع سياسات RLS الخاصة بنظام رصيد — للاختبار فقط';


-- ============================================================
-- PART 15 — SEED: إنشاء مستخدم Owner عند تسجيل منظمة جديدة
-- ============================================================

CREATE OR REPLACE FUNCTION on_org_created_seed_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- إضافة المنشئ كـ Owner تلقائياً
  INSERT INTO user_roles (user_id, org_id, role)
  VALUES (auth.uid(), NEW.id, 'owner')
  ON CONFLICT (user_id, org_id) DO NOTHING;

  -- تهيئة شجرة الحسابات الافتراضية
  PERFORM seed_default_accounts(NEW.id);

  RETURN NEW;
END;
$$;

-- فقط إن لم يكن موجوداً مسبقاً
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_org_created_seed_owner'
  ) THEN
    CREATE TRIGGER trg_org_created_seed_owner
      AFTER INSERT ON organizations
      FOR EACH ROW EXECUTE FUNCTION on_org_created_seed_owner();
  END IF;
END $$;


-- ============================================================
-- ✅ VERIFICATION QUERIES (شغّلها بعد التطبيق للتأكد)
-- ============================================================

-- 1. عدد السياسات المُنشأة
-- SELECT tablename, COUNT(*) as policies
-- FROM pg_policies WHERE schemaname='public'
-- GROUP BY tablename ORDER BY tablename;

-- 2. اختبار منطق الأدوار (في حالة تجريبية)
-- SELECT get_my_role(), get_my_org_id(), is_owner(), is_supervisor();

-- 3. استعراض جميع السياسات
-- SELECT * FROM rbac_policy_summary;
