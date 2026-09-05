# خارطة تنفيذ النسخة الأساسية القابلة للبيع لمحلات التجزئة الصغيرة والمتوسطة

> النطاق: استكمال دورة البيع والمخزون والوردية بالكامل، مع الحفاظ على السرعة، صغر حجم قاعدة البيانات، وضوح العقود بين الـ App والـ Backend والـ Dashboard.
>
> المشاريع:
>
> - **Desktop App / POS:** `E:\private\witch-store`
> - **Backend API:** `E:\private\witch-store-backend`
> - **Owner Dashboard:** `E:\private\dashboard-stores`
>
> ملاحظة: تقرير الفحص ذكر أن لوحة الإدارة موجودة في `E:\private\dashboard-stores`. لو المسار الفعلي عندك هو `E:\private\store desktop` يتم استبدال المسار فقط بدون تغيير الخطة.

---

## 1. هدف النسخة

إنتاج نظام احترافي Senior-Level يمكن بيعه لمحلات التجزئة الصغيرة والمتوسطة ويشمل:

- إدارة آمنة للشركات والفروع والأجهزة والتراخيص.
- مستخدمين وأدوار وصلاحيات.
- دورة بيع POS سريعة ومستقرة.
- ورديات وخزنة وفروقات كاشير.
- مخزون وحركات مخزون وجرد وتسويات.
- مشتريات وموردين وحساباتهم.
- مرتجعات واستبدال.
- عملاء وبيع آجل ومدفوعات.
- تقارير تشغيلية ومالية أساسية.
- طباعة الفواتير والباركود.
- استيراد وتصدير البيانات.
- نسخ احتياطي وسياسة استعادة.
- أداء سريع في الـ App والـ Dashboard والـ API وقاعدة البيانات.

### قاعدة وحدات المنتجات

هذه النسخة تعتمد **وحدة واحدة فقط لكل المنتجات: القطعة**.

- لا يوجد جدول Units.
- لا يوجد Unit Conversion.
- لا يوجد Pack/Carton/Kg/Liter في قاعدة البيانات.
- كل كميات الشراء والبيع والمخزون أعداد صحيحة بالقطعة.
- الحقل المقترح للكمية يكون `INTEGER` وليس `DECIMAL`.
- يتم حذف أو تجاهل أي حقل `unit` موجود حاليًا في الـ Frontend DTOs.
- لو احتاج المنتج بيع كرتونة في المستقبل، يتم تعريف الكرتونة كمنتج مستقل له Barcode وسعر ومخزون مستقل، وليس كوحدة تحويل في النسخة الأساسية.

---

# 2. المبادئ المعمارية الإلزامية

## 2.1 مصدر الحقيقة

- الـ Backend هو مصدر الحقيقة لكل:
  - الأسعار.
  - الخصومات.
  - الضرائب.
  - إجمالي الفاتورة.
  - المخزون.
  - صلاحيات المستخدم.
  - حالة الترخيص.
- الـ App يعرض الحسابات مبدئيًا لتحسين التجربة، لكن الـ Backend يعيد الحساب قبل الحفظ.
- لا يتم قبول إجمالي نهائي محسوب من العميل بدون إعادة تحقق.

## 2.2 Multi-Tenant Isolation

كل سجل Business يجب أن يرتبط بـ:

- `company_id`
- `branch_id` عند الحاجة

ولا يسمح أبدًا بـ:

- fallback تلقائي إلى `branch_id = 1`.
- قراءة سجل بدون فلترة الشركة.
- تمرير `company_id` من الـ App والاعتماد عليه مباشرة.

الشركة والفرع يتم استخراجهما من الـ Token والـ Tenant Middleware.

## 2.3 عقود API

- جميع العقود Typed.
- Request DTO وResponse DTO منفصلان عن Prisma Models.
- ممنوع إرجاع صفوف قاعدة البيانات كاملة تلقائيًا.
- كل Response يحتوي فقط على البيانات المطلوبة للشاشة.
- أسماء الحقول تكون ثابتة.
- يتم توحيد نمط الأخطاء.

صيغة خطأ موحدة:

```json
{
  "success": false,
  "code": "INSUFFICIENT_STOCK",
  "message": "الكمية المتاحة غير كافية",
  "details": {
    "product_id": 10,
    "available_qty": 3,
    "requested_qty": 5
  }
}
```

صيغة نجاح موحدة:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

## 2.4 السرعة وحجم البيانات

- Server-side pagination لكل القوائم.
- Cursor pagination للجداول الضخمة مثل:
  - Sales
  - Inventory movements
  - Audit logs
- لا يتم تحميل كل المنتجات أو الفواتير دفعة واحدة.
- استخدام `select` بدل `include` الواسع في Prisma.
- منع N+1 Queries.
- استخدام Transactions في العمليات المالية والمخزون.
- ضغط Response باستخدام gzip أو brotli.
- Cache للـ lookups قليلة التغيير.
- Search بحد أدنى حرفين أو ثلاثة مع debounce.
- فهارس مركبة حسب الشركة والفرع والتاريخ.
- عدم تخزين JSON كبير أو Snapshots مكررة إلا عند الضرورة.
- عدم تخزين صور المنتجات داخل PostgreSQL؛ يتم تخزين URL أو path فقط.
- Audit logs تحتوي الحد الأدنى المطلوب، ولا تحفظ Request/Response كاملين.
- أرشفة logs القديمة وفق Retention Policy.

