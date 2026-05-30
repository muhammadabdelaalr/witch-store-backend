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

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product management
 */

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Success
 *   post:
 *     summary: Create a product
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               sku:
 *                 type: string
 *               barcode:
 *                 type: string
 *               category_id:
 *                 type: integer
 *               factory:
 *                 type: string
 *               description:
 *                 type: string
 *               cost_price:
 *                 type: number
 *               sell_price:
 *                 type: number
 *               stock_qty:
 *                 type: integer
 *               low_stock_threshold:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/', getAllProducts);

/**
 * @swagger
 * /api/products/barcode:
 *   get:
 *     summary: Get product by barcode
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/barcode', getProductByBarcode);
router.post('/', createProduct);

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Update a product
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               sku:
 *                 type: string
 *               barcode:
 *                 type: string
 *               category_id:
 *                 type: integer
 *               factory:
 *                 type: string
 *               description:
 *                 type: string
 *               cost_price:
 *                 type: number
 *               sell_price:
 *                 type: number
 *               stock_qty:
 *                 type: integer
 *               low_stock_threshold:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Success
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Success
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 */
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);

/**
 * @swagger
 * /api/products/{id}/adjust-stock:
 *   post:
 *     summary: Adjust product stock
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - qty
 *               - type
 *             properties:
 *               qty:
 *                 type: integer
 *               type:
 *                 type: string
 *                 enum: [add, remove, set]
 *     responses:
 *       200:
 *         description: Success
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 */
router.post('/:id/adjust-stock', adjustStock);

export default router;
