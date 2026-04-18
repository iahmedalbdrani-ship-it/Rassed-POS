// ============================================================
// Control Panel (رصيد) — Static Reference Data
// NOTE: Product rows are now fetched from Supabase.
//       This file keeps only UI constants (categories, payment methods).
// ============================================================

import type { CategoryFilter } from '../types/pos';

// ─── UI Category Filters (for the POS sidebar) ───────────────
// These are display-only; the actual category strings come from DB.
export const CATEGORIES: CategoryFilter[] = [
  { id: 'all',      name: 'الكل',         icon: '🏪', color: 'bg-gradient-to-br from-slate-500 to-slate-600' },
  { id: 'rice',     name: 'الأرز',        icon: '🌾', color: 'bg-gradient-to-br from-amber-400 to-amber-600' },
  { id: 'drinks',   name: 'المشروبات',    icon: '🥤', color: 'bg-gradient-to-br from-blue-400 to-blue-600' },
  { id: 'dairy',    name: 'الألبان',      icon: '🥛', color: 'bg-gradient-to-br from-white to-blue-200' },
  { id: 'cleaning', name: 'المنظفات',     icon: '🧹', color: 'bg-gradient-to-br from-emerald-400 to-emerald-600' },
  { id: 'snacks',   name: 'المقرمشات',    icon: '🍿', color: 'bg-gradient-to-br from-orange-400 to-orange-600' },
  { id: 'frozen',   name: 'المجمدات',     icon: '🧊', color: 'bg-gradient-to-br from-cyan-400 to-cyan-600' },
  { id: 'bakery',   name: 'المخبوزات',    icon: '🍞', color: 'bg-gradient-to-br from-yellow-300 to-yellow-500' },
  { id: 'oils',     name: 'الزيوت',       icon: '🫒', color: 'bg-gradient-to-br from-lime-500 to-lime-700' },
  { id: 'spices',   name: 'التوابل',      icon: '🌿', color: 'bg-gradient-to-br from-green-500 to-green-700' },
  { id: 'canned',   name: 'المعلبات',     icon: '🫙', color: 'bg-gradient-to-br from-stone-400 to-stone-600' },
];

// ─── Payment Methods (UI constants) ──────────────────────────
export const PAYMENT_METHODS = [
  { id: 'cash'       as const, name: 'نقدي',         nameAr: 'نقدي',         icon: 'banknote',    color: 'bg-gradient-to-br from-emerald-500 to-emerald-700' },
  { id: 'mada'       as const, name: 'بطاقة مدى',    nameAr: 'بطاقة مدى',    icon: 'credit-card', color: 'bg-gradient-to-br from-red-500 to-red-700' },
  { id: 'visa'       as const, name: 'Visa',          nameAr: 'فيزا',         icon: 'credit-card', color: 'bg-gradient-to-br from-blue-600 to-blue-800' },
  { id: 'mastercard' as const, name: 'Mastercard',    nameAr: 'ماستركارد',    icon: 'credit-card', color: 'bg-gradient-to-br from-orange-500 to-orange-700' },
];

// ─── Empty settings fallback (used before DB fetch completes) ─
// Real values are loaded from Supabase `settings` table.
export const STORE_SETTINGS_FALLBACK = {
  name_ar:         'جاري التحميل...',
  name_en:         '',
  vat_number:      '',
  cr_number:       '',
  address:         '',
  city:            'الرياض',
  phone:           '',
  email:           '',
  currency:        'ر.س',
  tax_rate:        0.15,
  receipt_footer:  'شكراً لتعاملكم معنا | رصيد ERP | متوافق مع ZATCA Phase 2',
  zatca_env:       'sandbox' as 'sandbox' | 'production',
};