## 2.5 قابلية الصيانة

- Controllers خفيفة.
- Business logic داخل Services.
- Access to DB داخل Repositories أو Data Access layer منظم.
- Validation قبل Service.
- Permission checks قبل تنفيذ Business action.
- Shared constants للـ statuses والـ permission keys.
- لا يوجد منطق مالي مكرر بين أكثر من Controller.

---

# 3. نموذج الطبقات المستهدف

```text
Desktop App (Electron + React)
        |
        | HTTPS REST / JSON
        v
Express API
  - Auth Middleware
  - Tenant Middleware
  - Permission Middleware
  - Validation
  - Service Layer
  - Repository / Prisma
        |
        v
PostgreSQL
        ^
        |
Owner Dashboard (React)
```

---

# 4. قواعد الأداء المستهدفة

هذه أرقام هدف وليست ضمانًا مطلقًا، وتُقاس على بيئة إنتاج واقعية:

- فتح شاشة POS بعد تسجيل الدخول: أقل من 2 ثانية بعد Warm Load.
- Barcode lookup: أقل من 200ms في أغلب الحالات.
- Product search: أقل من 400ms.
- إنشاء فاتورة بيع: أقل من 700ms بدون طباعة.
- فتح Dashboard summary: أقل من 1.5 ثانية.
- Pagination response: أقل من 500ms في الجداول المعتادة.
- لا يزيد الحجم المعتاد للـ JSON response للقائمة عن 100–250KB.
- لا يتم إرسال الصور داخل JSON كـ Base64.

---

# 5. الخطة التنفيذية الكاملة

---

## Phase 0 — تثبيت الوضع الحالي وإنشاء Baseline

### الهدف

تثبيت الحالة الحالية قبل إضافة Business Features ومنع البناء فوق عقود غير مستقرة.

### Desktop App

- حصر جميع Routes وHooks وStores المستخدمة.
- إزالة أي اعتماد على API URL مكتوب ثابتًا.
- استخدام:
  - `VITE_API_BASE_URL`
  - `VITE_APP_ENV`
- توحيد Axios client.
- توحيد Error Handling.
- إضافة request ID للـ logs المعروضة عند الخطأ.
- منع عرض تفاصيل تقنية حساسة للمستخدم.

### Backend

- توحيد هيكل:
  - Routes
  - Controllers
  - Services
  - Validators
  - Middleware
- إضافة Global Error Handler.
- إضافة Request ID.
- إضافة structured logging.
- ضبط CORS Allowlist.
- إزالة secrets الافتراضية.
- التأكد من أن Environment validation يتم عند Startup.
- عدم تشغيل السيرفر لو Secret مطلوب غير موجود.

### Database

- إنشاء Prisma migrations رسمية.
- عدم الاعتماد على `db push` في الإنتاج.
- إنشاء migration baseline للحالة الحالية.
- مراجعة أنواع الأعمدة والفهارس.
- التأكد من وجود foreign keys.
- التأكد من عدم وجود tables أو columns غير مستخدمة.

### Dashboard

- توحيد API client.
- توحيد auth handling.
- إضافة refresh token flow أو إعادة تسجيل دخول منظمة.
- معالجة 401/403 بشكل موحد.
- إزالة أي عرض لكلمات المرور.

### Definition of Done

- كل مشروع يبني بدون Errors.
- العقود الأساسية موثقة.
- كل secrets من Environment.
- Git ignores تحتوي:
  - `dist`
  - `build`
  - `release`
  - logs
- لا توجد ملفات build متتبعة كمصدر.
- توجد migration baseline قابلة للتطبيق على DB جديدة.

---

## Phase 1 — الأمان والهوية والصلاحيات

### الهدف

بناء أساس آمن قبل أي توسع في المبيعات والمخزون.

### Desktop App

- Login للمستخدم بعد تفعيل الجهاز.
- عدم تخزين كلمة المرور.
- تخزين token بشكل آمن قدر الإمكان داخل Electron.
- إخفاء الصفحات والأزرار حسب permission.
- عدم الاعتماد على الإخفاء كحماية؛ الحماية الأساسية في الـ Backend.
- شاشة Session Expired منظمة.
- Logout يمسح:
  - access token
  - refresh token
  - current user
  - branch context

### Backend

- استخدام bcrypt لكلمات مرور المستخدمين والـ Owner Admin.
- عدم إرجاع password أو password_hash في أي Response.
- إصدار Access Token قصير العمر.
- Refresh Token rotation.
- Device binding:
  - token مرتبط بـ device_id
  - التحقق من license status
  - التحقق من device status
- Permission Middleware.
- Role keys المقترحة:
  - `OWNER`
  - `BRANCH_MANAGER`
  - `CASHIER`
  - `SALES`
  - `INVENTORY`
  - `PURCHASING`
  - `ACCOUNTANT`
  - `VIEWER`

### Database

جداول مقترحة بأقل حجم عملي:

- `roles`
- `permissions`
- `role_permissions`
- `users`
- `user_roles` أو role_id واحد في النسخة الأولى
- `refresh_tokens` مع hash وليس token خام
- `login_events` ببيانات مختصرة

