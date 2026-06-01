import { Request, Response } from 'express';
import { prisma } from '../prisma';

export const createRefund = async (req: Request, res: Response) => {
  try {
    const saleId = parseInt(req.params.id as string);
    if (isNaN(saleId)) {
      res.status(400).json({ error: 'Invalid sale ID' });
      return;
    }

    const { items, reason, seller_name } = req.body;
    // items is an array of { product_id, qty }

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Refund must contain at least one item' });
      return;
    }

    // Start Prisma Transaction
    const refund = await prisma.$transaction(async (tx: any) => {
      // 1. Fetch the original sale
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { items: true, refunds: { include: { items: true } } },
      });

      if (!sale) {
        throw new Error('Sale not found');
      }

      // 2. Validate refund quantities against original sale AND past refunds
      // Calculate max refundable quantities
      const maxRefundable: Record<number, { maxQty: number, unitPrice: number, costPrice: number }> = {};
      for (const saleItem of sale.items) {
        maxRefundable[saleItem.product_id] = {
          maxQty: saleItem.qty,
          unitPrice: saleItem.unit_price,
          costPrice: saleItem.cost_price,
        };
      }

      // Deduct already refunded items (or lock them out completely based on the new rule)
      for (const pastRefund of sale.refunds) {
        for (const refundItem of pastRefund.items) {
          if (maxRefundable[refundItem.product_id]) {
            // Business Rule: If a product was refunded once, it cannot be refunded again.
            maxRefundable[refundItem.product_id].maxQty = 0;
          }
        }
      }

      let rawRefundSubtotal = 0;
      const verifiedRefundItems = [];

      for (const item of items) {
        const productIdInt = parseInt(item.product_id);
        const qtyInt = parseInt(item.qty);

        if (qtyInt <= 0) continue;

        if (!maxRefundable[productIdInt]) {
          throw new Error(`Product ID ${productIdInt} was not part of this sale`);
        }

        if (qtyInt > maxRefundable[productIdInt].maxQty) {
          throw new Error(`Cannot refund ${qtyInt} of Product ID ${productIdInt}. Only ${maxRefundable[productIdInt].maxQty} available for refund.`);
        }

        const refundItemAmount = qtyInt * maxRefundable[productIdInt].unitPrice;
        rawRefundSubtotal += refundItemAmount;

        verifiedRefundItems.push({
          product_id: productIdInt,
          qty: qtyInt,
          unit_price: maxRefundable[productIdInt].unitPrice,
          cost_price: maxRefundable[productIdInt].costPrice,
        });

        // 3. Restock inventory
        await tx.product.update({
          where: { id: productIdInt },
          data: {
            stock_qty: {
              increment: qtyInt,
            },
          },
        });
      }

      if (verifiedRefundItems.length === 0) {
         throw new Error('No valid items to refund');
      }

      // Calculate final refund total matching invoice structure
      const discountAmount = rawRefundSubtotal * (sale.discount / 100);
      const taxAmount = (rawRefundSubtotal - discountAmount) * (sale.tax / 100);
      const refundTotal = rawRefundSubtotal - discountAmount + taxAmount;

      // 4. Create the Refund record
      const newRefund = await tx.refund.create({
        data: {
          sale_id: sale.id,
          total: refundTotal,
          reason: reason || null,
          seller_name: seller_name || null,
          items: {
            create: verifiedRefundItems,
          },
        },
      });

      // 5. Update Customer Ledger if Customer is attached
      if (sale.customer_id) {
        // Create customer ledger transaction for the refund
        await tx.customerTransaction.create({
          data: {
            customer_id: sale.customer_id,
            type: 'payment', // A refund acts like a payment from the customer's perspective
            amount: refundTotal,
            notes: `Refund for Sale #${sale.id}`,
          },
        });

        // Update customer balance (decrement debt)
        await tx.customer.update({
          where: { id: sale.customer_id },
          data: {
            balance: {
              decrement: refundTotal,
            },
          },
        });
      }

      // 6. User Activity Log
      if (seller_name) {
        const user = await tx.user.findUnique({
          where: { name: seller_name },
        });
        if (user) {
          const logs = JSON.parse(user.logs || '[]');
          logs.push({
            action: 'CREATE_REFUND',
            details: { refund_id: newRefund.id, sale_id: sale.id, total: refundTotal },
            timestamp: new Date().toISOString(),
          });
          await tx.user.update({
            where: { id: user.id },
            data: { logs: JSON.stringify(logs) },
          });
        }
      }

      return newRefund;
    });

    res.status(201).json(refund);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
