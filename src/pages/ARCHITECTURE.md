# 🏪 رصيد ERP — نظام نقطة البيع المتكامل
## Enterprise POS System — Production Ready | SaaS Ready

---

## 🗂️ هيكل المشروع (Folder Structure)

```
raseed-erp/
├── src/
│   ├── modules/
│   │   ├── pos/                          # ← نقطة البيع (POS Module)
│   │   │   ├── components/
│   │   │   │   ├── POSCashier.tsx        ← المكوّن الرئيسي
│   │   │   │   ├── ProductCard.tsx       ← بطاقة المنتج
│   │   │   │   ├── ProductGrid.tsx       ← شبكة المنتجات
│   │   │   │   ├── CartPanel.tsx         ← سلة المشتريات
│   │   │   │   ├── CheckoutModal.tsx     ← نافذة الدفع
│   │   │   │   ├── SuccessOverlay.tsx    ← شاشة النجاح
│   │   │   │   └── ThermalReceipt.tsx   ← الفاتورة الحرارية 80mm
│   │   │   ├── engines/
│   │   │   │   ├── zatca.engine.ts       ← ZATCA TLV Encoder
│   │   │   │   ├── accounting.engine.ts  ← Double Entry Engine
│   │   │   │   ├── inventory.engine.ts   ← Inventory Manager
│   │   │   │   └── invoice.engine.ts     ← Invoice Generator
│   │   │   ├── hooks/
│   │   │   │   ├── useCart.ts            ← Cart state + logic
│   │   │   │   ├── useProducts.ts        ← Products + search
│   │   │   │   ├── useBarcodeScanner.ts  ← HID Scanner hook
│   │   │   │   └── useOfflineSync.ts     ← Offline/LocalStorage
│   │   │   ├── store/
│   │   │   │   └── pos.store.ts          ← Zustand store
│   │   │   └── types/
│   │   │       └── pos.types.ts          ← All interfaces
│   │   │
│   │   ├── accounting/                   ← وحدة المحاسبة
│   │   │   ├── ledger/
│   │   │   ├── reports/
│   │   │   └── journal/
│   │   │
│   │   ├── inventory/                    ← وحدة المخزون
│   │   ├── customers/                    ← إدارة العملاء
│   │   ├── reports/                      ← التقارير
│   │   └── settings/                    ← الإعدادات
│   │
│   ├── shared/
│   │   ├── components/
│   │   │   ├── GlassCard.tsx
│   │   │   ├── GlassButton.tsx
│   │   │   └── Notification.tsx
│   │   ├── hooks/
│   │   ├── utils/
│   │   │   ├── formatter.ts              ← fmt() utility
│   │   │   └── validators.ts
│   │   └── theme/
│   │       └── theme.ts                  ← Design tokens + fmt
│   │
│   ├── lib/
│   │   ├── supabase.ts                   ← Supabase client
│   │   └── firebase.ts                   ← Firebase client (optional)
│   │
│   └── App.tsx
│
├── public/
├── package.json
├── tailwind.config.ts
└── vite.config.ts
```

---

## 📦 المكتبات المطلوبة

```bash
npm install \
  react react-dom typescript \
  @supabase/supabase-js \
  firebase \
  zustand \
  @tanstack/react-query \
  react-to-print \
  qrcode.react \
  react-barcode \
  framer-motion \
  lucide-react \
  uuid \
  @types/uuid \
  tailwindcss \
  @tailwindcss/forms
```

---

## ⚙️ المحركات (Engines)

### 1. ZATCA TLV Engine
- ✅ TextEncoder + Uint8Array (بدون Buffer — آمن لـ Vite/Electron)
- ✅ TLV Fields: Seller, VAT#, Timestamp, Total, VAT Amount
- ✅ يدعم Sandbox + Production

### 2. Accounting Engine (Double Entry)
```
عملية بيع نقدي:
  DEBIT:  1010 الصندوق        +grand_total
  CREDIT: 4010 إيرادات المبيعات  +subtotal_ex_vat
  CREDIT: 2030 ضريبة مستحقة     +total_vat

عملية بيع مدى/فيزا:
  DEBIT:  1020/1021 البنك     +grand_total
  CREDIT: 4010 إيرادات         +subtotal_ex_vat
  CREDIT: 2030 ضريبة           +total_vat
```

### 3. Inventory Engine
- خصم فوري من المخزون عند إتمام البيع
- تنبيه عند انخفاض المخزون (min_stock)
- ربط المرتجعات بالفاتورة الأصلية

---

## 🔑 نقاط البيع الرئيسية

| الميزة | الوصف |
|--------|--------|
| ZATCA Phase 2 | ✅ TLV QR متوافق |
| فاتورة حرارية | ✅ 80mm مع QR + Barcode |
| محاسبة مزدوجة | ✅ قيود تلقائية |
| باركود سكانر | ✅ HID keyboard emulation |
| Offline Mode | ✅ LocalStorage sync |
| متعدد الفروع | ✅ branch_id |
| متعدد المستخدمين | ✅ cashier_id |
| خصومات | ✅ سطر بسطر |
| ضريبة مختلطة | ✅ معفى + خاضع |

---

## 🔒 Security Checklist

- [ ] RLS (Row Level Security) في Supabase
- [ ] JWT validation على كل endpoint
- [ ] Invoice tampering protection (hash)
- [ ] Audit log لكل عملية
- [ ] Rate limiting على POS endpoint
- [ ] HTTPS only في Production

---

## 🚀 Supabase Schema

```sql
-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  branch_id TEXT NOT NULL,
  cashier_id UUID REFERENCES auth.users(id),
  items JSONB NOT NULL,
  totals JSONB NOT NULL,
  payments JSONB NOT NULL,
  change_due NUMERIC(12,2) DEFAULT 0,
  zatca_qr TEXT,
  status TEXT DEFAULT 'completed',
  refund_ref UUID REFERENCES invoices(id)
);

-- Accounting Entries
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  description TEXT,
  lines JSONB NOT NULL
);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT,
  category TEXT,
  price NUMERIC(12,2) NOT NULL,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 5,
  unit TEXT DEFAULT 'قطعة',
  vat_exempt BOOLEAN DEFAULT false,
  branch_id TEXT
);

-- Enable RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
```
