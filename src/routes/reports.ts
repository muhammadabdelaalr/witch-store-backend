import { Router } from 'express';
import {
  getDashboardStats,
  getSalesReport,
  getProfitReport,
} from '../controllers/reports';
import { authTokenMiddleware } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { requireModule } from '../middleware/guards';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../utils/permissions';

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Reporting and dashboard stats
 */

/**
 * @swagger
 * /api/reports/dashboard:
 *   get:
 *     summary: Get dashboard stats
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/dashboard', requireModule('dashboard'), requirePermission(PERMISSIONS.REPORT_READ), getDashboardStats);

/**
 * @swagger
 * /api/reports/sales:
 *   get:
 *     summary: Get sales report
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/sales', requireModule('reports'), requirePermission(PERMISSIONS.REPORT_READ), getSalesReport);

/**
 * @swagger
 * /api/reports/profit:
 *   get:
 *     summary: Get profit report
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/profit', requireModule('reports'), requirePermission(PERMISSIONS.REPORT_READ), getProfitReport);

export default router;
