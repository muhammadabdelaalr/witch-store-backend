import { Router } from 'express';
import {
  getAllProducts,
  getProductByBarcode,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
} from '../controllers/products';

const router = Router();

router.get('/', getAllProducts);
router.get('/barcode', getProductByBarcode);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);
router.post('/:id/adjust-stock', adjustStock);

export default router;
