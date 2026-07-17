"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const owner_1 = require("../controllers/owner");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
/**
 * @swagger
 * tags:
 *   name: Owner Dashboard
 *   description: Owner SaaS control panel operations
 */
// 1. Authentication (Rate limited, no auth middleware needed)
router.post('/auth/login', (0, auth_1.rateLimitMiddleware)(15 * 60 * 1000, 15), // 15 mins, 15 attempts max
owner_1.ownerLogin);
// Apply Owner Authentication middleware to all subsequent routes
router.use(auth_1.ownerAuthMiddleware);
// 1.5 Dashboard & Lookups
router.get('/dashboard', owner_1.getDashboardStats);
router.get('/lookups', owner_1.getLookups);
// 2. Companies Management
router.get('/companies', owner_1.getCompanies);
router.post('/companies', owner_1.createCompany);
router.patch('/companies/:id', owner_1.updateCompany);
router.patch('/companies/:id/status', owner_1.updateCompanyStatus);
router.delete('/companies/:id', owner_1.deleteCompany);
// 3. Plans Management
router.get('/plans', owner_1.getPlans);
router.post('/plans', owner_1.createPlan);
router.patch('/plans/:id', owner_1.updatePlan);
router.delete('/plans/:id', owner_1.deletePlan);
// 4. Modules & Features Lookups
router.get('/modules', owner_1.getModules);
router.get('/features', owner_1.getFeatures);
// 5. Licenses Management
router.get('/licenses', owner_1.getLicenses);
router.post('/licenses', owner_1.createLicense);
router.patch('/licenses/:id', owner_1.updateLicense);
router.post('/licenses/:id/suspend', owner_1.suspendLicense);
router.post('/licenses/:id/reactivate', owner_1.reactivateLicense);
router.post('/licenses/:id/extend', owner_1.extendLicense);
router.post('/licenses/:id/convert-lifetime', owner_1.convertLicenseToLifetime);
// 6. Devices Management
router.get('/devices', owner_1.getDevices);
router.post('/devices/:id/block', owner_1.blockDevice);
router.post('/devices/:id/unblock', owner_1.unblockDevice);
// 7. Payments Management
router.get('/payments', owner_1.getPayments);
router.post('/payments', owner_1.createPayment);
// 8. Platform Audit Logs
router.get('/audit-logs', owner_1.getOwnerAuditLogs);
exports.default = router;
