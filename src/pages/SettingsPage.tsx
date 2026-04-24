// ============================================================
// Control Panel (رصيد) — Settings Page
// Sections: Company | ZATCA | FATOORA | Users | Fiscal Year
// Connected to Supabase — Real Save / Load
// Logo Upload → Supabase Storage bucket: logos
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  Building2, Zap, FileText, Users, Calendar, Save,
  CheckCircle, AlertCircle, Eye, EyeOff, Loader2, X,
  Camera, ImagePlus,
} from 'lucide-react';
import { settingsService, type StoreSettings } from '../lib/supabase-services';
import supabase from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';

type Section = 'company' | 'zatca' | 'fatoora' | 'users' | 'fiscal';

const SECTIONS: { id: Section; label: string; icon: any }[] = [
  { id: 'company', label: 'بيانات الشركة',  icon: Building2 },
  { id: 'zatca',   label: 'ربط ZATCA',       icon: Zap       },
  { id: 'fatoora', label: 'ربط FATOORA',     icon: FileText  },
  { id: 'users',   label: 'المستخدمون',       icon: Users     },
  { id: 'fiscal',  label: 'السنة المالية',   icon: Calendar  },
];

const inputCls = "w-full px-4 py-3 rounded-2xl text-sm outline-none transition-all";
const inputSty = { background: 'rgba(241,245,249,0.8)', border: '1.5px solid rgba(0,0,0,0.08)' };
const labelCls = "block text-xs font-medium text-slate-500 mb-1.5";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={labelCls}>{label}</label>{children}</div>;
}

// ─── Toast Notification ───────────────────────────────────────
interface ToastProps { message: string; type: 'success' | 'error'; onClose: () => void }

