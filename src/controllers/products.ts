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

export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id;
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
    const search = req.query.search as string | undefined;
    const lowStock = req.query.lowStock === 'true';
    const isActive = req.query.isActive;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const skip = (page - 1) * limit;

    const where: any = { company_id: companyId };

    if (isActive === 'true') {
      where.is_active = true;
    } else if (isActive === 'false') {
      where.is_active = false;
    }

    if (categoryId) {
      where.category_id = categoryId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { factory: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    let products: any[];
    let total = 0;

    if (lowStock) {
      let queryStr = `
        SELECT p.*
        FROM products p
        INNER JOIN product_stocks ps ON ps.product_id = p.id
        WHERE p.company_id = $1 AND ps.branch_id = $2 AND ps.stock_qty <= ps.low_stock_threshold
      `;
      const queryParams: any[] = [companyId, branchId];
      let paramCount = 3;

      if (isActive === 'true') {
        queryStr += ` AND p.is_active = true`;
      } else if (isActive === 'false') {
        queryStr += ` AND p.is_active = false`;
      }

      if (categoryId) {
        queryStr += ` AND p.category_id = $${paramCount++}`;
        queryParams.push(categoryId);
      }

      if (search) {
        queryStr += ` AND (p.name ILIKE $${paramCount} OR p.sku ILIKE $${paramCount} OR p.barcode ILIKE $${paramCount} OR p.factory ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
        queryParams.push(`%${search}%`);
        paramCount++;
      }

      const countQueryStr = `SELECT COUNT(*)::int as count FROM (${queryStr}) as count_table`;
      const countRes: any = await prisma.$queryRawUnsafe(countQueryStr, ...queryParams);
      total = countRes[0]?.count || 0;

      queryStr += ` ORDER BY p.name ASC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
      queryParams.push(limit, skip);

      const rawProducts: any[] = await prisma.$queryRawUnsafe(queryStr, ...queryParams);

      const productIds = rawProducts.map((p) => p.id);
      const productStocks = await prisma.productStock.findMany({
        where: { product_id: { in: productIds }, branch_id: branchId },
      });

      const categoryIds = rawProducts.map((p) => p.category_id).filter((id) => id !== null) as number[];
      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
      });

      products = rawProducts.map((p) => {
        const cat = categories.find((c) => c.id === p.category_id);
        const ps = productStocks.find((s) => s.product_id === p.id);
        return {
          ...p,
          category: cat || null,
          stock_qty: ps ? ps.stock_qty : 0,
          low_stock_threshold: ps ? ps.low_stock_threshold : 5,
        };
      });
    } else {
      const [data, count] = await Promise.all([
        prisma.product.findMany({
          where,
          include: {
            category: true,
            product_stocks: { where: { branch_id: branchId } },
          },
          orderBy: { name: 'asc' },
          skip,
          take: limit,
        }),
        prisma.product.count({ where }),
      ]);

      products = data.map((p) => {
        const ps = p.product_stocks[0];
        return {
          ...p,
          stock_qty: ps ? ps.stock_qty : 0,
          low_stock_threshold: ps ? ps.low_stock_threshold : 5,
          product_stocks: undefined,
        };
      });
      total = count;
    }

    const totalPages = Math.ceil(total / limit);

    return paginatedSuccess(res, products, { total, page, limit, totalPages });
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const getProductByBarcode = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id;
    const query = req.query.query as string;
    const isActive = req.query.isActive;
    if (!query) {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Search query is required');
    }

    const activeFilter = isActive === 'true' ? { is_active: true } : isActive === 'false' ? { is_active: false } : {};

    let products = await prisma.product.findMany({
      where: {
        company_id: companyId,
        ...activeFilter,
        OR: [{ barcode: query }, { sku: query }],
      },
      include: {
        category: true,
        product_stocks: { where: { branch_id: branchId } },
      },
    });

    if (products.length === 0) {
      products = await prisma.product.findMany({
        where: {
          company_id: companyId,
          ...activeFilter,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { barcode: { contains: query, mode: 'insensitive' } },
            { sku: { contains: query, mode: 'insensitive' } },
            { factory: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          category: true,
          product_stocks: { where: { branch_id: branchId } },
        },
        take: 10,
      });
    }

    const mappedProducts = products.map((p) => {
      const ps = p.product_stocks[0];
      return {
        ...p,
        stock_qty: ps ? ps.stock_qty : 0,
        low_stock_threshold: ps ? ps.low_stock_threshold : 5,
        product_stocks: undefined,
      };
    });

    return success(res, mappedProducts);
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id;
    const username = getUsername(req);
    const {
      name,
      sku,
      barcode,
      category_id,
      factory,
      description,
      cost_price,
      sell_price,
      stock_qty,
      low_stock_threshold,
      is_active,
      image_path,
    } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Product name is required');
    }

    const product = await prisma.$transaction(async (tx) => {
      const prod = await tx.product.create({
        data: {
          company_id: companyId,
          branch_id: branchId,
          name: name.trim(),
          sku: sku || null,
          barcode: barcode || null,
          category_id: category_id ? parseInt(category_id) : null,
          factory: factory || null,
          description: description || null,
          cost_price: cost_price ? parseFloat(cost_price) : 0,
          sell_price: sell_price ? parseFloat(sell_price) : 0,
          stock_qty: stock_qty ? parseInt(stock_qty) : 0,
          low_stock_threshold: low_stock_threshold ? parseInt(low_stock_threshold) : 5,
          is_active: is_active !== undefined ? Boolean(is_active) : true,
          image_path: image_path || null,
        },
      });

      const branches = await tx.branch.findMany({
        where: { company_id: companyId },
      });

      for (const b of branches) {
        await tx.productStock.create({
          data: {
            company_id: companyId,
            branch_id: b.id,
            product_id: prod.id,
            stock_qty: b.id === branchId ? (stock_qty ? parseInt(stock_qty) : 0) : 0,
            low_stock_threshold: low_stock_threshold ? parseInt(low_stock_threshold) : 5,
          },
        });
      }

      return prod;
    });

    await logUserActivity(companyId, username, 'CREATE_PRODUCT', {
      id: product.id,
      name: product.name,
      sku: product.sku,
    });

    return success(res, { ...product, stock_qty: stock_qty ? parseInt(stock_qty) : 0 }, 201);
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id;
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid product ID');
    }

    const existing = await prisma.product.findFirst({
      where: { id, company_id: companyId },
    });
    if (!existing) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Product not found');
    }

    const updateData: any = {};
    const fields = ['name', 'sku', 'barcode', 'factory', 'description', 'image_path'];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (req.body.is_active !== undefined) {
      updateData.is_active = Boolean(req.body.is_active);
    }

    if (req.body.category_id !== undefined) {
      updateData.category_id = req.body.category_id ? parseInt(req.body.category_id) : null;
    }
    if (req.body.cost_price !== undefined) {
      updateData.cost_price = parseFloat(req.body.cost_price);
    }
    if (req.body.sell_price !== undefined) {
      updateData.sell_price = parseFloat(req.body.sell_price);
    }
    if (req.body.low_stock_threshold !== undefined) {
      updateData.low_stock_threshold = req.body.low_stock_threshold ? parseInt(req.body.low_stock_threshold) : null;
    }

    const product = await prisma.$transaction(async (tx) => {
      const prod = await tx.product.update({
        where: { id },
        data: updateData,
      });

      if (req.body.stock_qty !== undefined || req.body.low_stock_threshold !== undefined) {
        await tx.productStock.upsert({
          where: {
            company_id_branch_id_product_id: {
              company_id: companyId,
              branch_id: branchId,
              product_id: id,
            },
          },
          update: {
            stock_qty: req.body.stock_qty !== undefined ? parseInt(req.body.stock_qty) : undefined,
            low_stock_threshold: req.body.low_stock_threshold !== undefined ? parseInt(req.body.low_stock_threshold) : undefined,
          },
          create: {
            company_id: companyId,
            branch_id: branchId,
            product_id: id,
            stock_qty: req.body.stock_qty !== undefined ? parseInt(req.body.stock_qty) : 0,
            low_stock_threshold: req.body.low_stock_threshold !== undefined ? parseInt(req.body.low_stock_threshold) : 5,
          },
        });
      }

      return prod;
    });

    const activeStock = await prisma.productStock.findUnique({
      where: {
        company_id_branch_id_product_id: {
          company_id: companyId,
          branch_id: branchId,
          product_id: id,
        },
      },
    });

    await logUserActivity(companyId, username, 'UPDATE_PRODUCT', {
      id: product.id,
      name: product.name,
      changes: req.body,
    });

    return success(res, {
      ...product,
      stock_qty: activeStock ? activeStock.stock_qty : 0,
      low_stock_threshold: activeStock ? activeStock.low_stock_threshold : 5,
    });
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid product ID');
    }

    const product = await prisma.product.findFirst({
      where: { id, company_id: companyId },
    });
    if (!product) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Product not found');
    }

    await prisma.product.delete({ where: { id } });

    await logUserActivity(companyId, username, 'DELETE_PRODUCT', {
      id: product.id,
      name: product.name,
    });

    return res.status(204).send();
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const adjustStock = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id;
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    const { delta } = req.body;

    if (isNaN(id)) {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid product ID');
    }

    if (delta === undefined || isNaN(parseInt(delta))) {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid stock delta');
    }

    const product = await prisma.product.findFirst({
      where: { id, company_id: companyId },
    });
    if (!product) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Product not found');
    }

    const updatedStock = await prisma.productStock.upsert({
      where: {
        company_id_branch_id_product_id: {
          company_id: companyId,
          branch_id: branchId,
          product_id: id,
        },
      },
      update: {
        stock_qty: { increment: parseInt(delta) },
      },
      create: {
        company_id: companyId,
        branch_id: branchId,
        product_id: id,
        stock_qty: parseInt(delta),
        low_stock_threshold: 5,
      },
    });

    await logUserActivity(companyId, username, 'ADJUST_STOCK', {
      id: product.id,
      name: product.name,
      delta: parseInt(delta),
      new_stock: updatedStock.stock_qty,
    });

    return success(res, {
      ...product,
      stock_qty: updatedStock.stock_qty,
      low_stock_threshold: updatedStock.low_stock_threshold,
    });
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};
