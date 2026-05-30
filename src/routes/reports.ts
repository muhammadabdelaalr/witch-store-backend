import { Router } from 'express';
import {
  getDashboardStats,
  getSalesReport,
  getProfitReport,
} from '../controllers/reports';

const router = Router();

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
router.get('/dashboard', getDashboardStats);

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
router.get('/sales', getSalesReport);

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
router.get('/profit', getProfitReport);

export default router;
