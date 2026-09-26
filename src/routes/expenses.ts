import { Router } from 'express';
import {
  getAllExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} from '../controllers/expenses';
import { authTokenMiddleware } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { requireModule } from '../middleware/guards';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../utils/permissions';

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);
router.use(requireModule('expenses'));

/**
 * @swagger
 * tags:
 *   name: Expenses
 *   description: Expense management
 */

/**
 * @swagger
 * /api/expenses:
 *   get:
 *     summary: Get all expenses
 *     tags: [Expenses]
 *     responses:
 *       200:
 *         description: Success
 *   post:
 *     summary: Create an expense
 *     tags: [Expenses]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category
 *               - amount
 *               - date
 *             properties:
 *               category_id:
 *                 type: integer
 *               category:
 *                 type: string
 *               amount:
 *                 type: number
 *               description:
 *                 type: string
 *               date:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/', requirePermission(PERMISSIONS.EXPENSE_READ), getAllExpenses);
router.post('/', requirePermission(PERMISSIONS.EXPENSE_CREATE), createExpense);

/**
 * @swagger
 * /api/expenses/{id}:
 *   put:
 *     summary: Update an expense
 *     tags: [Expenses]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category_id:
 *                 type: integer
 *               category:
 *                 type: string
 *               amount:
 *                 type: number
 *               description:
 *                 type: string
 *               date:
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
 *   delete:
 *     summary: Delete an expense
 *     tags: [Expenses]
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
router.put('/:id', requirePermission(PERMISSIONS.EXPENSE_UPDATE), updateExpense);
router.delete('/:id', requirePermission(PERMISSIONS.EXPENSE_DELETE), deleteExpense);

export default router;
