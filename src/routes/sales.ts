import { Router } from 'express';
import {
  createSale,
  getAllSales,
  getSaleById,
} from '../controllers/sales';

const router = Router();

router.post('/', createSale);
router.get('/', getAllSales);
router.get('/:id', getSaleById);

export default router;
