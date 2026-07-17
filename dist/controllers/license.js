"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutDevice = exports.refreshLicenseToken = exports.validateLicense = exports.activateLicense = void 0;
const prisma_1 = require("../prisma");
const licenseSigner_1 = require("../utils/licenseSigner");
const jwt_1 = require("../utils/jwt");
const crypto_1 = __importDefault(require("crypto"));
// Helper to compute modules and features for a license
async function getLicensePermissions(licenseId, planId, allowAll) {
    let allowedModules = [];
    let allowedFeatures = [];
    if (allowAll) {
        const allMods = await prisma_1.prisma.module.findMany({ where: { is_active: true } });
        const allFeats = await prisma_1.prisma.feature.findMany({ where: { is_active: true } });
        allowedModules = allMods.map(m => m.key);
        allowedFeatures = allFeats.map(f => f.key);
    }
    else {
        // Modules
        const planModules = await prisma_1.prisma.planModule.findMany({
            where: { plan_id: planId },
            include: { module: true }
        });
        const overrides = await prisma_1.prisma.licenseModule.findMany({
            where: { license_id: licenseId },
            include: { module: true }
        });
        const moduleSet = new Set();
        planModules.forEach(pm => { if (pm.module.is_active)
            moduleSet.add(pm.module.key); });
        overrides.forEach(o => {
            if (o.module.is_active) {
                if (o.is_enabled)
                    moduleSet.add(o.module.key);
                else
                    moduleSet.delete(o.module.key);
            }
        });
        allowedModules = Array.from(moduleSet);
        // Features
        const planFeatures = await prisma_1.prisma.planFeature.findMany({
            where: { plan_id: planId },
            include: { feature: true }
        });
        const featureOverrides = await prisma_1.prisma.licenseFeature.findMany({
            where: { license_id: licenseId },
            include: { feature: true }
        });
        const featureSet = new Set();
        planFeatures.forEach(pf => { if (pf.feature.is_active)
            featureSet.add(pf.feature.key); });
        featureOverrides.forEach(fo => {
            if (fo.feature.is_active) {
                if (fo.is_enabled)
                    featureSet.add(fo.feature.key);
                else
                    featureSet.delete(fo.feature.key);
            }
        });
        allowedFeatures = Array.from(featureSet);
    }
    return { allowedModules, allowedFeatures };
}
// 1. License Activation
const activateLicense = async (req, res) => {
    try {
        const deviceId = req.headers['x-device-id'];
        const { license_key, device_name, platform, app_version } = req.body;
        if (!license_key) {
            res.status(400).json({ error: 'LICENSE_INVALID', message: 'يرجى إدخال مفتاح الترخيص.' });
            return;
        }
        if (!deviceId) {
            res.status(400).json({ error: 'LICENSE_INVALID', message: 'معرف الجهاز غير موجود في ترويسة الطلب.' });
            return;
        }
        // A. Find License
        const license = await prisma_1.prisma.license.findUnique({
            where: { license_key },
            include: { company: true }
        });
        if (!license) {
            res.status(400).json({ error: 'LICENSE_INVALID', message: 'مفتاح الترخيص غير صالح.' });
            return;
        }
        // B. Validate Company
        if (license.company.status === 'suspended') {
            res.status(403).json({ error: 'COMPANY_SUSPENDED', message: 'تم إيقاف حساب الشركة مؤقتاً. يرجى التواصل مع الإدارة.' });
            return;
        }
        // C. Validate License Status & Expiry
        if (license.status === 'suspended') {
            res.status(403).json({ error: 'LICENSE_SUSPENDED', message: 'هذا الترخيص موقوف مؤقتاً.' });
            return;
        }
        const now = new Date();
        if (license.expires_at && license.expires_at < now) {
            if (license.status !== 'expired') {
                await prisma_1.prisma.license.update({ where: { id: license.id }, data: { status: 'expired' } });
            }
            res.status(403).json({ error: 'LICENSE_EXPIRED', message: 'انتهت صلاحية هذا الترخيص.' });
            return;
        }
        if (license.status === 'expired') {
            res.status(403).json({ error: 'LICENSE_EXPIRED', message: 'انتهت صلاحية هذا الترخيص.' });
            return;
        }
        // D. Validate/Register Device
        let device = await prisma_1.prisma.deviceActivation.findUnique({
            where: {
                license_id_device_id: {
                    license_id: license.id,
                    device_id: deviceId
                }
            }
        });
        if (device) {
            if (device.status === 'blocked') {
                res.status(403).json({ error: 'LICENSE_DEVICE_BLOCKED', message: 'هذا الجهاز محظور من الاستخدام.' });
                return;
            }
            // Update metadata on reactivate
            device = await prisma_1.prisma.deviceActivation.update({
                where: { id: device.id },
                data: {
                    device_name: device_name || device.device_name,
                    platform: platform || device.platform,
                    app_version: app_version || device.app_version,
                    last_seen_at: now
                }
            });
        }
        else {
            // Check device limit
            const currentDevices = await prisma_1.prisma.deviceActivation.count({
                where: { license_id: license.id, status: 'active' }
            });
            if (currentDevices >= license.max_devices) {
                res.status(403).json({
                    error: 'LICENSE_DEVICE_LIMIT_REACHED',
                    message: `تم الوصول للحد الأقصى من الأجهزة المفعلة لهذا الترخيص (${license.max_devices} أجهزة).`
                });
                return;
            }
            // Create activation
            device = await prisma_1.prisma.deviceActivation.create({
                data: {
                    company_id: license.company_id,
                    license_id: license.id,
                    device_id: deviceId,
                    device_name: device_name || 'Generic Device',
                    platform: platform || 'unknown',
                    app_version: app_version || '1.0.0',
                    status: 'active'
                }
            });
        }
        // E. Generate Tokens
        const payload = {
            company_id: license.company_id,
            license_id: license.id,
            device_id: deviceId,
            role: 'device'
        };
        const accessToken = (0, jwt_1.generateAccessToken)(payload);
        const refreshToken = (0, jwt_1.generateRefreshToken)(payload);
        // Save refresh token to database
        await prisma_1.prisma.refreshToken.create({
            data: {
                token: refreshToken,
                user_name: 'DeviceActivation',
                device_id: deviceId,
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 Days
            }
        });
        // Ensure default users exist for the company
        const userCount = await prisma_1.prisma.user.count({
            where: { company_id: license.company_id }
        });
        if (userCount === 0) {
            const defaultBranch = await prisma_1.prisma.branch.findFirst({
                where: { company_id: license.company_id, is_main: true }
            }) || await prisma_1.prisma.branch.findFirst({
                where: { company_id: license.company_id }
            });
            const branchId = defaultBranch?.id || null;
            // Ensure 'Administrator' exists
            await prisma_1.prisma.user.upsert({
                where: {
                    company_id_name: {
                        company_id: license.company_id,
                        name: 'Administrator'
                    }
                },
                update: {
                    isAdmin: true
                },
                create: {
                    company_id: license.company_id,
                    branch_id: branchId,
                    name: 'Administrator',
                    phone: 'admin',
                    password: 'admin',
                    isAdmin: true,
                    logs: '[]',
                }
            });
            // Ensure 'admin' exists
            await prisma_1.prisma.user.upsert({
                where: {
                    company_id_name: {
                        company_id: license.company_id,
                        name: 'admin'
                    }
                },
                update: {
                    isAdmin: true
                },
                create: {
                    company_id: license.company_id,
                    branch_id: branchId,
                    name: 'admin',
                    phone: 'admin',
                    password: 'admin',
                    isAdmin: true,
                    logs: '[]',
                }
            });
            console.log(`Created default Administrator & admin users for company ID ${license.company_id}`);
        }
        // F. Build Snapshot
        const { allowedModules, allowedFeatures } = await getLicensePermissions(license.id, license.plan_id, license.allow_all_modules);
        const snapshot = {
            license_key_hash: crypto_1.default.createHash('sha256').update(license.license_key).digest('hex'),
            company_id: license.company_id,
            company_name: license.company.name,
            app_name: license.company.app_name || null,
            license_type: license.type,
            expires_at: license.expires_at ? license.expires_at.toISOString().split('T')[0] : null,
            allowed_modules: allowedModules,
            allowed_features: allowedFeatures,
            device_id: deviceId,
            last_validated_at: now.toISOString()
        };
        const signature = (0, licenseSigner_1.signLicenseSnapshot)(snapshot);
        res.json({
            accessToken,
            refreshToken,
            company: {
                id: license.company.id,
                name: license.company.name,
                legal_name: license.company.legal_name,
                status: license.company.status,
                app_name: license.company.app_name || null
            },
            license: {
                id: license.id,
                type: license.type,
                status: license.status,
                expires_at: license.expires_at
            },
            allowed_modules: allowedModules,
            allowed_features: allowedFeatures,
            signedSnapshot: {
                ...snapshot,
                signature
            }
        });
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.activateLicense = activateLicense;
// 2. Online License Validation
const validateLicense = async (req, res) => {
    try {
        const tenant = req.tenant;
        const license = await prisma_1.prisma.license.findUnique({
            where: { id: tenant.license_id }
        });
        if (!license) {
            res.status(403).json({ error: 'LICENSE_INVALID', message: 'الترخيص غير موجود.' });
            return;
        }
        const now = new Date();
        const snapshot = {
            license_key_hash: crypto_1.default.createHash('sha256').update(license.license_key).digest('hex'),
            company_id: tenant.company_id,
            company_name: tenant.company_name,
            app_name: tenant.company_app_name || null,
            license_type: license.type,
            expires_at: license.expires_at ? license.expires_at.toISOString().split('T')[0] : null,
            allowed_modules: tenant.allowed_modules,
            allowed_features: tenant.allowed_features,
            device_id: tenant.device_id,
            last_validated_at: now.toISOString()
        };
        const signature = (0, licenseSigner_1.signLicenseSnapshot)(snapshot);
        res.json({
            status: 'valid',
            company: tenant.company_name,
            app_name: tenant.company_app_name || null,
            license_type: license.type,
            expires_at: license.expires_at,
            allowed_modules: tenant.allowed_modules,
            allowed_features: tenant.allowed_features,
            signedSnapshot: {
                ...snapshot,
                signature
            }
        });
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.validateLicense = validateLicense;
// 3. Refresh Token
const refreshLicenseToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const deviceId = req.headers['x-device-id'];
        if (!refreshToken || !deviceId) {
            res.status(400).json({ error: 'TOKEN_INVALID', message: 'التوكن ومعرف الجهاز مطلوبين.' });
            return;
        }
        // A. Verify token signature & status in DB
        const dbToken = await prisma_1.prisma.refreshToken.findUnique({
            where: { token: refreshToken }
        });
        if (!dbToken || dbToken.device_id !== deviceId || dbToken.expires_at < new Date()) {
            res.status(401).json({ error: 'TOKEN_INVALID', message: 'توكن التجديد منتهي أو غير صالح.' });
            return;
        }
        // B. Verify JWT content
        const decoded = (0, jwt_1.verifyRefreshToken)(refreshToken);
        if (decoded.device_id !== deviceId) {
            res.status(401).json({ error: 'TOKEN_INVALID', message: 'معرف الجهاز غير متطابق.' });
            return;
        }
        // C. Check license & device state
        const device = await prisma_1.prisma.deviceActivation.findUnique({
            where: {
                license_id_device_id: {
                    license_id: decoded.license_id,
                    device_id: deviceId
                }
            },
            include: {
                license: {
                    include: { company: true }
                }
            }
        });
        if (!device || device.status === 'blocked' || device.license.status === 'suspended' || device.license.company.status === 'suspended') {
            res.status(403).json({ error: 'LICENSE_INVALID', message: 'حساب الشركة أو الجهاز أو الترخيص موقوف.' });
            return;
        }
        // Check expiry
        if (device.license.expires_at && device.license.expires_at < new Date()) {
            res.status(403).json({ error: 'LICENSE_EXPIRED', message: 'انتهت صلاحية الترخيص.' });
            return;
        }
        // D. Generate New Access Token
        const payload = {
            company_id: decoded.company_id,
            license_id: decoded.license_id,
            device_id: deviceId,
            role: 'device'
        };
        const newAccessToken = (0, jwt_1.generateAccessToken)(payload);
        res.json({
            accessToken: newAccessToken,
            refreshToken
        });
    }
    catch (error) {
        res.status(401).json({ error: 'TOKEN_INVALID', message: 'فشل تجديد التوكن.' });
    }
};
exports.refreshLicenseToken = refreshLicenseToken;
// 4. Logout Device / Deactivate
const logoutDevice = async (req, res) => {
    try {
        const tenant = req.tenant;
        // Delete device activation
        await prisma_1.prisma.deviceActivation.delete({
            where: {
                license_id_device_id: {
                    license_id: tenant.license_id,
                    device_id: tenant.device_id
                }
            }
        });
        // Clean refresh tokens
        await prisma_1.prisma.refreshToken.deleteMany({
            where: { device_id: tenant.device_id }
        });
        res.json({ success: true, message: 'تم إلغاء تفعيل الجهاز بنجاح.' });
    }
    catch (error) {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
};
exports.logoutDevice = logoutDevice;