لتقليل الحجم:

- لا تخزن permission snapshot لكل user.
- لا تكرر أسماء الصلاحيات في جداول العمليات.
- استخدم معرفات رقمية للصلاحيات والعلاقات.

### Dashboard

- إدارة أدوار وصلاحيات الشركة.
- Reset password بدون إظهار كلمة المرور القديمة.
- Suspend user.
- عرض آخر Login وحالة المستخدم.
- لا توجد شاشة تعرض passwords.

### Definition of Done

- لا توجد كلمة مرور plain text.
- لا يتم إرجاع password fields.
- كل Business Endpoint محمي بصلاحية.
- كل Request مربوط بشركة وجهاز وفرع ومستخدم موثوق.
- اختبارات 401 و403 موجودة.

---

## Phase 2 — البيانات الأساسية للمتجر

### الهدف

إنشاء Master Data مستقرة وخفيفة.

### Desktop App

شاشات:

- Company profile.
- Branches.
- Categories.
- Products.
- Customers.
- Suppliers.
- Users.

خصائص المنتج الأساسية:

- `id`
- `sku`
- `barcode`
- `name_ar`
- `name_en` اختياري
- `category_id`
- `cost_price`
- `sell_price`
- `min_sell_price` اختياري
- `reorder_level`
- `track_stock`
- `is_active`
- `image_url` اختياري
- `created_at`
- `updated_at`

قواعد:

- الوحدة دائمًا قطعة.
- الكمية Integer.
- Barcode unique داخل الشركة.
- SKU unique داخل الشركة.
- Product list paginated.
- Product search لا يحمل كل المنتجات.

### Backend

Endpoints:

```text
GET    /api/categories
POST   /api/categories
PATCH  /api/categories/:id
DELETE /api/categories/:id

GET    /api/products
GET    /api/products/:id
GET    /api/products/barcode/:barcode
POST   /api/products
PATCH  /api/products/:id
DELETE /api/products/:id

GET    /api/customers
GET    /api/customers/:id
POST   /api/customers
PATCH  /api/customers/:id
DELETE /api/customers/:id

GET    /api/suppliers
GET    /api/suppliers/:id
POST   /api/suppliers
PATCH  /api/suppliers/:id
DELETE /api/suppliers/:id
```

### Database

لتقليل الحجم:

- `products` لا يحتوي على unit table أو conversion fields.
- استخدام `INTEGER` للكميات.
- استخدام `NUMERIC(12,2)` للأسعار.
- الصورة URL فقط.
- description اختياري وبحد طول مناسب.
- لا تحفظ نسخة من category name داخل product.
- فهارس:
  - `(company_id, barcode)`
  - `(company_id, sku)`
  - `(company_id, category_id, is_active)`
  - trigram أو full-text index للاسم فقط عند الحاجة الفعلية.

### Dashboard

- إدارة Company/Branch الأساسية.
- عرض عدد المنتجات والمستخدمين والفروع.
- لا يجب إدارة العمليات اليومية من Owner Dashboard؛ هذه داخل App.
- Dashboard يظل للإدارة العليا والاشتراكات والدعم.

### Definition of Done

- CRUD كامل.
- Validation موحد.
- لا يوجد `unit` في API أو DB.
- Search وPagination يعملان.
- لا يمكن قراءة بيانات شركة أخرى.

---

## Phase 3 — دورة البيع POS

### الهدف

استكمال دورة بيع سريعة وآمنة.

### Desktop App

شاشة POS تدعم:

- Barcode scan.
- Search بالاسم وSKU.
- إضافة وحذف وتعديل كمية.
- كل كمية عدد صحيح بالقطعة.
- منع الكمية الصفرية أو السالبة.
- اختيار عميل اختياري.
- خصم على مستوى السطر.
- خصم على مستوى الفاتورة.
- نسبة أو قيمة ثابتة.
- حد خصم حسب صلاحية المستخدم.
- ملاحظات مختصرة.
- طرق دفع:
  - Cash
  - Card
  - InstaPay
  - Wallet
  - Deferred
  - Mixed Payment
- Hold sale.
- Resume held sale.
- Cancel sale مع سبب وصلاحية.
- Print receipt.
- Reprint receipt بصلاحية.
- keyboard shortcuts.
- عدم السماح بإرسال Request مرتين عند الضغط المتكرر.

### Backend

خدمة `CreateSaleService` تنفذ داخل Transaction واحدة:

1. التحقق من License/Device/User/Branch.
2. التحقق من صلاحية البيع.
3. تحميل المنتجات المطلوبة فقط.
4. التحقق من:
   - active
   - price rules
   - min price
   - available stock
5. إعادة حساب:
   - line subtotal
   - line discount
   - invoice discount
   - tax لو موجود
   - grand total
6. إنشاء Sale.
7. إنشاء SaleItems.
8. إنشاء Payment rows.
9. خصم المخزون.
10. إنشاء InventoryMovement لكل منتج.
11. تحديث رصيد العميل لو Deferred.
12. تسجيل Audit event مختصر.
13. Commit.
14. إرجاع Receipt DTO صغير.

Endpoints:

```text
POST /api/sales
GET  /api/sales
GET  /api/sales/:id
POST /api/sales/hold
POST /api/sales/:id/resume
POST /api/sales/:id/cancel
POST /api/sales/:id/reprint
```

