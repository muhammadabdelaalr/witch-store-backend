import { Router } from 'express';
import {
  openShift,
  getCurrentShift,
  recordCashMovement,
  closeShift,
  getShiftSummary,
  listShifts,
} from '../controllers/shifts';
import { authTokenMiddleware } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { requireModule } from '../middleware/guards';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../utils/permissions';

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);

// Active Shift Lifecycle
router.get('/current', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), getCurrentShift);
router.post('/open', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), openShift);
router.post('/cash-movement', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), recordCashMovement);
router.post('/:id/close', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), closeShift);
router.get('/:id/summary', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), getShiftSummary);
router.get('/', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), listShifts);

export default router;
