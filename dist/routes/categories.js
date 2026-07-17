"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const categories_1 = require("../controllers/categories");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const guards_1 = require("../middleware/guards");
const router = (0, express_1.Router)();
router.use(auth_1.authTokenMiddleware);
router.use(tenant_1.tenantResolverMiddleware);
router.use((0, guards_1.requireModule)('products')); // products module covers category settings
/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Category management
 */
/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Retrieve a list of categories
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of categories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: The category ID
 *                   name:
 *                     type: string
 *                     description: The category name
 */
router.get("/", categories_1.getAllCategories);
/**
 * @swagger
 * /api/categories:
 *   post:
 *     summary: Create a new category
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
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
 *                 description: The category name
 *     responses:
 *       201:
 *         description: The created category
 *       400:
 *         description: Category name is required
 *       500:
 *         description: Internal server error
 */
router.post("/", categories_1.createCategory);
exports.default = router;
