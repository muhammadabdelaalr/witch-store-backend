import { Request, Response } from 'express';
import { prisma, logUserActivity, getUsername } from '../prisma';

export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
    const search = req.query.search as string | undefined;
    const lowStock = req.query.lowStock === 'true';
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const skip = (page - 1) * limit;

    const where: any = {};

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

    if (lowStock) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { stock_qty: { lte: 0 } },
            {
              stock_qty: {
                lte: prisma.product.fields.low_stock_threshold
              }
            }
          ]
        }
      ];
    }

    let products: any[];
    let total = 0;

    if (lowStock) {
      let queryStr = `SELECT p.* FROM products p WHERE p.stock_qty <= COALESCE(p.low_stock_threshold, 5)`;
      const queryParams: any[] = [];
      let paramCount = 1;

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

      products = await prisma.$queryRawUnsafe(queryStr, ...queryParams);
    } else {
      const [data, count] = await Promise.all([
        prisma.product.findMany({
          where,
          include: { category: true },
          orderBy: { name: 'asc' },
          skip,
          take: limit,
        }),
        prisma.product.count({ where }),
      ]);
      products = data;
      total = count;
    }

    const totalPages = Math.ceil(total / limit);

    res.json({
      data: products,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getProductByBarcode = async (req: Request, res: Response) => {
  try {
    const query = req.query.query as string;
    if (!query) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    let products: any[] = await prisma.product.findMany({
      where: {
        OR: [
          { barcode: query },
          { sku: query },
        ]
      },
      include: { category: true }
    });

    if (products.length === 0) {
      products = await prisma.product.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { barcode: { contains: query, mode: 'insensitive' } },
            { sku: { contains: query, mode: 'insensitive' } },
            { factory: { contains: query, mode: 'insensitive' } },
          ]
        },
        include: { category: true },
        take: 10,
      });
    }

    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
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
      image_path,
    } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Product name is required' });
      return;
    }

    const product = await prisma.product.create({
      data: {
        name,
        sku: sku || null,
        barcode: barcode || null,
        category_id: category_id ? parseInt(category_id) : null,
        factory: factory || null,
        description: description || null,
        cost_price: cost_price ? parseFloat(cost_price) : 0,
        sell_price: sell_price ? parseFloat(sell_price) : 0,
        stock_qty: stock_qty ? parseInt(stock_qty) : 0,
        low_stock_threshold: low_stock_threshold ? parseInt(low_stock_threshold) : 5,
        image_path: image_path || null,
      },
    });

    await logUserActivity(username, 'CREATE_PRODUCT', {
      id: product.id,
      name: product.name,
      sku: product.sku,
    });

    res.status(201).json(product);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    const updateData: any = {};
    const fields = [
      'name',
      'sku',
      'barcode',
      'factory',
      'description',
      'image_path',
    ];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (req.body.category_id !== undefined) {
      updateData.category_id = req.body.category_id ? parseInt(req.body.category_id) : null;
    }
    if (req.body.cost_price !== undefined) {
      updateData.cost_price = parseFloat(req.body.cost_price);
    }
    if (req.body.sell_price !== undefined) {
      updateData.sell_price = parseFloat(req.body.sell_price);
    }
    if (req.body.stock_qty !== undefined) {
      updateData.stock_qty = parseInt(req.body.stock_qty);
    }
    if (req.body.low_stock_threshold !== undefined) {
      updateData.low_stock_threshold = req.body.low_stock_threshold ? parseInt(req.body.low_stock_threshold) : null;
    }

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
    });

    await logUserActivity(username, 'UPDATE_PRODUCT', {
      id: product.id,
      name: product.name,
      changes: req.body,
    });

    res.json(product);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    await prisma.product.delete({
      where: { id },
    });

    await logUserActivity(username, 'DELETE_PRODUCT', {
      id: product.id,
      name: product.name,
    });

    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const adjustStock = async (req: Request, res: Response) => {
  try {
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    const { delta } = req.body;

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    if (delta === undefined || isNaN(parseInt(delta))) {
      res.status(400).json({ error: 'Invalid stock delta' });
      return;
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        stock_qty: {
          increment: parseInt(delta),
        },
      },
    });

    await logUserActivity(username, 'ADJUST_STOCK', {
      id: product.id,
      name: product.name,
      delta: parseInt(delta),
      new_stock: product.stock_qty,
    });

    res.json(product);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
