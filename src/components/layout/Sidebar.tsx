// ============================================================
// Control Panel (رصيد) — Sidebar Navigation
// Design: White Glassmorphism | RTL Arabic
// ============================================================

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, FileText, BookOpen,
  BarChart3, Settings, ChevronLeft, LogOut, Bell,
  Building2, Zap, Package, TrendingDown
} from 'lucide-react';

const navItems = [
  { id: '/',          icon: LayoutDashboard, label: 'لوحة التحكم',     badge: null     },
  { id: '/pos',       icon: ShoppingCart,    label: 'نقطة البيع',      badge: 'مباشر'  },
  { id: '/invoices',  icon: FileText,        label: 'الفواتير',         badge: null     },
  { id: '/inventory', icon: Package,         label: 'المخزون',          badge: null     },
  { id: '/expenses',  icon: TrendingDown,    label: 'المصروفات',        badge: null     },
  { id: '/accounts',  icon: BookOpen,        label: 'شجرة الحسابات',   badge: null     },
  { id: '/reports',   icon: BarChart3,       label: 'التقارير المالية', badge: null     },
  { id: '/settings',  icon: Settings,        label: 'الإعدادات',        badge: null     },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="relative flex flex-col transition-all duration-300 ease-in-out"
      style={{
        width: collapsed ? '72px' : '240px',
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderLeft: '1px solid rgba(255,255,255,0.8)',
        boxShadow: '4px 0 24px rgba(0,0,0,0.06)',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 py-5 border-b"
        style={{ borderColor: 'rgba(0,0,0,0.06)' }}
      >
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            boxShadow: '0 4px 16px rgba(249,115,22,0.4)',
          }}
        >
          <Zap className="text-white" size={20} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="font-black text-slate-800 text-base leading-tight">رصيد</h1>
            <p className="text-[10px] text-slate-400">نظام ERP السعودي</p>
          </div>
        )}
      </div>

      {/* Company Badge */}
      {!collapsed && (
        <div
          className="mx-3 my-3 px-3 py-2.5 rounded-2xl flex items-center gap-2.5"
          style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.15)' }}
        >
          <Building2 size={14} className="text-orange-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-700 truncate">متجر رصيد الذكي</p>
            <p className="text-[9px] text-slate-400">310123456700003</p>
          </div>
        </div>
      )}

      {/* Nav Items */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all duration-150 group"
              style={{
                background: isActive
                  ? 'linear-gradient(135deg, rgba(249,115,22,0.12), rgba(234,88,12,0.08))'
                  : 'transparent',
                border: isActive ? '1px solid rgba(249,115,22,0.2)' : '1px solid transparent',
              }}
            >
              <item.icon
                size={18}
                className="flex-shrink-0 transition-colors"
                style={{ color: isActive ? '#f97316' : '#94a3b8' }}
              />
              {!collapsed && (
                <span
                  className="text-[13px] font-medium flex-1 text-right transition-colors"
                  style={{ color: isActive ? '#1e293b' : '#64748b' }}
                >
                  {item.label}
                </span>
              )}
              {!collapsed && item.badge && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Actions */}
      <div
        className="p-3 border-t space-y-1"
        style={{ borderColor: 'rgba(0,0,0,0.06)' }}
      >
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-slate-500 hover:bg-slate-100/60 transition-all"
        >
          <Bell size={16} className="flex-shrink-0" />
          {!collapsed && <span className="text-[12px]">الإشعارات</span>}
        </button>
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-rose-400 hover:bg-rose-50 transition-all"
        >
          <LogOut size={16} className="flex-shrink-0" />
          {!collapsed && <span className="text-[12px]">تسجيل الخروج</span>}
        </button>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110 z-10"
        style={{
          background: 'white',
          border: '1.5px solid rgba(0,0,0,0.1)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <ChevronLeft
          size={12}
          className="text-slate-400 transition-transform duration-300"
          style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
    </aside>
  );
}
