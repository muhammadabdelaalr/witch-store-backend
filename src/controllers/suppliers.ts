import { Request, Response } from 'express';
import { prisma, logUserActivity, getUsername } from '../prisma';

export const getAllSuppliers = async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.supplier.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      data: suppliers,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createSupplier = async (req: Request, res: Response) => {
  try {
    const username = getUsername(req);
    const { name, phone, email, address, balance } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Supplier name is required' });
      return;
    }

    const supplier = await prisma.supplier.create({
      data: {
        name,
        phone: phone || null,
        email: email || null,
        address: address || null,
        balance: balance ? parseFloat(balance) : 0,
      },
    });

    await logUserActivity(username, 'CREATE_SUPPLIER', {
      id: supplier.id,
      name: supplier.name,
    });

    res.status(201).json(supplier);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateSupplier = async (req: Request, res: Response) => {
  try {
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid supplier ID' });
      return;
    }

    const updateData: any = {};
    const fields = ['name', 'phone', 'email', 'address'];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (req.body.balance !== undefined) {
      updateData.balance = parseFloat(req.body.balance);
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: updateData,
    });

    await logUserActivity(username, 'UPDATE_SUPPLIER', {
      id: supplier.id,
      name: supplier.name,
      changes: req.body,
    });

    res.json(supplier);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const addSupplierTransaction = async (req: Request, res: Response) => {
  try {
    const username = getUsername(req);
    const { supplier_id, type, amount, notes } = req.body;

    if (!supplier_id || !type || amount === undefined) {
      res.status(400).json({ error: 'supplier_id, type, and amount are required' });
      return;
    }

    if (type !== 'payment' && type !== 'purchase') {
      res.status(400).json({ error: 'Type must be payment or purchase' });
      return;
    }

    const supplierIdInt = parseInt(supplier_id);
    const amountFloat = parseFloat(amount);

    const transaction = await prisma.$transaction(async (tx: any) => {
      // 1. Verify supplier exists
      const supplier = await tx.supplier.findUnique({
        where: { id: supplierIdInt },
      });
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // 2. Create supplier transaction
      const newTx = await tx.supplierTransaction.create({
        data: {
          supplier_id: supplierIdInt,
          type,
          amount: amountFloat,
          notes: notes || null,
        },
      });

      // 3. Update supplier balance
      const balanceDelta = type === 'payment' ? -amountFloat : amountFloat;

      await tx.supplier.update({
        where: { id: supplierIdInt },
        data: {
          balance: {
            increment: balanceDelta,
          },
        },
      });

      return newTx;
    });

    await logUserActivity(username, 'SUPPLIER_TRANSACTION', {
      supplier_id: supplierIdInt,
      type,
      amount: amountFloat,
    });

    res.status(201).json(transaction);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getSupplierTransactions = async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.params.id as string);
    if (isNaN(supplierId)) {
      res.status(400).json({ error: 'Invalid supplier ID' });
      return;
    }

    const transactions = await prisma.supplierTransaction.findMany({
      where: { supplier_id: supplierId },
      orderBy: { created_at: 'desc' },
    });

    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
