import { prisma } from '../prisma';
import { Prisma } from '../generated/prisma';

export const MOVEMENT_TYPES = {
  OPENING: 'OPENING',
  PURCHASE: 'PURCHASE',
  SALE: 'SALE',
  SALE_RETURN: 'SALE_RETURN',
  PURCHASE_RETURN: 'PURCHASE_RETURN',
  ADJUSTMENT_IN: 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT: 'ADJUSTMENT_OUT',
  DAMAGE: 'DAMAGE',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
} as const;

export type MovementType = (typeof MOVEMENT_TYPES)[keyof typeof MOVEMENT_TYPES];

export interface ApplyMovementParams {
  company_id: number;
  branch_id: number;
  product_id: number;
  movement_type: string;
  quantity_delta: number; // positive to add, negative to subtract
  reference_type: string;
  reference_id?: number;
  user_id?: number | null;
  notes?: string | null;
}

export class InventoryService {
  /**
   * Applies an inventory movement within a transaction (or uses global prisma client).
   * Atomically updates ProductStock, syncs Product.stock_qty, and records the movement ledger entry.
   */
  static async applyMovement(
    tx: Prisma.TransactionClient,
    params: ApplyMovementParams
  ) {
    const {
      company_id,
      branch_id,
      product_id,
      movement_type,
      quantity_delta,
      reference_type,
      reference_id = 0,
      user_id,
      notes,
    } = params;

    // Enforce piece-only integer check
    if (!Number.isInteger(quantity_delta)) {
      throw new Error('Quantity delta must be an integer piece quantity.');
    }

    // 1. Ensure Product belongs to company
    const product = await tx.product.findFirst({
      where: { id: product_id, company_id },
      select: { id: true, name: true, stock_qty: true, low_stock_threshold: true },
    });

    if (!product) {
      throw new Error(`Product with ID ${product_id} not found in this company.`);
    }

    // 2. Fetch or create branch stock
    const currentStock = await tx.productStock.upsert({
      where: {
        company_id_branch_id_product_id: {
          company_id,
          branch_id,
          product_id,
        },
      },
      update: {},
      create: {
        company_id,
        branch_id,
        product_id,
        stock_qty: 0,
        low_stock_threshold: product.low_stock_threshold || 5,
      },
    });

    const newStockQty = currentStock.stock_qty + quantity_delta;

    // Prevent negative stock
    if (newStockQty < 0) {
      const err: any = new Error(
        `الكمية المتاحة في المخزن (${currentStock.stock_qty}) غير كافية لخصم (${Math.abs(quantity_delta)}) للمنتج: ${product.name}`
      );
      err.code = 'INSUFFICIENT_STOCK';
      err.details = {
        product_id,
        available_qty: currentStock.stock_qty,
        requested_qty: Math.abs(quantity_delta),
      };
      throw err;
    }

    // 3. Update branch stock balance
    const updatedBranchStock = await tx.productStock.update({
      where: { id: currentStock.id },
      data: { stock_qty: newStockQty },
    });

    // 4. Synchronize legacy Product.stock_qty across all branches for this company
    const allBranchStocks = await tx.productStock.aggregate({
      where: { company_id, product_id },
      _sum: { stock_qty: true },
    });
    const totalCompanyStock = allBranchStocks._sum.stock_qty ?? newStockQty;

    await tx.product.update({
      where: { id: product_id },
      data: { stock_qty: totalCompanyStock },
    });

    // 5. Create immutable movement ledger record
    const movement = await tx.inventoryMovement.create({
      data: {
        company_id,
        branch_id,
        product_id,
        movement_type,
        quantity_delta,
        balance_after: newStockQty,
        reference_type,
        reference_id,
        user_id: user_id || null,
        notes: notes || null,
      },
    });

    return {
      stock: updatedBranchStock,
      movement,
      balance_after: newStockQty,
    };
  }

