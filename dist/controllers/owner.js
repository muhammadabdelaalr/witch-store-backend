"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePlan = exports.deleteCompany = exports.updateCompanyStatus = exports.getOwnerAuditLogs = exports.createPayment = exports.getPayments = exports.unblockDevice = exports.blockDevice = exports.getDevices = exports.convertLicenseToLifetime = exports.extendLicense = exports.reactivateLicense = exports.suspendLicense = exports.updateLicense = exports.createLicense = exports.getLicenses = exports.getFeatures = exports.getModules = exports.updatePlan = exports.createPlan = exports.getPlans = exports.updateCompany = exports.createCompany = exports.getCompanies = exports.getLookups = exports.getDashboardStats = exports.ownerLogin = void 0;
const prisma_1 = require("../prisma");
const jwt_1 = require("../utils/jwt");
const crypto_1 = __importDefault(require("crypto"));
// Helper to hash passwords using SHA-256 (same as seed script)
function hashPassword(password) {
    return crypto_1.default.createHash('sha256').update(password).digest('hex');
}
// Helper for Owner Audit Logging
async function logOwnerAction(ownerUserId, action, entityType, entityId, details) {
    try {
        await prisma_1.prisma.ownerAuditLog.create({
            data: {
                owner_user_id: ownerUserId,
                action,
                entity_type: entityType,
                entity_id: entityId,
                details,
            },
        });
    }
    catch (error) {
        console.error('[OwnerAuditLog Error] Failed to write log:', error);
    }
}
// 1. Owner Admin Login
const ownerLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'INVALID_CREDENTIALS', message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.' });
            return;
        }
        const owner = await prisma_1.prisma.ownerAdminUser.findUnique({
            where: { email },
        });
        if (!owner || owner.password_hash !== hashPassword(password)) {
            res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
            return;
        }
        // Generate Tokens
        const accessToken = (0, jwt_1.generateAccessToken)({
            user_id: owner.id,
            email: owner.email,
            role: owner.role,
            company_id: 0,
            license_id: 0,
            device_id: '',
        });
        const refreshToken = (0, jwt_1.generateRefreshToken)({
            user_id: owner.id,
            email: owner.email,
            role: owner.role,
            company_id: 0,
            license_id: 0,
            device_id: '',
        });
        // Save refresh token to database
        await prisma_1.prisma.refreshToken.create({
            data: {
                token: refreshToken,
                user_name: owner.name,
                device_id: 'owner-portal',
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 Days
            },
        });
        await logOwnerAction(owner.id, 'LOGIN', 'ownerAdminUser', owner.id, 'تم تسجيل الدخول لوحة المالك');
        res.json({
            accessToken,
            refreshToken,
            user: {
                id: owner.id,
                name: owner.name,
                email: owner.email,
                role: owner.role,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.ownerLogin = ownerLogin;
// ==========================================
// 1.5 DASHBOARD & LOOKUPS
// ==========================================
const getDashboardStats = async (req, res) => {
    try {
        const [companies_count, active_licenses_count, expired_licenses_count, active_devices_count] = await Promise.all([
            prisma_1.prisma.company.count(),
            prisma_1.prisma.license.count({ where: { status: 'active' } }),
            prisma_1.prisma.license.count({ where: { status: 'expired' } }),
            prisma_1.prisma.deviceActivation.count({ where: { status: 'active' } }),
        ]);
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const paymentsThisMonthResult = await prisma_1.prisma.payment.aggregate({
            _sum: { amount: true },
            where: { created_at: { gte: firstDayOfMonth }, status: 'paid' },
        });
        const payments_this_month = paymentsThisMonthResult._sum.amount || 0;
        const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const licenses_expiring_soon = await prisma_1.prisma.license.findMany({
            where: {
                status: 'active',
                expires_at: { not: null, lte: next30Days, gte: now }
            },
            include: { company: true },
            take: 5
        });
        res.json({
            companies_count,
            active_licenses_count,
            expired_licenses_count,
            active_devices_count,
            payments_this_month,
            licenses_expiring_soon,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.getDashboardStats = getDashboardStats;
const getLookups = async (req, res) => {
    try {
        const [companies, plans, modules, licenses] = await Promise.all([
            prisma_1.prisma.company.findMany({ select: { id: true, name: true, status: true } }),
            prisma_1.prisma.plan.findMany({ select: { id: true, name: true, is_active: true } }),
            prisma_1.prisma.module.findMany({ select: { id: true, key: true, name: true, is_active: true } }),
            prisma_1.prisma.license.findMany({
                select: {
                    id: true,
                    company_id: true,
                    plan_id: true,
                    status: true,
                    plan: { select: { name: true, price_monthly: true, price_yearly: true, is_lifetime: true } },
                    company: { select: { name: true } }
                }
            })
        ]);
        res.json({ companies, plans, modules, licenses });
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.getLookups = getLookups;
// ==========================================
// 2. COMPANIES MANAGEMENT
// ==========================================
const getCompanies = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            prisma_1.prisma.company.findMany({
                include: {
                    _count: {
                        select: {
                            branches: true,
                            licenses: true,
                            devices: true,
                        },
                    },
                    users: {
                        where: { isAdmin: true },
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true,
                            isAdmin: true,
                            password: true,
                        },
                    },
                },
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.company.count(),
        ]);
        res.json({
            data,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.getCompanies = getCompanies;
const createCompany = async (req, res) => {
    try {
        const { name, legal_name, phone, email, password, address, app_name } = req.body;
        if (!name && !phone) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'يجب إدخال اسم الشركة أو رقم الهاتف على الأقل.' });
            return;
        }
        if (!address) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'العنوان مطلوب.' });
            return;
        }
        if (!email) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'البريد الإلكتروني للمشرف مطلوب.' });
            return;
        }
        if (!password) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'كلمة مرور المشرف مطلوبة.' });
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'البريد الإلكتروني للمشرف غير صالح.' });
            return;
        }
        const singleCompanyMode = process.env.OWNER_SINGLE_COMPANY_MODE === 'true';
        if (singleCompanyMode) {
            const existingCompaniesCount = await prisma_1.prisma.company.count();
            if (existingCompaniesCount >= 1) {
                res.status(400).json({
                    error: 'SINGLE_COMPANY_LIMIT_REACHED',
                    message: 'النظام مخصص لشركة واحدة فقط.'
                });
                return;
            }
        }
        // Create Company, default Branch, and Admin User inside a transaction
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            const newCompany = await tx.company.create({
                data: {
                    name: name ? name.trim() : phone.trim(),
                    legal_name: legal_name ? legal_name.trim() : null,
                    phone: phone ? phone.trim() : null,
                    email: email.trim(),
                    address: address.trim(),
                    status: 'active',
                    app_name: app_name ? app_name.trim() : null,
                },
            });
            const defaultBranch = await tx.branch.create({
                data: {
                    company_id: newCompany.id,
                    name: 'الفرع الرئيسي',
                    is_main: true,
                },
            });
            const adminUser = await tx.user.create({
                data: {
                    company_id: newCompany.id,
                    branch_id: defaultBranch.id,
                    name: email.trim(),
                    email: email.trim(),
                    password: password,
                    phone: phone ? phone.trim() : '0000000000',
                    isAdmin: true,
                    logs: '[]',
                },
            });
            return { company: newCompany, branch: defaultBranch, adminUser };
        });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'CREATE_COMPANY', 'Company', result.company.id, `إنشاء شركة جديدة: ${name || phone} مع الفرع الرئيسي والمشرف`);
        }
        res.status(201).json(result);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.createCompany = createCompany;
