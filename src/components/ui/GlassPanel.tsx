// ─── GlassPanel — reusable glassmorphism card ─────────────────
import React from 'react';

interface GlassPanelProps {
  children:   React.ReactNode;
  className?: string;
  style?:     React.CSSProperties;
  title?:     string;
  action?:    React.ReactNode;
  glow?:      string; // accent color for top-right blob
}

export default function GlassPanel({
  children, className = '', style = {}, title, action, glow,
}: GlassPanelProps) {
  return (
    <div
      className={`relative rounded-[1.75rem] overflow-hidden ${className}`}
      style={{
        background:     'rgba(10,19,38,0.65)',
        backdropFilter: 'blur(28px) saturate(180%)',
        border:         '1px solid rgba(255,255,255,0.07)',
        boxShadow:      '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
        ...style,
      }}
    >
      {glow && (
        <div
          className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl pointer-events-none opacity-[0.12]"
          style={{ background: glow }}
        />
      )}
      {title && (
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <span className="text-[14px] font-medium text-slate-200">{title}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