  /**
   * Retrieves paginated branch stock balances with search and filters.
   */
  static async getBalances(
    companyId: number,
    branchId: number,
    filters: {
      page?: number;
      limit?: number;
      search?: string;
      category_id?: number;
      low_stock_only?: boolean;
    }
  ) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const skip = (page - 1) * limit;

    const whereClause: Prisma.ProductWhereInput = {
      company_id: companyId,
      is_active: true,
    };

    if (filters.search?.trim()) {
      const q = filters.search.trim();
      whereClause.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (filters.category_id) {
      whereClause.category_id = Number(filters.category_id);
    }

    const [totalProducts, products] = await Promise.all([
      prisma.product.count({ where: whereClause }),
      prisma.product.findMany({
        where: whereClause,
        include: {
          category: { select: { id: true, name: true } },
          product_stocks: {
            where: { branch_id: branchId },
            select: { id: true, stock_qty: true, low_stock_threshold: true },
          },
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
    ]);

    const formatted = products.map((p) => {
      const branchStock = p.product_stocks[0];
      const stock_qty = branchStock?.stock_qty ?? 0;
      const low_stock_threshold = branchStock?.low_stock_threshold ?? (p.low_stock_threshold || 5);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        factory: p.factory,
        category: p.category,
        cost_price: p.cost_price,
        sell_price: p.sell_price,
        stock_qty,
        low_stock_threshold,
        is_low_stock: stock_qty <= low_stock_threshold,
      };
    });

    const results = filters.low_stock_only
      ? formatted.filter((item) => item.is_low_stock)
      : formatted;

    return {
      data: results,
      meta: {
        page,
        limit,
        total: totalProducts,
        totalPages: Math.ceil(totalProducts / limit),
      },
    };
  }

  /**
   * Retrieves paginated movements ledger with filters.
   */
  static async getMovements(
    companyId: number,
    branchId: number,
    filters: {
      page?: number;
      limit?: number;
      product_id?: number;
      movement_type?: string;
      from?: string;
      to?: string;
    }
  ) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryMovementWhereInput = {
      company_id: companyId,
      branch_id: branchId,
    };

    if (filters.product_id) {
      where.product_id = Number(filters.product_id);
    }

    if (filters.movement_type) {
      where.movement_type = filters.movement_type;
    }

    if (filters.from || filters.to) {
      where.created_at = {};
      if (filters.from) {
        where.created_at.gte = new Date(filters.from);
      }
      if (filters.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        where.created_at.lte = toDate;
      }
    }

    const [total, movements] = await Promise.all([
      prisma.inventoryMovement.count({ where }),
      prisma.inventoryMovement.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true, barcode: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const userIds = [...new Set(movements.map((m) => m.user_id).filter((id): id is number => typeof id === 'number'))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      data: movements.map((m) => ({
        id: m.id,
        created_at: m.created_at,
        movement_type: m.movement_type,
        quantity_delta: m.quantity_delta,
        balance_after: m.balance_after,
        reference_type: m.reference_type,
        reference_id: m.reference_id,
        notes: m.notes,
        product: m.product,
        user: m.user_id ? userMap.get(m.user_id) || null : null,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves complete stock card for a specific product.
   */
  static async getProductStockCard(
    companyId: number,
    branchId: number,
    productId: number
  ) {
    const product = await prisma.product.findFirst({
      where: { id: productId, company_id: companyId },
      include: {
        category: { select: { id: true, name: true } },
        product_stocks: {
          where: { branch_id: branchId },
          select: { stock_qty: true, low_stock_threshold: true },
        },
      },
    });

    if (!product) {
      const error: any = new Error('المنتج غير موجود');
      error.code = 'NOT_FOUND';
      throw error;
    }

    const currentStock = product.product_stocks[0]?.stock_qty ?? 0;
    const threshold = product.product_stocks[0]?.low_stock_threshold ?? (product.low_stock_threshold || 5);

    // Aggregate lifetime inflows and outflows
    const [inflowAgg, outflowAgg, recentMovements] = await Promise.all([
      prisma.inventoryMovement.aggregate({
        where: {
          company_id: companyId,
          branch_id: branchId,
          product_id: productId,
          quantity_delta: { gt: 0 },
        },
        _sum: { quantity_delta: true },
      }),
      prisma.inventoryMovement.aggregate({
        where: {
          company_id: companyId,
          branch_id: branchId,
          product_id: productId,
          quantity_delta: { lt: 0 },
        },
        _sum: { quantity_delta: true },
      }),
      prisma.inventoryMovement.findMany({
        where: {
          company_id: companyId,
          branch_id: branchId,
          product_id: productId,
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
    ]);

    const cardUserIds = [...new Set(recentMovements.map((m) => m.user_id).filter((id): id is number => typeof id === 'number'))];
    const cardUsers = cardUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: cardUserIds } },
          select: { id: true, name: true },
        })
      : [];
    const cardUserMap = new Map(cardUsers.map((u) => [u.id, u]));

    return {
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        factory: product.factory,
        category: product.category,
        cost_price: product.cost_price,
        sell_price: product.sell_price,
        current_stock: currentStock,
        low_stock_threshold: threshold,
        is_low_stock: currentStock <= threshold,
      },
      stats: {
        total_in: inflowAgg._sum.quantity_delta ?? 0,
        total_out: Math.abs(outflowAgg._sum.quantity_delta ?? 0),
        net_balance: currentStock,
        total_movements_count: recentMovements.length,
      },
      movements: recentMovements.map((m) => ({
        ...m,
        user: m.user_id ? cardUserMap.get(m.user_id) || null : null,
      })),
    };
  }

  /**
   * Executes a manual stock adjustment with mandatory reason and notes.
   */
  static async createAdjustment(
    companyId: number,
    branchId: number,
    userId: number | undefined,
    data: {
      product_id: number;
      type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE';
      qty: number;
      reason: string;
      notes?: string;
    }
  ) {
    const qty = parseInt(String(data.qty), 10);
    if (!qty || qty <= 0 || !Number.isInteger(qty)) {
      const error: any = new Error('يجب إدخال كمية صحيحة موجبة بالقطعة');
      error.code = 'INVALID_QUANTITY';
      throw error;
    }

    if (!data.reason?.trim()) {
      const error: any = new Error('سبب التسوية المخزنية إلزامي');
      error.code = 'REASON_REQUIRED';
      throw error;
    }

    const delta = data.type === 'ADJUSTMENT_IN' ? qty : -qty;
    const combinedNotes = data.notes?.trim()
      ? `${data.reason.trim()} - ${data.notes.trim()}`
      : data.reason.trim();

    return await prisma.$transaction(async (tx) => {
      return await InventoryService.applyMovement(tx, {
        company_id: companyId,
        branch_id: branchId,
        product_id: data.product_id,
        movement_type: data.type,
        quantity_delta: delta,
        reference_type: 'MANUAL_ADJUSTMENT',
        reference_id: 0,
        user_id: userId,
        notes: combinedNotes,
      });
    }, {
      maxWait: 15000,
      timeout: 30000,
    });
  }

  /**
   * Returns list of products currently below or at their low stock threshold.
   */
  static async getLowStock(companyId: number, branchId: number) {
    const stocks = await prisma.productStock.findMany({
      where: {
        company_id: companyId,
        branch_id: branchId,
        stock_qty: { lte: prisma.productStock.fields.low_stock_threshold },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            sell_price: true,
            cost_price: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { stock_qty: 'asc' },
    });

    return stocks.map((s) => ({
      id: s.product.id,
      name: s.product.name,
      sku: s.product.sku,
      barcode: s.product.barcode,
      category: s.product.category,
      current_stock: s.stock_qty,
      threshold: s.low_stock_threshold,
      deficit: Math.max(0, s.low_stock_threshold - s.stock_qty),
    }));
  }
}
