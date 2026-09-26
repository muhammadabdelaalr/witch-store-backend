import { Router } from 'express';
import {
  getBalances,
  getMovements,
  getProductStockCard,
  createAdjustment,
  getLowStock,
} from '../controllers/inventory';
import { authTokenMiddleware } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { requireModule } from '../middleware/guards';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../utils/permissions';

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);

// All inventory routes require 'products' module entitlement
router.get('/balances', requireModule('products'), requirePermission(PERMISSIONS.INVENTORY_READ), getBalances);
router.get('/movements', requireModule('products'), requirePermission(PERMISSIONS.INVENTORY_READ), getMovements);
router.get('/products/:id/card', requireModule('products'), requirePermission(PERMISSIONS.INVENTORY_READ), getProductStockCard);
router.get('/low-stock', requireModule('products'), requirePermission(PERMISSIONS.INVENTORY_READ), getLowStock);
router.post('/adjustments', requireModule('products'), requirePermission(PERMISSIONS.INVENTORY_ADJUST), createAdjustment);

export default router;
