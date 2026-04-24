// ============================================================
// رصيد — Customer Service
//
// NEVER call supabase directly in components — use these
// functions only. كل دالة تُطبّق org_id بشكل إلزامي.
// ============================================================

import { supabase } from '@/lib/supabase';
import type { Customer, CustomerInsert, CustomerUpdate, CustomerOption } from '@/types/customer';

// ─── Guard ────────────────────────────────────────────────────

function assertOrgId(orgId: string | undefined | null): asserts orgId is string {
  if (!orgId?.trim()) {
    throw new Error('[CustomerService] org_id مطلوب — لم يتم تحميل بيانات المؤسسة بعد');
  }
}

// ═══════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════

/** جلب جميع عملاء المؤسسة (نشطون فقط بالافتراض) */
export async function getCustomers(
  orgId: string,
  includeInactive = false,
): Promise<Customer[]> {
  assertOrgId(orgId);

  let q = supabase
    .from('customers')
    .select('*')
    .eq('org_id', orgId)
    .order('name', { ascending: true });

  if (!includeInactive) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) throw new Error(`customers.list: ${error.message}`);
  return (data ?? []) as Customer[];
}

/** قائمة مختصرة للقوائم المنسدلة */
export async function getCustomerOptions(orgId: string): Promise<CustomerOption[]> {
  assertOrgId(orgId);

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, vat_number')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw new Error(`customers.options: ${error.message}`);
  return (data ?? []) as CustomerOption[];
}

/** جلب عميل واحد — org_id مُحقَّق مزدوج */
export async function getCustomerById(
  id: string,
  orgId: string,
): Promise<Customer> {
  assertOrgId(orgId);

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)        // ← الحماية المزدوجة — لا تُحذف أبداً
    .single();

  if (error) throw new Error(`customers.getById(${id}): ${error.message}`);
  return data as Customer;
}

/** بحث نصي في الاسم / الهاتف / الرقم الضريبي */
export async function searchCustomers(
  orgId: string,
  query: string,
  limit = 20,
): Promise<Customer[]> {
  assertOrgId(orgId);
  if (!query.trim()) return getCustomers(orgId);

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('org_id', orgId)
    .or(`name.ilike.%${query}%,phone.ilike.%${query}%,vat_number.ilike.%${query}%`)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`customers.search: ${error.message}`);
  return (data ?? []) as Customer[];
}

// ═══════════════════════════════════════════════════════════
// WRITE
// ═══════════════════════════════════════════════════════════

/**
 * إنشاء عميل جديد.
 * org_id يجب أن يأتي من TenantContext — لا من مدخلات المستخدم.
 */
export async function createCustomer(payload: CustomerInsert): Promise<Customer> {
  assertOrgId(payload.org_id);

  const { data, error } = await supabase
    .from('customers')
    .insert({ ...payload, is_active: true })
    .select()
    .single();

  if (error) throw new Error(`customers.create: ${error.message}`);
  return data as Customer;
}

/** تحديث عميل — org_id مُحقَّق مزدوج */
export async function updateCustomer(
  id: string,
  orgId: string,
  updates: CustomerUpdate,
): Promise<Customer> {
  assertOrgId(orgId);

  const { data, error } = await supabase
    .from('customers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)        // ← يمنع تعديل عملاء مؤسسات أخرى
    .select()
    .single();

  if (error) throw new Error(`customers.update(${id}): ${error.message}`);
  return data as Customer;
}

/** حذف ناعم (is_active = false) — يحافظ على الأرشيف */
export async function deactivateCustomer(
  id: string,
  orgId: string,
): Promise<void> {
  assertOrgId(orgId);

  const { error } = await supabase
    .from('customers')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId);       // ← الحماية المزدوجة

  if (error) throw new Error(`customers.deactivate(${id}): ${error.message}`);
}

/** حذف فعلي — للاستخدام الإداري فقط بعد تأكيد */
export async function deleteCustomer(
  id: string,
  orgId: string,
): Promise<void> {
  assertOrgId(orgId);

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);       // ← يمنع حذف عملاء مؤسسات أخرى

  if (error) throw new Error(`customers.delete(${id}): ${error.message}`);
}
