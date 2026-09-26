import { Request, Response } from 'express';
import { prisma, logUserActivity, getUsername } from '../prisma';

function success<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

function paginatedSuccess<T>(res: Response, data: T[], meta: { total: number; page: number; limit: number; totalPages: number }) {
  return res.json({ success: true, data, meta });
}

function errorResponse(res: Response, status: number, code: string, message: string, details?: any) {
  return res.status(status).json({ success: false, code, message, details });
}

export const getAllCategories = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const categories = await prisma.category.findMany({
      where: { company_id: companyId },
      orderBy: { name: 'asc' },
    });
    return success(res, categories);
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const createCategory = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Category name is required');
    }
    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        company_id: companyId,
      },
    });
    await logUserActivity(companyId, username, 'CREATE_CATEGORY', {
      id: category.id,
      name: category.name,
    });
    return success(res, category, 201);
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};