const updateCompany = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, legal_name, phone, email, address, status, app_name } = req.body;
        const companyId = parseInt(id, 10);
        if (isNaN(companyId)) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الشركة غير صالح.' });
            return;
        }
        const oldCompany = await prisma_1.prisma.company.findUnique({ where: { id: companyId } });
        if (!oldCompany) {
            res.status(404).json({ error: 'NOT_FOUND', message: 'الشركة غير موجودة.' });
            return;
        }
        const updated = await prisma_1.prisma.company.update({
            where: { id: companyId },
            data: {
                name: name || (phone ? phone : undefined),
                legal_name,
                phone,
                email,
                address,
                status,
                app_name: app_name !== undefined ? (app_name ? app_name.trim() : null) : undefined
            },
        });
        if (email && oldCompany.email !== email) {
            // Find the admin user with the old email and update to the new email
            const adminUser = await prisma_1.prisma.user.findFirst({
                where: {
                    company_id: companyId,
                    name: oldCompany.email || 'Administrator'
                }
            });
            if (adminUser) {
                await prisma_1.prisma.user.update({
                    where: { id: adminUser.id },
                    data: { name: email, email: email }
                });
            }
            else {
                // Fallback: look for Administrator or admin
                const fallbackAdmin = await prisma_1.prisma.user.findFirst({
                    where: {
                        company_id: companyId,
                        name: { in: ['admin', 'Administrator'] }
                    }
                });
                if (fallbackAdmin) {
                    await prisma_1.prisma.user.update({
                        where: { id: fallbackAdmin.id },
                        data: { name: email, email: email }
                    });
                }
            }
        }
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'UPDATE_COMPANY', 'Company', companyId, `تحديث بيانات الشركة: ${name || updated.name}، الحالة: ${status || updated.status}`);
        }
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.updateCompany = updateCompany;
// ==========================================
// 3. PLANS MANAGEMENT
// ==========================================
const getPlans = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            prisma_1.prisma.plan.findMany({
                include: {
                    plan_modules: { include: { module: true } },
                    plan_features: { include: { feature: true } },
                },
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.plan.count(),
        ]);
        res.json({
            data,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.getPlans = getPlans;
const createPlan = async (req, res) => {
    try {
        const { name, description, price_monthly, price_yearly, is_lifetime, max_users, max_devices, max_branches, moduleIds, featureIds } = req.body;
        if (!name || price_monthly === undefined || price_yearly === undefined) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'الاسم والأسعار الشهرية والسنوية مطلوبة.' });
            return;
        }
        const newPlan = await prisma_1.prisma.$transaction(async (tx) => {
            const plan = await tx.plan.create({
                data: {
                    name,
                    description,
                    price_monthly,
                    price_yearly,
                    is_lifetime: !!is_lifetime,
                    max_users: max_users || 5,
                    max_devices: max_devices || 5,
                    max_branches: max_branches || 1,
                    is_active: true,
                },
            });
            if (moduleIds && Array.isArray(moduleIds)) {
                await tx.planModule.createMany({
                    data: moduleIds.map((mId) => ({ plan_id: plan.id, module_id: mId })),
                });
            }
            if (featureIds && Array.isArray(featureIds)) {
                await tx.planFeature.createMany({
                    data: featureIds.map((fId) => ({ plan_id: plan.id, feature_id: fId })),
                });
            }
            return plan;
        });
        // Fetch complete plan
        const completePlan = await prisma_1.prisma.plan.findUnique({
            where: { id: newPlan.id },
            include: {
                plan_modules: { include: { module: true } },
                plan_features: { include: { feature: true } },
            },
        });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'CREATE_PLAN', 'Plan', newPlan.id, `إنشاء باقة جديدة: ${name}`);
        }
        res.status(201).json(completePlan);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.createPlan = createPlan;
const updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, price_monthly, price_yearly, is_lifetime, max_users, max_devices, max_branches, is_active, moduleIds, featureIds } = req.body;
        const planId = parseInt(id, 10);
        if (isNaN(planId)) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الباقة غير صالح.' });
            return;
        }
        await prisma_1.prisma.$transaction(async (tx) => {
            await tx.plan.update({
                where: { id: planId },
                data: {
                    name,
                    description,
                    price_monthly,
                    price_yearly,
                    is_lifetime,
                    max_users,
                    max_devices,
                    max_branches,
                    is_active,
                },
            });
            if (moduleIds && Array.isArray(moduleIds)) {
                await tx.planModule.deleteMany({ where: { plan_id: planId } });
                await tx.planModule.createMany({
                    data: moduleIds.map((mId) => ({ plan_id: planId, module_id: mId })),
                });
            }
            if (featureIds && Array.isArray(featureIds)) {
                await tx.planFeature.deleteMany({ where: { plan_id: planId } });
                await tx.planFeature.createMany({
                    data: featureIds.map((fId) => ({ plan_id: planId, feature_id: fId })),
                });
            }
        });
        const updatedPlan = await prisma_1.prisma.plan.findUnique({
            where: { id: planId },
            include: {
                plan_modules: { include: { module: true } },
                plan_features: { include: { feature: true } },
            },
        });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'UPDATE_PLAN', 'Plan', planId, `تحديث الباقة: ${name || updatedPlan?.name}`);
        }
        res.json(updatedPlan);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.updatePlan = updatePlan;
