// ============================================================
// رصيد — Tenant-Aware Data Access Layer
//
// كل عملية قراءة أو كتابة تمر من هنا وتُطبّق org_id تلقائياً.
// لا يجوز استدعاء supabase مباشرةً من المكونات أو الصفحات.
// ============================================================

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────

export type FilterOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'like' | 'ilike' | 'is' | 'in';

export interface TenantFilter {
  column:   string;
  operator: FilterOperator;
  value:    unknown;
}

export interface TenantQueryOptions {
  select?:  string;
  filters?: TenantFilter[];
  order?:   { column: string; ascending?: boolean };
  limit?:   number;
  offset?:  number;
}

// ─── Internal: apply extra filters to a query builder ─────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, filters: TenantFilter[]): any {
  let q = query;
  for (const f of filters) {
    switch (f.operator) {
      case 'eq':    q = q.eq(f.column, f.value);  break;
      case 'neq':   q = q.neq(f.column, f.value); break;
      case 'gt':    q = q.gt(f.column, f.value);  break;
      case 'gte':   q = q.gte(f.column, f.value); break;
      case 'lt':    q = q.lt(f.column, f.value);  break;
      case 'lte':   q = q.lte(f.column, f.value); break;
      case 'like':  q = q.like(f.column, f.value as string); break;
      case 'ilike': q = q.ilike(f.column, f.value as string); break;
      case 'is':    q = q.is(f.column, f.value as null | boolean); break;
      case 'in':    q = q.in(f.column, f.value as unknown[]); break;
    }
  }
  return q;
}

// ─── READ ─────────────────────────────────────────────────────

/**
 * جلب سجلات من جدول بعد فرض فلتر org_id.
 * يُستخدم بديلاً عن supabase.from(table).select() المباشر.
 */
export async function getTenantData<T = Record<string, unknown>>(
  table:   string,
  orgId:   string,
  options: TenantQueryOptions = {},
): Promise<T[]> {
  if (!orgId) throw new Error(`[Tenant] orgId مطلوب للقراءة من جدول "${table}"`);

  const select = options.select ?? '*';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from(table)
    .select(select)
    .eq('org_id', orgId);

  if (options.filters?.length) query = applyFilters(query, options.filters);
  if (options.order)  query = query.order(options.order.column, { ascending: options.order.ascending ?? true });
  if (options.limit)  query = query.limit(options.limit);
  if (options.offset) query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);

  const { data, error } = await query;
  if (error) throw new Error(`[Tenant] getTenantData(${table}): ${error.message}`);
  return (data ?? []) as T[];
}

/**
 * جلب سجل واحد بـ id + org_id.
 */
export async function getTenantRecord<T = Record<string, unknown>>(
  table:  string,
  orgId:  string,
  id:     string,
  select = '*',
): Promise<T> {
  if (!orgId) throw new Error(`[Tenant] orgId مطلوب للقراءة من جدول "${table}"`);

  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq('org_id', orgId)
    .eq('id', id)
    .single();

  if (error) throw new Error(`[Tenant] getTenantRecord(${table}, ${id}): ${error.message}`);
  return data as T;
}

// ─── WRITE ────────────────────────────────────────────────────

/**
 * إدراج سجل جديد مع حقن org_id تلقائياً.
 */
export async function addTenantData<T = Record<string, unknown>>(
  table:  string,
  orgId:  string,
  data:   Omit<T, 'id' | 'org_id' | 'created_at' | 'updated_at'>,
): Promise<T> {
  if (!orgId) throw new Error(`[Tenant] orgId مطلوب للكتابة في جدول "${table}"`);

  const { data: result, error } = await supabase
    .from(table)
    .insert({ ...(data as Record<string, unknown>), org_id: orgId })
    .select()
    .single();

  if (error) throw new Error(`[Tenant] addTenantData(${table}): ${error.message}`);
  return result as T;
}

/**
 * تحديث سجل بعد التحقق من org_id (يمنع تعديل بيانات مؤسسة أخرى).
 */
export async function updateTenantData<T = Record<string, unknown>>(
  table:   string,
  orgId:   string,
  id:      string,
  changes: Partial<Omit<T, 'id' | 'org_id' | 'created_at'>>,
): Promise<T> {
  if (!orgId) throw new Error(`[Tenant] orgId مطلوب للتحديث في جدول "${table}"`);

  const { data, error } = await supabase
    .from(table)
    .update({ ...(changes as Record<string, unknown>), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)   // ← الحماية المزدوجة: لا تُعدّل سجلات مؤسسات أخرى
    .select()
    .single();

  if (error) throw new Error(`[Tenant] updateTenantData(${table}, ${id}): ${error.message}`);
  return data as T;
}

/**
 * حذف سجل بعد التحقق من org_id.
 */
export async function deleteTenantData(
  table: string,
  orgId: string,
  id:    string,
): Promise<void> {
  if (!orgId) throw new Error(`[Tenant] orgId مطلوب للحذف من جدول "${table}"`);

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);   // ← الحماية المزدوجة

  if (error) throw new Error(`[Tenant] deleteTenantData(${table}, ${id}): ${error.message}`);
}

/**
 * حذف ناعم (soft delete) — يضبط is_active = false.
 */
export async function softDeleteTenantData(
  table: string,
  orgId: string,
  id:    string,
): Promise<void> {
  if (!orgId) throw new Error(`[Tenant] orgId مطلوب للحذف الناعم من جدول "${table}"`);

  const { error } = await supabase
    .from(table)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) throw new Error(`[Tenant] softDeleteTenantData(${table}, ${id}): ${error.message}`);
}
