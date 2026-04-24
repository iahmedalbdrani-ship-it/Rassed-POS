// ============================================================
// Control Panel (رصيد) — Glass Component Library
// White Glassmorphism | Corporate Blue | Arabic RTL
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { GLASS, GRADIENTS, RADIUS, SHADOWS, COLORS, MOTION, FONT } from './tokens';

// ─── Types ───────────────────────────────────────────────────
interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  elevated?: boolean;
  onClick?: () => void;
  hover?: boolean;
}

interface StatsCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  trend?: number;
  sparkData?: number[];
  accentColor: string;
  accentGradient: string;
  glowColor: string;
}

interface MicroChartProps {
  data: number[];
  color: string;
  height?: number;
}

interface SyncStatusProps {
  connected?: boolean;
  lastSync?: string;
}

interface GlassButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'confirm';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
  fullWidth?: boolean;
  icon?: React.ElementType;
}

interface BadgeProps {
  label: string;
  color: string;
  bg: string;
  size?: 'sm' | 'md';
}

// ─── GlassCard ───────────────────────────────────────────────
export function GlassCard({ children, className = '', style = {}, elevated = false, onClick, hover = false }: GlassCardProps) {
  const surface = elevated ? GLASS.elevated : GLASS.card;
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        ...surface,
        borderRadius: RADIUS.xl,
        transition: `transform ${MOTION.normal} ${MOTION.easing}, box-shadow ${MOTION.normal} ${MOTION.easing}`,
        cursor: onClick ? 'pointer' : 'default',
        ...(hover ? { ':hover': { transform: 'translateY(-2px)', boxShadow: SHADOWS.lg } } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── MicroChart (Sparkline SVG) ───────────────────────────────
export function MicroChart({ data, color, height = 44 }: MicroChartProps) {
  const width = 120;
  const padding = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const polyline = points.join(' ');
  const area = `M ${points[0]} L ${points.join(' L ')} L ${width - padding},${height} L ${padding},${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline points={polyline} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Last data point dot */}
      {points.length > 0 && (() => {
        const last = points[points.length - 1].split(',');
        return <circle cx={last[0]} cy={last[1]} r="3" fill={color} />;
      })()}
    </svg>
  );
}

// ─── StatsCard (Floating KPI Card) ───────────────────────────
export function StatsCard({ icon: Icon, label, value, sub, trend, sparkData, accentColor, accentGradient, glowColor }: StatsCardProps) {
  const [hovered, setHovered] = useState(false);
  const isPositive = (trend ?? 0) >= 0;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...GLASS.card,
        borderRadius: RADIUS.xxl,
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hovered
          ? `0 16px 48px rgba(0,0,0,0.10), 0 0 0 1px rgba(255,255,255,0.9) inset, 0 8px 24px ${glowColor}`
          : GLASS.card.boxShadow,
        transition: `all ${MOTION.slow} ${MOTION.easing}`,
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background accent blob */}
      <div
        style={{
          position: 'absolute',
          top: -20,
          left: -20,
          width: 100,
          height: 100,
          borderRadius: '50%',
          background: glowColor,
          filter: 'blur(32px)',
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />

      {/* Top row: icon + trend */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: RADIUS.md,
            background: accentGradient,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 4px 12px ${glowColor}`,
          }}
        >
          <Icon size={20} style={{ color: accentColor }} />
        </div>

        {trend !== undefined && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: FONT.sizes.xs,
              fontWeight: FONT.weights.semibold,
              color: isPositive ? COLORS.emerald.DEFAULT : COLORS.rose.DEFAULT,
              background: isPositive ? COLORS.emerald.light : COLORS.rose.light,
              padding: '3px 8px',
              borderRadius: RADIUS.full,
            }}
          >
            {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {isPositive ? '+' : ''}{trend}%
          </div>
        )}
      </div>

      {/* Value + Label */}
      <div style={{ position: 'relative' }}>
        <p style={{ fontSize: FONT.sizes.xs, color: COLORS.slate[400], marginBottom: 2, fontWeight: FONT.weights.medium }}>{label}</p>
        <p style={{ fontSize: FONT.sizes['3xl'], fontWeight: FONT.weights.black, color: COLORS.slate[800], lineHeight: 1.1 }}>{value}</p>
        {sub && <p style={{ fontSize: FONT.sizes.xs, color: COLORS.slate[400], marginTop: 4 }}>{sub}</p>}
      </div>

      {/* Sparkline */}
      {sparkData && (
        <div style={{ marginTop: -4 }}>
          <MicroChart data={sparkData} color={accentColor} height={44} />
        </div>
      )}
    </div>
  );
}

