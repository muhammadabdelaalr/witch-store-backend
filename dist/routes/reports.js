"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reports_1 = require("../controllers/reports");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const guards_1 = require("../middleware/guards");
const router = (0, express_1.Router)();
router.use(auth_1.authTokenMiddleware);
router.use(tenant_1.tenantResolverMiddleware);
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
router.get('/dashboard', (0, guards_1.requireModule)('dashboard'), reports_1.getDashboardStats);
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
router.get('/sales', (0, guards_1.requireModule)('reports'), reports_1.getSalesReport);
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
router.get('/profit', (0, guards_1.requireModule)('reports'), reports_1.getProfitReport);
exports.default = router;
