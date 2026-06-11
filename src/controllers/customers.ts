import { Request, Response } from 'express';
import { prisma, logUserActivity, getUsername } from '../prisma';

export const getAllCustomers = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const search = req.query.search as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const skip = (page - 1) * limit;

    const where: any = {
      company_id: companyId,
    };

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

    res.json({
      data: customers,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createCustomer = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const { name, phone, email, address, balance } = req.body;

    if (!name || !phone) {
      res.status(400).json({ error: 'Customer name and phone number are required' });
      return;
    }

    const customer = await prisma.customer.create({
      data: {
        company_id: companyId,
        name,
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

    res.status(201).json(customer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateCustomer = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid customer ID' });
      return;
    }

    // Ensure customer belongs to company
    const existing = await prisma.customer.findFirst({
      where: { id, company_id: companyId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Customer not found' });
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

    const customer = await prisma.customer.update({
      where: { id },
      data: updateData,
    });

    await logUserActivity(companyId, username, 'UPDATE_CUSTOMER', {
      id: customer.id,
      name: customer.name,
      changes: req.body,
    });

    res.json(customer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const addCustomerTransaction = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const { customer_id, type, amount, notes } = req.body;

    if (!customer_id || !type || amount === undefined || !notes || !notes.trim()) {
      res.status(400).json({ error: 'customer_id, type, amount, and notes are required' });
      return;
    }

    if (type !== 'payment' && type !== 'debt') {
      res.status(400).json({ error: 'Type must be payment or debt' });
      return;
    }

    const customerIdInt = parseInt(customer_id);
    const amountFloat = parseFloat(amount);

    const transaction = await prisma.$transaction(async (tx: any) => {
      // 1. Verify customer exists and belongs to company
      const customer = await tx.customer.findFirst({
        where: { id: customerIdInt, company_id: companyId },
      });
      if (!customer) {
        throw new Error('Customer not found');
      }

      // 2. Calculate remaining balance and final notes
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

      // 3. Update customer balance
      await tx.customer.update({
        where: { id: customerIdInt },
        data: {
          balance: {
            increment: balanceDelta,
          },
        },
      });

      return newTx;
    });

    await logUserActivity(companyId, username, 'CUSTOMER_TRANSACTION', {
      customer_id: customerIdInt,
      type,
      amount: amountFloat,
    });

    res.status(201).json(transaction);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getCustomerTransactions = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const customerId = parseInt(req.params.id as string);
    if (isNaN(customerId)) {
      res.status(400).json({ error: 'Invalid customer ID' });
      return;
    }

    // Verify customer belongs to company
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, company_id: companyId },
    });
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const transactions = await prisma.customerTransaction.findMany({
      where: { customer_id: customerId, company_id: companyId },
      orderBy: { created_at: 'desc' },
    });

    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid customer ID' });
      return;
    }

    // Ensure customer belongs to company
    const customer = await prisma.customer.findFirst({
      where: { id, company_id: companyId },
    });
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    await prisma.$transaction(async (tx: any) => {
      // 1. Delete all transactions of the customer
      await tx.customerTransaction.deleteMany({
        where: { customer_id: id, company_id: companyId },
      });

      // 2. Disconnect customer from all sales records
      await tx.sale.updateMany({
        where: { customer_id: id, company_id: companyId },
        data: { customer_id: null },
      });

      // 3. Delete customer
      await tx.customer.delete({
        where: { id },
      });
    });

    await logUserActivity(companyId, username, 'DELETE_CUSTOMER', { id });

    res.json({ message: 'Customer deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
