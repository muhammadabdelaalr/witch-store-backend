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

const router = Router();

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
router.get('/', getAllSuppliers);
router.post('/', createSupplier);

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
router.put('/:id', updateSupplier);

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
router.post('/transaction', addSupplierTransaction);

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
router.get('/:id/transactions', getSupplierTransactions);

router.post('/invoices', createSupplierInvoice);
router.put('/invoices/:id', updateSupplierInvoice);
router.get('/invoices', getSupplierInvoices);
router.get('/invoices/:id/history', getSupplierInvoiceHistory);

export default router;
