import { Request, Response } from 'express';
import { prisma } from '../prisma';

export const getAllExpenses = async (req: Request, res: Response) => {
  try {
    const { from, to, category, page = 1, limit = 10 } = req.query;
    const pageInt = parseInt(page as string);
    const limitInt = parseInt(limit as string);
    const skip = (pageInt - 1) * limitInt;

    const where: any = {};

    if (category) {
      where.category = category as string;
    }

    if (from || to) {
      where.date = {};
      if (from) {
        where.date.gte = from as string;
      }
      if (to) {
        where.date.lte = to as string;
      }
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limitInt,
      }),
      prisma.expense.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limitInt);

    res.json({
      data: expenses,
      total,
      page: pageInt,
      limit: limitInt,
      totalPages,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createExpense = async (req: Request, res: Response) => {
  try {
    const { category_id, category, amount, description, date } = req.body;

    if (!category || amount === undefined || !date) {
      res.status(400).json({ error: 'Category, amount, and date are required' });
      return;
    }

    const expense = await prisma.expense.create({
      data: {
        category_id: category_id ? parseInt(category_id) : null,
        category,
        amount: parseFloat(amount),
        description: description || null,
        date, // Expected format YYYY-MM-DD
      },
    });

    res.status(201).json(expense);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateExpense = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid expense ID' });
      return;
    }

    const updateData: any = {};
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

    const expense = await prisma.expense.update({
      where: { id },
      data: updateData,
    });

    res.json(expense);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteExpense = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid expense ID' });
      return;
    }

    await prisma.expense.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
