import { Router } from 'express';
import {
  createSale,
  getAllSales,
  getSaleById,
  holdSale,
  listHeldSales,
  resumeSale,
  completeHeldSale,
  cancelSale,
  reprintSale,
} from '../controllers/sales';
import { createRefund } from '../controllers/refunds';
import { authTokenMiddleware, requireUserSession } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { requireModule } from '../middleware/guards';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../utils/permissions';
import { cancelSaleSchema, idParamSchema, refundSchema, saleListQuerySchema, saleSchema, validateBody, validateParams, validateQuery } from '../middleware/validate';

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);
router.use(requireUserSession);

// Base Sales CRUD
router.post('/', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), validateBody(saleSchema), createSale);
router.get('/', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), validateQuery(saleListQuerySchema), getAllSales);

// Held Sales Lifecycle
router.post('/hold', requireModule('pos'), requirePermission(PERMISSIONS.POS_HOLD), validateBody(saleSchema), holdSale);
router.get('/held', requireModule('pos'), requirePermission(PERMISSIONS.POS_HOLD), listHeldSales);
router.post('/held/:id/resume', requireModule('pos'), requirePermission(PERMISSIONS.POS_HOLD), validateParams(idParamSchema), resumeSale);
router.post('/held/:id/complete', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), validateParams(idParamSchema), validateBody(saleSchema), completeHeldSale);

// Specific Sale Actions (must be declared before /:id generic GET)
router.post('/:id/cancel', requireModule('pos'), requirePermission(PERMISSIONS.POS_CANCEL), validateParams(idParamSchema), validateBody(cancelSaleSchema), cancelSale);
router.post('/:id/reprint', requireModule('pos'), requirePermission(PERMISSIONS.POS_REPRINT), validateParams(idParamSchema), reprintSale);
router.post('/:id/refund', requireModule('refunds'), requirePermission(PERMISSIONS.REFUND_CREATE), validateParams(idParamSchema), validateBody(refundSchema), createRefund);

// Details Lookup
router.get('/:id', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), validateParams(idParamSchema), getSaleById);

export default router;
