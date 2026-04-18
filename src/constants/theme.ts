// src/constants/theme.ts

// 1. منسقات الأرقام (لحسابات الفواتير والداشبورد)
export const fmt = new Intl.NumberFormat('ar-SA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const fmtShort = new Intl.NumberFormat('ar-SA', {
  maximumFractionDigits: 0,
});

// 2. بيانات الرسوم البيانية (لحل مشكلة CashflowChart)
export const CASHFLOW_DATA = [
  { month: 'يناير', income: 45000, expense: 32000 },
  { month: 'فبراير', income: 52000, expense: 34000 },
  { month: 'مارس', income: 48000, expense: 38000 },
  { month: 'أبريل', income: 61000, expense: 42000 },
];

// 3. بيانات السجل التجريبي (لحل مشكلة Dashboard/LEDGER_MOCK)
export const LEDGER_MOCK = [
  { id: '1', date: '2026-04-15', desc: 'مبيعات كاش - وردية الصباح', amount: 1250.50, status: 'paid' },
  { id: '2', date: '2026-04-16', desc: 'مشتريات مواد خام - مورد أ', amount: -4500.00, status: 'completed' },
  { id: '3', date: '2026-04-17', desc: 'فاتورة مبيعات رقم 1002', amount: 890.00, status: 'pending' },
];

// 4. بيانات الحالات (لحل مشكلة StatusBadge)
export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  paid:      { label: 'مدفوع', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  pending:   { label: 'معلق', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  cancelled: { label: 'ملغي', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  completed: { label: 'مكتمل', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
};

// 5. تعريف واجهة التبويبات
export interface NavTab {
  id: string;
  label: string;
  icon: string;
}

// 6. مصفوفة التبويبات الموحدة (كل الأقسام الجديدة)
export const NAV_TABS: NavTab[] = [
  { id: 'dashboard', label: 'الرئيسية', icon: '📊' },
  { id: 'pos',       label: 'نقطة البيع', icon: '🛒' },
  { id: 'invoices',  label: 'الفواتير', icon: '🧾' },
  { id: 'purchases', label: 'المشتريات', icon: '📦' },
  { id: 'suppliers', label: 'الموردين', icon: '👥' },
  { id: 'expenses',  label: 'المصروفات', icon: '💸' },
  { id: 'returns',   label: 'المرتجعات', icon: '🔄' },
  { id: 'settings',  label: 'الإعدادات', icon: '⚙️' },
];

// 7. ثوابت التصميم (Glassmorphism)
export const APP_BG = 'linear-gradient(135deg, #f0f4ff 0%, #fafffe 50%, #f5f0ff 100%)';
export const APP_FONT = "'Tajawal', sans-serif";

export const TOPBAR_STYLE = {
  background: 'rgba(10, 19, 38, 0.85)',
  backdropFilter: 'blur(20px)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
};

// 8. الحسابات الافتراضية
export const DEFAULT_ACCOUNTS = [
  { code: '1100', name: 'الصندوق والبنك', balance: 156220 },
  { code: '4100', name: 'إيرادات المبيعات', balance: 284750 },
  { code: '2300', name: 'ضريبة القيمة المضافة', balance: 42712 },
  { code: '5100', name: 'تكلفة البضاعة', balance: 147200 },
];