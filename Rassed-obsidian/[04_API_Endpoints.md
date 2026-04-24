---
type: backend
module: api
status: active
---

# هيكل واجهة برمجة التطبيقات (API Architecture) - مشروع رصيد

<api_standards>
يعتمد نظام "رصيد" على بنية (RESTful API) قياسية للتواصل بين واجهة المستخدم (Frontend) والخادم (Backend).
- **الصيغة المعتمدة (Data Format):** يتم إرسال واستقبال جميع البيانات بصيغة `JSON`.
- **الرابط الأساسي (Base URL):** `/api/v1/`
</api_standards>

<authentication>
- **المصادقة:** يتم استخدام `JWT` (JSON Web Tokens).
- يجب إرفاق التوكن في ترويسة الطلب (Headers) بهذا الشكل: 
  `Authorization: Bearer <token>`
- أي طلب لا يحتوي على التوكن أو يحتوي على توكن منتهي الصلاحية يجب أن يُرجع خطأ `401 Unauthorized`.
</authentication>

<core_endpoints>

## 1. إدارة الحسابات المحاسبية (Accounts)
- `GET /api/v1/accounts`: استرجاع دليل الحسابات (شجرة الحسابات).
- `POST /api/v1/accounts`: إضافة حساب فرعي أو رئيسي جديد.

## 2. إدارة القيود المحاسبية (Journal Entries)
- `GET /api/v1/journal-entries`: استرجاع قائمة القيود مع إمكانية الفلترة (حسب التاريخ، الحالة).
- `GET /api/v1/journal-entries/:id`: استرجاع تفاصيل قيد محدد (بما في ذلك سطور القيد).
- `POST /api/v1/journal-entries`: إنشاء قيد محاسبي جديد (مهم: يجب أن تمر البيانات عبر طبقة التحقق - Validation Middleware).

## 3. الفواتير والمبيعات (Invoices)
- `GET /api/v1/invoices`: استرجاع قائمة الفواتير.
- `POST /api/v1/invoices`: إنشاء فاتورة جديدة (يقوم النظام بربطها تلقائياً بإنشاء قيد محاسبي).
- `PUT /api/v1/invoices/:id/pay`: تحديث حالة الفاتورة إلى مدفوعة وتسجيل قيد التحصيل.

</core_endpoints>

<business_logic_validation>
**قاعدة صارمة عند إنشاء القيود (POST /journal-entries):**
يجب على الـ API التحقق برمجياً قبل الحفظ في قاعدة البيانات من أن:
1. مصفوفة سطور القيد (lines) تحتوي على سطرين على الأقل.
2. مجموع خانات المدين (debit) يجب أن يساوي تماماً (===) مجموع خانات الدائن (credit).
إذا لم يتحقق الشرط، يجب إرجاع خطأ `400 Bad Request` مع رسالة: "القيد غير متزن".
</business_logic_validation>

<error_handling>
## الهيكل الموحد للأخطاء (Standard Error Response)
يجب أن تعود جميع الأخطاء بهذا الهيكل لتسهيل التعامل معها في واجهة المستخدم:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "مجموع المدين لا يساوي الدائن.",
    "details": {}
  }
}

**أكواد الحالة (Status Codes):**

- `200 OK`: للطلبات الناجحة واسترجاع البيانات.
    
- `201 Created`: عند نجاح إنشاء عنصر جديد (مثل حفظ قيد أو فاتورة).
    
- `400 Bad Request`: أخطاء في مدخلات المستخدم أو القواعد المحاسبية.
    
- `401 / 403`: أخطاء الصلاحيات والمصادقة.
    
- `500 Internal Server Error`: أخطاء الخادم غير المتوقعة. </error_handling>