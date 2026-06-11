const { PrismaClient } = require('./generated/prisma');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');

dotenv.config();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const MODULES = [
  { key: 'dashboard', name: 'لوحة التحكم', description: 'لوحة تحليلات سريعة ومؤشرات الأداء للمتجر' },
  { key: 'pos', name: 'نقطة البيع (POS)', description: 'شاشة بيع سريعة للمبيعات المباشرة والكاشير' },
  { key: 'products', name: 'إدارة المنتجات', description: 'إضافة وتعديل المنتجات وأسعار التكلفة والبيع' },
  { key: 'inventory', name: 'إدارة المخزن', description: 'مراقبة مستويات المخزون وحركات الجرد الوارد والمنصرف' },
  { key: 'customers', name: 'إدارة العملاء', description: 'بيانات العملاء وحساب الديون والدفعات' },
  { key: 'suppliers', name: 'إدارة الموردين', description: 'بيانات الموردين والمديونيات المستحقة لهم' },
  { key: 'supplier_invoices', name: 'فواتير الشراء للموردين', description: 'تسجيل وتعديل فواتير الوارد للموردين وتأثيرها المالي' },
  { key: 'expenses', name: 'إدارة المصروفات', description: 'تسجيل بنود المصاريف المتنوعة للمتجر (رواتب، إيجار، إلخ)' },
  { key: 'reports', name: 'التقارير والمبيعات', description: 'تقارير المبيعات والأرباح والمصروفات وحجم المبيعات اليومية' },
  { key: 'refunds', name: 'مرتجع المبيعات', description: 'إدارة مرتجعات الفواتير وإرجاع المنتجات للمخزن' },
  { key: 'installments', name: 'نظام التقسيط والأقساط', description: 'متابعة أقساط العملاء والتحصيل وجدولة الديون المتبقية' },
  { key: 'users', name: 'المستخدمين والصلاحيات', description: 'إدارة البائعين والكاشير وسجلات الأنشطة' },
  { key: 'audit_logs', name: 'سجلات الأنشطة التشغيلية', description: 'مراقبة تفصيلية لحركات البائعين وحذف المعاملات للأمان' },
  { key: 'settings', name: 'إعدادات النظام', description: 'إعدادات المتجر العامة والمنطقة الزمنية والعملات' },
];

const FEATURES = [
  { key: 'advanced_reports', name: 'التقارير المتقدمة', description: 'تحليلات أرباح تفصيلية وفلاتر متقدمة حسب الفترات الزمنية' },
  { key: 'cloud_backup', name: 'النسخ الاحتياطي السحابي', description: 'حفظ واسترجاع نسخة احتياطية من البيانات على السحابة' },
  { key: 'excel_export', name: 'تصدير إكسل (Excel)', description: 'تصدير تقارير المبيعات والمنتجات لكشوف Excel' },
  { key: 'pdf_export', name: 'تصدير PDF', description: 'تصدير وطباعة الفواتير والتقارير بصيغة PDF' },
  { key: 'whatsapp_notifications', name: 'إشعارات الواتساب (WhatsApp)', description: 'إرسال إيصالات الفواتير للأقساط والمبيعات عبر الواتساب' },
  { key: 'sms_notifications', name: 'رسائل نصية قصيرة (SMS)', description: 'إرسال تنبيهات الأقساط المتأخرة للعملاء عبر الـ SMS' },
  { key: 'ai_analytics', name: 'تحليلات الذكاء الاصطناعي', description: 'توقعات المبيعات وأفضل المنتجات مبيعاً بالذكاء الاصطناعي' },
  { key: 'custom_invoice_template', name: 'قوالب فواتير مخصصة', description: 'تصميم وتخصيص شكل إيصال الكاشير والفاتورة الضريبية' },
  { key: 'barcode_printing', name: 'طباعة الباركود', description: 'توليد وطباعة تكتات الباركود للملابس مباشرة من النظام' },
  { key: 'bulk_import', name: 'استيراد جماعي للمنتجات', description: 'رفع وتنزيل المنتجات عبر ملفات Excel لتسريع التكويد' },
  { key: 'api_access', name: 'ربط خارجي (APIs)', description: 'صلاحية الوصول المباشر للبيانات لربط المتجر بموقع إلكتروني خارجي' },
];