### Database

جداول:

- `sales`
- `sale_items`
- `sale_payments`
- `held_sales`
- `held_sale_items`

أو لتقليل الجداول يمكن استخدام `sales.status = HELD` مع نفس الجداول، بشرط ألا تؤثر على التقارير والمخزون.

حقول مهمة:

`sales`:

- company_id
- branch_id
- user_id
- customer_id nullable
- invoice_number
- status
- subtotal
- discount_total
- tax_total
- grand_total
- paid_total
- due_total
- notes قصيرة
- created_at

`sale_items`:

- sale_id
- product_id
- qty INTEGER
- unit_price
- cost_price_snapshot
- line_discount
- line_total

لتقليل الحجم:

- لا تحفظ product object كامل داخل sale item.
- تحفظ فقط snapshot الضروري:
  - price
  - cost
- اسم المنتج يمكن قراءته من product، أو حفظ `product_name_snapshot` فقط لو مطلوب قانونيًا للفواتير التاريخية.
- لا تحفظ cart JSON كامل.
- لا تحفظ Response API.

فهارس:

- `(company_id, branch_id, created_at DESC)`
- `(company_id, invoice_number)`
- `(sale_id)`
- `(product_id, created_at)` عند الحاجة للتقارير.

### Dashboard

- Owner Dashboard يعرض KPIs مجمعة فقط:
  - عدد الشركات النشطة
  - إجمالي الفروع
  - إجمالي الأجهزة
- لا يقرأ كل فواتير الشركات افتراضيًا.
- أي دعم لعرض مبيعات عميل يجب أن يكون:
  - بصلاحية Support
  - مع Audit Log
  - وبحدود Pagination.

### Definition of Done

- إجمالي الـ Frontend يطابق Backend.
- لا يمكن بيع مخزون غير متاح إلا بصلاحية صريحة لو تم دعمها.
- Request idempotent.
- الدفع المتعدد يعمل.
- Hold/Resume يعمل.
- Receipt قابل للطباعة.
- Performance tests لإنشاء الفاتورة.

---

## Phase 4 — الوردية والخزنة

### الهدف

إدارة النقدية ومسؤولية الكاشير.

### Desktop App

- Open shift.
- إدخال opening balance.
- منع البيع النقدي بدون وردية مفتوحة.
- Cash in.
- Cash out.
- Expense from drawer.
- View shift summary حسب الصلاحية.
- Close shift.
- إدخال actual cash.
- إظهار difference.
- إدخال reason عند وجود فرق.
- Manager approval عند فرق أكبر من حد محدد.
- Print shift closing report.

### Backend

Endpoints:

```text
POST /api/shifts/open
GET  /api/shifts/current
POST /api/shifts/:id/cash-in
POST /api/shifts/:id/cash-out
POST /api/shifts/:id/close
GET  /api/shifts
GET  /api/shifts/:id/summary
```

قواعد:

- وردية مفتوحة واحدة لكل user/device/branch حسب سياسة النظام.
- كل حركة خزنة مرتبطة بالوردية.
- لا يتم تعديل Closing بعد الاعتماد.
- التصحيح يكون بحركة Adjustment جديدة.
- المبيعات النقدية تُحسب من Sale Payments وليس من قيمة مدخلة يدويًا.

### Database

جداول:

- `shifts`
- `cash_movements`

لتقليل الحجم:

- shift summary لا يتم حفظه بالكامل كـ JSON.
- يتم حسابه Query أو تخزين totals محددة عند الإغلاق:
  - cash_sales_total
  - refunds_cash_total
  - cash_in_total
  - cash_out_total
  - expected_cash
  - actual_cash
  - difference

فهارس:

- `(company_id, branch_id, opened_at DESC)`
- `(user_id, status)`
- `(shift_id, created_at)`

### Dashboard

- عرض عدد الفروع التي لديها ورديات مفتوحة.
- تنبيه وردية مفتوحة أكثر من مدة محددة.
- لا يحتاج Dashboard لتفاصيل كل حركة إلا في وضع الدعم.

### Definition of Done

- كل Sale نقدية مرتبطة بورديتها.
- تقرير الإغلاق يطابق حركات الخزنة.
- لا تعديل مباشر على وردية مغلقة.
- فرق الخزنة له سبب واعتماد.

---

## Phase 5 — المخزون وحركات المخزون

### الهدف

جعل المخزون قابلًا للمراجعة، وليس مجرد حقل كمية.

### Desktop App

- Stock balance لكل منتج وفرع.
- Inventory movement history.
- Stock adjustment مع سبب.
- Damage / loss.
- Initial stock.
- Low stock alerts.
- Product stock card.
- منع تعديل quantity مباشرة من Product form.
- كل الكميات بالقطعة Integer.

### Backend

كل تغيير كمية ينفذ من خلال خدمة واحدة مثل:

```text
InventoryService.applyMovement()
```

أنواع الحركة:

- OPENING
- PURCHASE
- SALE
- SALE_RETURN
- PURCHASE_RETURN
- ADJUSTMENT_IN
- ADJUSTMENT_OUT
- DAMAGE
- TRANSFER_IN
- TRANSFER_OUT

