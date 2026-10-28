import { Router } from 'express';
import {
  getAllCustomers,
  createCustomer,
  updateCustomer,
  addCustomerTransaction,
  getCustomerTransactions,
  deleteCustomer,
} from '../controllers/customers';
import { authTokenMiddleware, requireUserSession } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { requireModule } from '../middleware/guards';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../utils/permissions';
import { customerTransactionSchema, idParamSchema, listQuerySchema, partySchema, updatePartySchema, validateBody, validateParams, validateQuery } from '../middleware/validate';

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);
router.use(requireUserSession);
router.use(requireModule('customers'));

/**
 * @swagger
 * tags:
 *   name: Customers
 *   description: Customer management and transactions
 */

/**
 * @swagger
 * /api/v1/customers:
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
router.get('/', requirePermission(PERMISSIONS.CUSTOMER_READ), validateQuery(listQuerySchema), getAllCustomers);
router.post('/', requirePermission(PERMISSIONS.CUSTOMER_CREATE), validateBody(partySchema), createCustomer);

/**
 * @swagger
 * /api/v1/customers/{id}:
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
router.put('/:id', requirePermission(PERMISSIONS.CUSTOMER_UPDATE), validateParams(idParamSchema), validateBody(updatePartySchema), updateCustomer);
router.delete('/:id', requirePermission(PERMISSIONS.CUSTOMER_DELETE), validateParams(idParamSchema), deleteCustomer);

/**
 * @swagger
 * /api/v1/customers/transaction:
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
router.post('/transaction', requirePermission(PERMISSIONS.CUSTOMER_PAYMENT), validateBody(customerTransactionSchema), addCustomerTransaction);

/**
 * @swagger
 * /api/v1/customers/{id}/transactions:
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
router.get('/:id/transactions', requirePermission(PERMISSIONS.CUSTOMER_READ), validateParams(idParamSchema), getCustomerTransactions);

export default router;
