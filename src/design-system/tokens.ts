// ============================================================
// Control Panel (رصيد) — Design System Tokens
// White Glassmorphism | Corporate Blue | Arabic RTL
// ============================================================

// ─── Color Palette ───────────────────────────────────────────
export const COLORS = {
  // Brand – Corporate Blue
  blue: {
    50:  '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',   // PRIMARY ACTION
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },

  // Neutral Slate
  slate: {
    50:  '#f8fafc',   // APP BACKGROUND
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },

  // Semantic
  emerald: {
    DEFAULT: '#10b981',
    light:   'rgba(16,185,129,0.10)',
    glow:    'rgba(16,185,129,0.30)',
  },
  rose: {
    DEFAULT: '#f43f5e',
    light:   'rgba(244,63,94,0.10)',
    glow:    'rgba(244,63,94,0.30)',
  },
  amber: {
    DEFAULT: '#f59e0b',
    light:   'rgba(245,158,11,0.10)',
    glow:    'rgba(245,158,11,0.30)',
  },

  // Pure
  white:       '#ffffff',
  transparent: 'transparent',
} as const;

// ─── Glassmorphism Surfaces ───────────────────────────────────
export const GLASS = {
  // Standard frosted card
  card: {
    background:        'rgba(255,255,255,0.70)',
    backdropFilter:    'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border:            '1px solid rgba(255,255,255,0.85)',
    boxShadow:         '0 4px 32px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.9) inset',
  },
  // Elevated modal / dropdown
  elevated: {
    background:        'rgba(255,255,255,0.82)',
    backdropFilter:    'blur(32px)',
    WebkitBackdropFilter: 'blur(32px)',
    border:            '1px solid rgba(255,255,255,0.9)',
    boxShadow:         '0 20px 60px rgba(0,0,0,0.10), 0 1px 0 rgba(255,255,255,1) inset',
  },
  // Dark sidebar
  sidebar: {
    background:        'rgba(255,255,255,0.68)',
    backdropFilter:    'blur(28px)',
    WebkitBackdropFilter: 'blur(28px)',
    borderLeft:        '1px solid rgba(255,255,255,0.85)',
    boxShadow:         '4px 0 32px rgba(37,99,235,0.06)',
  },
  // Subtle section divider
  subtle: {
    background:        'rgba(255,255,255,0.45)',
    backdropFilter:    'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border:            '1px solid rgba(255,255,255,0.65)',
    boxShadow:         '0 2px 12px rgba(0,0,0,0.04)',
  },
} as const;

// ─── Background Gradients ─────────────────────────────────────
export const GRADIENTS = {
  // Main app background
  appBg: 'linear-gradient(145deg, #f0f5ff 0%, #f8fafc 40%, #eef2ff 70%, #f0fdf4 100%)',

  // Primary button – Corporate Blue
  primaryBtn: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',

  // Success – Emerald
  successBtn: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',

  // Danger – Rose
  dangerBtn: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',

  // Stats card accents
  blueAccent:   'linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(37,99,235,0.04) 100%)',
  emeraldAccent:'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.04) 100%)',
  roseAccent:   'linear-gradient(135deg, rgba(244,63,94,0.12) 0%, rgba(244,63,94,0.04) 100%)',
  amberAccent:  'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.04) 100%)',

  // Glowing confirm button
  confirmGlow:  'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
} as const;

// ─── Border Radius ────────────────────────────────────────────
export const RADIUS = {
  sm:   '0.75rem',   // 12px – tags, badges
  md:   '1rem',      // 16px – inputs, small cards
  lg:   '1.5rem',    // 24px – cards
  xl:   '2rem',      // 32px – large panels
  xxl:  '2.5rem',    // 40px – hero cards
  full: '9999px',    // pills
} as const;

// ─── Typography ───────────────────────────────────────────────
export const FONT = {
  family: "'Tajawal', 'Noto Sans Arabic', sans-serif",
  weights: { normal: 400, medium: 500, semibold: 600, bold: 700, black: 900 },
  sizes: {
    xs:   '0.688rem',  // 11px
    sm:   '0.75rem',   // 12px
    base: '0.875rem',  // 14px
    md:   '1rem',      // 16px
    lg:   '1.125rem',  // 18px
    xl:   '1.25rem',   // 20px
    '2xl':'1.5rem',    // 24px
    '3xl':'1.875rem',  // 30px
    '4xl':'2.25rem',   // 36px
  },
} as const;

// ─── Shadow System ────────────────────────────────────────────
export const SHADOWS = {
  none:   'none',
  sm:     '0 1px 4px rgba(0,0,0,0.06)',
  md:     '0 4px 16px rgba(0,0,0,0.08)',
  lg:     '0 8px 32px rgba(0,0,0,0.10)',
  xl:     '0 16px 48px rgba(0,0,0,0.12)',
  blue:   '0 8px 32px rgba(37,99,235,0.25)',
  blueGlow: '0 0 32px rgba(37,99,235,0.40), 0 0 64px rgba(37,99,235,0.20)',
  emerald:'0 8px 24px rgba(16,185,129,0.25)',
  rose:   '0 8px 24px rgba(244,63,94,0.25)',
} as const;

// ─── Animation Durations ──────────────────────────────────────
export const MOTION = {
  fast:   '120ms',
  normal: '200ms',
  slow:   '350ms',
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// ─── Spacing Scale ────────────────────────────────────────────
export const SPACE = {
  1:  '0.25rem',
  2:  '0.5rem',
  3:  '0.75rem',
  4:  '1rem',
  5:  '1.25rem',
  6:  '1.5rem',
  8:  '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
} as const;

// ─── Format Helpers ───────────────────────────────────────────
export const fmt = new Intl.NumberFormat('ar-SA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  }).format(n);

export const fmtShort = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}م`
    : n >= 1000
    ? `${(n / 1000).toFixed(0)}ك`
    : String(Math.round(n));

// ─── Status Metadata ──────────────────────────────────────────
export const STATUS_META = {
  paid:      { label: 'مدفوع',   color: '#10b981', bg: 'rgba(16,185,129,0.10)' },
  pending:   { label: 'معلق',    color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
  cancelled: { label: 'ملغي',    color: '#f43f5e', bg: 'rgba(244,63,94,0.10)' },
  completed: { label: 'مكتمل',   color: '#10b981', bg: 'rgba(16,185,129,0.10)' },
  cleared:   { label: 'مقبولة',  color: '#10b981', bg: 'rgba(16,185,129,0.10)' },
  reported:  { label: 'مُرسلة',  color: '#2563eb', bg: 'rgba(37,99,235,0.10)'  },
  rejected:  { label: 'مرفوضة', color: '#f43f5e', bg: 'rgba(244,63,94,0.10)' },
  draft:     { label: 'مسودة',   color: '#94a3b8', bg: 'rgba(148,163,184,0.10)'},
} as const;

// ─── Mock Micro-chart Data ────────────────────────────────────
export const SPARK_SALES     = [42, 58, 51, 73, 68, 85, 92, 79, 95, 88, 102, 97];
export const SPARK_EXPENSES  = [31, 28, 35, 29, 38, 32, 41, 36, 30, 44, 39, 42];
export const SPARK_PROFIT    = [11, 30, 16, 44, 30, 53, 51, 43, 65, 44, 63, 55];
