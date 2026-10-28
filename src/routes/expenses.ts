import { Router } from 'express';
import {
  getAllExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} from '../controllers/expenses';
import { authTokenMiddleware, requireUserSession } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { requireModule } from '../middleware/guards';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../utils/permissions';
import { expenseListQuerySchema, expenseSchema, idParamSchema, updateExpenseSchema, validateBody, validateParams, validateQuery } from '../middleware/validate';

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);
router.use(requireUserSession);
router.use(requireModule('expenses'));

/**
 * @swagger
 * tags:
 *   name: Expenses
 *   description: Expense management
 */

/**
 * @swagger
 * /api/v1/expenses:
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
router.get('/', requirePermission(PERMISSIONS.EXPENSE_READ), validateQuery(expenseListQuerySchema), getAllExpenses);
router.post('/', requirePermission(PERMISSIONS.EXPENSE_CREATE), validateBody(expenseSchema), createExpense);

/**
 * @swagger
 * /api/v1/expenses/{id}:
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
router.put('/:id', requirePermission(PERMISSIONS.EXPENSE_UPDATE), validateParams(idParamSchema), validateBody(updateExpenseSchema), updateExpense);
router.delete('/:id', requirePermission(PERMISSIONS.EXPENSE_DELETE), validateParams(idParamSchema), deleteExpense);

export default router;
