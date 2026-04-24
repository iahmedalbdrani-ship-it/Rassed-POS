// ============================================================
// Control Panel (رصيد) — Sidebar Navigation v2
// Design: White Glassmorphism | Corporate Blue #2563EB | RTL
// ============================================================

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, FileText, BookOpen,
  BarChart3, Settings, ChevronLeft, LogOut, Bell,
  Building2, Zap, Package, TrendingDown,
} from 'lucide-react';
import { GLASS, COLORS, RADIUS, FONT, GRADIENTS, SHADOWS, MOTION } from '../../design-system/tokens';
import { ConnectionStatusDot } from '../ui/ConnectionStatusDot';

// ─── Nav Items ────────────────────────────────────────────────
const navItems = [
  { id: '/',          icon: LayoutDashboard, label: 'لوحة التحكم',     badge: null       },
  { id: '/pos',       icon: ShoppingCart,    label: 'نقطة البيع',      badge: 'مباشر'    },
  { id: '/invoices',  icon: FileText,        label: 'الفواتير',         badge: null       },
  { id: '/inventory', icon: Package,         label: 'المخزون',          badge: null       },
  { id: '/expenses',  icon: TrendingDown,    label: 'المصروفات',        badge: null       },
  { id: '/accounts',  icon: BookOpen,        label: 'شجرة الحسابات',   badge: null       },
  { id: '/reports',   icon: BarChart3,       label: 'التقارير المالية', badge: null       },
  { id: '/settings',  icon: Settings,        label: 'الإعدادات',        badge: null       },
];