حتى لو التحويلات المتقدمة ستأتي لاحقًا، يتم تجهيز الـ enum بدون تنفيذ UI كامل.

Endpoints:

```text
GET  /api/inventory/balances
GET  /api/inventory/movements
GET  /api/inventory/products/:id/card
POST /api/inventory/adjustments
GET  /api/inventory/low-stock
```

### Database

الخيار الموصى به:

- جدول `stock_balances`
- جدول `inventory_movements`

`stock_balances`:

- company_id
- branch_id
- product_id
- quantity INTEGER
- updated_at

Unique:

```text
(company_id, branch_id, product_id)
```

`inventory_movements`:

- company_id
- branch_id
- product_id
- movement_type SMALLINT أو enum صغير
- quantity_delta INTEGER
- balance_after INTEGER اختياري
- reference_type
- reference_id
- user_id
- notes قصيرة
- created_at

لتقليل الحجم:

- لا تحفظ balance_before إذا كان غير مطلوب.
- لا تحفظ product snapshot.
- لا تحفظ movement payload JSON.
- `reference_type` يمكن أن يكون SMALLINT.
- أرشفة movements القديمة فقط بعد اعتماد سياسة قانونية، مع الحفاظ على إجماليات موثوقة.

فهارس:

- `(company_id, branch_id, product_id)`
- `(company_id, branch_id, created_at DESC)`
- `(reference_type, reference_id)`

### Dashboard

- تنبيهات فقط:
  - شركات لديها أخطاء مخزون
  - عدد المنتجات منخفضة المخزون
- لا يحمل كل movements.

### Definition of Done

- لا يوجد تعديل مخزون خارج Inventory Service.
- كل Sale/Purchase/Return ينشئ movement.
- stock_balances يساوي مجموع الحركات في اختبار reconciliation.
- لا توجد كميات كسور.

---

## Phase 6 — الجرد والتسويات

### الهدف

مقارنة النظام بالمخزون الفعلي وتصحيح الفرق بشكل مراقب.

### Desktop App

- إنشاء جلسة جرد.
- اختيار:
  - كل المنتجات
  - Category
  - قائمة منتجات
- Barcode counting.
- إدخال counted_qty.
- عرض system_qty وdifference.
- Save draft.
- Submit.
- Approve.
- تطبيق adjustment.
- Print variance report.

### Backend

Endpoints:

```text
POST /api/stock-counts
GET  /api/stock-counts
GET  /api/stock-counts/:id
POST /api/stock-counts/:id/items
POST /api/stock-counts/:id/submit
POST /api/stock-counts/:id/approve
POST /api/stock-counts/:id/apply
```

قواعد:

- لا تطبق فروقات الجرد قبل approval.
- كل فرق يخلق Inventory Movement.
- منع تطبيق الجرد مرتين.
- Idempotency key.
- Snapshot لكمية النظام وقت بدء أو إغلاق الجرد حسب السياسة.

### Database

جداول:

- `stock_counts`
- `stock_count_items`

لتقليل الحجم:

- لا تنشئ rows لكل المنتجات عند إنشاء الجلسة لو يمكن Lazy insert عند العد.
- تحفظ فقط المنتجات التي تم عدها أو الموجودة في Scope عند الاعتماد.
- لا تحفظ Product object.

### Dashboard

- لا يحتاج تفاصيل.
- KPI اختياري لعدد الجرد غير المكتمل.

### Definition of Done

- Workflow Draft → Submitted → Approved → Applied.
- لا Double Apply.
- movements مطابقة للفروق.
- تقرير فروقات واضح.

---

## Phase 7 — المشتريات والموردون

### الهدف

تغذية المخزون وتسجيل التزامات المورد.

### Desktop App

- Create Purchase Invoice.
- اختيار Supplier.
- إضافة المنتجات بالقطعة.
- cost price.
- qty Integer.
- paid amount.
- payment method.
- due amount.
- notes.
- Receive stock.
- Supplier statement.
- Supplier payment.
- Purchase return.

### Backend

Endpoints:

```text
POST /api/purchases
GET  /api/purchases
GET  /api/purchases/:id
POST /api/purchases/:id/payments
POST /api/purchases/:id/return

GET  /api/suppliers/:id/statement
POST /api/suppliers/:id/payments
```

Transaction:

1. Validate supplier/products.
2. Create purchase.
3. Create items.
4. Update stock.
5. Create inventory movements.
6. Update supplier balance.
7. Create payment.
8. Update product latest cost أو weighted average حسب القرار.
9. Commit.

### Database

جداول:

- `purchases`
- `purchase_items`
- `supplier_payments`
- `purchase_returns`
- `purchase_return_items`

أو يمكن توحيد payments في جدول مالي عام لاحقًا، لكن في النسخة الأولى يفضل الوضوح.

لتقليل الحجم:

- لا تحفظ supplier snapshot كامل.
- لا تحفظ product JSON.
- تحافظ فقط على cost snapshot.
- كل qty Integer.

### Dashboard

- عرض عدد الشركات التي لديها اشتراك module المشتريات.
- لا يدخل في إدارة فواتير المورد اليومية.

### Definition of Done

- Purchase تزيد المخزون.
- Purchase return تقلل المخزون.
- Supplier balance متصالح مع invoices/payments/returns.
- لا توجد quantity decimals.

