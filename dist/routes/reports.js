"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reports_1 = require("../controllers/reports");
const router = (0, express_1.Router)();
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
router.get('/dashboard', reports_1.getDashboardStats);
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
router.get('/sales', reports_1.getSalesReport);
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
router.get('/profit', reports_1.getProfitReport);
exports.default = router;
