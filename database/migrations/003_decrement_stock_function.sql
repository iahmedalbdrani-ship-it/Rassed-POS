-- ============================================================
-- Control Panel (رصيد) — Migration: decrement_stock RPC
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Function: atomically decrement stock qty after a POS sale
CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, qty_sold INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products
  SET stock      = GREATEST(0, stock - qty_sold),
      updated_at = now()
  WHERE id = product_id;

  -- Raise an exception if product not found
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % not found', product_id;
  END IF;
END;
$$;

-- Grant execute to the anon & authenticated roles
GRANT EXECUTE ON FUNCTION decrement_stock(UUID, INT) TO anon, authenticated;

-- ─── Ensure settings table exists ───────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID,
  name_ar          TEXT NOT NULL DEFAULT '',
  name_en          TEXT DEFAULT '',
  vat_number       TEXT DEFAULT '',
  cr_number        TEXT DEFAULT '',
  address          TEXT DEFAULT '',
  city             TEXT DEFAULT 'الرياض',
  phone            TEXT DEFAULT '',
  email            TEXT DEFAULT '',
  logo_url         TEXT DEFAULT '',
  currency         TEXT DEFAULT 'ر.س',
  tax_rate         NUMERIC DEFAULT 0.15,
  receipt_footer   TEXT DEFAULT 'شكراً لتعاملكم معنا',
  zatca_env        TEXT DEFAULT 'sandbox' CHECK (zatca_env IN ('sandbox', 'production')),
  zatca_cert       TEXT DEFAULT '',
  zatca_private_key TEXT DEFAULT '',
  zatca_otp        TEXT DEFAULT '',
  fatoora_api_key  TEXT DEFAULT '',
  fatoora_webhook  TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ─── Ensure products table has required columns ──────────────
ALTER TABLE IF EXISTS products
  ADD COLUMN IF NOT EXISTS icon        TEXT DEFAULT '📦',
  ADD COLUMN IF NOT EXISTS name_en     TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS barcode     TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS cost        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_stock   INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit        TEXT DEFAULT 'قطعة',
  ADD COLUMN IF NOT EXISTS vat_exempt  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS image_url   TEXT,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT now();

-- ─── Index for fast barcode lookups ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_barcode    ON products (barcode);
CREATE INDEX IF NOT EXISTS idx_products_is_active  ON products (is_active);
CREATE INDEX IF NOT EXISTS idx_products_category   ON products (category);

-- ─── Row Level Security ──────────────────────────────────────
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write their own settings
CREATE POLICY IF NOT EXISTS "settings_all_authenticated"
  ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow authenticated users to read/write products
CREATE POLICY IF NOT EXISTS "products_all_authenticated"
  ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anon to read products (for POS without login)
CREATE POLICY IF NOT EXISTS "products_read_anon"
  ON products FOR SELECT TO anon USING (is_active = true);
