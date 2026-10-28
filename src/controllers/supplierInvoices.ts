import { Request, Response } from 'express';
import { prisma, logUserActivity, getUsername } from '../prisma';
import { InventoryService, MOVEMENT_TYPES } from '../services/inventory.service';

export const createSupplierInvoice = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id;
    const username = getUsername(req);
    const { supplier_id, total, amount_paid, notes, invoice_date, items } = req.body;
    const seller_name = username;

    if (!supplier_id || total === undefined || amount_paid === undefined || !notes || !invoice_date || !items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'supplier_id, total, amount_paid, notes, invoice_date, and items are required' });
      return;
    }

    const supplierIdInt = parseInt(supplier_id);
    const totalFloat = parseFloat(total);
    const amountPaidFloat = parseFloat(amount_paid);
    const parsedInvoiceDate = new Date(invoice_date);
    const calculatedTotal = Math.round(items.reduce(
      (sum: number, item: any) => sum + Number(item.qty) * Number(item.unit_cost),
      0,
    ) * 100) / 100;

    if (isNaN(supplierIdInt) || isNaN(totalFloat) || isNaN(amountPaidFloat) || isNaN(parsedInvoiceDate.getTime())) {
      res.status(400).json({ error: 'Invalid numeric or date format' });
      return;
    }
    if (Math.abs(totalFloat - calculatedTotal) > 0.01 || amountPaidFloat > calculatedTotal) {
      res.status(400).json({ error: 'INVOICE_TOTAL_MISMATCH', message: 'Invoice total must match its items and paid amount cannot exceed total' });
      return;
    }

    const invoice = await prisma.$transaction(async (tx) => {
      // 1. Verify supplier
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierIdInt, company_id: companyId },
      });
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // 2. Create invoice
      const newInvoice = await tx.supplierInvoice.create({
        data: {
          company_id: companyId,
          branch_id: branchId,
          supplier_id: supplierIdInt,
          total: calculatedTotal,
          amount_paid: amountPaidFloat,
          notes,
          seller_name,
          invoice_date: parsedInvoiceDate,
          items: {
            create: items.map((item: any) => ({
              company_id: companyId,
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

        const product = await tx.product.findFirst({
          where: { id: prodId, company_id: companyId },
        });
        if (!product) {
          throw new Error(`Product with ID ${prodId} not found`);
        }

        // Update cost price on product level
        await tx.product.update({
          where: { id: prodId },
          data: {
            cost_price: unitCostFloat,
          },
        });

        // Adjust stock and record movement via central InventoryService
        await InventoryService.applyMovement(tx, {
          company_id: companyId,
          branch_id: branchId,
          product_id: prodId,
          movement_type: MOVEMENT_TYPES.PURCHASE,
          quantity_delta: qtyInt,
          reference_type: 'supplier_invoice',
          reference_id: newInvoice.id,
          user_id: req.tenant?.user?.id,
          notes: `فاتورة شراء رقم #${newInvoice.id}`,
        });
      }

      // 4. Create ledger transactions
      // Transaction 1: Purchase (full amount)
      await tx.supplierTransaction.create({
        data: {
          company_id: companyId,
          supplier_id: supplierIdInt,
          type: 'purchase',
          amount: calculatedTotal,
          notes: `فاتورة شراء رقم #${newInvoice.id} - الإجمالي: ${totalFloat} | [ملاحظة: ${notes}]`,
          invoice_id: newInvoice.id,
          seller_name,
          created_at: parsedInvoiceDate,
        },
      });

      // Update supplier balance (increment full purchase total)
      let balanceDelta = calculatedTotal;

      // Transaction 2: Payment (if paid > 0)
      if (amountPaidFloat > 0) {
        await tx.supplierTransaction.create({
          data: {
            company_id: companyId,
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
          company_id: companyId,
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

    await logUserActivity(companyId, username, 'CREATE_SUPPLIER_INVOICE', {
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
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id;
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    const { total, amount_paid, notes, invoice_date, items, is_refund } = req.body;
    const seller_name = username;

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid invoice ID' });
      return;
    }

    if (total === undefined || amount_paid === undefined || !notes || !invoice_date || !items || !Array.isArray(items)) {
      res.status(400).json({ error: 'total, amount_paid, notes, invoice_date, and items are required' });
      return;
    }

    const totalFloat = parseFloat(total);
    const amountPaidFloat = parseFloat(amount_paid);
    const parsedInvoiceDate = new Date(invoice_date);
    const calculatedTotal = Math.round(items.reduce(
      (sum: number, item: any) => sum + Number(item.qty) * Number(item.unit_cost),
      0,
    ) * 100) / 100;

    if (isNaN(totalFloat) || isNaN(amountPaidFloat) || isNaN(parsedInvoiceDate.getTime())) {
      res.status(400).json({ error: 'Invalid numeric or date format' });
      return;
    }
    if (Math.abs(totalFloat - calculatedTotal) > 0.01 || amountPaidFloat > calculatedTotal) {
      res.status(400).json({ error: 'INVOICE_TOTAL_MISMATCH', message: 'Invoice total must match its items and paid amount cannot exceed total' });
      return;
    }

    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // 1. Fetch old invoice
      const oldInvoice = await tx.supplierInvoice.findFirst({
        where: { id, company_id: companyId },
        include: { items: true },
      });

      if (!oldInvoice) {
        throw new Error('Invoice not found');
      }

      const invoiceBranchId = oldInvoice.branch_id || branchId;
      if (invoiceBranchId !== branchId) {
        throw new Error('Invoice belongs to another branch');
      }

      // 2. Reverse the original purchase movements through the central ledger.
      for (const oldItem of oldInvoice.items) {
        await InventoryService.applyMovement(tx, {
          company_id: companyId,
          branch_id: invoiceBranchId,
          product_id: oldItem.product_id,
          movement_type: MOVEMENT_TYPES.PURCHASE_REVERSAL,
          quantity_delta: -oldItem.qty,
          reference_type: 'supplier_invoice_edit',
          reference_id: id,
          user_id: req.tenant?.user?.id,
          notes: `Reverse previous quantity for supplier invoice #${id}`,
        });
      }

      // 3. Apply new stock adjustments on ProductStock level & update cost price
      for (const newItem of items) {
        const prodId = parseInt(newItem.product_id);
        const qtyInt = parseInt(newItem.qty);
        const unitCostFloat = parseFloat(newItem.unit_cost);

        await tx.product.update({
          where: { id: prodId },
          data: {
            cost_price: unitCostFloat,
          },
        });

        await InventoryService.applyMovement(tx, {
          company_id: companyId,
          branch_id: branchId,
          product_id: prodId,
          movement_type: MOVEMENT_TYPES.PURCHASE,
          quantity_delta: qtyInt,
          reference_type: 'supplier_invoice_edit',
          reference_id: id,
          user_id: req.tenant?.user?.id,
          notes: `Apply updated quantity for supplier invoice #${id}`,
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
              company_id: companyId,
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
      const newUnpaid = calculatedTotal - amountPaidFloat;
      const balanceDiff = newUnpaid - oldUnpaid;

      // Update supplier balance
      await tx.supplier.update({
        where: { id: oldInvoice.supplier_id },
        data: {
          balance: { increment: balanceDiff },
        },
      });

      // 6. Update linked SupplierTransaction records
      const purchaseTx = await tx.supplierTransaction.findFirst({
        where: { invoice_id: id, type: 'purchase', company_id: companyId },
      });
      if (purchaseTx) {
        await tx.supplierTransaction.update({
          where: { id: purchaseTx.id },
          data: {
            amount: calculatedTotal,
            created_at: parsedInvoiceDate,
            notes: `[معدلة] فاتورة شراء رقم #${id} - الإجمالي الجديد: ${totalFloat} | [ملاحظة: ${notes}]`,
            seller_name,
          },
        });
      } else {
        await tx.supplierTransaction.create({
          data: {
            company_id: companyId,
            supplier_id: oldInvoice.supplier_id,
            type: 'purchase',
            amount: calculatedTotal,
            notes: `فاتورة شراء رقم #${id} - الإجمالي: ${totalFloat} | [ملاحظة: ${notes}]`,
            invoice_id: id,
            seller_name,
            created_at: parsedInvoiceDate,
          },
        });
      }

      const paymentTx = await tx.supplierTransaction.findFirst({
        where: { invoice_id: id, type: 'payment', company_id: companyId },
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
              company_id: companyId,
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
          total: calculatedTotal,
          amount_paid: amountPaidFloat,
          notes,
          invoice_date: parsedInvoiceDate,
          branch_id: branchId, // update to active branch if modified
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
          company_id: companyId,
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

    await logUserActivity(companyId, username, is_refund ? 'REFUND_SUPPLIER_INVOICE' : 'UPDATE_SUPPLIER_INVOICE', {
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
    const companyId = req.tenant!.company_id;
    const supplierId = parseInt(req.query.supplierId as string);
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const skip = (page - 1) * limit;

    const where: any = {
      company_id: companyId,
    };
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
    const companyId = req.tenant!.company_id;
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid invoice ID' });
      return;
    }

    // Verify invoice belongs to company
    const invoice = await prisma.supplierInvoice.findFirst({
      where: { id, company_id: companyId },
    });
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const history = await prisma.supplierInvoiceHistory.findMany({
      where: { invoice_id: id, company_id: companyId },
      orderBy: { created_at: 'desc' },
    });

    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
