"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantResolverMiddleware = void 0;
const prisma_1 = require("../prisma");
const tenantResolverMiddleware = async (req, res, next) => {
    try {
        const payload = req.tokenPayload;
        if (!payload) {
            res.status(401).json({ error: 'TOKEN_INVALID', message: 'توكن التحقق غير صالح.' });
            return;
        }
        const deviceIdHeader = req.headers['x-device-id'];
        if (!deviceIdHeader || deviceIdHeader !== payload.device_id) {
            res.status(403).json({ error: 'TENANT_ACCESS_DENIED', message: 'معرف الجهاز غير متطابق مع التوكن.' });
            return;
        }
        // 1. Verify Company Status
        const company = await prisma_1.prisma.company.findUnique({
            where: { id: payload.company_id }
        });
        if (!company) {
            res.status(403).json({ error: 'TENANT_ACCESS_DENIED', message: 'الشركة غير مسجلة بالنظام.' });
            return;
        }
        if (company.status === 'suspended') {
            res.status(403).json({ error: 'COMPANY_SUSPENDED', message: 'تم إيقاف حساب الشركة مؤقتاً. يرجى مراجعة الإدارة.' });
            return;
        }
        // 2. Verify License Status
        const license = await prisma_1.prisma.license.findUnique({
            where: { id: payload.license_id }
        });
        if (!license) {
            res.status(403).json({ error: 'LICENSE_INVALID', message: 'الترخيص غير موجود.' });
            return;
        }
        if (license.status === 'suspended') {
            res.status(403).json({ error: 'LICENSE_SUSPENDED', message: 'الترخيص موقوف مؤقتاً. يرجى مراجعة الدعم.' });
            return;
        }
        // Check expiry
        const now = new Date();
        if (license.expires_at && license.expires_at < now) {
            // Update status to expired in database if not already
            if (license.status !== 'expired') {
                await prisma_1.prisma.license.update({
                    where: { id: license.id },
                    data: { status: 'expired' }
                });
            }
            res.status(403).json({ error: 'LICENSE_EXPIRED', message: 'انتهت صلاحية الترخيص. يرجى تجديد الاشتراك.' });
            return;
        }
        if (license.status === 'expired') {
            res.status(403).json({ error: 'LICENSE_EXPIRED', message: 'انتهت صلاحية الترخيص. يرجى تجديد الاشتراك.' });
            return;
        }
        // 3. Verify Device Activation Status
        const device = await prisma_1.prisma.deviceActivation.findUnique({
            where: {
                license_id_device_id: {
                    license_id: license.id,
                    device_id: payload.device_id
                }
            }
        });
        if (!device) {
            res.status(403).json({ error: 'LICENSE_INVALID', message: 'هذا الجهاز غير مفعل لهذا الترخيص.' });
            return;
        }
        if (device.status === 'blocked') {
            res.status(403).json({ error: 'LICENSE_DEVICE_BLOCKED', message: 'تم حظر هذا الجهاز من قبل الإدارة.' });
            return;
        }
        // Update last seen
        await prisma_1.prisma.deviceActivation.update({
            where: { id: device.id },
            data: { last_seen_at: now }
        });
        // 4. Resolve Allowed Modules & Features
        let allowedModules = [];
        let allowedFeatures = [];
        if (license.allow_all_modules) {
            const allMods = await prisma_1.prisma.module.findMany({ where: { is_active: true } });
            const allFeats = await prisma_1.prisma.feature.findMany({ where: { is_active: true } });
            allowedModules = allMods.map(m => m.key);
            allowedFeatures = allFeats.map(f => f.key);
        }
        else {
            // Resolve Modules (Plan modules + License overrides)
            const planModules = await prisma_1.prisma.planModule.findMany({
                where: { plan_id: license.plan_id },
                include: { module: true }
            });
            const licenseOverrides = await prisma_1.prisma.licenseModule.findMany({
                where: { license_id: license.id },
                include: { module: true }
            });
            const moduleSet = new Set();
            // Add defaults from Plan
            planModules.forEach(pm => {
                if (pm.module.is_active) {
                    moduleSet.add(pm.module.key);
                }
            });
            // Apply License overrides
            licenseOverrides.forEach(lo => {
                if (lo.module.is_active) {
                    if (lo.is_enabled) {
                        moduleSet.add(lo.module.key);
                    }
                    else {
                        moduleSet.delete(lo.module.key);
                    }
                }
            });
            allowedModules = Array.from(moduleSet);
            // Resolve Features (Plan features + License overrides)
            const planFeatures = await prisma_1.prisma.planFeature.findMany({
                where: { plan_id: license.plan_id },
                include: { feature: true }
            });
            const licenseFeatureOverrides = await prisma_1.prisma.licenseFeature.findMany({
                where: { license_id: license.id },
                include: { feature: true }
            });
            const featureSet = new Set();
            planFeatures.forEach(pf => {
                if (pf.feature.is_active) {
                    featureSet.add(pf.feature.key);
                }
            });
            licenseFeatureOverrides.forEach(lf => {
                if (lf.feature.is_active) {
                    if (lf.is_enabled) {
                        featureSet.add(lf.feature.key);
                    }
                    else {
                        featureSet.delete(lf.feature.key);
                    }
                }
            });
            allowedFeatures = Array.from(featureSet);
        }
        // Resolve branch_id
        const branchIdHeader = req.headers['x-branch-id'];
        let branchId = branchIdHeader ? parseInt(branchIdHeader, 10) : undefined;
        if (branchId) {
            const branchExists = await prisma_1.prisma.branch.findFirst({
                where: { id: branchId, company_id: company.id }
            });
            if (!branchExists) {
                branchId = undefined;
            }
        }
        if (!branchId) {
            const mainBranch = await prisma_1.prisma.branch.findFirst({
                where: { company_id: company.id, is_main: true }
            }) || await prisma_1.prisma.branch.findFirst({
                where: { company_id: company.id }
            });
            branchId = mainBranch?.id || 1;
        }
        // Attach to Request
        req.tenant = {
            company_id: company.id,
            company_name: company.name,
            company_app_name: company.app_name,
            license_id: license.id,
            device_id: device.device_id,
            branch_id: branchId,
            allowed_modules: allowedModules,
            allowed_features: allowedFeatures
        };
        next();
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.tenantResolverMiddleware = tenantResolverMiddleware;
