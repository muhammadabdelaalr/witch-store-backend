"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteExpense = exports.updateExpense = exports.createExpense = exports.getAllExpenses = void 0;
const prisma_1 = require("../prisma");
const getAllExpenses = async (req, res) => {
    try {
        const { from, to, category, page = 1, limit = 10 } = req.query;
        const pageInt = parseInt(page);
        const limitInt = parseInt(limit);
        const skip = (pageInt - 1) * limitInt;
        const where = {};
        if (category) {
            where.category = category;
        }
        if (from || to) {
            where.date = {};
            if (from) {
                where.date.gte = from;
            }
            if (to) {
                where.date.lte = to;
            }
        }
        const [expenses, total] = await Promise.all([
            prisma_1.prisma.expense.findMany({
                where,
                orderBy: { date: 'desc' },
                skip,
                take: limitInt,
            }),
            prisma_1.prisma.expense.count({ where }),
        ]);
        const totalPages = Math.ceil(total / limitInt);
        res.json({
            data: expenses,
            total,
            page: pageInt,
            limit: limitInt,
            totalPages,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getAllExpenses = getAllExpenses;
const createExpense = async (req, res) => {
    try {
        const { category_id, category, amount, description, date } = req.body;
        if (!category || amount === undefined || !date) {
            res.status(400).json({ error: 'Category, amount, and date are required' });
            return;
        }
        const expense = await prisma_1.prisma.expense.create({
            data: {
                category_id: category_id ? parseInt(category_id) : null,
                category,
                amount: parseFloat(amount),
                description: description || null,
                date, // Expected format YYYY-MM-DD
            },
        });
        res.status(201).json(expense);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createExpense = createExpense;
const updateExpense = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid expense ID' });
            return;
        }
        const updateData = {};
        const fields = ['category', 'description', 'date'];
        fields.forEach((field) => {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        });
        if (req.body.category_id !== undefined) {
            updateData.category_id = req.body.category_id ? parseInt(req.body.category_id) : null;
        }
        if (req.body.amount !== undefined) {
            updateData.amount = parseFloat(req.body.amount);
        }
        const expense = await prisma_1.prisma.expense.update({
            where: { id },
            data: updateData,
        });
        res.json(expense);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateExpense = updateExpense;
const deleteExpense = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid expense ID' });
            return;
        }
        await prisma_1.prisma.expense.delete({
            where: { id },
        });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.deleteExpense = deleteExpense;
