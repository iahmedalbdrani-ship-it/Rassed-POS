// src/sections/Settingssection.tsx
import React, { useState } from 'react';

export default function Settingssection() {
  const [currency, setCurrency] = useState('ر.س');

  return (
    <div className="space-y-8 pb-20" dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-black text-slate-800">إعدادات النظام</h1>
          <p className="text-slate-500 text-sm mt-1">إدارة هوية المتجر، الإعدادات المالية، والأمان</p>
        </div>
        <button className="px-8 py-3 bg-orange-500 text-white rounded-2xl font-bold shadow-lg shadow-orange-200 hover:scale-105 transition-all">
          حفظ التغييرات
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* كارت بيانات المتجر */}
        <div className="bg-white/40 backdrop-blur-xl border border-white/60 p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <span className="p-3 bg-blue-500/10 text-blue-600 rounded-2xl text-xl">🏢</span>
            <h2 className="text-xl font-black text-slate-800">بيانات المتجر والمنشأة</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 mr-2">اسم الشركة / المتجر</label>
              <input type="text" placeholder="مثلاً: شركة الخليج للتوزيع" className="w-full p-4 rounded-2xl bg-white/50 border border-white/20 outline-none focus:ring-2 ring-blue-500/20" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 mr-2">الرقم الضريبي (VAT)</label>
              <input type="text" placeholder="3100xxxxxxxxxxx" className="w-full p-4 rounded-2xl bg-white/50 border border-white/20 outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 mr-2">العنوان الكامل</label>
              <input type="text" placeholder="جدة، حي الحمراء، طريق الملك" className="w-full p-4 rounded-2xl bg-white/50 border border-white/20 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 mr-2">رقم الهاتف</label>
                <input type="text" placeholder="96650xxxxxxx" className="w-full p-4 rounded-2xl bg-white/50 border border-white/20 outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 mr-2">الموقع الإلكتروني</label>
                <input type="text" placeholder="www.store.com" className="w-full p-4 rounded-2xl bg-white/50 border border-white/20 outline-none" />
              </div>
            </div>
          </div>
        </div>

        {/* كارت الإعدادات المالية وذيل الفاتورة */}
        <div className="bg-white/40 backdrop-blur-xl border border-white/60 p-8 rounded-[2.5rem] shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <span className="p-3 bg-emerald-500/10 text-emerald-600 rounded-2xl text-xl">💰</span>
            <h2 className="text-xl font-black text-slate-800">الإعدادات المالية</h2>
          </div>
          <div className="space-y-6 flex-1">
            <div className="flex items-center justify-between p-4 bg-white/30 rounded-2xl border border-white/40">
              <span className="font-bold text-slate-600">نسبة ضريبة القيمة المضافة</span>
              <div className="flex items-center gap-2">
                <input type="number" defaultValue="15" className="w-16 p-2 text-center rounded-xl bg-white border-none font-bold" />
                <span className="font-bold text-slate-400">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 mr-2">عملة النظام</label>
              <select className="w-full p-4 rounded-2xl bg-white/50 border border-white/20 outline-none" value={currency} onChange={(e)=>setCurrency(e.target.value)}>
                <option>ريال سعودي (ر.س)</option>
                <option>درهم إماراتي (د.إ)</option>
                <option>دولار أمريكي ($)</option>
                <option>دينار كويتي (د.ك)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 mr-2">ذيل الفاتورة (مواقع التواصل)</label>
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <span className="absolute left-4 top-4 opacity-30">📸</span>
                  <input type="text" placeholder="انستقرام" className="w-full p-4 pl-10 rounded-2xl bg-white/50 border border-white/20 outline-none text-sm" />
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-4 opacity-30">👻</span>
                  <input type="text" placeholder="سناب شات" className="w-full p-4 pl-10 rounded-2xl bg-white/50 border border-white/20 outline-none text-sm" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* كارت الهوية البصرية (الشعار والختم) */}
        <div className="bg-white/40 backdrop-blur-xl border border-white/60 p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <span className="p-3 bg-purple-500/10 text-purple-600 rounded-2xl text-xl">🎨</span>
            <h2 className="text-xl font-black text-slate-800">الهوية البصرية</h2>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-sm font-bold text-slate-500 text-center">شعار الشركة</p>
              <div className="h-40 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center gap-2 hover:bg-white/40 transition-all cursor-pointer">
                <span className="text-2xl opacity-30">🖼️</span>
                <span className="text-[10px] font-bold text-slate-400">رفع الشعار</span>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-bold text-slate-500 text-center">الختم الرسمي</p>
              <div className="h-40 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center gap-2 hover:bg-white/40 transition-all cursor-pointer">
                <span className="text-2xl opacity-30">💮</span>
                <span className="text-[10px] font-bold text-slate-400">رفع الختم</span>
              </div>
            </div>
          </div>
        </div>

        {/* كارت الأمان (تغيير كلمة المرور) */}
        <div className="bg-white/40 backdrop-blur-xl border border-white/60 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-6">
            <span className="p-3 bg-rose-500/10 text-rose-600 rounded-2xl text-xl">🔐</span>
            <h2 className="text-xl font-black text-slate-800">أمان الحساب (Admin)</h2>
          </div>
          <div className="space-y-4">
            <input type="password" placeholder="كلمة المرور الحالية" className="w-full p-4 rounded-2xl bg-white/50 border border-white/20 outline-none" />
            <input type="password" placeholder="كلمة المرور الجديدة" className="w-full p-4 rounded-2xl bg-white/50 border border-white/20 outline-none" />
            <button className="w-full py-4 bg-slate-800 text-white rounded-2xl font-bold hover:bg-black transition-all">تحديث كلمة المرور</button>
          </div>
        </div>

      </div>
    </div>
  );
}