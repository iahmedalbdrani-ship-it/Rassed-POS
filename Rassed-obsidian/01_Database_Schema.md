---
type: database
module: accounting
status: draft
tags:
---

# هيكل قواعد البيانات والمنطق المحاسبي - رصيد

<accounting_logic>
النظام المحاسبي في "رصيد" يعتمد بشكل صارم على مبدأ القيد المزدوج (Double-Entry Bookkeeping).
أي عملية مالية (Transaction) يجب أن تحتوي على شقين على الأقل (مدين ودائن - Debit and Credit)، ويجب أن يكون مجموع الطرف المدين مساوياً تماماً لمجموع الطرف الدائن.
</accounting_logic>

<core_collections>

## 1. مجموعة الحسابات (Accounts Collection)
هذا الجدول يخزن الشجرة المحاسبية.
- `id`: المعرف الفريد للحساب (String)
- `account_code`: الرمز المحاسبي (مثال: 1001) (String)
- `name`: اسم الحساب (مثل: بنك، صندوق، مبيعات) (String)
- `type`: نوع الحساب (Asset, Liability, Equity, Revenue, Expense) (String)
- `parent_id`: معرف الحساب الأب (لإنشاء شجرة متفرعة) (String/Null)

## 2. مجموعة القيود (Journal Entries Collection)
يمثل رأس العملية المالية.
- `id`: المعرف الفريد (String)
- `date`: تاريخ ووقت العملية (Timestamp)
- `description`: وصف أو بيان القيد (String)
- `reference_doc`: رقم المستند المرجعي (مثل رقم الفاتورة) (String/Null)
- `status`: حالة القيد (مسودة، معتمد) (String)

## 3. مجموعة تفاصيل القيود (Journal Entry Lines Collection)
تمثل السطور داخل كل قيد مالي.
- `id`: المعرف الفريد (String)
- `entry_id`: ربط مع جدول القيود (Reference)
- `account_id`: ربط مع جدول الحسابات (Reference)
- `debit`: المبلغ المدين (Number)
- `credit`: المبلغ الدائن (Number)

</core_collections>