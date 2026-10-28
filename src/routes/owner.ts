import { Router } from 'express';
import {
  ownerLogin,
  ownerRefreshToken,
  getCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getModules,
  getFeatures,
  getLicenses,
  createLicense,
  updateLicense,
  suspendLicense,
  reactivateLicense,
  extendLicense,
  convertLicenseToLifetime,
  getDevices,
  blockDevice,
  unblockDevice,
  getPayments,
  createPayment,
  getOwnerAuditLogs,
  getDashboardStats,
  getLookups,
  updateCompanyStatus
} from '../controllers/owner';
import { ownerAuthMiddleware, rateLimitMiddleware } from '../middleware/auth';
import { companyStatusSchema, emptyBodySchema, extendLicenseSchema, idParamSchema, listQuerySchema, ownerCompanySchema, ownerLicenseSchema, ownerLoginSchema, ownerPaymentSchema, ownerPlanSchema, refreshTokenSchema, updateOwnerCompanySchema, updateOwnerLicenseSchema, updateOwnerPlanSchema, validateBody, validateParams, validateQuery } from '../middleware/validate';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Owner Dashboard
 *   description: Owner SaaS control panel operations
 */

// 1. Authentication (Rate limited, no auth middleware needed)
router.post(
  '/auth/login',
  rateLimitMiddleware(15 * 60 * 1000, 15, 'owner-login'),
  validateBody(ownerLoginSchema),
  ownerLogin
);

router.post('/auth/refresh-token', rateLimitMiddleware(15 * 60 * 1000, 50, 'owner-refresh'), validateBody(refreshTokenSchema), ownerRefreshToken);

// Apply Owner Authentication middleware to all subsequent routes
router.use(ownerAuthMiddleware);

// 1.5 Dashboard & Lookups
router.get('/dashboard', getDashboardStats);
router.get('/lookups', getLookups);

// 2. Companies Management
router.get('/companies', validateQuery(listQuerySchema), getCompanies);
router.post('/companies', validateBody(ownerCompanySchema), createCompany);
router.patch('/companies/:id', validateParams(idParamSchema), validateBody(updateOwnerCompanySchema), updateCompany);
router.patch('/companies/:id/status', validateParams(idParamSchema), validateBody(companyStatusSchema), updateCompanyStatus);
router.delete('/companies/:id', validateParams(idParamSchema), deleteCompany);

// 3. Plans Management
router.get('/plans', validateQuery(listQuerySchema), getPlans);
router.post('/plans', validateBody(ownerPlanSchema), createPlan);
router.patch('/plans/:id', validateParams(idParamSchema), validateBody(updateOwnerPlanSchema), updatePlan);
router.delete('/plans/:id', validateParams(idParamSchema), deletePlan);

// 4. Modules & Features Lookups
router.get('/modules', getModules);
router.get('/features', getFeatures);

// 5. Licenses Management
router.get('/licenses', validateQuery(listQuerySchema), getLicenses);
router.post('/licenses', validateBody(ownerLicenseSchema), createLicense);
router.patch('/licenses/:id', validateParams(idParamSchema), validateBody(updateOwnerLicenseSchema), updateLicense);
router.post('/licenses/:id/suspend', validateParams(idParamSchema), validateBody(emptyBodySchema), suspendLicense);
router.post('/licenses/:id/reactivate', validateParams(idParamSchema), validateBody(emptyBodySchema), reactivateLicense);
router.post('/licenses/:id/extend', validateParams(idParamSchema), validateBody(extendLicenseSchema), extendLicense);
router.post('/licenses/:id/convert-lifetime', validateParams(idParamSchema), validateBody(emptyBodySchema), convertLicenseToLifetime);

// 6. Devices Management
router.get('/devices', validateQuery(listQuerySchema), getDevices);
router.post('/devices/:id/block', validateParams(idParamSchema), validateBody(emptyBodySchema), blockDevice);
router.post('/devices/:id/unblock', validateParams(idParamSchema), validateBody(emptyBodySchema), unblockDevice);

// 7. Payments Management
router.get('/payments', validateQuery(listQuerySchema), getPayments);
router.post('/payments', validateBody(ownerPaymentSchema), createPayment);

// 8. Platform Audit Logs
router.get('/audit-logs', validateQuery(listQuerySchema), getOwnerAuditLogs);

export default router;
