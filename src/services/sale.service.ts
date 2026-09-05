import { Prisma, PaymentMethod, SaleType } from '../generated/prisma';
import { prisma } from '../prisma';
import {
  CreateSaleDTO,
  HoldSaleDTO,
  CancelSaleDTO,
  SaleResponseDTO,
  SaleListItemDTO,
} from '../dto/sale.dto';

export interface TenantContext {
  company_id: number;
  company_name: string;
  branch_id: number;
  user?: {
    id: number;
    name: string;
    role: {
      id: number;
      key: string;
      name: string;
      permissions: string[];
    } | null;
  };
}

class SaleError extends Error {
  code: string;
  status: number;
  details?: any;

  constructor(code: string, message: string, status: number = 400, details?: any) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildSaleResponse(sale: any): SaleResponseDTO {
  const subtotal = sale.items.reduce(
    (sum: number, item: any) => sum + item.unit_price * item.qty,
    0
  );
  const discountAmount = round2(subtotal * (sale.discount / 100));
  const taxableAmount = round2(subtotal - discountAmount);
  const taxAmount = round2(taxableAmount * (sale.tax / 100));
  const total = round2(taxableAmount + taxAmount);

  const paidFromPayments = (sale.sale_payments || []).reduce(
    (sum: number, p: any) => sum + p.amount,
    0
  );
  const amountPaid = round2(sale.amount_paid ?? paidFromPayments);
  const changeDue = round2(Math.max(0, amountPaid - total));
  const dueAmount = round2(Math.max(0, total - amountPaid));

  return {
    id: sale.id,
    invoice_number: sale.invoice_number || null,
    status: sale.status,
    customer_id: sale.customer_id || null,
    customer_name: sale.customer_name || (sale.customer ? sale.customer.name : null),
    seller_name: sale.seller_name || null,
    sale_type: sale.sale_type,
    subtotal: round2(subtotal),
    discount: sale.discount,
    discount_amount: discountAmount,
    tax: sale.tax,
    tax_amount: taxAmount,
    total,
    amount_paid: amountPaid,
    change_due: changeDue,
    due_amount: dueAmount,
    payment_method: sale.payment_method,
    payments: (sale.sale_payments || []).map((p: any) => ({
      id: p.id,
      method: p.method,
      amount: p.amount,
    })),
    notes: sale.notes || null,
    items: sale.items.map((item: any) => ({
      id: item.id,
      product_id: item.product_id,
      qty: item.qty,
      unit_price: item.unit_price,
      cost_price: item.cost_price,
      line_discount: item.line_discount || 0,
      line_total: round2(item.unit_price * item.qty),
      product: {
        id: item.product.id,
        name: item.product.name,
        sku: item.product.sku,
        barcode: item.product.barcode,
      },
    })),
    created_at: sale.created_at,
  };
}

async function generateInvoiceNumber(companyId: number, tx: Prisma.TransactionClient): Promise<string> {
  // Format: INV-{company_id}-{timestamp}-{random}
  // For production, consider a dedicated counter table.
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  const candidate = `INV-${companyId}-${datePart}-${randomPart}`;

  const existing = await tx.sale.findFirst({
    where: { company_id: companyId, invoice_number: candidate },
    select: { id: true },
  });

  if (existing) {
    return generateInvoiceNumber(companyId, tx);
  }

  return candidate;
}

async function ensureProductStock(
  companyId: number,
  branchId: number,
  productId: number,
  tx: Prisma.TransactionClient
) {
  const stock = await tx.productStock.upsert({
    where: {
      company_id_branch_id_product_id: {
        company_id: companyId,
        branch_id: branchId,
        product_id: productId,
      },
    },
    update: {},
    create: {
      company_id: companyId,
      branch_id: branchId,
      product_id: productId,
      stock_qty: 0,
      low_stock_threshold: 5,
    },
  });
  return stock;
}

async function recordInventoryMovement(
  companyId: number,
  branchId: number,
  productId: number,
  movementType: string,
  quantityDelta: number,
  balanceAfter: number,
  referenceType: string,
  referenceId: number,
  userId: number | undefined,
  notes: string | null,
  tx: Prisma.TransactionClient
) {
  await tx.inventoryMovement.create({
    data: {
      company_id: companyId,
      branch_id: branchId,
      product_id: productId,
      movement_type: movementType,
      quantity_delta: quantityDelta,
      balance_after: balanceAfter,
      reference_type: referenceType,
      reference_id: referenceId,
      user_id: userId,
      notes,
    },
  });
}

async function validateAndLoadProducts(
  items: { product_id: number; qty: number; unit_price: number; line_discount?: number }[],
  companyId: number,
  branchId: number,
  tx: Prisma.TransactionClient
) {
  if (!items || items.length === 0) {
    throw new SaleError('EMPTY_CART', 'Sale must contain at least one item');
  }

  const productIds = [...new Set(items.map((i) => i.product_id))];

  const products = await tx.product.findMany({
    where: {
      id: { in: productIds },
      company_id: companyId,
      is_active: true,
    },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      sell_price: true,
      cost_price: true,
      is_active: true,
    },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));
  const verifiedItems = [];

