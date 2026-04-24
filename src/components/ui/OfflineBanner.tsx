// ============================================================
// Control Panel (رصيد) — OfflineBanner
//
// شريط علوي نحيف بتأثير Glassmorphism يظهر بهدوء عند انقطاع
// الإنترنت، ويختفي عند عودة الاتصال.
// اللمسة السينمائية: لا خطأ أحمر مزعج — فقط هدوء ووقار.
// ============================================================

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

// ─── Banner States ────────────────────────────────────────────

type BannerState = 'hidden' | 'offline' | 'syncing' | 'synced';

export function OfflineBanner() {
  const { isOnline, pendingCount, isSyncing, lastSyncedAt, triggerSync } = useOnlineStatus();
  const [bannerState, setBannerState] = useState<BannerState>('hidden');
  const [visible, setVisible]         = useState(false);

  // ── مزامنة حالة البانر مع حالة الشبكة ──────────────────
  useEffect(() => {
    if (!isOnline) {
      setBannerState('offline');
      setVisible(true);
      return;
    }

    if (isOnline && isSyncing) {
      setBannerState('syncing');
      setVisible(true);
      return;
    }

    if (isOnline && lastSyncedAt && pendingCount === 0) {
      // إظهار رسالة "تمت المزامنة" لـ 3 ثوانٍ ثم الاختفاء
      setBannerState('synced');
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }

    if (isOnline && !isSyncing && pendingCount === 0) {
      setVisible(false);
    }
  }, [isOnline, isSyncing, lastSyncedAt, pendingCount]);

  if (!visible) return null;

  // ── تحديد محتوى البانر بحسب الحالة ─────────────────────
  const config = {
    offline: {
      bg:         'rgba(30, 30, 40, 0.72)',
      border:     '1px solid rgba(255,255,255,0.10)',
      textColor:  'rgba(255,255,255,0.90)',
      subColor:   'rgba(255,255,255,0.50)',
      icon:       <WifiOff size={13} style={{ color: 'rgba(148,163,184,0.85)' }} />,
      dot:        '#94a3b8',    // رمادي زجاجي هادئ
      dotGlow:    'rgba(148,163,184,0.35)',
      message:    'تعمل الآن في الوضع المحلي.. مبيعاتك في أمان وسيتم مزامنتها فوراً.',
      sub:        pendingCount > 0 ? `${pendingCount} فاتورة في انتظار المزامنة` : null,
      showRetry:  false,
    },
    syncing: {
      bg:         'rgba(30, 50, 80, 0.72)',
      border:     '1px solid rgba(37,99,235,0.25)',
      textColor:  'rgba(255,255,255,0.90)',
      subColor:   'rgba(147,197,253,0.70)',
      icon:       <RefreshCw size={13} style={{ color: '#60a5fa', animation: 'spin 1s linear infinite' }} />,
      dot:        '#3b82f6',
      dotGlow:    'rgba(59,130,246,0.40)',
      message:    `جارٍ مزامنة ${pendingCount} فاتورة...`,
      sub:        'عملية صامتة في الخلفية',
      showRetry:  false,
    },
    synced: {
      bg:         'rgba(15, 50, 35, 0.72)',
      border:     '1px solid rgba(16,185,129,0.25)',
      textColor:  'rgba(255,255,255,0.90)',
      subColor:   'rgba(110,231,183,0.70)',
      icon:       <CheckCircle2 size={13} style={{ color: '#10b981' }} />,
      dot:        '#10b981',
      dotGlow:    'rgba(16,185,129,0.40)',
      message:    'تمت مزامنة جميع الفواتير بنجاح ✓',
      sub:        null,
      showRetry:  false,
    },
  }[bannerState as Exclude<BannerState, 'hidden'>] ?? null;

  if (!config) return null;

  return (
    <>
      {/* Keyframe for spinning icon */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes bannerSlideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
      `}</style>

      <div
        role="status"
        aria-live="polite"
        style={{
          position:       'fixed',
          top:            0,
          left:           0,
          right:          0,
          zIndex:         9999,
          padding:        '7px 20px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            10,
          background:     config.bg,
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          borderBottom:   config.border,
          boxShadow:      '0 2px 20px rgba(0,0,0,0.18)',
          animation:      'bannerSlideDown 0.35s cubic-bezier(0.4,0,0.2,1)',
          direction:      'rtl',
          fontFamily:     "'Tajawal', sans-serif",
        }}
      >
        {/* ── النقطة النبضة ── */}
        <span
          style={{
            width:        7,
            height:       7,
            borderRadius: '50%',
            background:   config.dot,
            boxShadow:    `0 0 8px ${config.dotGlow}`,
            flexShrink:   0,
            animation:    bannerState === 'syncing'
              ? 'pulse 1.2s ease-in-out infinite'
              : 'none',
          }}
        />

        {/* ── أيقونة الحالة ── */}
        {config.icon}

        {/* ── النص الرئيسي ── */}
        <span
          style={{
            fontSize:   '12.5px',
            fontWeight: 500,
            color:      config.textColor,
            letterSpacing: '0.01em',
          }}
        >
          {config.message}
        </span>

        {/* ── النص الثانوي ── */}
        {config.sub && (
          <span
            style={{
              fontSize:  '11px',
              color:     config.subColor,
              marginRight: 4,
            }}
          >
            •&nbsp;{config.sub}
          </span>
        )}

        {/* ── زر إعادة المحاولة اليدوية ── */}
        {isOnline && pendingCount > 0 && !isSyncing && (
          <button
            onClick={triggerSync}
            style={{
              marginRight:    8,
              padding:        '3px 10px',
              fontSize:       '11px',
              fontWeight:     600,
              color:          'rgba(255,255,255,0.80)',
              background:     'rgba(255,255,255,0.12)',
              border:         '1px solid rgba(255,255,255,0.18)',
              borderRadius:   '999px',
              cursor:         'pointer',
              backdropFilter: 'blur(8px)',
              transition:     'all 150ms ease',
              fontFamily:     "'Tajawal', sans-serif",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.20)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)';
            }}
          >
            مزامنة الآن
          </button>
        )}

        {/* ── حالة أوفلاين: أيقونة بسيطة يسار ── */}
        {bannerState === 'offline' && (
          <Wifi
            size={12}
            style={{
              color:     'rgba(255,255,255,0.18)',
              marginRight: 'auto',
            }}
          />
        )}
      </div>

      {/* مسافة تعويضية حتى لا يغطي البانر المحتوى */}
      <div style={{ height: '36px', flexShrink: 0 }} aria-hidden />
    </>
  );
}
