import { Request, Response } from 'express';
import { prisma, logUserActivity, getUsername } from '../prisma';

export const createSupplierInvoice = async (req: Request, res: Response) => {
  try {
    const username = getUsername(req);
    const { supplier_id, total, amount_paid, notes, invoice_date, items, seller_name } = req.body;

    if (!supplier_id || total === undefined || amount_paid === undefined || !notes || !invoice_date || !items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'supplier_id, total, amount_paid, notes, invoice_date, and items are required' });
      return;
    }

    if (!seller_name || seller_name.trim() === '') {
      res.status(400).json({ error: 'seller_name is required' });
      return;
    }

    const supplierIdInt = parseInt(supplier_id);
    const totalFloat = parseFloat(total);
    const amountPaidFloat = parseFloat(amount_paid);
    const parsedInvoiceDate = new Date(invoice_date);

    if (isNaN(supplierIdInt) || isNaN(totalFloat) || isNaN(amountPaidFloat) || isNaN(parsedInvoiceDate.getTime())) {
      res.status(400).json({ error: 'Invalid numeric or date format' });
      return;
    }

    const invoice = await prisma.$transaction(async (tx) => {
      // 1. Verify supplier
      const supplier = await tx.supplier.findUnique({ where: { id: supplierIdInt } });
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // 2. Create invoice
      const newInvoice = await tx.supplierInvoice.create({
        data: {
          supplier_id: supplierIdInt,
          total: totalFloat,
          amount_paid: amountPaidFloat,
          notes,
          seller_name,
          invoice_date: parsedInvoiceDate,
          items: {
            create: items.map((item: any) => ({
              product_id: parseInt(item.product_id),
              qty: parseInt(item.qty),
              unit_cost: parseFloat(item.unit_cost),
            })),
          },
        },
        include: {
          items: true,
        },
      });

      // 3. For each item: adjust product stock & cost price
      for (const item of items) {
        const prodId = parseInt(item.product_id);
        const qtyInt = parseInt(item.qty);
        const unitCostFloat = parseFloat(item.unit_cost);

        const product = await tx.product.findUnique({ where: { id: prodId } });
        if (!product) {
          throw new Error(`Product with ID ${prodId} not found`);
        }

        await tx.product.update({
          where: { id: prodId },
          data: {
            stock_qty: { increment: qtyInt },
            cost_price: unitCostFloat,
          },
        });
      }

      // 4. Create ledger transactions
      // Transaction 1: Purchase (full amount)
      await tx.supplierTransaction.create({
        data: {
          supplier_id: supplierIdInt,
          type: 'purchase',
          amount: totalFloat,
          notes: `فاتورة شراء رقم #${newInvoice.id} - الإجمالي: ${totalFloat} | [ملاحظة: ${notes}]`,
          invoice_id: newInvoice.id,
          seller_name,
          created_at: parsedInvoiceDate,
        },
      });

      // Update supplier balance (increment full purchase total)
      let balanceDelta = totalFloat;

      // Transaction 2: Payment (if paid > 0)
      if (amountPaidFloat > 0) {
        await tx.supplierTransaction.create({
          data: {
            supplier_id: supplierIdInt,
            type: 'payment',
            amount: amountPaidFloat,
            notes: `دفعة مسددة للفاتورة رقم #${newInvoice.id} | [ملاحظة: ${notes}]`,
            invoice_id: newInvoice.id,
            seller_name,
            created_at: parsedInvoiceDate,
          },
        });
        // Decrement paid amount from balance
        balanceDelta -= amountPaidFloat;
      }

      // Update supplier balance
      await tx.supplier.update({
        where: { id: supplierIdInt },
        data: {
          balance: { increment: balanceDelta },
        },
      });

      // 5. Create History Log
      const changeSummary = `تم إنشاء الفاتورة بواسطة ${seller_name} بإجمالي ${totalFloat} ج.م ومبلغ مدفوع ${amountPaidFloat} ج.م. المنتجات: ` +
        items.map((i: any) => `المنتج #${i.product_id} (كمية: ${i.qty}، تكلفة: ${i.unit_cost})`).join(', ');

      await tx.supplierInvoiceHistory.create({
        data: {
          invoice_id: newInvoice.id,
          seller_name,
          action: 'create',
          changes: changeSummary,
          created_at: new Date(),
        },
      });

      return newInvoice;
    }, {
      timeout: 30000,
      maxWait: 15000,
    });

    await logUserActivity(username, 'CREATE_SUPPLIER_INVOICE', {
      id: invoice.id,
      supplier_id: supplierIdInt,
      total: totalFloat,
    });

    res.status(201).json(invoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateSupplierInvoice = async (req: Request, res: Response) => {
  try {
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    const { total, amount_paid, notes, invoice_date, items, seller_name, is_refund } = req.body;

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid invoice ID' });
      return;
    }

    if (total === undefined || amount_paid === undefined || !notes || !invoice_date || !items || !Array.isArray(items)) {
      res.status(400).json({ error: 'total, amount_paid, notes, invoice_date, and items are required' });
      return;
    }

    if (!seller_name || seller_name.trim() === '') {
      res.status(400).json({ error: 'seller_name is required' });
      return;
    }

    const totalFloat = parseFloat(total);
    const amountPaidFloat = parseFloat(amount_paid);
    const parsedInvoiceDate = new Date(invoice_date);

    if (isNaN(totalFloat) || isNaN(amountPaidFloat) || isNaN(parsedInvoiceDate.getTime())) {
      res.status(400).json({ error: 'Invalid numeric or date format' });
      return;
    }

    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // 1. Fetch old invoice
      const oldInvoice = await tx.supplierInvoice.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!oldInvoice) {
        throw new Error('Invoice not found');
      }

      // 2. Revert old stock adjustments
      for (const oldItem of oldInvoice.items) {
        await tx.product.update({
          where: { id: oldItem.product_id },
          data: {
            stock_qty: { decrement: oldItem.qty },
          },
        });
      }

      // 3. Apply new stock adjustments & update cost price
      for (const newItem of items) {
        const prodId = parseInt(newItem.product_id);
        const qtyInt = parseInt(newItem.qty);
        const unitCostFloat = parseFloat(newItem.unit_cost);

        await tx.product.update({
          where: { id: prodId },
          data: {
            stock_qty: { increment: qtyInt },
            cost_price: unitCostFloat,
          },
        });
      }

      // 4. Delete old items and create new ones
      await tx.supplierInvoiceItem.deleteMany({
        where: { invoice_id: id },
      });

      const updatedItems = await Promise.all(
        items.map((item: any) =>
          tx.supplierInvoiceItem.create({
            data: {
              invoice_id: id,
              product_id: parseInt(item.product_id),
              qty: parseInt(item.qty),
              unit_cost: parseFloat(item.unit_cost),
            },
          })
        )
      );

      // 5. Calculate net balance difference for the supplier
      const oldUnpaid = oldInvoice.total - oldInvoice.amount_paid;
      const newUnpaid = totalFloat - amountPaidFloat;
      const balanceDiff = newUnpaid - oldUnpaid;

      // Update supplier balance
      await tx.supplier.update({
        where: { id: oldInvoice.supplier_id },
        data: {
          balance: { increment: balanceDiff },
        },
      });

      // 6. Update linked SupplierTransaction records
      // Find purchase transaction
      const purchaseTx = await tx.supplierTransaction.findFirst({
        where: { invoice_id: id, type: 'purchase' },
      });
      if (purchaseTx) {
        await tx.supplierTransaction.update({
          where: { id: purchaseTx.id },
          data: {
            amount: totalFloat,
            created_at: parsedInvoiceDate,
            notes: `[معدلة] فاتورة شراء رقم #${id} - الإجمالي الجديد: ${totalFloat} | [ملاحظة: ${notes}]`,
            seller_name,
          },
        });
      } else {
        await tx.supplierTransaction.create({
          data: {
            supplier_id: oldInvoice.supplier_id,
            type: 'purchase',
            amount: totalFloat,
            notes: `فاتورة شراء رقم #${id} - الإجمالي: ${totalFloat} | [ملاحظة: ${notes}]`,
            invoice_id: id,
            seller_name,
            created_at: parsedInvoiceDate,
          },
        });
      }

      // Find payment transaction
      const paymentTx = await tx.supplierTransaction.findFirst({
        where: { invoice_id: id, type: 'payment' },
      });

      if (amountPaidFloat > 0) {
        if (paymentTx) {
          await tx.supplierTransaction.update({
            where: { id: paymentTx.id },
            data: {
              amount: amountPaidFloat,
              created_at: parsedInvoiceDate,
              notes: `[معدلة] دفعة مسددة للفاتورة رقم #${id} | [ملاحظة: ${notes}]`,
              seller_name,
            },
          });
        } else {
          await tx.supplierTransaction.create({
            data: {
              supplier_id: oldInvoice.supplier_id,
              type: 'payment',
              amount: amountPaidFloat,
              notes: `دفعة مسددة للفاتورة رقم #${id} | [ملاحظة: ${notes}]`,
              invoice_id: id,
              seller_name,
              created_at: parsedInvoiceDate,
            },
          });
        }
      } else if (paymentTx) {
        await tx.supplierTransaction.delete({
          where: { id: paymentTx.id },
        });
      }

      // 7. Update the invoice itself
      const newInvoice = await tx.supplierInvoice.update({
        where: { id },
        data: {
          total: totalFloat,
          amount_paid: amountPaidFloat,
          notes,
          invoice_date: parsedInvoiceDate,
        },
      });

      // 8. Generate history logs
      let itemChanges: string[] = [];
      const oldItemsMap = new Map(oldInvoice.items.map(i => [i.product_id, i]));
      const newItemsMap = new Map(items.map((i: any) => [parseInt(i.product_id), i]));

      for (const [prodId, oldItem] of oldItemsMap) {
        const newItem = newItemsMap.get(prodId);
        if (!newItem) {
          itemChanges.push(`حذف المنتج #${prodId} (الكمية السابقة: ${oldItem.qty})`);
        } else if (newItem.qty !== oldItem.qty || parseFloat(newItem.unit_cost) !== oldItem.unit_cost) {
          itemChanges.push(`تعديل المنتج #${prodId} - الكمية: ${oldItem.qty} -> ${newItem.qty}، التكلفة: ${oldItem.unit_cost} -> ${newItem.unit_cost}`);
        }
      }

      for (const [prodId, newItem] of newItemsMap) {
        if (!oldItemsMap.has(prodId)) {
          itemChanges.push(`إضافة المنتج #${prodId} (الكمية: ${newItem.qty}، التكلفة: ${newItem.unit_cost})`);
        }
      }

      if (totalFloat !== oldInvoice.total) {
        itemChanges.push(`تغيير الإجمالي من ${oldInvoice.total} إلى ${totalFloat}`);
      }
      if (amountPaidFloat !== oldInvoice.amount_paid) {
        itemChanges.push(`تغيير المدفوع من ${oldInvoice.amount_paid} إلى ${amountPaidFloat}`);
      }

      const actionText = is_refund ? 'refund' : 'edit';
      const changesSummary = `تعديل الفاتورة (${is_refund ? 'مرتجع' : 'تحديث'}). التغييرات: ` + itemChanges.join(' | ');

      await tx.supplierInvoiceHistory.create({
        data: {
          invoice_id: id,
          seller_name,
          action: actionText,
          changes: changesSummary,
          created_at: new Date(),
        },
      });

      return {
        ...newInvoice,
        items: updatedItems,
      };
    }, {
      timeout: 30000,
      maxWait: 15000,
    });

    await logUserActivity(username, is_refund ? 'REFUND_SUPPLIER_INVOICE' : 'UPDATE_SUPPLIER_INVOICE', {
      id,
      total: totalFloat,
      is_refund: !!is_refund,
    });

    res.json(updatedInvoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getSupplierInvoices = async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.query.supplierId as string);
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (!isNaN(supplierId)) {
      where.supplier_id = supplierId;
    }

    const [invoices, total] = await Promise.all([
      prisma.supplierInvoice.findMany({
        where,
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
        orderBy: { invoice_date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.supplierInvoice.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      data: invoices,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getSupplierInvoiceHistory = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid invoice ID' });
      return;
    }

    const history = await prisma.supplierInvoiceHistory.findMany({
      where: { invoice_id: id },
      orderBy: { created_at: 'desc' },
    });

    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
