// ============================================================
// Control Panel (رصيد) — Supabase Services Layer
// Products | Settings | Inventory | Toast
// ============================================================

import supabase from './supabase';

// ─── Types ───────────────────────────────────────────────────

export interface ProductRow {
  id: string;
  org_id?: string;
  barcode?: string;
  name: string;
  name_en?: string;
  category?: string;
  price: number;
  cost?: number;
  stock: number;
  min_stock?: number;
  unit?: string;
  icon?: string;
  image_url?: string;
  vat_exempt?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StoreSettings {
  id?: string;
  org_id?: string;
  name_ar: string;
  name_en?: string;
  vat_number: string;
  cr_number?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  currency?: string;
  tax_rate?: number;
  receipt_footer?: string;
  zatca_env?: 'sandbox' | 'production';
  zatca_cert?: string;
  zatca_private_key?: string;
  zatca_otp?: string;
  fatoora_api_key?: string;
  fatoora_webhook?: string;
}

// ─── Default fallback settings (shown while loading) ─────────
export const DEFAULT_SETTINGS: StoreSettings = {
  name_ar: '',
  name_en: '',
  vat_number: '',
  cr_number: '',
  address: '',
  city: 'الرياض',
  phone: '',
  email: '',
  currency: 'ر.س',
  tax_rate: 0.15,
  receipt_footer: 'شكراً لتعاملكم معنا | رصيد ERP | متوافق مع ZATCA Phase 2',
  zatca_env: 'sandbox',
};

// ═══════════════════════════════════════════════════════════
// ── PRODUCTS SERVICE ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════
// ─── Guard ────────────────────────────────────────────────────
function assertOrgId(orgId: string | undefined | null): asserts orgId is string {
  if (!orgId?.trim()) throw new Error('[Service] org_id مطلوب — لم يتم تحميل بيانات المؤسسة بعد');
}

export const productsService = {

  /** Fetch all active products for the org */
  async list(orgId: string): Promise<ProductRow[]> {
    assertOrgId(orgId);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw new Error(`products.list: ${error.message}`);
    return (data ?? []) as ProductRow[];
  },

  /** Search products by name or barcode within the org */
  async search(orgId: string, query: string): Promise<ProductRow[]> {
    assertOrgId(orgId);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,barcode.ilike.%${query}%,name_en.ilike.%${query}%`)
      .order('name', { ascending: true })
      .limit(50);

    if (error) throw new Error(`products.search: ${error.message}`);
    return (data ?? []) as ProductRow[];
  },

  /** Get single product by barcode within the org */
  async getByBarcode(orgId: string, barcode: string): Promise<ProductRow | null> {
    assertOrgId(orgId);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('org_id', orgId)
      .eq('barcode', barcode)
      .eq('is_active', true)
      .single();

    if (error) return null;
    return data as ProductRow;
  },

  /** Add new product — org_id must come from TenantContext */
  async create(product: Omit<ProductRow, 'id' | 'created_at' | 'updated_at'>): Promise<ProductRow> {
    assertOrgId(product.org_id);
    const { data, error } = await supabase
      .from('products')
      .insert({ ...product, is_active: true })
      .select()
      .single();

    if (error) throw new Error(`products.create: ${error.message}`);
    return data as ProductRow;
  },

  /** Update existing product — double org_id guard */
  async update(id: string, orgId: string, updates: Partial<ProductRow>): Promise<ProductRow> {
    assertOrgId(orgId);
    const { data, error } = await supabase
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) throw new Error(`products.update: ${error.message}`);
    return data as ProductRow;
  },

  /** Soft-delete a product — double org_id guard */
  async delete(id: string, orgId: string): Promise<void> {
    assertOrgId(orgId);
    const { error } = await supabase
      .from('products')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) throw new Error(`products.delete: ${error.message}`);
  },

  /**
   * Deduct sold quantities from stock.
   * Called after a successful POS sale.
   * Each item: { id, qty }
   */
  async deductStock(soldItems: Array<{ id: string; qty: number }>): Promise<void> {
    const updates = soldItems.map(({ id, qty }) =>
      supabase.rpc('decrement_stock', { product_id: id, qty_sold: qty })
    );
    const results = await Promise.all(updates);
    for (const { error } of results) {
      if (error) throw new Error(`products.deductStock: ${error.message}`);
    }
  },
};

// ═══════════════════════════════════════════════════════════
// ── SETTINGS SERVICE ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════
export const settingsService = {

  /** Fetch organization settings by org_id */
  async get(orgId: string): Promise<StoreSettings> {
    assertOrgId(orgId);
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('org_id', orgId)
      .limit(1)
      .single();

    if (error || !data) {
      console.warn('[Settings] No settings found, using defaults');
      return DEFAULT_SETTINGS;
    }
    return data as StoreSettings;
  },

  /** Upsert organization settings — scoped to org_id */
  async save(orgId: string, settings: Partial<StoreSettings>): Promise<StoreSettings> {
    assertOrgId(orgId);

    const { data: existing } = await supabase
      .from('settings')
      .select('id')
      .eq('org_id', orgId)
      .limit(1)
      .single();

    if (existing?.id) {
      const { data, error } = await supabase
        .from('settings')
        .update({ ...settings, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .eq('org_id', orgId)
        .select()
        .single();

      if (error) throw new Error(`settings.update: ${error.message}`);
      return data as StoreSettings;
    } else {
      const { data, error } = await supabase
        .from('settings')
        .insert({ ...settings, org_id: orgId })
        .select()
        .single();

      if (error) throw new Error(`settings.insert: ${error.message}`);
      return data as StoreSettings;
    }
  },
};

// ═══════════════════════════════════════════════════════════
// ── POS SALES SERVICE ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════
export const posSalesService = {

  /**
   * Record a completed POS sale:
   * 1. Insert into invoices table
   * 2. Deduct stock from products
   * 3. Create accounting entry (transactions)
   */
  async completeSale(saleData: {
    org_id: string;
    invoice_number: string;
    invoice_uuid: string;
    cashier_id: string;
    cashier_name: string;
    branch_name: string;
    items: Array<{
      id: string;
      name: string;
      barcode?: string;
      qty: number;
      unit_price: number;
      discount_pct: number;
      vat_rate: number;
      vat_amount: number;
      line_total: number;
    }>;
    subtotal_ex_vat: number;
    total_discount: number;
    total_vat: number;
    grand_total: number;
    payment_method: string;
    payment_amount: number;
    zatca_qr: string;
    settings: StoreSettings;
  }) {
    const now = new Date().toISOString();

    // 1. Insert invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        org_id: saleData.org_id,
        invoice_number: saleData.invoice_number,
        uuid: saleData.invoice_uuid,
        invoice_type: 'SIMPLIFIED',
        invoice_status: 'CLEARED',
        issue_date: now.slice(0, 10),
        subtotal: saleData.subtotal_ex_vat,
        discount_amount: saleData.total_discount,
        taxable_amount: saleData.subtotal_ex_vat - saleData.total_discount,
        vat_rate: 15,
        vat_amount: saleData.total_vat,
        total_amount: saleData.grand_total,
        qr_code: saleData.zatca_qr,
        notes: `كاشير: ${saleData.cashier_name} | فرع: ${saleData.branch_name} | دفع: ${saleData.payment_method}`,
      })
      .select()
      .single();

    if (invErr) throw new Error(`posSales.invoice: ${invErr.message}`);

    // 2. Insert invoice lines
    const lines = saleData.items.map((item, i) => ({
      invoice_id: invoice.id,
      line_number: i + 1,
      item_name_ar: item.name,
      item_code: item.barcode ?? item.id,
      quantity: item.qty,
      unit_price: item.unit_price,
      discount_pct: item.discount_pct,
      vat_rate: item.vat_rate,
      vat_amount: item.vat_amount,
      line_total: item.line_total,
    }));

    const { error: linesErr } = await supabase.from('invoice_lines').insert(lines);
    if (linesErr) console.error('[POS] invoice_lines insert error:', linesErr.message);

    // 3. Deduct stock (non-blocking — log error only)
    try {
      await productsService.deductStock(
        saleData.items.map(i => ({ id: i.id, qty: i.qty }))
      );
    } catch (stockErr) {
      console.error('[POS] stock deduction failed:', stockErr);
    }

    return invoice;
  },
};