---

## Phase 8 — المرتجعات والاستبدال

### الهدف

دورة مرتجع كاملة بدون كسر المخزون أو الحسابات.

### Desktop App

- Search original invoice.
- Return full or partial.
- تحديد الكمية المرتجعة.
- منع أكثر من sold minus previous returned.
- حالة المنتج:
  - RETURN_TO_STOCK
  - DAMAGED
- refund method:
  - original method
  - cash
  - customer credit
- reason required.
- manager approval حسب القيمة.
- Exchange workflow:
  - return items
  - create new sale
  - settle difference

### Backend

Endpoints:

```text
POST /api/sales/:id/returns
GET  /api/sales/:id/returns
POST /api/exchanges
```

يتم تنفيذ return داخل Transaction:

- validate available return qty
- create return
- create return items
- payment/refund
- stock movement حسب الحالة
- update customer balance إن وجد
- audit

### Database

جداول:

- `sale_returns`
- `sale_return_items`
- `refund_payments`

لتقليل الحجم:

- لا تكرر بيانات sale.
- reference إلى sale_item.
- reason length محدود.
- لا تحفظ invoice JSON.

### Dashboard

- KPI اختياري:
  - معدل المرتجعات لكل شركة
  - تنبيه غير طبيعي للاستخدام أو الدعم
- أي مشاهدة تفصيلية تحتاج صلاحية Support.

### Definition of Done

- لا يمكن إرجاع أكثر من المباع.
- المخزون يعكس حالة المنتج المرتجع.
- refund totals متصالح.
- exchange ينتج مستندات واضحة.

---

## Phase 9 — العملاء والبيع الآجل

### الهدف

إدارة المديونية والتحصيل بدون تضخم بيانات غير ضروري.

### Desktop App

- Customer profile.
- current balance.
- credit limit.
- sale deferred.
- partial payment.
- customer statement.
- overdue indicator.
- payment receipt.

### Backend

Endpoints:

```text
GET  /api/customers/:id/statement
POST /api/customers/:id/payments
GET  /api/customers/debts
```

قواعد:

- لا يسمح بتجاوز Credit Limit إلا بصلاحية.
- كل تغيير رصيد له transaction row.
- الرصيد المحفوظ Cache للسرعة، مع ledger كمصدر مراجعة.
- reconciliation job أو endpoint إداري.

### Database

جداول:

- `customer_ledger`
- `customer_payments`

أو جدول مالي موحد في مرحلة متقدمة.

`customer_ledger`:

- customer_id
- type
- amount
- reference_type
- reference_id
- created_at

لتقليل الحجم:

- لا تحفظ description طويل.
- لا تكرر customer name.
- `customers.balance` قيمة سريعة مشتقة، والـ ledger للتدقيق.

### Dashboard

- لا يعرض بيانات العملاء النهائية افتراضيًا.
- فقط إحصاءات تجميعية عند الحاجة وبصلاحية.

### Definition of Done

- customer balance يطابق ledger.
- المدفوعات الجزئية تعمل.
- Credit limit enforced.
- كشف الحساب paginated.

---

## Phase 10 — المصروفات والتقارير التشغيلية

### الهدف

تقديم معلومات يحتاجها صاحب المتجر يوميًا.

### Desktop App

المصروفات:

- Create expense.
- expense category.
- branch.
- shift.
- payment method.
- amount.
- note قصيرة.
- attachment URL اختياري.

التقارير:

- Daily sales.
- Sales by product.
- Sales by category.
- Sales by cashier.
- Sales by payment method.
- Discounts.
- Returns.
- Gross profit.
- Stock value.
- Low stock.
- Inventory movement.
- Customer debts.
- Supplier dues.
- Shift summaries.
- Expenses.

كل تقرير:

- Date range.
- Branch filter.
- User filter عند الحاجة.
- Server-side pagination.
- Export CSV/Excel.
- Print/PDF للملخصات فقط.

### Backend

- Reporting Services مستقلة.
- لا تنفذ loops كبيرة داخل Node.
- Aggregations في SQL/Prisma query.
- استخدام Materialized Views فقط لو القياس أثبت الحاجة.
- Cache قصير 30–120 ثانية لتقارير Dashboard.
- Limits قصوى لفترة التقارير الثقيلة.

Endpoints:

```text
GET /api/reports/dashboard
GET /api/reports/sales
GET /api/reports/profit
GET /api/reports/inventory
GET /api/reports/debts
GET /api/reports/shifts
GET /api/reports/expenses
```

### Database

فهارس التقارير:

- sales `(company_id, branch_id, created_at)`
- sale_items `(sale_id, product_id)`
- payments `(company_id, method, created_at)`
- movements `(company_id, branch_id, product_id, created_at)`
- expenses `(company_id, branch_id, created_at)`

لتقليل الحجم:

- لا تحفظ كل تقرير.
- لا تحفظ dashboard snapshots كل دقيقة.
- التقارير تحسب من source tables.
- Daily summary table ممكن إضافته فقط بعد قياس فعلي ووجود حجم كبير.

### Dashboard

Owner Dashboard لا يحتاج تقارير Business تفصيلية لكل شركة.
يمكن عرض:

- active companies
- active licenses
- devices
- support health
- API usage summary
- failed activation/login anomalies

