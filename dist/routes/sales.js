"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sales_1 = require("../controllers/sales");
const refunds_1 = require("../controllers/refunds");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const guards_1 = require("../middleware/guards");
const router = (0, express_1.Router)();
router.use(auth_1.authTokenMiddleware);
router.use(tenant_1.tenantResolverMiddleware);
/**
 * @swagger
 * tags:
 *   name: Sales
 *   description: Sales management
 */
/**
 * @swagger
 * /api/sales:
 *   post:
 *     summary: Create a sale
 *     tags: [Sales]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - total
 *               - amount_paid
 *               - payment_method
 *               - items
 *             properties:
 *               customer_id:
 *                 type: integer
 *               total:
 *                 type: number
 *               discount:
 *                 type: number
 *               tax:
 *                 type: number
 *               amount_paid:
 *                 type: number
 *               payment_method:
 *                 type: string
 *               sale_type:
 *                 type: string
 *                 enum: [retail, wholesale]
 *               notes:
 *                 type: string
 *               seller_name:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product_id:
 *                       type: integer
 *                     qty:
 *                       type: integer
 *                     unit_price:
 *                       type: number
 *                     cost_price:
 *                       type: number
 *     responses:
 *       200:
 *         description: Success
 *   get:
 *     summary: Get all sales
 *     tags: [Sales]
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/', (0, guards_1.requireModule)('pos'), sales_1.createSale);
router.get('/', (0, guards_1.requireModule)('pos'), sales_1.getAllSales);
/**
 * @swagger
 * /api/sales/{id}:
 *   get:
 *     summary: Get a sale by ID
 *     tags: [Sales]
 *     responses:
 *       200:
 *         description: Success
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/:id', (0, guards_1.requireModule)('pos'), sales_1.getSaleById);
/**
 * @swagger
 * /api/sales/{id}/refund:
 *   post:
 *     summary: Refund a sale
 *     tags: [Refunds]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *               seller_name:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product_id:
 *                       type: integer
 *                     qty:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Success
 */
router.post('/:id/refund', (0, guards_1.requireModule)('refunds'), refunds_1.createRefund);
exports.default = router;