  for (const item of items) {
    const product = productMap.get(item.product_id);

    if (!product) {
      throw new SaleError(
        'PRODUCT_NOT_FOUND',
        `Product with ID ${item.product_id} not found or inactive`
      );
    }

    const qty = Math.floor(item.qty);
    if (!qty || qty <= 0) {
      throw new SaleError('INVALID_QUANTITY', `Invalid quantity for product "${product.name}"`);
    }

    const unitPrice = round2(parseFloat(String(item.unit_price)) || product.sell_price);
    if (isNaN(unitPrice) || unitPrice < 0) {
      throw new SaleError('INVALID_PRICE', `Invalid price for product "${product.name}"`);
    }

    if (unitPrice < product.sell_price) {
      throw new SaleError(
        'PRICE_BELOW_MINIMUM',
        `Sale price for "${product.name}" cannot be less than ${product.sell_price}`
      );
    }

    const lineDiscount = round2(parseFloat(String(item.line_discount || 0)) || 0);
    if (lineDiscount < 0 || lineDiscount > unitPrice) {
      throw new SaleError(
        'INVALID_LINE_DISCOUNT',
        `Line discount for "${product.name}" must be between 0 and unit price`
      );
    }

    const stock = await ensureProductStock(companyId, branchId, product.id, tx);

    if (stock.stock_qty < qty) {
      throw new SaleError(
        'INSUFFICIENT_STOCK',
        `Insufficient stock for "${product.name}". Available: ${stock.stock_qty}, requested: ${qty}`,
        400,
        {
          product_id: product.id,
          available_qty: stock.stock_qty,
          requested_qty: qty,
        }
      );
    }

    verifiedItems.push({
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      qty,
      unit_price: unitPrice,
      cost_price: product.cost_price,
      line_discount: lineDiscount,
      stock_before: stock.stock_qty,
    });
  }

  return verifiedItems;
}

function calculateTotals(
  items: { qty: number; unit_price: number; line_discount: number }[],
  discountPercent: number,
  taxPercent: number
) {
  const subtotal = items.reduce((sum, item) => {
    return sum + (item.unit_price - item.line_discount) * item.qty;
  }, 0);

  const discountAmount = round2(subtotal * (discountPercent / 100));
  const taxableAmount = round2(subtotal - discountAmount);
  const taxAmount = round2(taxableAmount * (taxPercent / 100));
  const total = round2(taxableAmount + taxAmount);

  return {
    subtotal: round2(subtotal),
    discountAmount,
    taxableAmount,
    taxAmount,
    total,
  };
}

async function applyCustomerBalanceUpdate(
  sale: { id: number; customer_id: number | null; total: number; amount_paid: number },
  companyId: number,
  sellerName: string | undefined,
  tx: Prisma.TransactionClient
) {
  if (!sale.customer_id) return;

  const unpaid = round2(sale.total - sale.amount_paid);
  if (Math.abs(unpaid) < 0.001) return;

  const type = unpaid > 0 ? 'debt' : 'payment';
  const amount = Math.abs(unpaid);

  await tx.customerTransaction.create({
    data: {
      company_id: companyId,
      customer_id: sale.customer_id,
      type,
      amount,
      notes: `${type === 'debt' ? 'Debt' : 'Payment'} from Sale #${sale.id}`,
    },
  });

  await tx.customer.update({
    where: { id: sale.customer_id },
    data: {
      balance: {
        increment: unpaid,
      },
    },
  });
}

