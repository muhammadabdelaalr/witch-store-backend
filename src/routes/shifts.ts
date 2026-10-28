import { Router } from 'express';
import {
  openShift,
  getCurrentShift,
  recordCashMovement,
  closeShift,
  getShiftSummary,
  listShifts,
} from '../controllers/shifts';
import { authTokenMiddleware, requireUserSession } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { requireModule } from '../middleware/guards';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../utils/permissions';
import { cashMovementSchema, closeShiftSchema, idParamSchema, openShiftSchema, shiftListQuerySchema, validateBody, validateParams, validateQuery } from '../middleware/validate';

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);
router.use(requireUserSession);

// Active Shift Lifecycle
router.get('/current', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), getCurrentShift);
router.post('/open', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), validateBody(openShiftSchema), openShift);
router.post('/cash-movement', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), validateBody(cashMovementSchema), recordCashMovement);
router.post('/:id/close', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), validateParams(idParamSchema), validateBody(closeShiftSchema), closeShift);
router.get('/:id/summary', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), validateParams(idParamSchema), getShiftSummary);
router.get('/', requireModule('pos'), requirePermission(PERMISSIONS.POS_SALE), validateQuery(shiftListQuerySchema), listShifts);

export default router;