### Definition of Done

- التقارير تطابق الفواتير والحركات.
- كل تقرير له pagination أو aggregate مناسب.
- لا Query تتسبب في Full Table Scan على الجداول الرئيسية.
- exports تتم streaming عند الملفات الكبيرة.

---

## Phase 11 — الطباعة، الباركود، الاستيراد والتصدير

### Desktop App

- Receipt template.
- Company logo URL/path.
- Branch data.
- Invoice number.
- QR placeholder لو احتاج مستقبلًا.
- Reprint permission.
- Barcode labels.
- Product import from Excel/CSV.
- Export products/customers/suppliers.
- Validation preview قبل الاستيراد.
- Batch import على دفعات.

### Backend

- Import endpoint لا يستقبل ملفًا ضخمًا في JSON.
- Multipart upload.
- Limit لحجم الملف.
- parsing streaming أو batch.
- dry-run validation.
- bulk insert/update في batches.
- job status عند الملفات الكبيرة.

### Database

- لا تحفظ ملف Excel داخل DB.
- تخزن metadata فقط إن لزم:
  - filename
  - imported_by
  - row count
  - success count
  - failure count
- ملفات مؤقتة تحذف بعد مدة قصيرة.

### Dashboard

- لا يحتاج استيراد Business data إلا لو دعم onboarding.
- يمكن إضافة Support-assisted import مع صلاحية خاصة وAudit.

### Definition of Done

- استيراد 10k منتج لا يجمد الـ App.
- يظهر تقرير أخطاء واضح.
- لا duplicates غير مقصودة.
- طباعة الفواتير والباركود مستقرة.

---

## Phase 12 — النسخ الاحتياطي، المراقبة، والجودة

### Desktop App

- Health indicator للاتصال.
- Retry للطلبات الآمنة فقط.
- منع retry تلقائي لإنشاء Sale بدون idempotency.
- Crash reporting بدون بيانات حساسة.
- Auto update signed.
- Graceful error screens.
- لا Full Offline Sales في النسخة الأولى إلا إذا تم تصميم Sync Engine مستقل.

### Backend

- Health endpoint.
- Readiness endpoint.
- Structured logs.
- Error monitoring.
- Slow query monitoring.
- DB connection pooling مضبوط.
- API rate limiting خارجي/موزع للإنتاج.
- Request timeout.
- Payload size limits.
- graceful shutdown.
- backup schedule.
- restore test.

### Database

- Daily backups.
- Retention policy:
  - يومي لفترة قصيرة
  - أسبوعي لفترة أطول
- اختبار Restore دوري.
- VACUUM/ANALYZE حسب بيئة PostgreSQL.
- مراقبة:
  - DB size
  - index size
  - slow queries
  - dead tuples
- حذف logs القديمة وليس السجلات المالية بدون سياسة معتمدة.

### Dashboard

- System health.
- failed jobs.
- license anomalies.
- API errors summary.
- support tools بصلاحيات وتدقيق.

### Definition of Done

- Backup ناجح وRestore مجرب.
- توجد Alerts للأخطاء الحرجة.
- اختبارات Integration للعمليات المالية.
- Load test للـ POS search/create sale/reports.
- Security review مكتملة.

---

# 6. استراتيجية قاعدة البيانات الخفيفة

## 6.1 ما لا يتم إنشاؤه في النسخة الأساسية

- لا Units table.
- لا Unit conversions.
- لا Event sourcing كامل.
- لا تخزين لكل API request/response.
- لا صور داخل DB.
- لا JSON snapshots ضخمة.
- لا duplicated denormalized fields إلا ما ثبت فائدته.
- لا materialized report tables قبل قياس الأداء.
- لا audit لكل قراءة؛ audit فقط للعمليات الحساسة.

## 6.2 أنواع البيانات المقترحة

- IDs:
  - `BIGINT` لو متوقع حجم كبير طويل الأجل.
  - أو UUID إذا النظام الحالي يعتمد عليه بشكل ثابت.
- Quantities:
  - `INTEGER`
- Money:
  - `NUMERIC(12,2)` أو `NUMERIC(14,2)`
- Status:
  - Small enum أو `SMALLINT` مع mapping واضح.
- Notes:
  - `VARCHAR(250/500)` حسب الاستخدام بدل Text مفتوح دائمًا.
- Dates:
  - `TIMESTAMPTZ`
- Boolean:
  - `BOOLEAN`

## 6.3 الفهارس

لا تضف Index لكل عمود. تضيف فقط بناء على Queries الفعلية.

فهارس أساسية:

```text
products(company_id, barcode)
products(company_id, sku)
products(company_id, is_active, category_id)

sales(company_id, branch_id, created_at desc)
sales(company_id, invoice_number)
sale_items(sale_id)
sale_items(product_id)

stock_balances(company_id, branch_id, product_id) UNIQUE
inventory_movements(company_id, branch_id, product_id, created_at desc)

shifts(company_id, branch_id, opened_at desc)
customer_ledger(customer_id, created_at desc)
supplier_payments(supplier_id, created_at desc)
```

## 6.4 الحذف والأرشفة