async function createSaleCore(
  data: CreateSaleDTO,
  tenant: TenantContext,
  status: 'completed' | 'held'
): Promise<SaleResponseDTO> {
  const companyId = tenant.company_id;
  const branchId = tenant.branch_id;
  const userId = tenant.user?.id;

  const discount = round2(parseFloat(String(data.discount || 0)) || 0);
  const tax = round2(parseFloat(String(data.tax || 0)) || 0);
  const saleType = (data.sale_type || 'retail') as SaleType;
  const customerId = data.customer_id ? parseInt(String(data.customer_id)) : null;
  const sellerName = data.seller_name || tenant.user?.name;

  if (data.payment_method === 'installment') {
    throw new SaleError('NOT_SUPPORTED', 'Installments are not supported in Phase 3', 400);
  }

  const result = await prisma.$transaction(
    async (tx) => {
      // Idempotency check
      if (data.idempotency_key) {
        const existing = await tx.sale.findFirst({
          where: {
            company_id: companyId,
            idempotency_key: data.idempotency_key,
          },
          include: {
            items: { include: { product: true } },
            sale_payments: true,
            customer: true,
          },
        });

        if (existing) {
          return buildSaleResponse(existing);
        }
      }

      const verifiedItems = await validateAndLoadProducts(
        data.items.map((i) => ({
          product_id: i.product_id,
          qty: i.qty,
          unit_price: i.unit_price,
          line_discount: i.line_discount,
        })),
        companyId,
        branchId,
        tx
      );

      const { subtotal, discountAmount, taxAmount, total } = calculateTotals(
        verifiedItems,
        discount,
        tax
      );

      // Build payments
      const payments: { method: PaymentMethod; amount: number }[] = [];
      if (data.payments && data.payments.length > 0) {
        let paymentsTotal = 0;
        for (const p of data.payments) {
          const amount = round2(parseFloat(String(p.amount)) || 0);
          if (amount <= 0) continue;
          payments.push({ method: p.method, amount });
          paymentsTotal += amount;
        }
        const paymentsTotalRounded = round2(paymentsTotal);
        if (Math.abs(paymentsTotalRounded - total) > 0.01 && status === 'completed') {
          throw new SaleError(
            'PAYMENT_MISMATCH',
            `Payments total (${paymentsTotalRounded}) does not match sale total (${total})`
          );
        }
      }

      const primaryMethod = data.payment_method;
      const amountPaid =
        status === 'held'
          ? 0
          : round2(
              data.amount_paid !== undefined && data.amount_paid !== null
                ? parseFloat(String(data.amount_paid))
                : payments.reduce((sum, p) => sum + p.amount, total)
            );

      if (status === 'completed' && primaryMethod !== 'deferred' && amountPaid < total) {
        throw new SaleError(
          'INSUFFICIENT_PAYMENT',
          `Amount paid (${amountPaid}) is less than total (${total})`
        );
      }

      const invoiceNumber = status === 'completed' ? await generateInvoiceNumber(companyId, tx) : null;

      const sale = await tx.sale.create({
        data: {
          company_id: companyId,
          branch_id: branchId,
          customer_id: customerId,
          customer_name: data.customer_name || null,
          invoice_number: invoiceNumber,
          status,
          total,
          discount,
          tax,
          amount_paid: amountPaid,
          payment_method: primaryMethod,
          sale_type: saleType,
          notes: data.notes || null,
          seller_name: sellerName || null,
          idempotency_key: data.idempotency_key || null,
          items: {
            create: verifiedItems.map((item) => ({
              product_id: item.product_id,
              qty: item.qty,
              unit_price: item.unit_price,
              cost_price: item.cost_price,
              line_discount: item.line_discount,
            })),
          },
        },
        include: {
          items: { include: { product: true } },
          customer: true,
        },
      });

      // Create sale payments
      if (status === 'completed' && payments.length > 0) {
        await tx.salePayment.createMany({
          data: payments.map((p) => ({
            sale_id: sale.id,
            company_id: companyId,
            method: p.method,
            amount: p.amount,
          })),
        });
      } else if (status === 'completed') {
        await tx.salePayment.create({
          data: {
            sale_id: sale.id,
            company_id: companyId,
            method: primaryMethod,
            amount: amountPaid,
          },
        });
      }

      // Stock + inventory movement for completed sales only
      if (status === 'completed') {
        for (const item of verifiedItems) {
          const updatedStock = await tx.productStock.update({
            where: {
              company_id_branch_id_product_id: {
                company_id: companyId,
                branch_id: branchId,
                product_id: item.product_id,
              },
            },
            data: {
              stock_qty: {
                decrement: item.qty,
              },
            },
          });

          // Backward-compatible fallback column
          await tx.product.update({
            where: { id: item.product_id },
            data: {
              stock_qty: {
                decrement: item.qty,
              },
            },
          });

          await recordInventoryMovement(
            companyId,
            branchId,
            item.product_id,
            'SALE',
            -item.qty,
            updatedStock.stock_qty,
            'sale',
            sale.id,
            userId,
            `Sale #${sale.id}`,
            tx
          );
        }

        await applyCustomerBalanceUpdate(
          { id: sale.id, customer_id: customerId, total, amount_paid: amountPaid },
          companyId,
          sellerName,
          tx
        );
      }

      const fullSale = await tx.sale.findUnique({
        where: { id: sale.id },
        include: {
          items: { include: { product: true } },
          sale_payments: true,
          customer: true,
        },
      });

      return buildSaleResponse(fullSale);
    },
    {
      maxWait: 15000,
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );

  return result;
}

export async function createSale(data: CreateSaleDTO, tenant: TenantContext): Promise<SaleResponseDTO> {
  return createSaleCore(data, tenant, 'completed');
}

export async function holdSale(data: HoldSaleDTO, tenant: TenantContext): Promise<SaleResponseDTO> {
  const holdData: CreateSaleDTO = {
    ...data,
    payment_method: 'cash',
    amount_paid: 0,
  };
  return createSaleCore(holdData, tenant, 'held');
}

export async function resumeSale(saleId: number, tenant: TenantContext): Promise<SaleResponseDTO> {
  const companyId = tenant.company_id;

  const sale = await prisma.sale.findFirst({
    where: {
      id: saleId,
      company_id: companyId,
      status: 'held',
    },
    include: {
      items: { include: { product: true } },
      sale_payments: true,
      customer: true,
    },
  });

  if (!sale) {
    throw new SaleError('SALE_NOT_FOUND', 'Held sale not found', 404);
  }

  return buildSaleResponse(sale);
}

export async function completeHeldSale(
  saleId: number,
  data: CreateSaleDTO,
  tenant: TenantContext
): Promise<SaleResponseDTO> {
  const companyId = tenant.company_id;
  const branchId = tenant.branch_id;
  const userId = tenant.user?.id;

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.sale.findFirst({
        where: { id: saleId, company_id: companyId, status: 'held' },
        include: { items: { include: { product: true } }, customer: true },
      });

      if (!existing) {
        throw new SaleError('SALE_NOT_FOUND', 'Held sale not found', 404);
      }

      // Remove old held items so we can re-validate current stock/prices
      await tx.saleItem.deleteMany({ where: { sale_id: existing.id } });

      const discount = round2(parseFloat(String(data.discount || existing.discount || 0)) || 0);
      const tax = round2(parseFloat(String(data.tax || existing.tax || 0)) || 0);
      const primaryMethod = data.payment_method;

      if (primaryMethod === 'installment') {
        throw new SaleError('NOT_SUPPORTED', 'Installments are not supported in Phase 3', 400);
      }

      const verifiedItems = await validateAndLoadProducts(
        data.items.map((i) => ({
          product_id: i.product_id,
          qty: i.qty,
          unit_price: i.unit_price,
          line_discount: i.line_discount,
        })),
        companyId,
        branchId,
        tx
      );

      const { total } = calculateTotals(verifiedItems, discount, tax);

      const payments: { method: PaymentMethod; amount: number }[] = [];
      if (data.payments && data.payments.length > 0) {
        for (const p of data.payments) {
          const amount = round2(parseFloat(String(p.amount)) || 0);
          if (amount > 0) payments.push({ method: p.method, amount });
        }
      }

      const amountPaid =
        data.amount_paid !== undefined && data.amount_paid !== null
          ? round2(parseFloat(String(data.amount_paid)))
          : payments.reduce((sum, p) => sum + p.amount, total);

      if (primaryMethod !== 'deferred' && amountPaid < total) {
        throw new SaleError('INSUFFICIENT_PAYMENT', 'Amount paid is less than total');
      }

      const invoiceNumber = await generateInvoiceNumber(companyId, tx);

      await tx.sale.update({
        where: { id: existing.id },
        data: {
          invoice_number: invoiceNumber,
          status: 'completed',
          total,
          discount,
          tax,
          amount_paid: amountPaid,
          payment_method: primaryMethod,
          sale_type: (data.sale_type || existing.sale_type || 'retail') as SaleType,
          notes: data.notes || existing.notes,
          seller_name: data.seller_name || existing.seller_name || tenant.user?.name,
          customer_id: data.customer_id || existing.customer_id,
          customer_name: data.customer_name || existing.customer_name,
        },
      });

      await tx.saleItem.createMany({
        data: verifiedItems.map((item) => ({
          sale_id: existing.id,
          product_id: item.product_id,
          qty: item.qty,
          unit_price: item.unit_price,
          cost_price: item.cost_price,
          line_discount: item.line_discount,
        })),
      });

      if (payments.length > 0) {
        await tx.salePayment.createMany({
          data: payments.map((p) => ({
            sale_id: existing.id,
            company_id: companyId,
            method: p.method,
            amount: p.amount,
          })),
        });
      } else {
        await tx.salePayment.create({
          data: {
            sale_id: existing.id,
            company_id: companyId,
            method: primaryMethod,
            amount: amountPaid,
          },
        });
      }

      for (const item of verifiedItems) {
        const updatedStock = await tx.productStock.update({
          where: {
            company_id_branch_id_product_id: {
              company_id: companyId,
              branch_id: branchId,
              product_id: item.product_id,
            },
          },
          data: { stock_qty: { decrement: item.qty } },
        });

        await tx.product.update({
          where: { id: item.product_id },
          data: { stock_qty: { decrement: item.qty } },
        });

        await recordInventoryMovement(
          companyId,
          branchId,
          item.product_id,
          'SALE',
          -item.qty,
          updatedStock.stock_qty,
          'sale',
          existing.id,
          userId,
          `Sale #${existing.id}`,
          tx
        );
      }

      await applyCustomerBalanceUpdate(
        { id: existing.id, customer_id: existing.customer_id, total, amount_paid: amountPaid },
        companyId,
        data.seller_name || tenant.user?.name,
        tx
      );

      const fullSale = await tx.sale.findUnique({
        where: { id: existing.id },
        include: {
          items: { include: { product: true } },
          sale_payments: true,
          customer: true,
        },
      });

      return buildSaleResponse(fullSale);
    },
    {
      maxWait: 15000,
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

export async function cancelSale(
  saleId: number,
  data: CancelSaleDTO,
  tenant: TenantContext
): Promise<SaleResponseDTO> {
  const companyId = tenant.company_id;
  const branchId = tenant.branch_id;
  const userId = tenant.user?.id;
  const cancelledBy = data.cancelled_by || tenant.user?.name;

  return prisma.$transaction(
    async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, company_id: companyId, status: 'completed' },
        include: { items: { include: { product: true } }, sale_payments: true, customer: true },
      });

      if (!sale) {
        throw new SaleError('SALE_NOT_FOUND', 'Completed sale not found', 404);
      }

      // Check no refunds exist
      const refundCount = await tx.refund.count({
        where: { sale_id: sale.id, company_id: companyId },
      });

      if (refundCount > 0) {
        throw new SaleError(
          'SALE_HAS_REFUNDS',
          'Cannot cancel a sale that has refunds. Use refund workflow instead.',
          400
        );
      }

      for (const item of sale.items) {
        const updatedStock = await tx.productStock.upsert({
          where: {
            company_id_branch_id_product_id: {
              company_id: companyId,
              branch_id: branchId,
              product_id: item.product_id,
            },
          },
          update: {
            stock_qty: {
              increment: item.qty,
            },
          },
          create: {
            company_id: companyId,
            branch_id: branchId,
            product_id: item.product_id,
            stock_qty: item.qty,
            low_stock_threshold: 5,
          },
        });

        await tx.product.update({
          where: { id: item.product_id },
          data: { stock_qty: { increment: item.qty } },
        });

        await recordInventoryMovement(
          companyId,
          branchId,
          item.product_id,
          'SALE_CANCEL',
          item.qty,
          updatedStock.stock_qty,
          'sale',
          sale.id,
          userId,
          `Cancel Sale #${sale.id}`,
          tx
        );
      }

      // Reverse customer balance if there was deferred/partial debt
      if (sale.customer_id) {
        const unpaid = round2(sale.total - sale.amount_paid);
        if (Math.abs(unpaid) > 0.001) {
          await tx.customerTransaction.create({
            data: {
              company_id: companyId,
              customer_id: sale.customer_id,
              type: unpaid > 0 ? 'payment' : 'debt',
              amount: Math.abs(unpaid),
              notes: `Cancel Sale #${sale.id}`,
            },
          });

          await tx.customer.update({
            where: { id: sale.customer_id },
            data: { balance: { decrement: unpaid } },
          });
        }
      }

      const updatedSale = await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: 'cancelled',
          cancel_reason: data.reason,
          cancelled_at: new Date(),
          cancelled_by: cancelledBy,
        },
        include: {
          items: { include: { product: true } },
          sale_payments: true,
          customer: true,
        },
      });

      return buildSaleResponse(updatedSale);
    },
    {
      maxWait: 15000,
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

export async function getSaleById(saleId: number, tenant: TenantContext): Promise<SaleResponseDTO> {
  const companyId = tenant.company_id;

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, company_id: companyId },
    include: {
      items: { include: { product: true } },
      sale_payments: true,
      customer: true,
    },
  });

  if (!sale) {
    throw new SaleError('SALE_NOT_FOUND', 'Sale not found', 404);
  }

  return buildSaleResponse(sale);
}

