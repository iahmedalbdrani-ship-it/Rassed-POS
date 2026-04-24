# CLAUDE.md — رصيد POS | نظام عزل البيئات

## نظرة عامة على المشروع

تطبيق POS مبني على React + Vite + Electron مع Firebase و Supabase.
هذا الملف هو **مرجع Claude Code** — يوضح البنية والقواعد وكيفية التعامل مع البيئات.

---

## هيكل الملفات

```
rasid-pos/
├── CLAUDE.md                         ← أنت هنا
├── .env.development                  ← مفاتيح dev (في .gitignore)
├── .env.production                   ← مفاتيح prod (في .gitignore)
├── .env.example                      ← قالب فارغ (في Git)
├── .gitignore
├── vite.config.ts
├── package.json
├── src/
│   ├── types/
│   │   └── environment.d.ts          ← TypeScript types للـ env
│   ├── config/
│   │   ├── environment.ts            ← isDev, isProd, getEnvironmentConfig()
│   │   ├── firebase.ts               ← Firebase singleton
│   │   └── supabase.ts               ← Supabase singleton
│   └── ...
└── electron/
    └── main.ts                       ← Electron main process
```

---

## البيئات والمفاتيح

| البيئة | Firebase Project | Supabase Ref |
|--------|-----------------|--------------|
| development | rassed-dev | xxmnvcnjkmpdrspmurmy |
| production | rassed-a7010 | rekipmtjzrrdvsikrqnr |

---

## قواعد صارمة (STRICT RULES)

1. **لا تتلمس .env.development أو .env.production** — هما في .gitignore
2. **لا تُضف مفاتيح Firebase/Supabase مباشرة في الكود** — استخدم `import.meta.env` فقط
3. **كل وصول للبيئة يمر عبر** `src/config/environment.ts` — لا تقرأ `import.meta.env` مباشرة من components
4. **Firebase Singleton** — `getApps().length === 0` يمنع إعادة التهيئة
5. **Analytics في prod فقط** — محاطة بـ `config.isProd &&`

---

## كيفية الاستخدام

### في أي component أو service:

```typescript
// ✅ الطريقة الصحيحة
import { supabase } from '@config/supabase'
import { auth, db } from '@config/firebase'
import { isDevelopment, getEnvironmentConfig } from '@config/environment'

// استخدام Supabase
const { data, error } = await supabase.from('invoices').select('*')

// استخدام Firebase
const user = auth.currentUser

// فحص البيئة
if (isDevelopment()) {
  console.log('نحن في dev')
}

// الحصول على الإعدادات الكاملة
const config = getEnvironmentConfig()
console.log(config.env)           // 'development' | 'production'
console.log(config.supabase.url)  // URL الصحيح للبيئة الحالية
```

### ❌ الطريقة الخاطئة:

```typescript
// لا تفعل هذا
const url = import.meta.env.VITE_SUPABASE_URL  // مباشرة في component
const apiKey = 'AIzaSyCMJ54...'                 // hardcoded في الكود
```

---

## الأوامر الرئيسية

```bash
npm run dev              # تطوير (يقرأ .env.development)
npm run build:dev        # بناء dev
npm run build:prod       # بناء prod (يقرأ .env.production)
npm run electron:dev     # Electron مع Vite dev server
npm run electron:prod    # Electron مع ملفات مبنية
npm run type-check       # TypeScript check
```

---

## التحقق من صحة البيئة

عند بدء تشغيل التطبيق، `getEnvironmentConfig()` تتحقق تلقائياً من:
- وجود جميع متغيرات البيئة المطلوبة
- أن `VITE_APP_ENV` له قيمة صحيحة

إذا كان أي متغير مفقوداً → يُوقف التطبيق برسالة خطأ واضحة.

---

## الانتقال من dev إلى prod

```bash
# 1. تأكد أن .env.production محدّث بمفاتيح الإنتاج
# 2. بناء التطبيق للإنتاج
npm run build:prod

# 3. تجربة البناء محلياً
npm run preview

# 4. بناء Electron للإنتاج
npm run electron:build:prod
```

---

## فحص البيئة الحالية (Debugging)

```typescript
import { getEnvironmentConfig, getSupabaseConfig } from '@config'

// في console أو في صفحة Settings (dev only)
console.table(getEnvironmentConfig())
console.table(getSupabaseConfig())
```

---

## أخطاء شائعة وحلولها

| الخطأ | السبب | الحل |
|-------|-------|------|
| `VITE_SUPABASE_URL is undefined` | الملف .env غير موجود | أنشئ .env.development |
| Firebase initialized twice | إعادة render في HMR | `getApps().length === 0` check موجود بالفعل |
| Wrong project in prod | استخدام .env.development في build | استخدم `npm run build:prod` وليس `build` |
| Electron loads blank page | dist غير موجود | شغّل `npm run build:prod` أولاً |
