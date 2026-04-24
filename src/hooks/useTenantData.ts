// ============================================================
// رصيد — useTenantData Hook
//
// Hook موحّد للمكونات — يُغني عن استدعاء supabase مباشرةً.
// يجلب البيانات تلقائياً عند تحميل المكون ويُعيد:
//   { data, isLoading, error, refetch, add, update, remove }
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTenant } from '../contexts/TenantContext';
import {
  getTenantData,
  addTenantData,
  updateTenantData,
  deleteTenantData,
  softDeleteTenantData,
  type TenantQueryOptions,
} from '../lib/tenant';

// ─── Types ────────────────────────────────────────────────────

interface UseTenantDataState<T> {
  data:      T[];
  isLoading: boolean;
  error:     string | null;
}

interface UseTenantDataReturn<T> {
  data:      T[];
  isLoading: boolean;
  error:     string | null;
  refetch:   () => Promise<void>;
  add:       (record: Omit<T, 'id' | 'org_id' | 'created_at' | 'updated_at'>) => Promise<T>;
  update:    (id: string, changes: Partial<Omit<T, 'id' | 'org_id' | 'created_at'>>) => Promise<T>;
  remove:    (id: string) => Promise<void>;
  softRemove:(id: string) => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────

/**
 * @param table   — اسم جدول Supabase
 * @param options — فلاتر، ترتيب، حقول (اختياري)
 * @param enabled — هل يُنفَّذ الجلب؟ (اختياري، افتراضي true)
 *
 * @example
 * const { data: products, isLoading, add } = useTenantData<ProductRow>('products', {
 *   filters: [{ column: 'is_active', operator: 'eq', value: true }],
 *   order:   { column: 'name', ascending: true },
 * });
 */
export function useTenantData<T extends Record<string, unknown>>(
  table:    string,
  options:  TenantQueryOptions = {},
  enabled = true,
): UseTenantDataReturn<T> {
  const { orgId, isLoading: tenantLoading } = useTenant();

  const [state, setState] = useState<UseTenantDataState<T>>({
    data:      [],
    isLoading: true,
    error:     null,
  });

  // Stable reference to options to avoid unnecessary refetches
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const fetch = useCallback(async () => {
    if (!enabled || !orgId) return;

    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const rows = await getTenantData<T>(table, orgId, optionsRef.current);
      setState({ data: rows, isLoading: false, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : `خطأ في جلب بيانات ${table}`;
      setState(s => ({ ...s, isLoading: false, error: msg }));
    }
  }, [table, orgId, enabled]);

  useEffect(() => {
    if (!tenantLoading) fetch();
  }, [fetch, tenantLoading]);

  const add = useCallback(async (
    record: Omit<T, 'id' | 'org_id' | 'created_at' | 'updated_at'>,
  ): Promise<T> => {
    if (!orgId) throw new Error('[useTenantData] orgId غير محمّل بعد');
    const created = await addTenantData<T>(table, orgId, record);
    setState(s => ({ ...s, data: [...s.data, created] }));
    return created;
  }, [table, orgId]);

  const update = useCallback(async (
    id:      string,
    changes: Partial<Omit<T, 'id' | 'org_id' | 'created_at'>>,
  ): Promise<T> => {
    if (!orgId) throw new Error('[useTenantData] orgId غير محمّل بعد');
    const updated = await updateTenantData<T>(table, orgId, id, changes);
    setState(s => ({
      ...s,
      data: s.data.map(row => (row['id'] === id ? updated : row)),
    }));
    return updated;
  }, [table, orgId]);

  const remove = useCallback(async (id: string): Promise<void> => {
    if (!orgId) throw new Error('[useTenantData] orgId غير محمّل بعد');
    await deleteTenantData(table, orgId, id);
    setState(s => ({ ...s, data: s.data.filter(row => row['id'] !== id) }));
  }, [table, orgId]);

  const softRemove = useCallback(async (id: string): Promise<void> => {
    if (!orgId) throw new Error('[useTenantData] orgId غير محمّل بعد');
    await softDeleteTenantData(table, orgId, id);
    setState(s => ({
      ...s,
      data: s.data.filter(row => row['id'] !== id),
    }));
  }, [table, orgId]);

  return {
    data:      state.data,
    isLoading: state.isLoading || tenantLoading,
    error:     state.error,
    refetch:   fetch,
    add,
    update,
    remove,
    softRemove,
  };
}
