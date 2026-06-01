"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const expenses_1 = require("../controllers/expenses");
const router = (0, express_1.Router)();
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
router.get('/', expenses_1.getAllExpenses);
router.post('/', expenses_1.createExpense);
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
router.put('/:id', expenses_1.updateExpense);
router.delete('/:id', expenses_1.deleteExpense);
exports.default = router;
