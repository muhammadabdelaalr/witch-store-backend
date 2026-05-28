import { Router } from 'express';
import {
  getAllCustomers,
  createCustomer,
  updateCustomer,
  addCustomerTransaction,
  getCustomerTransactions,
} from '../controllers/customers';

const router = Router();

router.get('/', getAllCustomers);
router.post('/', createCustomer);
router.put('/:id', updateCustomer);
router.post('/transaction', addCustomerTransaction);
router.get('/:id/transactions', getCustomerTransactions);

export default router;