// ─── Sidebar ─────────────────────────────────────────────────
export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="relative flex flex-col"
      style={{
        width: collapsed ? '72px' : '248px',
        flexShrink: 0,
        ...GLASS.sidebar,
        transition: `width ${MOTION.slow} ${MOTION.easing}`,
        zIndex: 40,
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* ── Logo ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: collapsed ? '18px 14px' : '18px 16px',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: RADIUS.md,
            background: GRADIENTS.primaryBtn,
            boxShadow: SHADOWS.blue,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: `all ${MOTION.normal} ${MOTION.easing}`,
          }}
        >
          <Zap size={20} color="#fff" />
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: FONT.sizes.md,
                fontWeight: FONT.weights.black,
                color: COLORS.slate[800],
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              رصيد
            </h1>
            <p style={{ fontSize: FONT.sizes.xs, color: COLORS.slate[400], margin: 0 }}>
              نظام ERP السعودي
            </p>
          </div>
        )}
      </div>

      {/* ── Company Badge ─────────────────────────────────────── */}
      {!collapsed && (
        <div
          style={{
            margin: '10px 12px',
            padding: '10px 12px',
            borderRadius: RADIUS.lg,
            background: 'rgba(37,99,235,0.06)',
            border: '1px solid rgba(37,99,235,0.14)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: RADIUS.sm,
              background: COLORS.blue[50],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Building2 size={14} style={{ color: COLORS.blue[600] }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: FONT.sizes.xs,
                fontWeight: FONT.weights.semibold,
                color: COLORS.slate[700],
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              متجر رصيد الذكي
            </p>
            <p style={{ fontSize: '10px', color: COLORS.slate[400], margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              310123456700003
            </p>
          </div>
        </div>
      )}

      {/* ── Nav Items ─────────────────────────────────────────── */}
      <nav
        style={{
          flex: 1,
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflowY: 'auto',
        }}
      >
        {navItems.map((item) => {
          const isActive = location.pathname === item.id;
          return (
            <NavItem
              key={item.id}
              item={item}
              isActive={isActive}
              collapsed={collapsed}
              onClick={() => navigate(item.id)}
            />
          );
        })}
      </nav>

      {/* ── Bottom Actions ────────────────────────────────────── */}
      <div
        style={{
          padding: '10px 8px',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {/* ── مؤشر حالة الاتصال ── */}
        <div style={{ position: 'relative', padding: '0 2px' }}>
          <ConnectionStatusDot collapsed={collapsed} />
        </div>

        <BottomBtn icon={Bell} label="الإشعارات" collapsed={collapsed} color={COLORS.slate[500]} />
        <BottomBtn icon={LogOut} label="تسجيل الخروج" collapsed={collapsed} color={COLORS.rose.DEFAULT} danger />
      </div>

      {/* ── Collapse Toggle ───────────────────────────────────── */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          position: 'absolute',
          left: -12,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 24,
          height: 24,
          borderRadius: RADIUS.full,
          background: COLORS.white,
          border: '1.5px solid rgba(0,0,0,0.10)',
          boxShadow: SHADOWS.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 50,
          transition: `all ${MOTION.fast} ${MOTION.easing}`,
        }}
      >
        <ChevronLeft
          size={12}
          style={{
            color: COLORS.slate[400],
            transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: `transform ${MOTION.normal} ${MOTION.easing}`,
          }}
        />
      </button>
    </aside>
  );
}

// ─── NavItem Sub-component ────────────────────────────────────
function NavItem({
  item,
  isActive,
  collapsed,
  onClick,
}: {
  item: (typeof navItems)[0];
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: collapsed ? '12px 14px' : '10px 12px',
        borderRadius: RADIUS.lg,
        border: '1px solid transparent',
        cursor: 'pointer',
        background: isActive
          ? 'linear-gradient(135deg,rgba(37,99,235,0.12),rgba(37,99,235,0.06))'
          : hovered
          ? 'rgba(37,99,235,0.04)'
          : 'transparent',
        borderColor: isActive ? 'rgba(37,99,235,0.20)' : 'transparent',
        transition: `all ${MOTION.fast} ${MOTION.easing}`,
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}
      title={collapsed ? item.label : undefined}
    >
      <item.icon
        size={18}
        style={{
          flexShrink: 0,
          color: isActive ? COLORS.blue[600] : hovered ? COLORS.blue[400] : COLORS.slate[400],
          transition: `color ${MOTION.fast}`,
        }}
      />
      {!collapsed && (
        <>
          <span
            style={{
              fontSize: FONT.sizes.sm,
              fontWeight: isActive ? FONT.weights.semibold : FONT.weights.medium,
              color: isActive ? COLORS.slate[800] : COLORS.slate[500],
              flex: 1,
              textAlign: 'right',
              transition: `color ${MOTION.fast}`,
            }}
          >
            {item.label}
          </span>
          {item.badge && (
            <span
              style={{
                fontSize: '9px',
                fontWeight: FONT.weights.bold,
                padding: '2px 6px',
                borderRadius: RADIUS.full,
                background: COLORS.emerald.light,
                color: COLORS.emerald.DEFAULT,
              }}
            >
              {item.badge}
            </span>
          )}
          {isActive && (
            <div
              style={{
                width: 3,
                height: 16,
                borderRadius: RADIUS.full,
                background: GRADIENTS.primaryBtn,
                flexShrink: 0,
              }}
            />
          )}
        </>
      )}
    </button>
  );
}

// ─── BottomBtn Sub-component ──────────────────────────────────
function BottomBtn({
  icon: Icon,
  label,
  collapsed,
  color,
  danger = false,
}: {
  icon: React.ElementType;
  label: string;
  collapsed: boolean;
  color: string;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: collapsed ? '10px 14px' : '8px 12px',
        borderRadius: RADIUS.lg,
        border: 'none',
        cursor: 'pointer',
        background: hovered ? (danger ? 'rgba(244,63,94,0.07)' : 'rgba(0,0,0,0.04)') : 'transparent',
        transition: `all ${MOTION.fast} ${MOTION.easing}`,
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}
    >
      <Icon size={16} style={{ color, flexShrink: 0 }} />
      {!collapsed && (
        <span style={{ fontSize: FONT.sizes.xs, color, fontWeight: FONT.weights.medium }}>{label}</span>
      )}
    </button>
  );
}
