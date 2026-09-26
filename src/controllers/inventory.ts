import { Request, Response } from 'express';
import { InventoryService } from '../services/inventory.service';

export const getBalances = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id || 1;

    const result = await InventoryService.getBalances(companyId, branchId, {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      search: req.query.search as string,
      category_id: req.query.category_id ? Number(req.query.category_id) : undefined,
      low_stock_only: req.query.low_stock_only === 'true',
    });

    res.json({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  } catch (error: any) {
    console.error('Error fetching inventory balances:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: error.message || 'حدث خطأ أثناء جلب أرصدة المخزون',
    });
  }
};

export const getMovements = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id || 1;

    const result = await InventoryService.getMovements(companyId, branchId, {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      product_id: req.query.product_id ? Number(req.query.product_id) : undefined,
      movement_type: req.query.movement_type as string,
      from: req.query.from as string,
      to: req.query.to as string,
    });

    res.json({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  } catch (error: any) {
    console.error('Error fetching inventory movements:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: error.message || 'حدث خطأ أثناء جلب حركات المخزون',
    });
  }
};

export const getProductStockCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id || 1;
    const paramId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const productId = parseInt(paramId, 10);

    if (isNaN(productId)) {
      res.status(400).json({
        success: false,
        code: 'INVALID_ID',
        message: 'معرف المنتج غير صالح',
      });
      return;
    }

    const card = await InventoryService.getProductStockCard(companyId, branchId, productId);

    res.json({
      success: true,
      data: card,
    });
  } catch (error: any) {
    if (error.code === 'NOT_FOUND') {
      res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: error.message,
      });
      return;
    }
    console.error('Error fetching stock card:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: error.message || 'حدث خطأ أثناء جلب بطاقة الصنف',
    });
  }
};

export const createAdjustment = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id || 1;
    const userId = (req as any).user?.id || req.tenant?.user?.id;

    const { product_id, type, reason, notes } = req.body;
    const rawQty = req.body.qty !== undefined ? req.body.qty : req.body.quantity;

    if (!product_id || !type || rawQty === undefined || rawQty === null) {
      res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'بيانات التسوية ناقصة (المنتج، النوع، الكمية)',
      });
      return;
    }

    if (!['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE'].includes(type)) {
      res.status(400).json({
        success: false,
        code: 'INVALID_TYPE',
        message: 'نوع التسوية غير صالح (يجب أن يكون ADJUSTMENT_IN أو ADJUSTMENT_OUT أو DAMAGE)',
      });
      return;
    }

    const result = await InventoryService.createAdjustment(companyId, branchId, userId, {
      product_id: Number(product_id),
      type,
      qty: Number(rawQty),
      reason,
      notes,
    });

    res.status(201).json({
      success: true,
      message: 'تم تسجيل التسوية المخزنية بنجاح',
      data: {
        ...result,
        type,
        quantity: result.movement.quantity_delta,
      },
    });
  } catch (error: any) {
    if (error.code === 'INSUFFICIENT_STOCK') {
      res.status(400).json({
        success: false,
        code: error.code,
        message: error.message,
        details: error.details,
      });
      return;
    }

    if (error.code === 'INVALID_QUANTITY' || error.code === 'REASON_REQUIRED') {
      res.status(400).json({
        success: false,
        code: error.code,
        message: error.message,
      });
      return;
    }

    console.error('Error creating inventory adjustment:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: error.message || 'حدث خطأ أثناء تسجيل حركة المخزون',
    });
  }
};

export const getLowStock = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id || 1;

    const lowStockItems = await InventoryService.getLowStock(companyId, branchId);

    res.json({
      success: true,
      data: lowStockItems,
      total: lowStockItems.length,
    });
  } catch (error: any) {
    console.error('Error fetching low stock products:', error);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: error.message || 'حدث خطأ أثناء جلب تنبيهات النواقص',
    });
  }
};
