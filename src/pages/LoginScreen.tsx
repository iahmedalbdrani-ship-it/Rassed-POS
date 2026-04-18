// ============================================================
// Control Panel (رصيد) — Login Screen
// Design: Apple White Glassmorphism | Floating Light Glass Card
// Auth:   Firebase Email/Password + Google OAuth
// ============================================================

import { useState, useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import { authService } from '../lib/firebase';

// ─── Lucide icons (inline SVG — no extra import needed) ───────
const IconShield = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
const IconMail = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);
const IconLock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconEye = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const IconEyeOff = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);
const IconAlertCircle = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
);

// ─── Google brand SVG logo ────────────────────────────────────
const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

// ─── Floating background shapes ──────────────────────────────
function BackgroundScene() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {/* Base gradient */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #fafffe 50%, #f5f0ff 100%)' }} />

      {/* Indigo blob — top left */}
      <div className="absolute -top-[20%] -left-[10%] w-[700px] h-[700px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0.04) 55%, transparent 75%)',
          filter: 'blur(60px)',
          animation: 'floatA 14s ease-in-out infinite',
        }} />

      {/* Emerald blob — bottom right */}
      <div className="absolute -bottom-[15%] -right-[10%] w-[650px] h-[650px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(16,185,129,0.16) 0%, rgba(16,185,129,0.04) 55%, transparent 75%)',
          filter: 'blur(60px)',
          animation: 'floatB 18s ease-in-out infinite',
        }} />

      {/* Rose blob — top right */}
      <div className="absolute -top-[5%] right-[15%] w-[400px] h-[400px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(244,63,94,0.10) 0%, transparent 65%)',
          filter: 'blur(50px)',
          animation: 'floatC 22s ease-in-out infinite',
        }} />

      {/* Amber blob — bottom left */}
      <div className="absolute bottom-[10%] left-[5%] w-[350px] h-[350px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(245,158,11,0.10) 0%, transparent 65%)',
          filter: 'blur(45px)',
          animation: 'floatA 20s ease-in-out infinite reverse',
        }} />

      {/* Fine grain texture overlay */}
      <div className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '180px 180px',
        }} />
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────
function Spinner({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: 'spin 0.8s linear infinite' }}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="3" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ─── Glass input ──────────────────────────────────────────────
interface GlassInputProps {
  type:        'text' | 'email' | 'password';
  value:       string;
  onChange:    (v: string) => void;
  placeholder: string;
  icon:        React.ReactNode;
  autoFocus?:  boolean;
  suffix?:     React.ReactNode;
  error?:      boolean;
}

function GlassInput({ type, value, onChange, placeholder, icon, autoFocus, suffix, error }: GlassInputProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 group"
      style={{
        background:     error ? 'rgba(244,63,94,0.06)' : 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(20px)',
        border:         error
          ? '1.5px solid rgba(244,63,94,0.35)'
          : '1.5px solid rgba(255,255,255,0.85)',
        boxShadow: error
          ? '0 2px 12px rgba(244,63,94,0.08)'
          : '0 2px 12px rgba(99,102,241,0.04), inset 0 1px 0 rgba(255,255,255,0.9)',
      }}
    >
      <span className="text-slate-400 flex-shrink-0">{icon}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        dir="ltr"
        className="flex-1 bg-transparent text-[14px] text-slate-800 placeholder-slate-400 outline-none min-w-0"
        style={{ fontFamily: "'SF Pro Text', -apple-system, sans-serif" }}
      />
      {suffix}
    </div>
  );
}

// ─── Main Login Screen ────────────────────────────────────────
interface LoginScreenProps {
  onAuthSuccess: (user: User) => void;
}

