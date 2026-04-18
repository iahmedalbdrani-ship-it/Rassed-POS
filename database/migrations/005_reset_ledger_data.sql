-- ============================================================
-- Control Panel (رصيد) — Migration 005
-- تصفير بيانات القيود والسجلات والأرصدة
-- ⚠️  يحذف البيانات المحاسبية فقط ويحافظ على هيكل الجداول
-- ============================================================

BEGIN;

-- ─── 1. تصفير جداول القيود المحاسبية ─────────────────────────
-- حذف بنود القيود أولاً لاحترام قيود الـ FK
DELETE FROM journal_entry_lines;
DELETE FROM journal_entries;

-- إعادة ضبط التسلسل الخاص برقم القيد (entry_number)
ALTER SEQUENCE IF EXISTS journal_entries_entry_number_seq RESTART WITH 1;

-- ─── 2. تصفير القيود التقليدية (transactions) ────────────────
DELETE FROM transaction_lines;
DELETE FROM transactions;

-- ─── 3. تصفير دفتر الأستاذ (ledger) ──────────────────────────
DELETE FROM ledger;

-- ─── 4. تصفير الأرصدة (current_balance) ──────────────────────
-- الأرصدة الحقيقية محسوبة عبر الـ VIEW: account_balances
-- لكن إن كان عمود current_balance موجود في جدول accounts، نضعه صفراً
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'current_balance'
  ) THEN
    EXECUTE 'UPDATE accounts SET current_balance = 0';
  END IF;
END $$;

-- ─── 5. إضافة حساب مصروفات المرافق (الكهرباء/الماء/الاتصالات) إن لم يوجد ───
INSERT INTO accounts (code, name_ar, name_en, type, nature, is_header, level, is_active)
VALUES ('5500', 'مصروفات المرافق (كهرباء - ماء - اتصالات)', 'Utilities Expense', 'EXPENSE', 'DEBIT', FALSE, 2, TRUE)
ON CONFLICT (code) DO NOTHING;

-- ربط الأب
UPDATE accounts
SET parent_id = (SELECT id FROM accounts WHERE code = '5' LIMIT 1)
WHERE code = '5500';

-- ─── 6. التحقق من نجاح التصفير ───────────────────────────────
DO $$
DECLARE
  v_je_count   INT;
  v_jel_count  INT;
  v_tx_count   INT;
  v_led_count  INT;
BEGIN
  SELECT COUNT(*) INTO v_je_count   FROM journal_entries;
  SELECT COUNT(*) INTO v_jel_count  FROM journal_entry_lines;
  SELECT COUNT(*) INTO v_tx_count   FROM transactions;
  SELECT COUNT(*) INTO v_led_count  FROM ledger;

  RAISE NOTICE '✅ Reset complete — journal_entries=%, journal_entry_lines=%, transactions=%, ledger=%',
    v_je_count, v_jel_count, v_tx_count, v_led_count;
END $$;

COMMIT;
