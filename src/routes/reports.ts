import { Router } from 'express';
import {
  getDashboardStats,
  getSalesReport,
  getProfitReport,
} from '../controllers/reports';

const router = Router();

router.get('/dashboard', getDashboardStats);
router.get('/sales', getSalesReport);
router.get('/profit', getProfitReport);

export default router;
