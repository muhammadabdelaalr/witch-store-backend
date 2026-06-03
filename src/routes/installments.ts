import { Router } from 'express';
import {
  getCustomerInstallments,
  payInstallment,
  getUpcomingInstallments,
} from '../controllers/installments';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Installments
 *   description: Installments management
 */

router.get('/customer/:customerId', getCustomerInstallments);
router.post('/:id/pay', payInstallment);
router.get('/upcoming', getUpcomingInstallments);

export default router;
