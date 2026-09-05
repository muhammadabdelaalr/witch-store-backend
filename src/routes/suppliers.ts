import { Router } from 'express';
import {
  getAllSuppliers,
  createSupplier,
  updateSupplier,
  addSupplierTransaction,
  getSupplierTransactions,
} from '../controllers/suppliers';
import {
  createSupplierInvoice,
  updateSupplierInvoice,
  getSupplierInvoices,
  getSupplierInvoiceHistory,
} from '../controllers/supplierInvoices';
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
router.get('/', requireModule('suppliers'), requirePermission(PERMISSIONS.SUPPLIER_READ), getAllSuppliers);
router.post('/', requireModule('suppliers'), requirePermission(PERMISSIONS.SUPPLIER_CREATE), createSupplier);

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
router.put('/:id', requireModule('suppliers'), requirePermission(PERMISSIONS.SUPPLIER_UPDATE), updateSupplier);

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
router.post('/transaction', requireModule('suppliers'), requirePermission(PERMISSIONS.SUPPLIER_PAYMENT), addSupplierTransaction);

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
router.get('/:id/transactions', requireModule('suppliers'), requirePermission(PERMISSIONS.SUPPLIER_READ), getSupplierTransactions);

router.post('/invoices', requireModule('supplier_invoices'), requirePermission(PERMISSIONS.SUPPLIER_INVOICE_CREATE), createSupplierInvoice);
router.put('/invoices/:id', requireModule('supplier_invoices'), requirePermission(PERMISSIONS.SUPPLIER_INVOICE_UPDATE), updateSupplierInvoice);
router.get('/invoices', requireModule('supplier_invoices'), requirePermission(PERMISSIONS.SUPPLIER_READ), getSupplierInvoices);
router.get('/invoices/:id/history', requireModule('supplier_invoices'), requirePermission(PERMISSIONS.SUPPLIER_READ), getSupplierInvoiceHistory);

export default router;
