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
  rateLimitMiddleware(15 * 60 * 1000, 15), // 15 mins, 15 attempts max
  ownerLogin
);

router.post('/auth/refresh-token', ownerRefreshToken);

// Apply Owner Authentication middleware to all subsequent routes
router.use(ownerAuthMiddleware);

// 1.5 Dashboard & Lookups
router.get('/dashboard', getDashboardStats);
router.get('/lookups', getLookups);

// 2. Companies Management
router.get('/companies', getCompanies);
router.post('/companies', createCompany);
router.patch('/companies/:id', updateCompany);
router.patch('/companies/:id/status', updateCompanyStatus);
router.delete('/companies/:id', deleteCompany);

// 3. Plans Management
router.get('/plans', getPlans);
router.post('/plans', createPlan);
router.patch('/plans/:id', updatePlan);
router.delete('/plans/:id', deletePlan);

// 4. Modules & Features Lookups
router.get('/modules', getModules);
router.get('/features', getFeatures);

// 5. Licenses Management
router.get('/licenses', getLicenses);
router.post('/licenses', createLicense);
router.patch('/licenses/:id', updateLicense);
router.post('/licenses/:id/suspend', suspendLicense);
router.post('/licenses/:id/reactivate', reactivateLicense);
router.post('/licenses/:id/extend', extendLicense);
router.post('/licenses/:id/convert-lifetime', convertLicenseToLifetime);

// 6. Devices Management
router.get('/devices', getDevices);
router.post('/devices/:id/block', blockDevice);
router.post('/devices/:id/unblock', unblockDevice);

// 7. Payments Management
router.get('/payments', getPayments);
router.post('/payments', createPayment);

// 8. Platform Audit Logs
router.get('/audit-logs', getOwnerAuditLogs);

export default router;
