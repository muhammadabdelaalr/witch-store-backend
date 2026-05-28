import { Request, Response } from 'express';
import { prisma } from '../prisma';

export const getAllCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: {
        name: 'asc',
      },
    });
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Category name is required' });
      return;
    }
    const category = await prisma.category.create({
      data: { name },
    });
    res.status(201).json(category);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
