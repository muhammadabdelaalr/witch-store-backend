import { Request, Response } from 'express';
import { prisma } from '../prisma';

export const createSale = async (req: Request, res: Response) => {
  try {
    const {
      customer_id,
      discount = 0,
      tax = 0,
      amount_paid,
      payment_method,
      notes,
      seller_name,
      items,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Sale must contain at least one item' });
      return;
    }

    if (amount_paid === undefined || isNaN(parseFloat(amount_paid))) {
      res.status(400).json({ error: 'Valid amount_paid is required' });
      return;
    }

    if (!payment_method) {
      res.status(400).json({ error: 'Payment method is required' });
      return;
    }

    const amountPaidFloat = parseFloat(amount_paid);
    const discountFloat = parseFloat(discount);
    const taxFloat = parseFloat(tax);
    const customerIdInt = customer_id ? parseInt(customer_id) : null;

    // Start Prisma ACID Transaction
    const sale = await prisma.$transaction(async (tx: any) => {
      let subtotal = 0;
      const verifiedItems = [];

      // 1. Validate stock availability and calculate prices
      for (const item of items) {
        if (!item.product_id || !item.qty || isNaN(parseInt(item.qty))) {
          throw new Error('Each item must have a product_id and a valid qty');
        }

        const productIdInt = parseInt(item.product_id);
        const qtyInt = parseInt(item.qty);

        if (qtyInt <= 0) {
          throw new Error('Quantity must be greater than zero');
        }

        const product = await tx.product.findUnique({
          where: { id: productIdInt },
        });

        if (!product) {
          throw new Error(`Product with ID ${productIdInt} not found`);
        }

        if (product.stock_qty < qtyInt) {
          throw new Error(
            `Insufficient stock for product "${product.name}". Requested: ${qtyInt}, Available: ${product.stock_qty}`
          );
        }

        // 2. Decrement stock
        await tx.product.update({
          where: { id: product.id },
          data: {
            stock_qty: {
              decrement: qtyInt,
            },
          },
        });

        subtotal += product.sell_price * qtyInt;

        verifiedItems.push({
          product_id: product.id,
          qty: qtyInt,
          unit_price: product.sell_price,
          cost_price: product.cost_price,
        });
      }

      // Calculate totals
      const discountAmount = subtotal * (discountFloat / 100);
      const taxAmount = (subtotal - discountAmount) * (taxFloat / 100);
      const grandTotal = subtotal - discountAmount + taxAmount;

      // 3. Create Sale record
      const newSale = await tx.sale.create({
        data: {
          customer_id: customerIdInt,
          total: grandTotal,
          discount: discountFloat,
          tax: taxFloat,
          amount_paid: amountPaidFloat,
          payment_method,
          notes: notes || null,
          seller_name: seller_name || null,
        },
      });

      // 4. Create SaleItem records
      for (const verifiedItem of verifiedItems) {
        await tx.saleItem.create({
          data: {
            sale_id: newSale.id,
            product_id: verifiedItem.product_id,
            qty: verifiedItem.qty,
            unit_price: verifiedItem.unit_price,
            cost_price: verifiedItem.cost_price,
          },
        });
      }

      // 5. Update Customer Ledger if Customer is attached
      if (customerIdInt) {
        const unpaid = grandTotal - amountPaidFloat;
        if (Math.abs(unpaid) > 0.001) {
          const type = unpaid > 0 ? 'debt' : 'payment';
          const amount = Math.abs(unpaid);

          // Create customer ledger transaction
          await tx.customerTransaction.create({
            data: {
              customer_id: customerIdInt,
              type,
              amount,
              notes: `Auto-generated from Sale #${newSale.id}`,
            },
          });

          // Update customer balance
          await tx.customer.update({
            where: { id: customerIdInt },
            data: {
              balance: {
                increment: unpaid,
              },
            },
          });
        }
      }

      // 6. User Activity Log inside user table
      if (seller_name) {
        const user = await tx.user.findUnique({
          where: { name: seller_name },
        });
        if (user) {
          const logs = JSON.parse(user.logs || '[]');
          logs.push({
            action: 'CREATE_SALE',
            details: { sale_id: newSale.id, total: grandTotal },
            timestamp: new Date().toISOString(),
          });
          await tx.user.update({
            where: { id: user.id },
            data: { logs: JSON.stringify(logs) },
          });
        }
      }

      return newSale;
    });

    // Retrieve the fully created sale with items
    const fullSale = await prisma.sale.findUnique({
      where: { id: sale.id },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    res.status(201).json(fullSale);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getAllSales = async (req: Request, res: Response) => {
  try {
    const { from, to, customerId, page = 1, limit = 10 } = req.query;
    const pageInt = parseInt(page as string);
    const limitInt = parseInt(limit as string);
    const skip = (pageInt - 1) * limitInt;

    const where: any = {};

    if (customerId) {
      where.customer_id = parseInt(customerId as string);
    }

    if (from || to) {
      where.created_at = {};
      if (from) {
        where.created_at.gte = new Date((from as string) + 'T00:00:00.000Z');
      }
      if (to) {
        where.created_at.lte = new Date((to as string) + 'T23:59:59.999Z');
      }
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          customer: {
            select: { name: true },
          },
          items: {
            include: {
              product: {
                select: { name: true, sku: true },
              },
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limitInt,
      }),
      prisma.sale.count({ where }),
    ]);

    const formattedSales = sales.map((sale: any) => ({
      ...sale,
      customer_name: sale.customer ? sale.customer.name : null,
    }));

    const totalPages = Math.ceil(total / limitInt);

    res.json({
      data: formattedSales,
      total,
      page: pageInt,
      limit: limitInt,
      totalPages,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getSaleById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid sale ID' });
      return;
    }

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!sale) {
      res.status(404).json({ error: 'Sale invoice not found' });
      return;
    }

    res.json(sale);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
