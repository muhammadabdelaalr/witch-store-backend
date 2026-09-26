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
import { authTokenMiddleware } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { requireModule } from '../middleware/guards';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../utils/permissions';

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);

// Base Sales CRUD
router.post('/', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), createSale);
router.get('/', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), getAllSales);

// Held Sales Lifecycle
router.post('/hold', requireModule('pos'), requirePermission(PERMISSIONS.POS_HOLD), holdSale);
router.get('/held', requireModule('pos'), requirePermission(PERMISSIONS.POS_HOLD), listHeldSales);
router.post('/held/:id/resume', requireModule('pos'), requirePermission(PERMISSIONS.POS_HOLD), resumeSale);
router.post('/held/:id/complete', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), completeHeldSale);

// Specific Sale Actions (must be declared before /:id generic GET)
router.post('/:id/cancel', requireModule('pos'), requirePermission(PERMISSIONS.POS_CANCEL), cancelSale);
router.post('/:id/reprint', requireModule('pos'), requirePermission(PERMISSIONS.POS_REPRINT), reprintSale);
router.post('/:id/refund', requireModule('refunds'), requirePermission(PERMISSIONS.REFUND_CREATE), createRefund);

// Details Lookup
router.get('/:id', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), getSaleById);

export default router;

