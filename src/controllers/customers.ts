import { Request, Response } from 'express';
import { prisma, logUserActivity, getUsername } from '../prisma';

export const getAllCustomers = async (req: Request, res: Response) => {
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
    const username = getUsername(req);
    const { name, phone, email, address, balance } = req.body;

    if (!name || !phone) {
      res.status(400).json({ error: 'Customer name and phone number are required' });
      return;
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        phone: phone || null,
        email: email || null,
        address: address || null,
        balance: balance ? parseFloat(balance) : 0,
      },
    });

    await logUserActivity(username, 'CREATE_CUSTOMER', {
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
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid customer ID' });
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

    await logUserActivity(username, 'UPDATE_CUSTOMER', {
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
    const username = getUsername(req);
    const { customer_id, type, amount, notes } = req.body;

    if (!customer_id || !type || amount === undefined) {
      res.status(400).json({ error: 'customer_id, type, and amount are required' });
      return;
    }

    if (type !== 'payment' && type !== 'debt') {
      res.status(400).json({ error: 'Type must be payment or debt' });
      return;
    }

    const customerIdInt = parseInt(customer_id);
    const amountFloat = parseFloat(amount);

    const transaction = await prisma.$transaction(async (tx: any) => {
      // 1. Verify customer exists
      const customer = await tx.customer.findUnique({
        where: { id: customerIdInt },
      });
      if (!customer) {
        throw new Error('Customer not found');
      }

      // 2. Create customer transaction
      const newTx = await tx.customerTransaction.create({
        data: {
          customer_id: customerIdInt,
          type,
          amount: amountFloat,
          notes: notes || null,
        },
      });

      // 3. Update customer balance
      const balanceDelta = type === 'payment' ? -amountFloat : amountFloat;

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

    await logUserActivity(username, 'CUSTOMER_TRANSACTION', {
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
    const customerId = parseInt(req.params.id as string);
    if (isNaN(customerId)) {
      res.status(400).json({ error: 'Invalid customer ID' });
      return;
    }

    const transactions = await prisma.customerTransaction.findMany({
      where: { customer_id: customerId },
      orderBy: { created_at: 'desc' },
    });

    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid customer ID' });
      return;
    }

    await prisma.$transaction(async (tx: any) => {
      // 1. Delete all transactions of the customer
      await tx.customerTransaction.deleteMany({
        where: { customer_id: id },
      });

      // 2. Disconnect customer from all sales records
      await tx.sale.updateMany({
        where: { customer_id: id },
        data: { customer_id: null },
      });

      // 3. Delete customer
      await tx.customer.delete({
        where: { id },
      });
    });

    await logUserActivity(username, 'DELETE_CUSTOMER', { id });

    res.json({ message: 'Customer deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
