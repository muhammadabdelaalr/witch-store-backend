"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const license_1 = require("../controllers/license");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const router = (0, express_1.Router)();
/**
 * @swagger
 * tags:
 *   name: License
 *   description: License activation, validation and management for devices
 */
// 1. License Activation (Rate limited)
router.post('/activate', (0, auth_1.rateLimitMiddleware)(15 * 60 * 1000, 20), // 15 mins, 20 requests max
license_1.activateLicense);
// 2. Online License Validation
router.post('/validate', auth_1.authTokenMiddleware, tenant_1.tenantResolverMiddleware, license_1.validateLicense);
// 3. Refresh License Token (Rate limited)
router.post('/refresh-token', (0, auth_1.rateLimitMiddleware)(15 * 60 * 1000, 50), license_1.refreshLicenseToken);
// 4. Logout / Deactivate Device
router.post('/logout-device', auth_1.authTokenMiddleware, tenant_1.tenantResolverMiddleware, license_1.logoutDevice);
exports.default = router;
