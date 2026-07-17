"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireFeature = exports.requireModule = void 0;
// 1. Module Guard
const requireModule = (moduleKey) => {
    return (req, res, next) => {
        const tenant = req.tenant;
        if (!tenant) {
            res.status(403).json({ error: 'TENANT_ACCESS_DENIED', message: 'لم يتم تحديد سياق الشركة المستأجرة.' });
            return;
        }
        if (!tenant.allowed_modules.includes(moduleKey)) {
            res.status(403).json({
                error: 'MODULE_NOT_ALLOWED',
                message: `هذه الوحدة (${moduleKey}) غير مفعلة في باقة الاشتراك الحالية.`
            });
            return;
        }
        next();
    };
};
exports.requireModule = requireModule;
// 2. Feature Guard
const requireFeature = (featureKey) => {
    return (req, res, next) => {
        const tenant = req.tenant;
        if (!tenant) {
            res.status(403).json({ error: 'TENANT_ACCESS_DENIED', message: 'لم يتم تحديد سياق الشركة المستأجرة.' });
            return;
        }
        if (!tenant.allowed_features.includes(featureKey)) {
            res.status(403).json({
                error: 'FEATURE_NOT_ALLOWED',
                message: `هذه الميزة الفرعية (${featureKey}) غير مفعلة في باقة الاشتراك الحالية.`
            });
            return;
        }
        next();
    };
};
exports.requireFeature = requireFeature;
