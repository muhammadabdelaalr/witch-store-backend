"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitMiddleware = exports.ownerAuthMiddleware = exports.authTokenMiddleware = void 0;
const jwt_1 = require("../utils/jwt");
// 1. Auth Token Middleware
const authTokenMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'TOKEN_INVALID', message: 'توكن التحقق غير موجود أو غير صالح.' });
            return;
        }
        const token = authHeader.split(' ')[1];
        const decoded = (0, jwt_1.verifyAccessToken)(token);
        req.tokenPayload = decoded;
        next();
    }
    catch (error) {
        if (error.name === 'TokenExpiredError') {
            res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'انتهت صلاحية توكن التحقق. يرجى تجديد الجلسة.' });
            return;
        }
        res.status(401).json({ error: 'TOKEN_INVALID', message: 'توكن التحقق غير صالح.' });
    }
};
exports.authTokenMiddleware = authTokenMiddleware;
// 2. Owner Auth Middleware
const ownerAuthMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'TOKEN_INVALID', message: 'توكن مدير المنصة غير موجود.' });
            return;
        }
        const token = authHeader.split(' ')[1];
        const decoded = (0, jwt_1.verifyAccessToken)(token);
        if (decoded.role !== 'owner' && decoded.role !== 'device') {
            // Allow 'device' role for checking license info if it matches owner requests,
            // but standard owner endpoints require role = owner/support/sales
        }
        if (!['owner', 'support', 'sales'].includes(decoded.role)) {
            res.status(403).json({ error: 'TENANT_ACCESS_DENIED', message: 'ليس لديك صلاحية للوصول لوحة التحكم الخاصة بالمالك.' });
            return;
        }
        req.ownerAdmin = {
            id: decoded.user_id || 0,
            email: decoded.email || '',
            role: decoded.role,
        };
        next();
    }
    catch (error) {
        if (error.name === 'TokenExpiredError') {
            res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'انتهت صلاحية الجلسة لمدير المنصة.' });
            return;
        }
        res.status(401).json({ error: 'TOKEN_INVALID', message: 'توكن التحقق غير صالح لمدير المنصة.' });
    }
};
exports.ownerAuthMiddleware = ownerAuthMiddleware;
// 3. Rate Limiter Middleware
const rateLimitMap = new Map();
const rateLimitMiddleware = (windowMs, maxRequests) => {
    return (req, res, next) => {
        const ip = req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const limitInfo = rateLimitMap.get(ip);
        if (!limitInfo || now > limitInfo.resetAt) {
            rateLimitMap.set(ip, {
                count: 1,
                resetAt: now + windowMs,
            });
            return next();
        }
        limitInfo.count++;
        if (limitInfo.count > maxRequests) {
            res.status(429).json({
                error: 'TOO_MANY_REQUESTS',
                message: 'لقد تجاوزت الحد المسموح به من الطلبات. يرجى الانتظار والمحاولة لاحقاً.',
            });
            return;
        }
        next();
    };
};
exports.rateLimitMiddleware = rateLimitMiddleware;
