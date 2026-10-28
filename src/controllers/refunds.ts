import { Request, Response, NextFunction } from 'express';
import { PaymentMethod, Prisma } from '../generated/prisma';
import { prisma } from '../prisma';
import { writeTenantAuditBestEffort } from '../services/audit.service';
import { InventoryService, MOVEMENT_TYPES } from '../services/inventory.service';

class RefundError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) {
    super(message);
  }
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const createRefund = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = req.tenant!;
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId)) throw new RefundError('INVALID_SALE_ID', 'Invalid sale ID');
    if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
      throw new RefundError('EMPTY_REFUND', 'Refund must contain at least one item');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Serialize all partial refunds for the same sale so remaining quantities
      // and payment-method ceilings are calculated from the latest committed rows.
      await tx.$queryRaw`
        SELECT id FROM sales
        WHERE id = ${saleId}
          AND company_id = ${tenant.company_id}
          AND branch_id = ${tenant.branch_id}
        FOR UPDATE
      `;

      const shifts = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM shifts
        WHERE company_id = ${tenant.company_id}
          AND branch_id = ${tenant.branch_id}
          AND user_id = ${tenant.user!.id}
          AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1
        FOR UPDATE
      `;
      const shift = shifts[0];
      if (!shift) throw new RefundError('OPEN_SHIFT_REQUIRED', 'An open shift is required to create a refund', 409);

      const sale = await tx.sale.findFirst({
        where: { id: saleId, company_id: tenant.company_id, branch_id: tenant.branch_id, status: 'completed' },
        include: {
          items: true,
          sale_payments: true,
          refunds: { include: { items: true, payments: true } },
        },
      });
      if (!sale) throw new RefundError('SALE_NOT_FOUND', 'Completed sale not found in this branch', 404);

      const soldByProduct = new Map(sale.items.map((item) => [item.product_id, item]));
      const alreadyRefunded = new Map<number, number>();
      for (const refund of sale.refunds) {
        for (const item of refund.items) {
          alreadyRefunded.set(item.product_id, (alreadyRefunded.get(item.product_id) || 0) + item.qty);
        }
      }

      const verifiedItems: Array<{ product_id: number; qty: number; unit_price: number; cost_price: number }> = [];
      let discountedLinesSubtotal = 0;
      for (const input of req.body.items) {
        const productId = Number(input.product_id);
        const qty = Number(input.qty);
        const soldItem = soldByProduct.get(productId);
        if (!soldItem) throw new RefundError('ITEM_NOT_IN_SALE', `Product ${productId} was not part of this sale`);
        if (!Number.isInteger(qty) || qty <= 0) throw new RefundError('INVALID_QUANTITY', 'Refund quantities must be positive integers');
        const remaining = soldItem.qty - (alreadyRefunded.get(productId) || 0);
        if (qty > remaining) {
          throw new RefundError('REFUND_QUANTITY_EXCEEDED', `Only ${remaining} pieces remain refundable`, 409, { product_id: productId, remaining });
        }
        discountedLinesSubtotal += (soldItem.unit_price - soldItem.line_discount) * qty;
        verifiedItems.push({ product_id: productId, qty, unit_price: soldItem.unit_price, cost_price: soldItem.cost_price });
      }

      const afterInvoiceDiscount = discountedLinesSubtotal * (1 - sale.discount / 100);
      const refundTotal = round2(afterInvoiceDiscount * (1 + sale.tax / 100));
      const originalByMethod = new Map<PaymentMethod, number>();
      for (const payment of sale.sale_payments) {
        originalByMethod.set(payment.method, round2((originalByMethod.get(payment.method) || 0) + payment.amount));
      }
      if (originalByMethod.size === 0) {
        const legacyAllocated = sale.payment_method === PaymentMethod.deferred
          ? sale.total
          : Math.min(sale.amount_paid, sale.total);
        originalByMethod.set(sale.payment_method, round2(legacyAllocated));
      }

      let allocations: Array<{ method: PaymentMethod; amount: number }> = [];
      if (Array.isArray(req.body.payments) && req.body.payments.length > 0) {
        allocations = req.body.payments.map((payment: any) => ({
          method: payment.method as PaymentMethod,
          amount: round2(Number(payment.amount)),
        }));
      } else if (originalByMethod.size === 1) {
        allocations = [{ method: [...originalByMethod.keys()][0], amount: refundTotal }];
      } else {
        throw new RefundError('REFUND_PAYMENT_ALLOCATION_REQUIRED', 'Split-payment sales require an explicit refund allocation', 409);
      }

      if (allocations.some((payment) => !Object.values(PaymentMethod).includes(payment.method) || !Number.isFinite(payment.amount) || payment.amount <= 0)) {
        throw new RefundError('INVALID_REFUND_PAYMENT', 'Refund payment allocation is invalid');
      }
      if (Math.abs(round2(allocations.reduce((sum, payment) => sum + payment.amount, 0)) - refundTotal) > 0.01) {
        throw new RefundError('PAYMENT_MISMATCH', 'Refund payment allocation must equal the refund total');
      }

      const refundedByMethod = new Map<PaymentMethod, number>();
      for (const previousRefund of sale.refunds) {
        for (const payment of previousRefund.payments) {
          refundedByMethod.set(payment.method, round2((refundedByMethod.get(payment.method) || 0) + payment.amount));
        }
      }
      for (const allocation of allocations) {
        const available = round2((originalByMethod.get(allocation.method) || 0) - (refundedByMethod.get(allocation.method) || 0));
        if (allocation.amount > available + 0.01) {
          throw new RefundError('REFUND_METHOD_LIMIT_EXCEEDED', `Refund exceeds the amount paid by ${allocation.method}`, 409, { method: allocation.method, available });
        }
      }

      const refund = await tx.refund.create({
        data: {
          company_id: tenant.company_id,
          branch_id: tenant.branch_id,
          shift_id: shift.id,
          user_id: tenant.user!.id,
          sale_id: sale.id,
          total: refundTotal,
          reason: typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 500) || null : null,
          seller_name: tenant.user!.name,
          items: {
            create: verifiedItems.map((item) => ({
              ...item,
              company_id: tenant.company_id,
            })),
          },
          payments: {
            create: allocations.map((payment) => ({
              company_id: tenant.company_id,
              branch_id: tenant.branch_id,
              method: payment.method,
              amount: payment.amount,
            })),
          },
        },
        include: { items: true, payments: true },
      });

      for (const item of verifiedItems) {
        await InventoryService.applyMovement(tx, {
          company_id: tenant.company_id,
          branch_id: tenant.branch_id,
          product_id: item.product_id,
          movement_type: MOVEMENT_TYPES.REFUND,
          quantity_delta: item.qty,
          reference_type: 'refund',
          reference_id: refund.id,
          user_id: tenant.user!.id,
          notes: `Refund #${refund.id} for Sale #${sale.id}`,
        });
      }

      if (sale.customer_id) {
        const originalDebt = await tx.customerTransaction.aggregate({
          where: { company_id: tenant.company_id, customer_id: sale.customer_id, source_type: 'sale', source_id: sale.id, type: 'debt' },
          _sum: { amount: true },
        });
        const priorDebtReductions = await tx.customerTransaction.aggregate({
          where: { company_id: tenant.company_id, customer_id: sale.customer_id, source_type: 'sale_refund', source_id: sale.id, type: 'payment' },
          _sum: { amount: true },
        });
        const debtRemaining = Math.max(0, (originalDebt._sum.amount || 0) - (priorDebtReductions._sum.amount || 0));
        const deferredRefund = allocations
          .filter((payment) => payment.method === PaymentMethod.deferred)
          .reduce((sum, payment) => sum + payment.amount, 0);
        const debtReduction = round2(Math.min(deferredRefund, debtRemaining));
        const deferredExcess = round2(Math.max(0, deferredRefund - debtReduction));
        if (debtReduction > 0) {
          await tx.customerTransaction.create({
            data: {
              company_id: tenant.company_id,
              customer_id: sale.customer_id,
              type: 'payment',
              amount: debtReduction,
              notes: `Debt reduction for Refund #${refund.id}, Sale #${sale.id}`,
              source_type: 'sale_refund',
              source_id: sale.id,
              idempotency_key: `refund:${refund.id}:debt`,
            },
          });
          await tx.customer.update({ where: { id: sale.customer_id }, data: { balance: { decrement: debtReduction } } });
        }
        if (deferredExcess > 0) {
          const deferredPayment = await tx.refundPayment.findFirst({
            where: { refund_id: refund.id, method: PaymentMethod.deferred },
          });
          if (deferredPayment) {
            const remainingDeferred = round2(deferredPayment.amount - deferredExcess);
            if (remainingDeferred > 0) {
              await tx.refundPayment.update({ where: { id: deferredPayment.id }, data: { amount: remainingDeferred } });
            } else {
              await tx.refundPayment.delete({ where: { id: deferredPayment.id } });
            }
            await tx.refundPayment.create({
              data: {
                refund_id: refund.id,
                company_id: tenant.company_id,
                branch_id: tenant.branch_id,
                method: PaymentMethod.cash,
                amount: deferredExcess,
              },
            });
          }
        }
      }

      return tx.refund.findUniqueOrThrow({
        where: { id: refund.id },
        include: { items: true, payments: true },
      });
    }, { maxWait: 15_000, timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    writeTenantAuditBestEffort(req, {
      action: 'CREATE_REFUND', entityType: 'refund', entityId: result.id,
      details: { sale_id: saleId, total: result.total, payment_methods: result.payments.map((payment) => payment.method) },
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof RefundError) {
      res.status(error.status).json({ success: false, error: error.code, code: error.code, message: error.message, details: error.details });
      return;
    }
    next(error);
  }
};
