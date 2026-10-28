import { Router } from 'express';
import {
  getDashboardStats,
  getSalesReport,
  getProfitReport,
} from '../controllers/reports';
import { authTokenMiddleware, requireUserSession } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { requireModule } from '../middleware/guards';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../utils/permissions';
import { reportQuerySchema, validateQuery } from '../middleware/validate';

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);
router.use(requireUserSession);

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Reporting and dashboard stats
 */

/**
 * @swagger
 * /api/v1/reports/dashboard:
 *   get:
 *     summary: Get dashboard stats
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/dashboard', requireModule('dashboard'), requirePermission(PERMISSIONS.REPORT_READ), validateQuery(reportQuerySchema), getDashboardStats);

/**
 * @swagger
 * /api/v1/reports/sales:
 *   get:
 *     summary: Get sales report
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/sales', requireModule('reports'), requirePermission(PERMISSIONS.REPORT_READ), validateQuery(reportQuerySchema), getSalesReport);

/**
 * @swagger
 * /api/v1/reports/profit:
 *   get:
 *     summary: Get profit report
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/profit', requireModule('reports'), requirePermission(PERMISSIONS.REPORT_READ), validateQuery(reportQuerySchema), getProfitReport);

export default router;
