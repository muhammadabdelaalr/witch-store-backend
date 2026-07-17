"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const suppliers_1 = require("../controllers/suppliers");
const supplierInvoices_1 = require("../controllers/supplierInvoices");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const guards_1 = require("../middleware/guards");
const router = (0, express_1.Router)();
router.use(auth_1.authTokenMiddleware);
router.use(tenant_1.tenantResolverMiddleware);
/**
 * @swagger
 * tags:
 *   name: Suppliers
 *   description: Supplier management and transactions
 */
/**
 * @swagger
 * /api/suppliers:
 *   get:
 *     summary: Get all suppliers
 *     tags: [Suppliers]
 *     responses:
 *       200:
 *         description: Success
 *   post:
 *     summary: Create a supplier
 *     tags: [Suppliers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               address:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/', (0, guards_1.requireModule)('suppliers'), suppliers_1.getAllSuppliers);
router.post('/', (0, guards_1.requireModule)('suppliers'), suppliers_1.createSupplier);
/**
 * @swagger
 * /api/suppliers/{id}:
 *   put:
 *     summary: Update a supplier
 *     tags: [Suppliers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               address:
 *                 type: string
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
router.put('/:id', (0, guards_1.requireModule)('suppliers'), suppliers_1.updateSupplier);
/**
 * @swagger
 * /api/suppliers/transaction:
 *   post:
 *     summary: Add a supplier transaction
 *     tags: [Suppliers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - supplier_id
 *               - type
 *               - amount
 *             properties:
 *               supplier_id:
 *                 type: integer
 *               type:
 *                 type: string
 *                 enum: [payment, purchase]
 *               amount:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/transaction', (0, guards_1.requireModule)('suppliers'), suppliers_1.addSupplierTransaction);
/**
 * @swagger
 * /api/suppliers/{id}/transactions:
 *   get:
 *     summary: Get transactions for a supplier
 *     tags: [Suppliers]
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
router.get('/:id/transactions', (0, guards_1.requireModule)('suppliers'), suppliers_1.getSupplierTransactions);
router.post('/invoices', (0, guards_1.requireModule)('supplier_invoices'), supplierInvoices_1.createSupplierInvoice);
router.put('/invoices/:id', (0, guards_1.requireModule)('supplier_invoices'), supplierInvoices_1.updateSupplierInvoice);
router.get('/invoices', (0, guards_1.requireModule)('supplier_invoices'), supplierInvoices_1.getSupplierInvoices);
router.get('/invoices/:id/history', (0, guards_1.requireModule)('supplier_invoices'), supplierInvoices_1.getSupplierInvoiceHistory);
exports.default = router;