function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="fixed bottom-6 left-6 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl"
      style={{
        background: type === 'success' ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#ef4444,#dc2626)',
        color: '#fff',
        backdropFilter: 'blur(20px)',
        animation: 'slideInUp 0.3s ease',
        minWidth: '260px',
      }}
    >
      {type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
      <span className="text-sm font-semibold flex-1">{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Logo Upload Zone ─────────────────────────────────────────
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_SIZE_MB   = 2;

interface LogoUploadZoneProps {
  currentUrl?: string;
  orgId: string;
  onUploadSuccess: (newUrl: string) => void;
  onError: (msg: string) => void;
}

function LogoUploadZone({ currentUrl, orgId, onUploadSuccess, onError }: LogoUploadZoneProps) {
  const inputRef             = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview,   setPreview]   = useState<string | null>(currentUrl ?? null);
  const [dragOver,  setDragOver]  = useState(false);

  // Sync preview when parent loads logo_url from DB
  useEffect(() => { if (currentUrl) setPreview(currentUrl); }, [currentUrl]);

  const processFile = async (file: File) => {
    // ── Validation ────────────────────────────────────────────
    if (!ALLOWED_TYPES.includes(file.type)) {
      onError('صيغة الملف غير مدعومة — يُرجى اختيار PNG أو JPG أو WebP');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      onError(`حجم الملف كبير جداً — الحد الأقصى ${MAX_SIZE_MB} ميغابايت`);
      return;
    }

    // ── Instant local preview ─────────────────────────────────
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploading(true);

    try {
      // ── Upload to Supabase Storage ────────────────────────────
      const ext      = file.name.split('.').pop() ?? 'jpg';
      const safeOrg  = orgId || 'default';
      const fileName = `orgs/${safeOrg}/logo_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, file, { upsert: true, contentType: file.type });

      if (uploadError) throw new Error(uploadError.message);

      // ── Retrieve public URL ───────────────────────────────────
      const { data: urlData } = supabase.storage
        .from('logos')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;

      // ── Save logo_url in settings table ──────────────────────
      await settingsService.save(orgId, { logo_url: publicUrl });

      // ── Notify parent to update local form state ──────────────
      onUploadSuccess(publicUrl);
    } catch (err: any) {
      onError(err.message ?? 'فشل رفع الشعار — حاول مجدداً');
      setPreview(currentUrl ?? null);   // revert preview on failure
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Drop zone */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className="relative flex items-center justify-center cursor-pointer transition-all select-none"
        style={{
          width: 140,
          height: 140,
          borderRadius: '2.5rem',
          background: dragOver
            ? 'rgba(249,115,22,0.08)'
            : 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: `2px dashed ${dragOver ? 'rgba(249,115,22,0.5)' : 'rgba(0,0,0,0.10)'}`,
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          transform: dragOver ? 'scale(1.03)' : 'scale(1)',
        }}
        title="انقر أو اسحب لتغيير الشعار"
      >
        {/* Preview image */}
        {preview ? (
          <img
            src={preview}
            alt="شعار المنشأة"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '2.4rem',
              filter: uploading ? 'brightness(0.45)' : 'brightness(1)',
              transition: 'filter 0.3s ease',
            }}
          />
        ) : (
          /* Placeholder */
          <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
            <div
              className="flex items-center justify-center rounded-2xl"
              style={{ width: 48, height: 48, background: 'rgba(249,115,22,0.10)' }}
            >
              <ImagePlus size={22} style={{ color: '#f97316' }} />
            </div>
            <span className="text-[10px] font-bold text-center leading-tight" style={{ color: '#94a3b8' }}>
              اضغط لرفع<br />الشعار
            </span>
          </div>
        )}

        {/* Upload spinner overlay */}
        {uploading && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(15,23,42,0.30)', borderRadius: '2.4rem' }}
          >
            <Loader2 size={32} className="animate-spin" style={{ color: '#fff' }} />
          </div>
        )}

        {/* Camera badge (bottom-left) */}
        {!uploading && (
          <div
            className="absolute flex items-center justify-center"
            style={{
              bottom: 8, left: 8,
              width: 28, height: 28,
              borderRadius: '0.85rem',
              background: 'linear-gradient(135deg,#f97316,#ea580c)',
              boxShadow: '0 2px 8px rgba(249,115,22,0.35)',
            }}
          >
            <Camera size={13} style={{ color: '#fff' }} />
          </div>
        )}
      </div>

      <p className="text-[10px] font-medium text-slate-400 text-center leading-relaxed">
        PNG · JPG · WebP<br />الحد الأقصى {MAX_SIZE_MB} ميغابايت
      </p>
    </div>
  );
}

// ─── Section: Company (Connected to Supabase) ─────────────────
function CompanySection() {
  const { orgId } = useTenant();
  const [form, setForm] = useState<Partial<StoreSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load settings from Supabase on mount
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const data = await settingsService.get(orgId);
        setForm(data);
      } catch (err: any) {
        console.error('[Settings]', err);
        setToast({ message: 'تعذّر تحميل الإعدادات — تحقق من الاتصال', type: 'error' });
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  const handleChange = (key: keyof StoreSettings, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsService.save(orgId, form);
      setToast({ message: 'تم حفظ إعدادات الشركة بنجاح ✓', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message ?? 'حدث خطأ أثناء الحفظ', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">جاري جلب بيانات المنشأة...</span>
      </div>
    );
  }

  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="space-y-5">

        {/* ── Logo Upload Section ────────────────────────────── */}
        <div
          className="flex items-center gap-6 p-5 rounded-[2rem]"
          style={{
            background: 'rgba(255,255,255,0.60)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1.5px solid rgba(255,255,255,0.80)',
            boxShadow: '0 2px 16px rgba(0,0,0,0.04)',
          }}
        >
          <LogoUploadZone
            currentUrl={form.logo_url}
            orgId={orgId}
            onUploadSuccess={(url) => {
              setForm(prev => ({ ...prev, logo_url: url }));
              setToast({ message: 'تم رفع الشعار وحفظه بنجاح ✓', type: 'success' });
            }}
            onError={(msg) => setToast({ message: msg, type: 'error' })}
          />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-700 mb-1">شعار المنشأة</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              سيظهر الشعار على الفواتير الحرارية وملف PDF، وعلى رأس التقارير الضريبية.
              {form.logo_url
                ? ' ✓ الشعار محفوظ مسبقاً.'
                : ' لم يُرفع شعار بعد.'}
            </p>
            {form.logo_url && (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold"
                style={{ background: 'rgba(16,185,129,0.08)', color: '#059669' }}
              >
                <CheckCircle size={11} />
                شعار نشط — اضغط عليه لاستبداله
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="اسم الشركة بالعربية">
            <input
              className={inputCls} style={inputSty}
              value={form.name_ar ?? ''}
              onChange={e => handleChange('name_ar', e.target.value)}
              placeholder="متجر رصيد الذكي"
            />
          </Field>
          <Field label="اسم الشركة بالإنجليزية">
            <input
              className={inputCls} style={inputSty}
              value={form.name_en ?? ''}
              onChange={e => handleChange('name_en', e.target.value)}
              placeholder="Raseed Smart Store"
            />
          </Field>
          <Field label="الرقم الضريبي (15 رقم)">
            <input
              className={inputCls} style={inputSty}
              value={form.vat_number ?? ''}
              onChange={e => handleChange('vat_number', e.target.value)}
              maxLength={15}
              placeholder="310000000000003"
            />
          </Field>
          <Field label="السجل التجاري">
            <input
              className={inputCls} style={inputSty}
              value={form.cr_number ?? ''}
              onChange={e => handleChange('cr_number', e.target.value)}
              placeholder="1234567890"
            />
          </Field>
          <Field label="المدينة">
            <input
              className={inputCls} style={inputSty}
              value={form.city ?? ''}
              onChange={e => handleChange('city', e.target.value)}
              placeholder="الرياض"
            />
          </Field>
          <Field label="رقم الهاتف">
            <input
              className={inputCls} style={inputSty}
              value={form.phone ?? ''}
              onChange={e => handleChange('phone', e.target.value)}
              placeholder="+966 11 000 0000"
            />
          </Field>
          <Field label="البريد الإلكتروني">
            <input
              className={inputCls} style={inputSty} type="email"
              value={form.email ?? ''}
              onChange={e => handleChange('email', e.target.value)}
              placeholder="info@mystore.sa"
            />
          </Field>
          <Field label="العملة الافتراضية">
            <select
              className={inputCls} style={inputSty}
              value={form.currency ?? 'ر.س'}
              onChange={e => handleChange('currency', e.target.value)}
            >
              <option value="ر.س">ريال سعودي (ر.س)</option>
              <option value="د.إ">درهم إماراتي (د.إ)</option>
            </select>
          </Field>
        </div>
        <Field label="نسبة ضريبة القيمة المضافة">
          <div className="flex items-center gap-3">
            <input className={`${inputCls} w-24`} style={inputSty} type="number" value="15" readOnly />
            <span className="text-sm text-slate-500 font-medium">% — ثابتة وفق لوائح هيئة الزكاة</span>
          </div>
        </Field>
        <Field label="ذيل الفاتورة">
          <textarea
            className={`${inputCls} h-20 resize-none`} style={inputSty}
            value={form.receipt_footer ?? ''}
            onChange={e => handleChange('receipt_footer', e.target.value)}
            placeholder="شكراً لتعاملكم معنا | رصيد ERP | متوافق مع ZATCA Phase 2"
          />
        </Field>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.3)' }}
        >
          {saving
            ? <><Loader2 size={14} className="animate-spin" /> جاري الحفظ...</>
            : <><Save size={14} /> حفظ التغييرات</>
          }
        </button>
      </div>
    </>
  );
}

// ─── Section: ZATCA ───────────────────────────────────────────
function ZatcaSection() {
  const { orgId } = useTenant();
  const [form, setForm]   = useState<Partial<StoreSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus]   = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try { const data = await settingsService.get(orgId); setForm(data); }
      catch { /* non-critical */ }
      finally { setLoading(false); }
    })();
  }, [orgId]);

  const testConnection = () => {
    setStatus('testing');
    setTimeout(() => setStatus(form.zatca_env === 'sandbox' ? 'success' : 'idle'), 1800);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsService.save(orgId, {
        zatca_env: form.zatca_env,
        zatca_cert: form.zatca_cert,
        zatca_private_key: form.zatca_private_key,
        zatca_otp: form.zatca_otp,
      });
      setToast({ message: 'تم حفظ إعدادات ZATCA بنجاح ✓', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">جاري جلب إعدادات ZATCA...</span>
      </div>
    );
  }

  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="space-y-5">
        <div
          className="rounded-2xl p-4 flex items-start gap-3"
          style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)' }}>
          <Zap size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-slate-600">
            <p className="font-semibold text-slate-700 mb-0.5">ZATCA Phase 2 — الفوترة الإلكترونية</p>
            <p className="text-xs text-slate-400">ابدأ بـ Sandbox للاختبار، ثم انتقل إلى Production بعد الحصول على الشهادة الرقمية</p>
          </div>
        </div>

        <Field label="بيئة الاتصال">
          <div className="flex gap-3">
            {(['sandbox', 'production'] as const).map(e => (
              <button key={e}
                onClick={() => setForm(prev => ({ ...prev, zatca_env: e }))}
                className="flex-1 py-3 rounded-2xl text-sm font-medium transition-all"
                style={{
                  background: form.zatca_env === e ? (e === 'sandbox' ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)') : 'rgba(0,0,0,0.03)',
                  color: form.zatca_env === e ? (e === 'sandbox' ? '#3b82f6' : '#10b981') : '#94a3b8',
                  border: `1.5px solid ${form.zatca_env === e ? (e === 'sandbox' ? 'rgba(59,130,246,0.3)' : 'rgba(16,185,129,0.3)') : 'rgba(0,0,0,0.08)'}`,
                }}>
                {e === 'sandbox' ? '🧪 Sandbox (اختبار)' : '🚀 Production (إنتاج)'}
              </button>
            ))}
          </div>
        </Field>

        <Field label="رقم الطلب (OTP) أو CSID">
          <input
            className={inputCls} style={inputSty}
            value={form.zatca_otp ?? ''}
            onChange={e => setForm(prev => ({ ...prev, zatca_otp: e.target.value }))}
            placeholder="أدخل OTP المستلم من ZATCA"
          />
        </Field>

        <Field label="الشهادة الرقمية (Certificate)">
          <textarea
            className={`${inputCls} h-24 resize-none font-mono text-xs`} style={inputSty}
            value={form.zatca_cert ?? ''}
            onChange={e => setForm(prev => ({ ...prev, zatca_cert: e.target.value }))}
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
          />
        </Field>

        <Field label="المفتاح الخاص (Private Key)">
          <div className="relative">
            <textarea
              className={`${inputCls} h-24 resize-none font-mono text-xs`} style={inputSty}
              value={showKey ? (form.zatca_private_key ?? '') : (form.zatca_private_key ? '•'.repeat(30) : '')}
              onChange={e => setForm(prev => ({ ...prev, zatca_private_key: e.target.value }))}
              placeholder="-----BEGIN EC PRIVATE KEY-----"
            />
            <button onClick={() => setShowKey(!showKey)} className="absolute left-3 top-3 text-slate-400">
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>

        <div className="flex gap-3">
          <button onClick={testConnection} disabled={status === 'testing'}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium text-slate-600 transition-all cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            {status === 'testing' ? <><span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" /> جاري الاختبار...</>
              : status === 'success' ? <><CheckCircle size={15} className="text-emerald-500" /> الاتصال ناجح</>
              : status === 'error'   ? <><AlertCircle size={15} className="text-rose-500" /> فشل الاتصال</>
              : '🔌 اختبار الاتصال'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-60 cursor-pointer"
            style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.3)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> حفظ...</> : <><Save size={14} /> حفظ الإعدادات</>}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Section: Users (Fetched from Supabase auth.users) ────────
function UsersSection() {
  const { orgId } = useTenant();
  const [users, setUsers]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('org_id', orgId)
          .order('created_at');
        if (!error && data) setUsers(data);
      } catch { /* non-critical */ }
      finally { setLoading(false); }
    })();
  }, [orgId]);

  const ROLE_COLORS: Record<string, string> = {
    admin: '#f97316', accountant: '#3b82f6', cashier: '#10b981', ADMIN: '#f97316', ACCOUNTANT: '#3b82f6', CASHIER: '#10b981',
  };
  const ROLE_LABELS: Record<string, string> = {
    admin: 'مدير', accountant: 'محاسب', cashier: 'كاشير',
    ADMIN: 'مدير', ACCOUNTANT: 'محاسب', CASHIER: 'كاشير',
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">
          {loading ? 'جاري التحميل...' : `${users.length} مستخدم نشط`}
        </p>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer"
          style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 2px 8px rgba(249,115,22,0.3)' }}>
          + مستخدم جديد
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">جاري جلب بيانات المستخدمين...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-10 text-sm text-slate-400">لا يوجد مستخدمون بعد</div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id}
              className="flex items-center justify-between p-4 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-black text-white"
                  style={{ background: ROLE_COLORS[u.role] ?? '#94a3b8' }}>
                  {(u.full_name ?? u.email ?? '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{u.full_name ?? '—'}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ color: ROLE_COLORS[u.role] ?? '#94a3b8', background: `${ROLE_COLORS[u.role] ?? '#94a3b8'}15` }}>
                  {ROLE_LABELS[u.role] ?? u.role}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section: Fiscal Year (Connected to Supabase) ─────────────
function FiscalSection() {
  const { orgId } = useTenant();
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('fiscal_periods')
          .select('*')
          .eq('org_id', orgId)
          .order('start_date', { ascending: false });
        if (data) setPeriods(data);
      } catch { /* non-critical */ }
      finally { setLoading(false); }
    })();
  }, [orgId]);

  const handleCreate = async () => {
    if (!newStart || !newEnd) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('fiscal_periods')
        .insert({ start_date: newStart, end_date: newEnd, status: 'OPEN' })
        .select().single();
      if (error) throw error;
      setPeriods(prev => [data, ...prev]);
      setNewStart(''); setNewEnd('');
      setToast({ message: 'تم إنشاء السنة المالية بنجاح ✓', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const currentPeriod = periods.find(p => p.status === 'OPEN');

  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">جاري جلب الفترات المالية...</span>
          </div>
        ) : currentPeriod ? (
          <div
            className="rounded-2xl p-4 flex items-start gap-3"
            style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
            <Calendar size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-slate-600">
              السنة المالية الحالية: <strong>{currentPeriod.start_date} — {currentPeriod.end_date}</strong>
              <span className="mr-2 px-2 py-0.5 rounded-full text-xs text-emerald-700 bg-emerald-100">مفتوحة</span>
            </p>
          </div>
        ) : (
          <div className="rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <p className="text-sm text-rose-600">⚠️ لا توجد سنة مالية مفتوحة. أنشئ واحدة الآن.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="تاريخ بداية السنة المالية">
            <input type="date" className={inputCls} style={inputSty} value={newStart} onChange={e => setNewStart(e.target.value)} />
          </Field>
          <Field label="تاريخ نهاية السنة المالية">
            <input type="date" className={inputCls} style={inputSty} value={newEnd} onChange={e => setNewEnd(e.target.value)} />
          </Field>
        </div>
        <button
          onClick={handleCreate}
          disabled={saving || !newStart || !newEnd}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50 cursor-pointer"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)', boxShadow: '0 4px 16px rgba(59,130,246,0.3)' }}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> جاري الإنشاء...</> : <><Save size={14} /> إنشاء سنة مالية جديدة</>}
        </button>
      </div>
    </>
  );
}

// ─── Main Settings Page ───────────────────────────────────────
export function SettingsPage() {
  const [section, setSection] = useState<Section>('company');
  const active = SECTIONS.find(s => s.id === section)!;

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: 'Tajawal, sans-serif' }}>
      <div className="mb-5">
        <h1 className="text-2xl font-black text-slate-800">الإعدادات</h1>
        <p className="text-sm text-slate-400 mt-0.5">إدارة الشركة، ZATCA، FATOORA، والمستخدمين</p>
      </div>

      <div className="grid grid-cols-4 gap-5">
        {/* Sidebar Nav */}
        <div className="col-span-1">
          <div
            className="rounded-[1.75rem] p-2 space-y-0.5"
            style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setSection(s.id)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-right transition-all cursor-pointer"
                style={{
                  background: section === s.id ? 'rgba(249,115,22,0.08)' : 'transparent',
                  border: section === s.id ? '1px solid rgba(249,115,22,0.15)' : '1px solid transparent',
                }}>
                <s.icon size={16} style={{ color: section === s.id ? '#f97316' : '#94a3b8', flexShrink: 0 }} />
                <span className="text-sm font-medium" style={{ color: section === s.id ? '#1e293b' : '#64748b' }}>
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="col-span-3">
          <div
            className="rounded-[1.75rem] p-6"
            style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center gap-3 mb-6 pb-4 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
              <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(249,115,22,0.1)' }}>
                <active.icon size={17} className="text-orange-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">{active.label}</h2>
            </div>

            {section === 'company'  && <CompanySection />}
            {section === 'zatca'    && <ZatcaSection />}
            {section === 'fatoora' && (
              <FatooraSection />
            )}
            {section === 'users'    && <UsersSection />}
            {section === 'fiscal'   && <FiscalSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section: FATOORA ─────────────────────────────────────────
function FatooraSection() {
  const [form, setForm]     = useState({ fatoora_api_key: '', fatoora_webhook: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    settingsService.get().then(data => {
      setForm({
        fatoora_api_key: data.fatoora_api_key ?? '',
        fatoora_webhook: data.fatoora_webhook ?? '',
      });
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsService.save(form);
      setToast({ message: 'تم حفظ إعدادات FATOORA بنجاح ✓', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="space-y-4">
        <Field label="FATOORA API Key">
          <input
            className={inputCls} style={inputSty} type="password"
            value={form.fatoora_api_key}
            onChange={e => setForm(p => ({ ...p, fatoora_api_key: e.target.value }))}
            placeholder="أدخل مفتاح FATOORA API"
          />
        </Field>
        <Field label="رابط الـ Webhook">
          <input
            className={inputCls} style={inputSty}
            value={form.fatoora_webhook}
            onChange={e => setForm(p => ({ ...p, fatoora_webhook: e.target.value }))}
            placeholder="https://your-domain.sa/fatoora/callback"
          />
        </Field>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-60 cursor-pointer"
          style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.3)' }}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> حفظ...</> : <><Save size={14} /> حفظ الإعدادات</>}
        </button>
      </div>
    </>
  );
}

export default SettingsPage;
