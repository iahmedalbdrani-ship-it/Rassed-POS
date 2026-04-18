// ============================================================
// Control Panel (رصيد) — Login Page
// Design: White Glassmorphism | Arabic RTL | Google Sign-In
// ============================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Eye, EyeOff, Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// ─── Google Logo SVG ─────────────────────────────────────────
function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export function Login() {
  const navigate    = useNavigate();
  const { login, loginWithGoogle } = useAuth();

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error,       setError]       = useState('');

  // ── Email/Password Login ───────────────────────────────────
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }
    setLoadingEmail(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError('بيانات الدخول غير صحيحة، يرجى المحاولة مجدداً');
    } finally {
      setLoadingEmail(false);
    }
  };

  // ── Google Login ───────────────────────────────────────────
  const handleGoogleLogin = async () => {
    setError('');
    setLoadingGoogle(true);
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // المستخدم أغلق النافذة — لا نعرض خطأ
      } else {
        setError('فشل تسجيل الدخول بـ Google، يرجى المحاولة مجدداً');
      }
    } finally {
      setLoadingGoogle(false);
    }
  };

  const isLoading = loadingEmail || loadingGoogle;

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6 font-['Tajawal'] relative overflow-hidden"
      dir="rtl"
      style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #fef3c7 30%, #fde68a 60%, #fdba74 100%)' }}
    >
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(234,88,12,0.1) 0%, transparent 70%)', transform: 'translate(-30%, 30%)' }} />
      <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.12) 0%, transparent 70%)', transform: 'translate(-50%,-50%)' }} />

      <div className="relative w-full max-w-[420px]">
        {/* Card */}
        <div
          className="rounded-[2.5rem] p-8 overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.78)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            border: '1px solid rgba(255,255,255,0.92)',
            boxShadow: '0 32px 80px rgba(249,115,22,0.12), 0 8px 24px rgba(0,0,0,0.06)',
          }}
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-7">
            <div className="w-16 h-16 rounded-[1.5rem] flex items-center justify-center mb-4"
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', boxShadow: '0 8px 24px rgba(249,115,22,0.4)' }}>
              <Zap className="text-white" size={28} />
            </div>
            <h1 className="text-2xl font-black text-slate-800">رصيد ERP</h1>
            <p className="text-sm text-slate-400 mt-1">النظام المحاسبي السعودي</p>
          </div>

          {/* ── Google Sign-In Button ── */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl text-sm font-semibold text-slate-700 transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-60 mb-5"
            style={{
              background: 'white',
              border: '1.5px solid rgba(0,0,0,0.1)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            {loadingGoogle ? (
              <span className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
            ) : (
              <GoogleLogo size={18} />
            )}
            {loadingGoogle ? 'جاري تسجيل الدخول...' : 'المتابعة بـ Google'}
          </button>

          {/* ── Divider ── */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
            <span className="text-[12px] text-slate-400 font-medium">أو بالبريد الإلكتروني</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
          </div>

          {/* ── Email / Password Form ── */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">البريد الإلكتروني</label>
              <div className="relative">
                <Mail size={15} className="absolute right-3.5 top-3.5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@company.sa"
                  disabled={isLoading}
                  className="w-full pr-10 pl-4 py-3 rounded-2xl text-sm text-slate-800 outline-none transition-all disabled:opacity-60"
                  style={{ background: 'rgba(241,245,249,0.8)', border: '1.5px solid rgba(0,0,0,0.08)' }}
                  onFocus={e => (e.target.style.border = '1.5px solid rgba(249,115,22,0.5)')}
                  onBlur={e  => (e.target.style.border = '1.5px solid rgba(0,0,0,0.08)')}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">كلمة المرور</label>
              <div className="relative">
                <Lock size={15} className="absolute right-3.5 top-3.5 text-slate-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                  className="w-full pr-10 pl-10 py-3 rounded-2xl text-sm text-slate-800 outline-none transition-all disabled:opacity-60"
                  style={{ background: 'rgba(241,245,249,0.8)', border: '1.5px solid rgba(0,0,0,0.08)' }}
                  onFocus={e => (e.target.style.border = '1.5px solid rgba(249,115,22,0.5)')}
                  onBlur={e  => (e.target.style.border = '1.5px solid rgba(0,0,0,0.08)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute left-3 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm text-rose-600"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <AlertCircle size={14} className="flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', boxShadow: '0 8px 24px rgba(249,115,22,0.35)' }}
            >
              {loadingEmail ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  جاري تسجيل الدخول...
                </span>
              ) : 'تسجيل الدخول'}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-slate-400 mt-6">
            نظام رصيد ERP — متوافق مع ZATCA Phase 2
          </p>
        </div>
      </div>
    </div>
  );
}