export default function LoginScreen({ onAuthSuccess }: LoginScreenProps) {
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPwd,     setShowPwd]     = useState(false);
  const [loadingEmail,setLoadingEmail]= useState(false);
  const [loadingGoogle,setLoadingGoogle]=useState(false);
  const [error,       setError]       = useState('');
  const [fieldError,  setFieldError]  = useState<'email' | 'password' | null>(null);
  const [visible,     setVisible]     = useState(false);

  // Entrance animation trigger
  useEffect(() => { const t = setTimeout(() => setVisible(true), 60); return () => clearTimeout(t); }, []);

  const clearError = () => { setError(''); setFieldError(null); };

  // ── Email sign in
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!email)    { setError('الرجاء إدخال البريد الإلكتروني'); setFieldError('email');    return; }
    if (!password) { setError('الرجاء إدخال كلمة المرور');       setFieldError('password'); return; }
    setLoadingEmail(true);
    try {
      const user = await authService.signInWithEmail(email, password);
      onAuthSuccess(user);
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code.includes('user-not-found') || code.includes('invalid-email')) {
        setError('البريد الإلكتروني غير مسجّل في النظام');
        setFieldError('email');
      } else if (code.includes('wrong-password') || code.includes('invalid-credential')) {
        setError('كلمة المرور غير صحيحة');
        setFieldError('password');
      } else if (code.includes('too-many-requests')) {
        setError('تم حظر الحساب مؤقتاً بسبب محاولات متعددة، حاول لاحقاً');
      } else {
        setError('حدث خطأ غير متوقع، يرجى المحاولة مجدداً');
      }
    } finally {
      setLoadingEmail(false);
    }
  };

  // ── Google sign in
  const handleGoogleLogin = async () => {
    clearError();
    setLoadingGoogle(true);
    try {
      const user = await authService.signInWithGoogle();
      onAuthSuccess(user);
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code.includes('popup-closed')) {
        // User closed popup — silent fail
      } else if (code.includes('popup-blocked')) {
        setError('تم حظر النافذة المنبثقة، يرجى السماح بالنوافذ المنبثقة في المتصفح');
      } else {
        setError('فشل الدخول عبر Google، حاول مرة أخرى');
      }
    } finally {
      setLoadingGoogle(false);
    }
  };

  const isLoading = loadingEmail || loadingGoogle;

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ fontFamily: "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Tajawal', sans-serif" }}
    >
      {/* Google Font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700;800&display=swap');

        @keyframes floatA {
          0%, 100% { transform: translate(0,0) scale(1); }
          33%       { transform: translate(30px,-40px) scale(1.05); }
          66%       { transform: translate(-20px,20px) scale(0.97); }
        }
        @keyframes floatB {
          0%, 100% { transform: translate(0,0) scale(1); }
          40%       { transform: translate(-40px,30px) scale(1.06); }
          70%       { transform: translate(20px,-20px) scale(0.96); }
        }
        @keyframes floatC {
          0%, 100% { transform: translate(0,0); }
          50%       { transform: translate(20px,30px) scale(1.04); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes slideUp {
          from { opacity:0; transform:translateY(28px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity:0; }
          to   { opacity:1; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .login-card      { animation: slideUp 0.55s cubic-bezier(0.16,1,0.3,1) both; }
        .login-logo      { animation: slideUp 0.55s 0.05s cubic-bezier(0.16,1,0.3,1) both; }
        .login-title     { animation: slideUp 0.55s 0.10s cubic-bezier(0.16,1,0.3,1) both; }
        .login-divider   { animation: fadeIn  0.4s  0.20s ease both; }
        .login-field-1   { animation: slideUp 0.5s  0.15s cubic-bezier(0.16,1,0.3,1) both; }
        .login-field-2   { animation: slideUp 0.5s  0.22s cubic-bezier(0.16,1,0.3,1) both; }
        .login-btn-email { animation: slideUp 0.5s  0.28s cubic-bezier(0.16,1,0.3,1) both; }
        .login-separator { animation: fadeIn  0.4s  0.33s ease both; }
        .login-btn-google{ animation: slideUp 0.5s  0.36s cubic-bezier(0.16,1,0.3,1) both; }
        .login-footer    { animation: fadeIn  0.4s  0.45s ease both; }

        .btn-primary:not(:disabled):hover .btn-shine {
          animation: shimmer 1.4s linear infinite;
        }
      `}</style>

      <BackgroundScene />

      {/* ── Glass Card */}
      <div
        className="login-card relative w-full max-w-[420px] rounded-[2.8rem] p-8 flex flex-col gap-7"
        style={{
          background:     'rgba(255,255,255,0.50)',
          backdropFilter: 'blur(36px) saturate(180%)',
          border:         '1.5px solid rgba(255,255,255,0.90)',
          boxShadow: [
            '0 2px  4px rgba(99,102,241,0.04)',
            '0 8px 24px rgba(99,102,241,0.08)',
            '0 32px 64px rgba(99,102,241,0.10)',
            'inset 0 1.5px 0 rgba(255,255,255,1)',
          ].join(', '),
          opacity: visible ? 1 : 0,
        }}
      >

        {/* Inner light refraction ring */}
        <div
          className="absolute inset-0 rounded-[2.8rem] pointer-events-none"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.20) 100%)',
          }}
        />

        {/* ── Header */}
        <div className="login-logo flex flex-col items-center gap-3 relative z-10">
          {/* Logo mark */}
          <div
            className="w-16 h-16 rounded-[22px] flex items-center justify-center relative"
            style={{
              background: 'linear-gradient(145deg, #6366f1, #4338ca)',
              boxShadow:  '0 8px 24px rgba(99,102,241,0.38), 0 2px 6px rgba(99,102,241,0.20), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            <div className="text-white"><IconShield /></div>
            {/* Shine dot */}
            <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-white opacity-60" />
          </div>

          <div className="text-center">
            <h1
              className="login-title text-[26px] font-black text-slate-800 tracking-tight leading-tight"
              style={{ fontFamily: "'Tajawal', sans-serif" }}
            >
              Control Panel
            </h1>
            <p className="text-[13px] text-slate-400 mt-1 font-medium">
              نظام رصيد المحاسبي المتكامل
            </p>
          </div>
        </div>

        {/* ── Divider line */}
        <div className="login-divider relative z-10">
          <div
            className="h-px w-full"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.15), transparent)' }}
          />
        </div>

        {/* ── Form */}
        <form onSubmit={handleEmailLogin} className="flex flex-col gap-3.5 relative z-10">

          {/* Email field */}
          <div className="login-field-1">
            <GlassInput
              type="email"
              value={email}
              onChange={v => { setEmail(v); clearError(); }}
              placeholder="البريد الإلكتروني"
              icon={<IconMail />}
              autoFocus
              error={fieldError === 'email'}
            />
          </div>

          {/* Password field */}
          <div className="login-field-2">
            <GlassInput
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={v => { setPassword(v); clearError(); }}
              placeholder="كلمة المرور"
              icon={<IconLock />}
              error={fieldError === 'password'}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPwd(p => !p)}
                  className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 p-0.5"
                >
                  {showPwd ? <IconEyeOff /> : <IconEye />}
                </button>
              }
            />
          </div>

          {/* Error message */}
          {error && (
            <div
              className="flex items-start gap-2 px-3.5 py-2.5 rounded-2xl text-[12px] font-medium"
              style={{
                background: 'rgba(244,63,94,0.08)',
                border:     '1px solid rgba(244,63,94,0.20)',
                color:      '#e11d48',
                animation:  'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              <IconAlertCircle />
              <span>{error}</span>
            </div>
          )}

          {/* Forgot password */}
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => email && authService.resetPassword(email)}
              className="text-[12px] text-indigo-500 hover:text-indigo-700 transition-colors font-medium"
            >
              نسيت كلمة المرور؟
            </button>
          </div>

          {/* Sign in button */}
          <div className="login-btn-email">
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary relative w-full py-3.5 rounded-2xl text-[14px] font-semibold text-white overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                boxShadow:  '0 4px 14px rgba(99,102,241,0.35), 0 1px 3px rgba(99,102,241,0.20)',
              }}
            >
              {/* Shimmer layer */}
              <div
                className="btn-shine absolute inset-0 rounded-2xl opacity-0 hover:opacity-100"
                style={{
                  background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.28) 50%, transparent 60%)',
                  backgroundSize: '200% auto',
                }}
              />
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loadingEmail ? <Spinner size={16} /> : null}
                {loadingEmail ? 'جارٍ التحقق…' : 'تسجيل الدخول'}
              </span>
            </button>
          </div>
        </form>

        {/* ── OR separator */}
        <div className="login-separator flex items-center gap-3 relative z-10">
          <div className="flex-1 h-px" style={{ background: 'rgba(148,163,184,0.25)' }} />
          <span className="text-[11px] text-slate-400 font-medium px-1">أو</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(148,163,184,0.25)' }} />
        </div>

        {/* ── Google button */}
        <div className="login-btn-google relative z-10">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="relative w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl text-[14px] font-medium text-slate-700 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
            style={{
              background:     'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(12px)',
              border:         '1.5px solid rgba(226,232,240,0.90)',
              boxShadow:      '0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)',
            }}
          >
            {loadingGoogle ? (
              <Spinner size={18} color="#6366f1" />
            ) : (
              <GoogleLogo />
            )}
            <span>{loadingGoogle ? 'جارٍ الاتصال بـ Google…' : 'الدخول عبر Google'}</span>
          </button>
        </div>

        {/* ── Footer */}
        <div className="login-footer text-center relative z-10">
          <p className="text-[11px] text-slate-400">
            بتسجيل الدخول، أنت توافق على{' '}
            <span className="text-indigo-500 cursor-pointer hover:underline">سياسة الخصوصية</span>
            {' '}و{' '}
            <span className="text-indigo-500 cursor-pointer hover:underline">شروط الاستخدام</span>
          </p>
          <div
            className="flex items-center justify-center gap-1.5 mt-2"
            style={{ color: '#94a3b8' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-[10px] font-medium">اتصال آمن · TLS 1.3</span>
          </div>
        </div>

      </div>
    </div>
  );
}
