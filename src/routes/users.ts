import { Router } from 'express';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  loginUser,
  syncActiveUser,
  logoutUser,
} from '../controllers/users';

const router = Router();

router.get('/', getAllUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);
router.post('/login', loginUser);
router.post('/sync', syncActiveUser);
router.post('/logout', logoutUser);

export default router;
