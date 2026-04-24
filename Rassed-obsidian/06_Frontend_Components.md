## type: frontend module: ui_components status: active

# هندسة مكونات الواجهة الأمامية (Frontend Components) - مشروع رصيد

<component_philosophy> نتبع في "رصيد" أسلوب التصميم الذري (Atomic Design) لبناء مكونات قابلة لإعادة الاستخدام (Reusable Components). هذا يضمن توحيد شكل التطبيق، وسهولة الصيانة، وتقليل تكرار الأكواد (DRY). الاعتماد الأساسي في التنسيق هو على مكتبة **Tailwind CSS**. </component_philosophy>

<core_components>

## 1. عارض المبالغ المالية (AmountDisplay)

<component name="AmountDisplay">

- **الهدف:** توحيد طريقة عرض المبالغ المالية في كامل التطبيق لتجنب الأخطاء البشرية.
    
- **الخصائص (Props):** `amount` (رقم)، `currency` (نص، افتراضي: SAR).
    
- **قواعد البرمجة:**
    
    1. يجب تطبيق خط الأرقام `font-numbers` (Inter) مع تفعيل خاصية `tabular-nums`.
        
    2. التنسيق الشرطي للألوان (Conditional Styling):
        
        - إذا كان `amount &gt; 0` (إيراد/موجب) -> النص باللون الأخضر `text-emerald-500`.
            
        - إذا كان `amount &lt; 0` (مصروف/سالب) -> النص باللون الأحمر `text-red-500`.
            
        - إذا كان `amount === 0` -> النص باللون الرمادي `text-slate-500`.
            
    3. يجب تنسيق الرقم ليفصل الآلاف بفاصلة ويعرض خانتين عشريتين (مثال: `1,250.00`). </component>
        

## 2. الجدول المالي الذكي (FinancialTable)

<component name="FinancialTable">

- **الهدف:** عرض القيود، الفواتير، والتقارير المحاسبية بشكل مرتب.
    
- **الخصائص (Props):** `columns` (مصفوفة الأعمدة)، `data` (مصفوفة البيانات)، `isLoading` (منطقي).
    
- **قواعد البرمجة:**
    
    1. محاذاة النصوص العربية لليمين `text-right`.
        
    2. **أعمدة المبالغ المالية:** يجب محاذاتها لليسار `text-left` دائماً (حتى لو كان الجدول بالعربية) لضمان اصطفاف الخانات العشرية فوق بعضها.
        
    3. عند تفعيل `isLoading = true`، يجب عرض (Skeleton Loader) يملأ مساحة الجدول بدلاً من تجميد الواجهة.
        
    4. خلفية ترويسة الجدول (Thead) تكون `bg-slate-50` ولون النص `text-slate-500` بحجم `text-sm font-medium`. </component>
        

## 3. شارة الحالة (StatusBadge)

<component name="StatusBadge">

- **الهدف:** عرض حالة الفاتورة أو القيد بشكل مرئي سريع لتسهيل التصفح.
    
- **الخصائص (Props):** `status` (نوع الحالة).
    
- **قواعد البرمجة:**
    
    - حالة `paid` أو `approved` (مدفوع/معتمد): خلفية `bg-emerald-100` ونص `text-emerald-700`.
        
    - حالة `pending` أو `draft` (معلق/مسودة): خلفية `bg-amber-100` ونص `text-amber-700`.
        
    - حالة `overdue` أو `rejected` (متأخر/مرفوض): خلفية `bg-red-100` ونص `text-red-700`.
        
    - يجب أن تكون الحواف دائرية بالكامل `rounded-full` مع مساحة داخلية `px-2 py-0.5` وحجم نص `text-xs font-medium`. </component>
        

</core_components>

<state_and_errors_handling>

- **حالات التحميل (Loading States):** يجب دائماً إظهار مؤشر تحميل (Spinner أو Skeleton) عند جلب أو إرسال البيانات إلى الـ API.
    
- **معالجة الأخطاء (Error Handling):** يجب اعتراض الأخطاء القادمة من الـ API (التي تم تعريف هيكلها مسبقاً) وعرضها للمستخدم في رسالة منبثقة (Toast Notification) باللون الأحمر للتنبيه، خاصة عند أخطاء "عدم توازن القيود". </state_and_errors_handling>