export async function listSales(
  tenant: TenantContext,
  filters: {
    from?: string;
    to?: string;
    customerId?: number;
    sale_type?: string;
    invoiceId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }
): Promise<{ data: SaleListItemDTO[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
  const companyId = tenant.company_id;
  const branchId = tenant.branch_id;
  const page = filters.page || 1;
  const limit = filters.limit || 10;
  const skip = (page - 1) * limit;

  const where: Prisma.SaleWhereInput = {
    company_id: companyId,
    branch_id: branchId,
  };

  if (filters.invoiceId) {
    where.OR = [
      { id: parseInt(filters.invoiceId) },
      { invoice_number: { contains: filters.invoiceId, mode: 'insensitive' } },
    ];
  }

  if (filters.customerId) {
    where.customer_id = filters.customerId;
  }

  if (filters.sale_type && filters.sale_type !== 'all') {
    where.sale_type = filters.sale_type as SaleType;
  }

  if (filters.status && filters.status !== 'all') {
    where.status = filters.status;
  }

  if (filters.from || filters.to) {
    where.created_at = {};
    if (filters.from) {
      where.created_at.gte = new Date(filters.from + 'T00:00:00.000Z');
    }
    if (filters.to) {
      where.created_at.lte = new Date(filters.to + 'T23:59:59.999Z');
    }
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      select: {
        id: true,
        invoice_number: true,
        status: true,
        customer_id: true,
        customer_name: true,
        seller_name: true,
        sale_type: true,
        total: true,
        amount_paid: true,
        payment_method: true,
        created_at: true,
        _count: { select: { items: true } },
        customer: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.sale.count({ where }),
  ]);

  const data: SaleListItemDTO[] = sales.map((sale: any) => ({
    id: sale.id,
    invoice_number: sale.invoice_number,
    status: sale.status,
    customer_id: sale.customer_id,
    customer_name: sale.customer_name || (sale.customer ? sale.customer.name : null),
    seller_name: sale.seller_name,
    sale_type: sale.sale_type,
    total: sale.total,
    amount_paid: sale.amount_paid,
    payment_method: sale.payment_method,
    item_count: sale._count.items,
    created_at: sale.created_at,
  }));

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function reprintSale(saleId: number, tenant: TenantContext): Promise<SaleResponseDTO> {
  // For now, reprint just returns the sale DTO.
  // Future: log reprint event to audit log.
  return getSaleById(saleId, tenant);
}

export { SaleError };
