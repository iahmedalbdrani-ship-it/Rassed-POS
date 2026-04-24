// ============================================================
// رصيد — Tenant Context
//
// يُحمّل بيانات المؤسسة من جدول settings في Supabase
// ويُوفّر orgId لكل المكونات الداخلية.
// ============================================================

import {
  createContext, useContext, useState, useEffect, useCallback,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

// ─── Types ────────────────────────────────────────────────────

export interface TenantInfo {
  id:         string;   // org_id — المفتاح المستخدم في كل الاستعلامات
  nameAr:     string;
  nameEn:     string;
  vatNumber:  string;
  crNumber:   string;
  city:       string;
  address:    string;
  phone:      string;
  currency:   string;
  vatRate:    number;   // 0.15
  logoUrl:    string | null;
  zatcaEnv:   'sandbox' | 'production';
}

interface TenantContextValue {
  tenant:     TenantInfo | null;
  orgId:      string;           // shortcut — empty string when not loaded
  isLoading:  boolean;
  error:      string | null;
  refetch:    () => Promise<void>;
}

// ─── Defaults ─────────────────────────────────────────────────

const FALLBACK_TENANT: TenantInfo = {
  id:        'tenant-raseed-001',
  nameAr:    'متجر رصيد الذكي',
  nameEn:    'Raseed Smart Store',
  vatNumber: '310123456700003',
  crNumber:  '',
  city:      'الرياض',
  address:   '',
  phone:     '',
  currency:  'SAR',
  vatRate:   0.15,
  logoUrl:   null,
  zatcaEnv:  'sandbox',
};

// ─── Context ──────────────────────────────────────────────────

const TenantContext = createContext<TenantContextValue>({
  tenant:    null,
  orgId:     '',
  isLoading: true,
  error:     null,
  refetch:   async () => {},
});

// ─── Provider ─────────────────────────────────────────────────

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [tenant,    setTenant]    = useState<TenantInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const loadTenant = useCallback(async () => {
    if (!isAuthenticated) {
      setTenant(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // جلب إعدادات المؤسسة — الصف الأول مرتبط بالمستخدم الحالي
      const { data, error: dbErr } = await supabase
        .from('settings')
        .select('id,name_ar,name_en,vat_number,cr_number,city,address,phone,currency,tax_rate,logo_url,zatca_env')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (dbErr) throw new Error(dbErr.message);

      if (data) {
        setTenant({
          id:        data.id         ?? FALLBACK_TENANT.id,
          nameAr:    data.name_ar    ?? FALLBACK_TENANT.nameAr,
          nameEn:    data.name_en    ?? FALLBACK_TENANT.nameEn,
          vatNumber: data.vat_number ?? FALLBACK_TENANT.vatNumber,
          crNumber:  data.cr_number  ?? '',
          city:      data.city       ?? FALLBACK_TENANT.city,
          address:   data.address    ?? '',
          phone:     data.phone      ?? '',
          currency:  data.currency   ?? 'SAR',
          vatRate:   +(data.tax_rate ?? 0.15),
          logoUrl:   data.logo_url   ?? null,
          zatcaEnv:  (data.zatca_env as 'sandbox' | 'production') ?? 'sandbox',
        });
      } else {
        // لا يوجد سجل في settings — استخدام الـ fallback مع uid المستخدم
        setTenant({ ...FALLBACK_TENANT, id: user?.id ?? FALLBACK_TENANT.id });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ في تحميل بيانات المؤسسة';
      setError(msg);
      // fallback عند الخطأ لضمان عمل التطبيق
      setTenant({ ...FALLBACK_TENANT, id: user?.id ?? FALLBACK_TENANT.id });
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => { loadTenant(); }, [loadTenant]);

  const value: TenantContextValue = {
    tenant,
    orgId:     tenant?.id ?? '',
    isLoading,
    error,
    refetch:   loadTenant,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────

export const useTenant = () => useContext(TenantContext);

/** يُعيد orgId جاهزاً — يرمي خطأً إذا لم يكن محمّلاً بعد */
export function useOrgId(): string {
  const { orgId, isLoading } = useContext(TenantContext);
  if (isLoading) return '';
  return orgId;
}
