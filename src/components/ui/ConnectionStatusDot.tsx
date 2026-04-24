// ============================================================
// Control Panel (رصيد) — ConnectionStatusDot
//
// أيقونة صغيرة في أسفل الـ Sidebar تُظهر حالة الاتصال:
//   🟢 أخضر ناعم  → متصل
//   ⚪ رمادي زجاجي → أوفلاين + عدد الفواتير المعلقة
// ============================================================

import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { COLORS, FONT, RADIUS, MOTION } from '../../design-system/tokens';

interface Props {
  collapsed: boolean;
}

export function ConnectionStatusDot({ collapsed }: Props) {
  const { isOnline, pendingCount, isSyncing } = useOnlineStatus();

  // ── تحديد الألوان والنص ──────────────────────────────────
  const online  = isOnline && !isSyncing;
  const syncing = isOnline && isSyncing;

  const dotColor    = online  ? '#10b981'
                    : syncing ? '#3b82f6'
                    : '#94a3b8';

  const dotGlow     = online  ? 'rgba(16,185,129,0.45)'
                    : syncing ? 'rgba(59,130,246,0.45)'
                    : 'rgba(148,163,184,0.25)';

  const labelText   = online  ? 'متصل'
                    : syncing ? 'مزامنة...'
                    : 'أوفلاين';

  const labelColor  = online  ? COLORS.emerald.DEFAULT
                    : syncing ? COLORS.blue[400]
                    : COLORS.slate[400];

  const bgColor     = online  ? 'rgba(16,185,129,0.08)'
                    : syncing ? 'rgba(59,130,246,0.08)'
                    : 'rgba(148,163,184,0.08)';

  const borderColor = online  ? 'rgba(16,185,129,0.18)'
                    : syncing ? 'rgba(59,130,246,0.18)'
                    : 'rgba(148,163,184,0.15)';

  const Icon = online ? Wifi : syncing ? RefreshCw : WifiOff;

  return (
    <div
      title={collapsed
        ? `${labelText}${!isOnline && pendingCount > 0 ? ` (${pendingCount} معلق)` : ''}`
        : undefined
      }
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            8,
        padding:        collapsed ? '8px 14px' : '7px 10px',
        borderRadius:   RADIUS.lg,
        background:     bgColor,
        border:         `1px solid ${borderColor}`,
        transition:     `all ${MOTION.normal} ${MOTION.easing}`,
        margin:         collapsed ? '0 4px' : '0 4px',
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}
    >
      {/* ── النقطة النابضة ── */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div
          style={{
            width:        8,
            height:       8,
            borderRadius: RADIUS.full,
            background:   dotColor,
            boxShadow:    `0 0 7px ${dotGlow}`,
          }}
        />
        {/* حلقة نبضة خارجية للأوفلاين */}
        {!isOnline && (
          <div
            style={{
              position:     'absolute',
              inset:        -3,
              borderRadius: RADIUS.full,
              border:       `1.5px solid ${dotColor}`,
              opacity:      0.4,
              animation:    'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
            }}
          />
        )}
      </div>

      {/* ── الأيقونة ── */}
      <Icon
        size={12}
        style={{
          color:     labelColor,
          flexShrink: 0,
          animation:  syncing ? 'spin 1s linear infinite' : 'none',
        }}
      />

      {/* ── النص (يُخفى عند الطي) ── */}
      {!collapsed && (
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin:     0,
              fontSize:   FONT.sizes.xs,
              fontWeight: FONT.weights.semibold,
              color:      labelColor,
              lineHeight: 1.2,
            }}
          >
            {labelText}
          </p>
          {!isOnline && pendingCount > 0 && (
            <p
              style={{
                margin:    0,
                fontSize:  '10px',
                color:     COLORS.slate[400],
                marginTop: 1,
              }}
            >
              {pendingCount} فاتورة معلقة
            </p>
          )}
          {isOnline && pendingCount === 0 && (
            <p style={{ margin: 0, fontSize: '10px', color: COLORS.slate[400], marginTop: 1 }}>
              مزامنة كاملة
            </p>
          )}
        </div>
      )}

      {/* ── Badge عدد المعلقة (عند الطي) ── */}
      {collapsed && !isOnline && pendingCount > 0 && (
        <div
          style={{
            position:   'absolute',
            top:        -4,
            left:       -4,
            width:      16,
            height:     16,
            borderRadius: RADIUS.full,
            background: COLORS.amber.DEFAULT,
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize:   '9px',
            fontWeight: FONT.weights.bold,
            color:      '#fff',
          }}
        >
          {pendingCount > 9 ? '9+' : pendingCount}
        </div>
      )}

      <style>{`
        @keyframes ping {
          0%    { transform: scale(1);   opacity: 0.5; }
          75%,100% { transform: scale(2); opacity: 0; }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
