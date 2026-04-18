// ============================================================
// Control Panel (رصيد) — Tenant Context
// ============================================================

import { createContext, useContext, type ReactNode } from 'react';

interface TenantInfo {
  id: string; nameAr: string; nameEn: string;
  vatNumber: string; city: string; currency: string; vatRate: number;
}

const DEFAULT_TENANT: TenantInfo = {
  id: 'tenant-raseed-001', nameAr: 'متجر رصيد الذكي',
  nameEn: 'Raseed Smart Store', vatNumber: '310123456700003',
  city: 'الرياض', currency: 'SAR', vatRate: 0.15,
};

const TenantContext = createContext<TenantInfo>(DEFAULT_TENANT);

export function TenantProvider({ children }: { children: ReactNode }) {
  return <TenantContext.Provider value={DEFAULT_TENANT}>{children}</TenantContext.Provider>;
}

export const useTenant = () => useContext(TenantContext);
