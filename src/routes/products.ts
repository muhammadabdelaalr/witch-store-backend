import { Router } from 'express';
import {
  getAllProducts,
  getProductByBarcode,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
} from '../controllers/products';
import { authTokenMiddleware, requireUserSession } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { requireModule } from '../middleware/guards';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../utils/permissions';
import { idParamSchema, legacyStockAdjustmentSchema, productListQuerySchema, productLookupQuerySchema, productSchema, updateProductSchema, validateBody, validateParams, validateQuery } from '../middleware/validate';

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);
router.use(requireUserSession);
router.use(requireModule('products'));

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product management
 */

/**
 * @swagger
 * /api/v1/products:
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
router.get('/', requirePermission(PERMISSIONS.PRODUCT_READ), validateQuery(productListQuerySchema), getAllProducts);

/**
 * @swagger
 * /api/v1/products/barcode:
 *   get:
 *     summary: Get product by barcode
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/barcode', requirePermission(PERMISSIONS.PRODUCT_READ), validateQuery(productLookupQuerySchema), getProductByBarcode);
router.post('/', requirePermission(PERMISSIONS.PRODUCT_CREATE), validateBody(productSchema), createProduct);

/**
 * @swagger
 * /api/v1/products/{id}:
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
router.put('/:id', requirePermission(PERMISSIONS.PRODUCT_UPDATE), validateParams(idParamSchema), validateBody(updateProductSchema), updateProduct);
router.delete('/:id', requirePermission(PERMISSIONS.PRODUCT_DELETE), validateParams(idParamSchema), deleteProduct);

/**
 * @swagger
 * /api/v1/products/{id}/adjust-stock:
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
router.post('/:id/adjust-stock', requirePermission(PERMISSIONS.INVENTORY_ADJUST), validateParams(idParamSchema), validateBody(legacyStockAdjustmentSchema), adjustStock);

export default router;
