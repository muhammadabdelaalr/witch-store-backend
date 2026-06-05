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
    const { supplier_id, type, amount, notes, date, seller_name, invoice_id } = req.body;

    if (!supplier_id || !type || amount === undefined) {
      res.status(400).json({ error: 'supplier_id, type, and amount are required' });
      return;
    }

    if (!notes || notes.trim() === '') {
      res.status(400).json({ error: 'Notes are required for all supplier transactions' });
      return;
    }

    if (type !== 'payment' && type !== 'purchase') {
      res.status(400).json({ error: 'Type must be payment or purchase' });
      return;
    }

    const supplierIdInt = parseInt(supplier_id);
    const amountFloat = parseFloat(amount);
    const invoiceIdInt = invoice_id ? parseInt(invoice_id) : undefined;

    const transaction = await prisma.$transaction(async (tx: any) => {
      // 1. Verify supplier exists
      const supplier = await tx.supplier.findUnique({
        where: { id: supplierIdInt },
      });
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // If invoice_id is provided, verify it exists and belongs to this supplier
      let invoice = null;
      if (invoiceIdInt) {
        invoice = await tx.supplierInvoice.findUnique({
          where: { id: invoiceIdInt },
        });
        if (!invoice) {
          throw new Error('Supplier invoice not found');
        }
        if (invoice.supplier_id !== supplierIdInt) {
          throw new Error('Invoice does not belong to this supplier');
        }
      }

      // 2. Create supplier transaction
      const newTx = await tx.supplierTransaction.create({
        data: {
          supplier_id: supplierIdInt,
          type,
          amount: amountFloat,
          notes: notes.trim(),
          seller_name: seller_name || null,
          invoice_id: invoiceIdInt || null,
          created_at: date ? new Date(date) : new Date(),
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

      // 4. If linked to an invoice and is a payment, update the invoice's amount_paid
      if (invoice && type === 'payment') {
        const updatedInvoice = await tx.supplierInvoice.update({
          where: { id: invoiceIdInt },
          data: {
            amount_paid: {
              increment: amountFloat,
            },
          },
        });

        // Create a history log entry for the invoice
        await tx.supplierInvoiceHistory.create({
          data: {
            invoice_id: invoiceIdInt!,
            seller_name: seller_name || 'سيستم',
            action: 'edit',
            changes: `تسجيل سداد بقيمة ${amountFloat} ج.م - المدفوع الجديد: ${updatedInvoice.amount_paid} ج.م | [ملاحظة: ${notes.trim()}]`,
            created_at: new Date(),
          },
        });
      }

      return newTx;
    });

    await logUserActivity(username, 'SUPPLIER_TRANSACTION', {
      supplier_id: supplierIdInt,
      type,
      amount: amountFloat,
      invoice_id: invoiceIdInt,
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
