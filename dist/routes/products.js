"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const products_1 = require("../controllers/products");
const router = (0, express_1.Router)();
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
router.get('/', products_1.getAllProducts);
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
router.get('/barcode', products_1.getProductByBarcode);
router.post('/', products_1.createProduct);
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
router.put('/:id', products_1.updateProduct);
router.delete('/:id', products_1.deleteProduct);
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
router.post('/:id/adjust-stock', products_1.adjustStock);
exports.default = router;