- المنتجات والمستخدمون والعملاء يفضل Soft Disable بدل Delete إذا عليهم حركات.
- لا يتم حذف فواتير أو حركات مخزون.
- يتم Void/Cancel بسجل واضح.
- Audit logs القديمة يمكن أرشفتها أو حذفها حسب Retention.
- Sessions وRefresh Tokens المنتهية تحذف دوريًا.

---

# 7. استراتيجية API السريعة

## 7.1 القوائم

مثال:

```text
GET /api/products?cursor=...&limit=50&search=milk&category_id=2
```

Response:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "next_cursor": "..."
  }
}
```

## 7.2 البحث

- Barcode endpoint مستقل وسريع.
- Name search مع debounce 250–350ms.
- Limit 20–50 نتيجة.
- لا يتم تحميل stock history أثناء قائمة المنتجات.

## 7.3 Payload

- Product list DTO صغير.
- Product details DTO منفصل.
- Sale list لا يعيد items افتراضيًا.
- Sale details فقط يعيد items.
- Dashboard يعيد aggregates فقط.
- Export endpoint منفصل.

## 7.4 Caching

Cache مناسب فقط لـ:

- plans/modules/features
- categories
- company settings
- license lookups قصيرة العمر
- dashboard aggregates قصيرة العمر

لا Cache مباشر لـ:

- stock balance عند البيع
- active shift
- customer balance قبل العملية المالية

## 7.5 Idempotency

يجب دعم `Idempotency-Key` في:

- Create sale
- Create purchase
- Return
- Customer payment
- Supplier payment
- Shift close
- Stock count apply

---

# 8. استراتيجية أداء الـ Desktop App

- Lazy load للـ routes.
- Query caching عبر TanStack Query.
- invalidation دقيقة بدل refetch لكل شيء.
- virtualization للجداول الكبيرة.
- memoization فقط عند القياس.
- عدم تخزين كل المنتجات في Zustand.
- Zustand للحالة المحلية الخفيفة فقط:
  - auth
  - license
  - cart
  - UI
- Server data داخل TanStack Query.
- عدم تحويل الصور Base64.
- debounce للبحث.
- prefetch لقوائم صغيرة.
- background refresh غير مزعج.
- منع rerenders غير الضرورية في شاشة POS.
- فصل cart line component.
- use stable selectors في Zustand.
- عدم حفظ cart ضخم في localStorage بدون حد.

---

# 9. استراتيجية أداء الـ Dashboard

- تحميل lookups مرة واحدة مع cache وTTL.
- لا تحميل companies/plans/licenses/devices كلها في Layout.
- كل صفحة تحمل بياناتها Paginated.
- route-level code splitting.
- skeletons خفيفة.
- filters server-side.
- chart data aggregate only.
- لا تعرض Business data للشركات إلا عند دعم محدد.
- search debounced.
- avoid large global Zustand stores.

---

# 10. الاختبارات المطلوبة

## Unit Tests

- pricing
- discounts
- totals
- credit limits
- stock movement
- shift closing
- returns limits
- permissions

## Integration Tests

- Activate device → user login → create sale.
- Sale decrements stock.
- Return restores stock.
- Purchase increases stock.
- Purchase return decreases stock.
- Shift summary equals cash movements.
- Customer balance reconciliation.
- Supplier balance reconciliation.
- Tenant isolation.
- Idempotent sale creation.

## E2E Tests

- POS happy path.
- Mixed payment.
- Held sale.
- Shift open/close.
- Stock count.
- Purchase.
- Return/exchange.
- Permission restrictions.

## Performance Tests

- Barcode lookup.
- Product search.
- Create sale with 1/10/50 items.
- Sales list pagination.
- Dashboard aggregates.
- Reports over 30/90/365 days.

---

# 11. Definition of Ready للبيع

لا تعتبر النسخة جاهزة للبيع إلا بعد تحقق التالي:

- [ ] Passwords hashed.
- [ ] Secrets mandatory.
- [ ] Tenant isolation tested.
- [ ] Permissions complete.
- [ ] Product unit fixed as piece only.
- [ ] POS full flow complete.
- [ ] Mixed payment complete.
- [ ] Hold/resume/cancel/reprint complete.
- [ ] Shift/cash drawer complete.
- [ ] Inventory movements complete.
- [ ] Stock count complete.
- [ ] Purchases/suppliers complete.
- [ ] Returns/exchange complete.
- [ ] Customer credit/payment complete.
- [ ] Core reports complete.
- [ ] Barcode/receipt/import complete.
- [ ] Backup and restore tested.
- [ ] API pagination/performance verified.
- [ ] Production monitoring enabled.
- [ ] Migration and deployment process documented.

---

# 12. ترتيب التنفيذ المقترح

```text
Phase 0  Baseline
Phase 1  Security/Auth/Permissions
Phase 2  Master Data
Phase 3  POS Sales
Phase 4  Shifts/Cash Drawer
Phase 5  Inventory Movements
Phase 6  Stock Count
Phase 7  Purchases/Suppliers
Phase 8  Returns/Exchange
Phase 9  Customer Credit
Phase 10 Reports/Expenses
Phase 11 Printing/Barcode/Import
Phase 12 Backup/Monitoring/Release
```

لا تبدأ Phase جديدة قبل إغلاق Definition of Done للـ Phase السابقة، خصوصًا مراحل الأمن، البيع، المخزون والوردية.
