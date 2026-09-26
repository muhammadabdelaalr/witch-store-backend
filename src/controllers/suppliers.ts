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

export const getAllSuppliers = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const search = req.query.search as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const skip = (page - 1) * limit;

    const where: any = { company_id: companyId };

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

    return paginatedSuccess(res, suppliers, { total, page, limit, totalPages });
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const createSupplier = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const { name, phone, email, address, balance } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Supplier name is required');
    }

    const supplier = await prisma.supplier.create({
      data: {
        company_id: companyId,
        name: name.trim(),
        phone: phone || null,
        email: email || null,
        address: address || null,
        balance: balance ? parseFloat(balance) : 0,
      },
    });

    await logUserActivity(companyId, username, 'CREATE_SUPPLIER', {
      id: supplier.id,
      name: supplier.name,
    });

    return success(res, supplier, 201);
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const updateSupplier = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid supplier ID');
    }

    const existing = await prisma.supplier.findFirst({
      where: { id, company_id: companyId },
    });
    if (!existing) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Supplier not found');
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

    await logUserActivity(companyId, username, 'UPDATE_SUPPLIER', {
      id: supplier.id,
      name: supplier.name,
      changes: req.body,
    });

    return success(res, supplier);
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const addSupplierTransaction = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const { supplier_id, type, amount, notes, date, seller_name, invoice_id } = req.body;

    if (!supplier_id || !type || amount === undefined) {
      return errorResponse(res, 400, 'BAD_REQUEST', 'supplier_id, type, and amount are required');
    }

    if (!notes || notes.trim() === '') {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Notes are required for all supplier transactions');
    }

    if (type !== 'payment' && type !== 'purchase') {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Type must be payment or purchase');
    }

    const supplierIdInt = parseInt(supplier_id);
    const amountFloat = parseFloat(amount);
    const invoiceIdInt = invoice_id ? parseInt(invoice_id) : undefined;

    const transaction = await prisma.$transaction(async (tx: any) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierIdInt, company_id: companyId },
      });
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      let invoice = null;
      if (invoiceIdInt) {
        invoice = await tx.supplierInvoice.findFirst({
          where: { id: invoiceIdInt, supplier_id: supplierIdInt, company_id: companyId },
        });
        if (!invoice) {
          throw new Error('Supplier invoice not found');
        }
      }

      const newTx = await tx.supplierTransaction.create({
        data: {
          company_id: companyId,
          supplier_id: supplierIdInt,
          type,
          amount: amountFloat,
          notes: notes.trim(),
          seller_name: seller_name || null,
          invoice_id: invoiceIdInt || null,
          created_at: date ? new Date(date) : new Date(),
        },
      });

      const balanceDelta = type === 'payment' ? -amountFloat : amountFloat;
      await tx.supplier.update({
        where: { id: supplierIdInt },
        data: { balance: { increment: balanceDelta } },
      });

      if (invoice && type === 'payment') {
        const updatedInvoice = await tx.supplierInvoice.update({
          where: { id: invoiceIdInt },
          data: { amount_paid: { increment: amountFloat } },
        });

        await tx.supplierInvoiceHistory.create({
          data: {
            company_id: companyId,
            invoice_id: invoiceIdInt,
            seller_name: seller_name || 'سيستم',
            action: 'edit',
            changes: `تسجيل سداد بقيمة ${amountFloat} ج.م - المدفوع الجديد: ${updatedInvoice.amount_paid} ج.م | [ملاحظة: ${notes.trim()}]`,
            created_at: new Date(),
          },
        });
      }

      return newTx;
    });

    await logUserActivity(companyId, username, 'SUPPLIER_TRANSACTION', {
      supplier_id: supplierIdInt,
      type,
      amount: amountFloat,
      invoice_id: invoiceIdInt,
    });

    return success(res, transaction, 201);
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const getSupplierTransactions = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const supplierId = parseInt(req.params.id as string);
    if (isNaN(supplierId)) {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid supplier ID');
    }

    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, company_id: companyId },
    });
    if (!supplier) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Supplier not found');
    }

    const transactions = await prisma.supplierTransaction.findMany({
      where: { supplier_id: supplierId, company_id: companyId },
      orderBy: { created_at: 'desc' },
    });

    return success(res, transactions);
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};
