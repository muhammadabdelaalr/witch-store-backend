import { Router } from 'express';
import {
  getAllCustomers,
  createCustomer,
  updateCustomer,
  addCustomerTransaction,
  getCustomerTransactions,
  deleteCustomer,
} from '../controllers/customers';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Customers
 *   description: Customer management and transactions
 */

/**
 * @swagger
 * /api/customers:
 *   get:
 *     summary: Get all customers
 *     tags: [Customers]
 *     responses:
 *       200:
 *         description: Success
 *   post:
 *     summary: Create a customer
 *     tags: [Customers]
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
router.get('/', getAllCustomers);
router.post('/', createCustomer);

/**
 * @swagger
 * /api/customers/{id}:
 *   put:
 *     summary: Update a customer
 *     tags: [Customers]
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
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);

/**
 * @swagger
 * /api/customers/transaction:
 *   post:
 *     summary: Add a customer transaction
 *     tags: [Customers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *               - type
 *               - amount
 *             properties:
 *               customer_id:
 *                 type: integer
 *               type:
 *                 type: string
 *                 enum: [payment, debt]
 *               amount:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/transaction', addCustomerTransaction);

/**
 * @swagger
 * /api/customers/{id}/transactions:
 *   get:
 *     summary: Get transactions for a customer
 *     tags: [Customers]
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
router.get('/:id/transactions', getCustomerTransactions);

export default router;
