import { Router } from 'express';
import {
  getAllSuppliers,
  createSupplier,
  updateSupplier,
  addSupplierTransaction,
  getSupplierTransactions,
} from '../controllers/suppliers';

const router = Router();

router.get('/', getAllSuppliers);
router.post('/', createSupplier);
router.put('/:id', updateSupplier);
router.post('/transaction', addSupplierTransaction);
router.get('/:id/transactions', getSupplierTransactions);

export default router;