// ==========================================
// 4. MODULES & FEATURES LOOKUPS
// ==========================================
const getModules = async (req, res) => {
    try {
        const modules = await prisma_1.prisma.module.findMany({ orderBy: { key: 'asc' } });
        res.json(modules);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.getModules = getModules;
const getFeatures = async (req, res) => {
    try {
        const features = await prisma_1.prisma.feature.findMany({ orderBy: { key: 'asc' } });
        res.json(features);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.getFeatures = getFeatures;
// ==========================================
// 5. LICENSES MANAGEMENT
// ==========================================
const getLicenses = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        // Auto-expire past licenses before fetching
        await prisma_1.prisma.license.updateMany({
            where: {
                status: 'active',
                expires_at: { lt: new Date() }
            },
            data: { status: 'expired' }
        });
        const [data, total] = await Promise.all([
            prisma_1.prisma.license.findMany({
                include: {
                    company: true,
                    plan: true,
                    devices: true,
                    license_modules: { include: { module: true } },
                    license_features: { include: { feature: true } },
                },
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.license.count(),
        ]);
        res.json({
            data,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.getLicenses = getLicenses;
const createLicense = async (req, res) => {
    try {
        const { company_id, plan_id, type, expires_at, max_devices, max_users, max_branches, allow_all_modules, customModules, customFeatures } = req.body;
        if (!company_id || !plan_id) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الشركة ومعرف الباقة مطلوبين.' });
            return;
        }
        const company = await prisma_1.prisma.company.findUnique({ where: { id: company_id } });
        const plan = await prisma_1.prisma.plan.findUnique({
            where: { id: plan_id },
            include: {
                plan_modules: true,
                plan_features: true,
            },
        });
        if (!company || !plan) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'الشركة أو الباقة غير صالحة.' });
            return;
        }
        // Generate random secure license key (e.g. XXXX-XXXX-XXXX-XXXX)
        const licenseKey = crypto_1.default.randomBytes(8).toString('hex').toUpperCase().match(/.{1,4}/g)?.join('-') || 'KEY-ERROR';
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            // Determine values (fallback to plan defaults)
            const finalMaxDevices = max_devices !== undefined ? max_devices : plan.max_devices;
            const finalMaxUsers = max_users !== undefined ? max_users : plan.max_users;
            const finalMaxBranches = max_branches !== undefined ? max_branches : plan.max_branches;
            const license = await tx.license.create({
                data: {
                    company_id,
                    plan_id,
                    license_key: licenseKey,
                    type: type || 'subscription',
                    status: 'active',
                    starts_at: new Date(),
                    expires_at: expires_at ? new Date(expires_at) : (type === 'lifetime' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // Default 30 days if subscription
                    max_devices: finalMaxDevices,
                    max_users: finalMaxUsers,
                    max_branches: finalMaxBranches,
                    allow_all_modules: !!allow_all_modules,
                },
            });
            // Default modules/features mappings from Plan
            if (!allow_all_modules) {
                // Module overrides
                for (const pm of plan.plan_modules) {
                    await tx.licenseModule.create({
                        data: { license_id: license.id, module_id: pm.module_id, is_enabled: true },
                    });
                }
                // Custom override adjustments if supplied
                if (customModules && Array.isArray(customModules)) {
                    // customModules [{ moduleId: number, isEnabled: boolean }]
                    for (const cm of customModules) {
                        await tx.licenseModule.upsert({
                            where: { license_id_module_id: { license_id: license.id, module_id: cm.moduleId } },
                            update: { is_enabled: cm.isEnabled },
                            create: { license_id: license.id, module_id: cm.moduleId, is_enabled: cm.isEnabled },
                        });
                    }
                }
                // Feature overrides
                for (const pf of plan.plan_features) {
                    await tx.licenseFeature.create({
                        data: { license_id: license.id, feature_id: pf.feature_id, is_enabled: true },
                    });
                }
                // Custom override adjustments if supplied
                if (customFeatures && Array.isArray(customFeatures)) {
                    // customFeatures [{ featureId: number, isEnabled: boolean }]
                    for (const cf of customFeatures) {
                        await tx.licenseFeature.upsert({
                            where: { license_id_feature_id: { license_id: license.id, feature_id: cf.featureId } },
                            update: { is_enabled: cf.isEnabled },
                            create: { license_id: license.id, feature_id: cf.featureId, is_enabled: cf.isEnabled },
                        });
                    }
                }
            }
            return license;
        });
        const completeLicense = await prisma_1.prisma.license.findUnique({
            where: { id: result.id },
            include: {
                company: true,
                plan: true,
                license_modules: { include: { module: true } },
                license_features: { include: { feature: true } },
            },
        });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'CREATE_LICENSE', 'License', result.id, `إنشاء ترخيص جديد: ${licenseKey} للشركة: ${company.name}`);
        }
        res.status(201).json(completeLicense);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.createLicense = createLicense;
const updateLicense = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, expires_at, max_devices, max_users, max_branches, allow_all_modules, customModules, customFeatures } = req.body;
        const licenseId = parseInt(id, 10);
        if (isNaN(licenseId)) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الترخيص غير صالح.' });
            return;
        }
        await prisma_1.prisma.$transaction(async (tx) => {
            await tx.license.update({
                where: { id: licenseId },
                data: {
                    type,
                    expires_at: expires_at ? new Date(expires_at) : (type === 'lifetime' ? null : undefined),
                    max_devices,
                    max_users,
                    max_branches,
                    allow_all_modules,
                },
            });
            if (customModules && Array.isArray(customModules)) {
                for (const cm of customModules) {
                    await tx.licenseModule.upsert({
                        where: { license_id_module_id: { license_id: licenseId, module_id: cm.moduleId } },
                        update: { is_enabled: cm.isEnabled },
                        create: { license_id: licenseId, module_id: cm.moduleId, is_enabled: cm.isEnabled },
                    });
                }
            }
            if (customFeatures && Array.isArray(customFeatures)) {
                for (const cf of customFeatures) {
                    await tx.licenseFeature.upsert({
                        where: { license_id_feature_id: { license_id: licenseId, feature_id: cf.featureId } },
                        update: { is_enabled: cf.isEnabled },
                        create: { license_id: licenseId, feature_id: cf.featureId, is_enabled: cf.isEnabled },
                    });
                }
            }
        });
        const updatedLicense = await prisma_1.prisma.license.findUnique({
            where: { id: licenseId },
            include: {
                company: true,
                plan: true,
                license_modules: { include: { module: true } },
                license_features: { include: { feature: true } },
            },
        });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'UPDATE_LICENSE', 'License', licenseId, `تحديث تفاصيل الترخيص ID: ${licenseId}`);
        }
        res.json(updatedLicense);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.updateLicense = updateLicense;
