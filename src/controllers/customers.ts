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

export const getAllCustomers = async (req: Request, res: Response) => {
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

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return paginatedSuccess(res, customers, { total, page, limit, totalPages });
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const createCustomer = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const { name, phone, email, address, balance } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Customer name is required');
    }

    const customer = await prisma.customer.create({
      data: {
        company_id: companyId,
        name: name.trim(),
        phone: phone || null,
        email: email || null,
        address: address || null,
        balance: balance ? parseFloat(balance) : 0,
      },
    });

    await logUserActivity(companyId, username, 'CREATE_CUSTOMER', {
      id: customer.id,
      name: customer.name,
    });

    return success(res, customer, 201);
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const updateCustomer = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid customer ID');
    }

    const existing = await prisma.customer.findFirst({
      where: { id, company_id: companyId },
    });
    if (!existing) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Customer not found');
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

    const customer = await prisma.customer.update({
      where: { id },
      data: updateData,
    });

    await logUserActivity(companyId, username, 'UPDATE_CUSTOMER', {
      id: customer.id,
      name: customer.name,
      changes: req.body,
    });

    return success(res, customer);
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const addCustomerTransaction = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const { customer_id, type, amount, notes } = req.body;

    if (!customer_id || !type || amount === undefined || !notes || !notes.trim()) {
      return errorResponse(res, 400, 'BAD_REQUEST', 'customer_id, type, amount, and notes are required');
    }

    if (type !== 'payment' && type !== 'debt') {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Type must be payment or debt');
    }

    const customerIdInt = parseInt(customer_id);
    const amountFloat = parseFloat(amount);

    const transaction = await prisma.$transaction(async (tx: any) => {
      const customer = await tx.customer.findFirst({
        where: { id: customerIdInt, company_id: companyId },
      });
      if (!customer) {
        throw new Error('Customer not found');
      }

      const balanceDelta = type === 'payment' ? -amountFloat : amountFloat;
      const remainingBalance = customer.balance + balanceDelta;
      const internalNote = `[ملاحظة داخلية: الدين المتبقي: ${remainingBalance.toFixed(2)}]`;
      const finalNotes = notes ? `${notes} | ${internalNote}` : internalNote;

      const newTx = await tx.customerTransaction.create({
        data: {
          company_id: companyId,
          customer_id: customerIdInt,
          type,
          amount: amountFloat,
          notes: finalNotes,
        },
      });

      await tx.customer.update({
        where: { id: customerIdInt },
        data: { balance: { increment: balanceDelta } },
      });

      return newTx;
    });

    await logUserActivity(companyId, username, 'CUSTOMER_TRANSACTION', {
      customer_id: customerIdInt,
      type,
      amount: amountFloat,
    });

    return success(res, transaction, 201);
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const getCustomerTransactions = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const customerId = parseInt(req.params.id as string);
    if (isNaN(customerId)) {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid customer ID');
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, company_id: companyId },
    });
    if (!customer) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Customer not found');
    }

    const transactions = await prisma.customerTransaction.findMany({
      where: { customer_id: customerId, company_id: companyId },
      orderBy: { created_at: 'desc' },
    });

    return success(res, transactions);
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid customer ID');
    }

    const customer = await prisma.customer.findFirst({
      where: { id, company_id: companyId },
    });
    if (!customer) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Customer not found');
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.customerTransaction.deleteMany({
        where: { customer_id: id, company_id: companyId },
      });

      await tx.sale.updateMany({
        where: { customer_id: id, company_id: companyId },
        data: { customer_id: null },
      });

      await tx.customer.delete({ where: { id } });
    });

    await logUserActivity(companyId, username, 'DELETE_CUSTOMER', { id });

    return success(res, { message: 'Customer deleted successfully' });
  } catch (error: any) {
    return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};
