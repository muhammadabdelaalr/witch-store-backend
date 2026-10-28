import { Router } from 'express';
import {
  getBalances,
  getMovements,
  getProductStockCard,
  createAdjustment,
  getLowStock,
} from '../controllers/inventory';
import { authTokenMiddleware, requireUserSession } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { requireModule } from '../middleware/guards';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../utils/permissions';
import { idParamSchema, inventoryAdjustmentSchema, inventoryBalanceQuerySchema, inventoryMovementQuerySchema, validateBody, validateParams, validateQuery } from '../middleware/validate';

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);
router.use(requireUserSession);

// All inventory routes require 'products' module entitlement
router.get('/balances', requireModule('products'), requirePermission(PERMISSIONS.INVENTORY_READ), validateQuery(inventoryBalanceQuerySchema), getBalances);
router.get('/movements', requireModule('products'), requirePermission(PERMISSIONS.INVENTORY_READ), validateQuery(inventoryMovementQuerySchema), getMovements);
router.get('/products/:id/card', requireModule('products'), requirePermission(PERMISSIONS.INVENTORY_READ), validateParams(idParamSchema), getProductStockCard);
router.get('/low-stock', requireModule('products'), requirePermission(PERMISSIONS.INVENTORY_READ), validateQuery(inventoryBalanceQuerySchema), getLowStock);
router.post('/adjustments', requireModule('products'), requirePermission(PERMISSIONS.INVENTORY_ADJUST), validateBody(inventoryAdjustmentSchema), createAdjustment);

export default router;