const suspendLicense = async (req, res) => {
    try {
        const { id } = req.params;
        const licenseId = parseInt(id, 10);
        if (isNaN(licenseId)) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الترخيص غير صالح.' });
            return;
        }
        const updated = await prisma_1.prisma.license.update({
            where: { id: licenseId },
            data: { status: 'suspended' },
        });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'SUSPEND_LICENSE', 'License', licenseId, `إيقاف الترخيص مؤقتاً: ${updated.license_key}`);
        }
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.suspendLicense = suspendLicense;
const reactivateLicense = async (req, res) => {
    try {
        const { id } = req.params;
        const licenseId = parseInt(id, 10);
        if (isNaN(licenseId)) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الترخيص غير صالح.' });
            return;
        }
        const license = await prisma_1.prisma.license.findUnique({ where: { id: licenseId } });
        if (!license) {
            res.status(404).json({ error: 'NOT_FOUND', message: 'الترخيص غير موجود.' });
            return;
        }
        // Determine correct status (check if already expired)
        let newStatus = 'active';
        if (license.expires_at && license.expires_at < new Date()) {
            newStatus = 'expired';
        }
        const updated = await prisma_1.prisma.license.update({
            where: { id: licenseId },
            data: { status: newStatus },
        });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'REACTIVATE_LICENSE', 'License', licenseId, `إعادة تفعيل الترخيص: ${updated.license_key}`);
        }
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.reactivateLicense = reactivateLicense;
const extendLicense = async (req, res) => {
    try {
        const { id } = req.params;
        const { days, newExpiryDate } = req.body;
        const licenseId = parseInt(id, 10);
        if (isNaN(licenseId)) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الترخيص غير صالح.' });
            return;
        }
        const license = await prisma_1.prisma.license.findUnique({ where: { id: licenseId } });
        if (!license) {
            res.status(404).json({ error: 'NOT_FOUND', message: 'الترخيص غير موجود.' });
            return;
        }
        let finalExpiry;
        if (newExpiryDate) {
            finalExpiry = new Date(newExpiryDate);
        }
        else if (days) {
            const baseDate = license.expires_at && license.expires_at > new Date() ? license.expires_at : new Date();
            finalExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
        }
        else {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'يرجى توفير الأيام أو تاريخ الانتهاء الجديد لتمديد الترخيص.' });
            return;
        }
        const updated = await prisma_1.prisma.license.update({
            where: { id: licenseId },
            data: {
                expires_at: finalExpiry,
                status: finalExpiry > new Date() ? 'active' : 'expired',
            },
        });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'EXTEND_LICENSE', 'License', licenseId, `تمديد تاريخ انتهاء الترخيص إلى: ${finalExpiry.toISOString()}`);
        }
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.extendLicense = extendLicense;
const convertLicenseToLifetime = async (req, res) => {
    try {
        const { id } = req.params;
        const licenseId = parseInt(id, 10);
        if (isNaN(licenseId)) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الترخيص غير صالح.' });
            return;
        }
        const updated = await prisma_1.prisma.license.update({
            where: { id: licenseId },
            data: {
                type: 'lifetime',
                expires_at: null,
                status: 'active',
            },
        });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'CONVERT_LIFETIME', 'License', licenseId, `تحويل الترخيص لرخصة مدى الحياة: ${updated.license_key}`);
        }
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.convertLicenseToLifetime = convertLicenseToLifetime;
// ==========================================
// 6. DEVICES MANAGEMENT
// ==========================================
const getDevices = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            prisma_1.prisma.deviceActivation.findMany({
                include: {
                    company: true,
                    license: true,
                },
                orderBy: { activated_at: 'desc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.deviceActivation.count(),
        ]);
        res.json({
            data,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.getDevices = getDevices;
const blockDevice = async (req, res) => {
    try {
        const { id } = req.params;
        const deviceId = parseInt(id, 10);
        if (isNaN(deviceId)) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف تفعيل الجهاز غير صالح.' });
            return;
        }
        const updated = await prisma_1.prisma.deviceActivation.update({
            where: { id: deviceId },
            data: { status: 'blocked' },
        });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'BLOCK_DEVICE', 'DeviceActivation', deviceId, `حظر الجهاز: ${updated.device_name} (ID: ${updated.device_id})`);
        }
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.blockDevice = blockDevice;
const unblockDevice = async (req, res) => {
    try {
        const { id } = req.params;
        const deviceId = parseInt(id, 10);
        if (isNaN(deviceId)) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف تفعيل الجهاز غير صالح.' });
            return;
        }
        const updated = await prisma_1.prisma.deviceActivation.update({
            where: { id: deviceId },
            data: { status: 'active' },
        });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'UNBLOCK_DEVICE', 'DeviceActivation', deviceId, `إلغاء حظر الجهاز: ${updated.device_name} (ID: ${updated.device_id})`);
        }
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.unblockDevice = unblockDevice;
// ==========================================
// 7. PAYMENTS & SUBSCRIPTIONS
// ==========================================
const getPayments = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            prisma_1.prisma.payment.findMany({
                include: {
                    company: true,
                    subscription: { include: { plan: true } },
                },
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.payment.count(),
        ]);
        res.json({
            data,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.getPayments = getPayments;
const createPayment = async (req, res) => {
    try {
        const { company_id, license_id, plan_id, amount, billing_cycle, method, notes } = req.body;
        if (!company_id || !license_id || !plan_id || !amount || !method) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'الشركة والترخيص والخصائص المالية كاملة مطلوبة.' });
            return;
        }
        const license = await prisma_1.prisma.license.findUnique({ where: { id: license_id } });
        if (!license || license.company_id !== company_id) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'الترخيص غير صالح أو غير مرتبط بهذه الشركة.' });
            return;
        }
        // Run transaction
        const payment = await prisma_1.prisma.$transaction(async (tx) => {
            // 1. Resolve active or new subscription
            let sub = await tx.subscription.findFirst({
                where: { company_id, license_id, plan_id, status: 'active' },
            });
            const now = new Date();
            let newEnd = new Date();
            // Extend duration depending on cycle
            const cycle = billing_cycle || 'monthly';
            const durationMs = cycle === 'yearly'
                ? 365 * 24 * 60 * 60 * 1000
                : cycle === 'lifetime'
                    ? 100 * 365 * 24 * 60 * 60 * 1000 // practically lifetime
                    : 30 * 24 * 60 * 60 * 1000; // 30 days
            if (sub) {
                const base = sub.current_period_end > now ? sub.current_period_end : now;
                newEnd = new Date(base.getTime() + durationMs);
                sub = await tx.subscription.update({
                    where: { id: sub.id },
                    data: {
                        current_period_start: now,
                        current_period_end: newEnd,
                        billing_cycle: cycle,
                    },
                });
            }
            else {
                newEnd = new Date(now.getTime() + durationMs);
                sub = await tx.subscription.create({
                    data: {
                        company_id,
                        license_id,
                        plan_id,
                        status: 'active',
                        billing_cycle: cycle,
                        current_period_start: now,
                        current_period_end: newEnd,
                    },
                });
            }
            // 2. Create the Payment record
            const manualProvider = await tx.paymentProvider.findUnique({ where: { key: 'manual' } });
            const payRecord = await tx.payment.create({
                data: {
                    company_id,
                    subscription_id: sub.id,
                    amount: parseFloat(amount),
                    currency: 'EGP',
                    method,
                    status: 'paid',
                    paid_at: now,
                    notes,
                    provider_id: manualProvider?.id || null,
                },
            });
            // 3. Update the associated License expires_at & status
            await tx.license.update({
                where: { id: license_id },
                data: {
                    expires_at: cycle === 'lifetime' ? null : newEnd,
                    status: 'active',
                    type: cycle === 'lifetime' ? 'lifetime' : 'subscription',
                },
            });
            return payRecord;
        });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'CREATE_PAYMENT', 'Payment', payment.id, `تسجيل دفعة يدوية بمبلغ ${amount} EGP لتجديد الترخيص ID: ${license_id}`);
        }
        res.status(201).json(payment);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.createPayment = createPayment;