const PROVIDERS = [
  { key: 'manual', name: 'دفع يدوي / كاش للوكيل', is_active: true },
  { key: 'paymob', name: 'بوابة Paymob مصر', is_active: true },
  { key: 'fawry', name: 'بوابة فوري (Fawry)', is_active: true },
  { key: 'stripe', name: 'بوابة Stripe الدولية', is_active: true },
];

async function seed() {
  console.log('=== Starting Seed Process ===');
  
  // Use direct connection URL for seed migrations
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  // 1. Ensure Default Company and Branch exist
  console.log('Verifying Company 1 and Branch 1...');
  let company = await prisma.company.findUnique({ where: { id: 1 } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        id: 1,
        name: 'شركة افتراضية',
        legal_name: 'شركة متجر الساحرة الافتراضية',
        status: 'active',
      },
    });
    console.log('Created Company #1');
  }

  let branch = await prisma.branch.findUnique({ where: { id: 1 } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        id: 1,
        company_id: 1,
        name: 'الفرع الرئيسي',
        is_main: true,
      },
    });
    console.log('Created Branch #1');
  }

  // 2. Seed Modules
  console.log('Seeding Modules...');
  const seededModules = [];
  for (const mod of MODULES) {
    const dbMod = await prisma.module.upsert({
      where: { key: mod.key },
      update: { name: mod.name, description: mod.description },
      create: { key: mod.key, name: mod.name, description: mod.description, is_active: true },
    });
    seededModules.push(dbMod);
  }
  console.log(`Seeded ${seededModules.length} modules.`);

  // 3. Seed Features
  console.log('Seeding Features...');
  const seededFeatures = [];
  for (const feat of FEATURES) {
    const dbFeat = await prisma.feature.upsert({
      where: { key: feat.key },
      update: { name: feat.name, description: feat.description },
      create: { key: feat.key, name: feat.name, description: feat.description, is_active: true },
    });
    seededFeatures.push(dbFeat);
  }
  console.log(`Seeded ${seededFeatures.length} features.`);

  // 4. Seed Payment Providers
  console.log('Seeding Payment Providers...');
  for (const prov of PROVIDERS) {
    await prisma.paymentProvider.upsert({
      where: { key: prov.key },
      update: { name: prov.name, is_active: prov.is_active },
      create: { key: prov.key, name: prov.name, is_active: prov.is_active },
    });
  }
  console.log(`Seeded payment providers.`);

  // 5. Seed Default Plan containing all modules and features
  console.log('Creating Default Plan...');
  let plan = await prisma.plan.findFirst({ where: { name: 'الباقة الشاملة' } });
  if (!plan) {
    plan = await prisma.plan.create({
      data: {
        name: 'الباقة الشاملة',
        description: 'باقة تشغيلية كاملة بكافة المميزات وشاشات نقطة البيع والمخازن والتقارير',
        price_monthly: 200,
        price_yearly: 2000,
        is_lifetime: false,
        max_users: 10,
        max_devices: 5,
        max_branches: 3,
        is_active: true,
      },
    });
  }

  // Map all modules and features to Plan
  for (const mod of seededModules) {
    await prisma.planModule.upsert({
      where: { plan_id_module_id: { plan_id: plan.id, module_id: mod.id } },
      update: {},
      create: { plan_id: plan.id, module_id: mod.id },
    });
  }
  for (const feat of seededFeatures) {
    await prisma.planFeature.upsert({
      where: { plan_id_feature_id: { plan_id: plan.id, feature_id: feat.id } },
      update: {},
      create: { plan_id: plan.id, feature_id: feat.id },
    });
  }
  console.log('Seeded Plan module and feature mappings.');

  // 6. Seed Default License for Company #1
  console.log('Issuing Default License...');
  const defaultKey = 'DEFAULT-LICENSE-KEY';
  let license = await prisma.license.findUnique({ where: { license_key: defaultKey } });
  if (!license) {
    license = await prisma.license.create({
      data: {
        company_id: 1,
        plan_id: plan.id,
        license_key: defaultKey,
        type: 'subscription',
        status: 'active',
        starts_at: new Date(),
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 Year Trial
        max_devices: 5,
        max_users: 10,
        max_branches: 3,
        allow_all_modules: false,
      },
    });
  }

  // Enable all modules and features directly on the license
  for (const mod of seededModules) {
    await prisma.licenseModule.upsert({
      where: { license_id_module_id: { license_id: license.id, module_id: mod.id } },
      update: { is_enabled: true },
      create: { license_id: license.id, module_id: mod.id, is_enabled: true },
    });
  }
  for (const feat of seededFeatures) {
    await prisma.licenseFeature.upsert({
      where: { license_id_feature_id: { license_id: license.id, feature_id: feat.id } },
      update: { is_enabled: true },
      create: { license_id: license.id, feature_id: feat.id, is_enabled: true },
    });
  }
  console.log('Seeded License module and feature mappings.');

  // 7. Seed Default OwnerAdminUser (Email: owner@store.com, Password: Aa152026@)
  console.log('Seeding Default Owner Admin User...');
  const ownerEmail = 'owner@store.com';
  const ownerPassHash = hashPassword('Aa152026@');
  
  await prisma.ownerAdminUser.upsert({
    where: { email: ownerEmail },
    update: { password_hash: ownerPassHash },
    create: {
      name: 'Owner Admin',
      email: ownerEmail,
      password_hash: ownerPassHash,
      role: 'owner',
    },
  });
  console.log('Seeded Owner Admin User.');

  // 8. Migrate existing product stock quantities to ProductStock table
  console.log('Migrating stock quantities to ProductStock...');
  const products = await prisma.product.findMany();
  let migratedStocks = 0;
  for (const prod of products) {
    const existingStock = await prisma.productStock.findUnique({
      where: {
        company_id_branch_id_product_id: {
          company_id: 1,
          branch_id: 1,
          product_id: prod.id,
        },
      },
    });

    if (!existingStock) {
      await prisma.productStock.create({
        data: {
          company_id: 1,
          branch_id: 1,
          product_id: prod.id,
          stock_qty: prod.stock_qty,
          low_stock_threshold: prod.low_stock_threshold !== null ? prod.low_stock_threshold : 5,
        },
      });
      migratedStocks++;
    }
  }
  console.log(`Migrated ${migratedStocks} products to branch-level stock records.`);

  // 9. Assign all existing business records to company_id = 1 and branch_id = 1
  console.log('Assigning existing data to default company and branch...');
  
  try {
    await prisma.$executeRawUnsafe('UPDATE categories SET company_id = 1 WHERE company_id IS NULL');
    await prisma.$executeRawUnsafe('UPDATE products SET company_id = 1, branch_id = 1 WHERE company_id IS NULL');
    await prisma.$executeRawUnsafe('UPDATE customers SET company_id = 1 WHERE company_id IS NULL');
    await prisma.$executeRawUnsafe('UPDATE suppliers SET company_id = 1 WHERE company_id IS NULL');
    await prisma.$executeRawUnsafe('UPDATE sales SET company_id = 1, branch_id = 1 WHERE company_id IS NULL');
    await prisma.$executeRawUnsafe('UPDATE expenses SET company_id = 1, branch_id = 1 WHERE company_id IS NULL');
    await prisma.$executeRawUnsafe('UPDATE customer_transactions SET company_id = 1 WHERE company_id IS NULL');
    await prisma.$executeRawUnsafe('UPDATE supplier_transactions SET company_id = 1 WHERE company_id IS NULL');
    await prisma.$executeRawUnsafe('UPDATE users SET company_id = 1, branch_id = 1 WHERE company_id IS NULL');
    await prisma.$executeRawUnsafe('UPDATE refunds SET company_id = 1, branch_id = 1 WHERE company_id IS NULL');
    await prisma.$executeRawUnsafe('UPDATE supplier_invoices SET company_id = 1, branch_id = 1 WHERE company_id IS NULL');
    await prisma.$executeRawUnsafe('UPDATE supplier_invoice_history SET company_id = 1 WHERE company_id IS NULL');
  } catch (rawErr) {
    console.log('Skipping raw SQL updates as tables are already migrated or empty:', rawErr.message);
  }

  console.log('=== Seed Process Completed Successfully! ===');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed process encountered an error:', err);
});
