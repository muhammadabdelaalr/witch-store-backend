import { Router } from 'express';
import {
  getAllExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} from '../controllers/expenses';

const router = Router();

router.get('/', getAllExpenses);
router.post('/', createExpense);
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);

export default router;