// ==========================================
// 8. AUDIT LOGS
// ==========================================
const getOwnerAuditLogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        let filter = {};
        if (req.query.entity_type)
            filter.entity_type = req.query.entity_type;
        if (req.query.owner_user_id)
            filter.owner_user_id = parseInt(req.query.owner_user_id);
        if (req.query.from || req.query.to) {
            filter.created_at = {};
            if (req.query.from)
                filter.created_at.gte = new Date(req.query.from);
            if (req.query.to)
                filter.created_at.lte = new Date(req.query.to);
        }
        const [data, total] = await Promise.all([
            prisma_1.prisma.ownerAuditLog.findMany({
                include: { owner_user: { select: { id: true, name: true, email: true, role: true } } },
                orderBy: { created_at: 'desc' },
                where: filter,
                skip,
                take: limit,
            }),
            prisma_1.prisma.ownerAuditLog.count({ where: filter }),
        ]);
        res.json({
            data,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.getOwnerAuditLogs = getOwnerAuditLogs;
// ==========================================
// 9. DELETIONS & STATUS UPDATES
// ==========================================
const updateCompanyStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const companyId = parseInt(id, 10);
        if (isNaN(companyId)) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الشركة غير صالح.' });
            return;
        }
        if (status !== 'active' && status !== 'suspended') {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'حالة غير صالحة.' });
            return;
        }
        const singleCompanyMode = process.env.OWNER_SINGLE_COMPANY_MODE === 'true';
        if (singleCompanyMode && status === 'suspended') {
            const count = await prisma_1.prisma.company.count({ where: { status: 'active' } });
            if (count <= 1) {
                res.status(400).json({
                    error: 'CANNOT_SUSPEND_LAST_COMPANY',
                    message: 'لا يمكن إيقاف الشركة الوحيدة النشطة في النظام.'
                });
                return;
            }
        }
        const updated = await prisma_1.prisma.company.update({
            where: { id: companyId },
            data: { status },
        });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'UPDATE_COMPANY_STATUS', 'Company', companyId, `تغيير حالة الشركة إلى: ${status}`);
        }
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.updateCompanyStatus = updateCompanyStatus;
const deleteCompany = async (req, res) => {
    // Converted to safe soft-delete behavior per requirements
    res.status(400).json({
        error: 'HARD_DELETE_DISABLED',
        message: 'تم إيقاف الحذف النهائي للشركات حفاظاً على سلامة البيانات. يرجى استخدام الإيقاف المؤقت (Suspension) بدلاً من ذلك.'
    });
};
exports.deleteCompany = deleteCompany;
const deletePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const planId = parseInt(id, 10);
        if (isNaN(planId)) {
            res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الباقة غير صالح.' });
            return;
        }
        const plan = await prisma_1.prisma.plan.findUnique({ where: { id: planId } });
        if (!plan) {
            res.status(404).json({ error: 'NOT_FOUND', message: 'الباقة غير موجودة.' });
            return;
        }
        await prisma_1.prisma.plan.delete({ where: { id: planId } });
        if (req.ownerAdmin) {
            await logOwnerAction(req.ownerAdmin.id, 'DELETE_PLAN', 'Plan', planId, `حذف الباقة: ${plan.name}`);
        }
        res.json({ message: 'تم حذف الباقة بنجاح.' });
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.deletePlan = deletePlan;