// ─── SyncStatus ───────────────────────────────────────────────
export function SyncStatus({ connected = true, lastSync }: SyncStatusProps) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(p => !p);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: connected ? COLORS.emerald.light : COLORS.rose.light,
        border: `1px solid ${connected ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'}`,
        borderRadius: RADIUS.full,
        padding: '5px 12px',
        fontSize: FONT.sizes.xs,
        fontWeight: FONT.weights.semibold,
        color: connected ? COLORS.emerald.DEFAULT : COLORS.rose.DEFAULT,
      }}
    >
      {/* Animated dot */}
      <div style={{ position: 'relative', width: 8, height: 8 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: connected ? COLORS.emerald.DEFAULT : COLORS.rose.DEFAULT,
          }}
        />
        {connected && (
          <div
            style={{
              position: 'absolute',
              inset: -3,
              borderRadius: '50%',
              background: COLORS.emerald.DEFAULT,
              opacity: pulse ? 0.4 : 0,
              transition: `opacity 0.9s ease`,
              animation: 'ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite',
            }}
          />
        )}
      </div>
      {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
      <span>{connected ? 'متصل' : 'غير متصل'}</span>
      {lastSync && connected && (
        <span style={{ color: COLORS.slate[400], fontWeight: FONT.weights.normal }}>
          · {lastSync}
        </span>
      )}
    </div>
  );
}

// ─── GlassButton ─────────────────────────────────────────────
export function GlassButton({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  loading = false,
  className = '',
  style = {},
  fullWidth = false,
  icon: Icon,
}: GlassButtonProps) {
  const [hovered, setHovered] = useState(false);

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '6px 14px', fontSize: FONT.sizes.sm },
    md: { padding: '10px 20px', fontSize: FONT.sizes.base },
    lg: { padding: '14px 28px', fontSize: FONT.sizes.md },
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: hovered ? 'linear-gradient(135deg,#1d4ed8,#1e40af)' : GRADIENTS.primaryBtn,
      color: '#fff',
      boxShadow: hovered ? SHADOWS.blue : '0 4px 16px rgba(37,99,235,0.30)',
      border: 'none',
    },
    secondary: {
      background: hovered ? 'rgba(37,99,235,0.10)' : 'rgba(37,99,235,0.06)',
      color: COLORS.blue[600],
      border: `1px solid rgba(37,99,235,0.20)`,
      boxShadow: 'none',
    },
    ghost: {
      background: hovered ? 'rgba(0,0,0,0.04)' : 'transparent',
      color: COLORS.slate[600],
      border: '1px solid transparent',
      boxShadow: 'none',
    },
    danger: {
      background: hovered ? 'linear-gradient(135deg,#e11d48,#be123c)' : GRADIENTS.dangerBtn,
      color: '#fff',
      boxShadow: hovered ? SHADOWS.rose : '0 4px 16px rgba(244,63,94,0.30)',
      border: 'none',
    },
    confirm: {
      background: hovered
        ? 'linear-gradient(135deg,#1d4ed8,#6d28d9)'
        : GRADIENTS.confirmGlow,
      color: '#fff',
      boxShadow: hovered ? SHADOWS.blueGlow : '0 8px 32px rgba(37,99,235,0.40)',
      border: 'none',
      transform: hovered ? 'scale(1.02)' : 'scale(1)',
    },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: RADIUS.lg,
        fontFamily: FONT.family,
        fontWeight: FONT.weights.semibold,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        width: fullWidth ? '100%' : 'auto',
        transition: `all ${MOTION.normal} ${MOTION.easing}`,
        outline: 'none',
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
    >
      {loading ? (
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
      ) : Icon ? (
        <Icon size={16} />
      ) : null}
      {children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────
export function Badge({ label, color, bg, size = 'md' }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: size === 'sm' ? '2px 8px' : '3px 10px',
        borderRadius: RADIUS.full,
        fontSize: size === 'sm' ? FONT.sizes.xs : FONT.sizes.sm,
        fontWeight: FONT.weights.semibold,
        color,
        background: bg,
      }}
    >
      {label}
    </span>
  );
}

// ─── Divider ─────────────────────────────────────────────────
export function GlassDivider({ vertical = false }: { vertical?: boolean }) {
  return (
    <div
      style={{
        [vertical ? 'width' : 'height']: 1,
        [vertical ? 'alignSelf' : 'width']: vertical ? undefined : '100%',
        background: 'rgba(0,0,0,0.06)',
        flexShrink: 0,
      }}
    />
  );
}

// ─── Section Title ────────────────────────────────────────────
export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
      <h2
        style={{
          fontSize: FONT.sizes.lg,
          fontWeight: FONT.weights.bold,
          color: COLORS.slate[800],
          margin: 0,
        }}
      >
        {title}
      </h2>
      {action}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '3rem', textAlign: 'center' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: RADIUS.xl,
          background: COLORS.blue[50],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={24} style={{ color: COLORS.blue[400] }} />
      </div>
      <div>
        <p style={{ fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.slate[700], margin: 0 }}>{title}</p>
        {desc && <p style={{ fontSize: FONT.sizes.sm, color: COLORS.slate[400], margin: '4px 0 0' }}>{desc}</p>}
      </div>
    </div>
  );
}

// ─── Animated Number ─────────────────────────────────────────
export function AnimatedNumber({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const target = value;
    const duration = 800;
    const start = ref.current;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (target - start) * eased;
      setDisplay(current);
      ref.current = current;
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [value]);

  return <span>{prefix}{Math.round(display).toLocaleString('ar-SA')}{suffix}</span>;
}
