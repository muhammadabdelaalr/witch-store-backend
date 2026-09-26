import { Router } from "express";
import { getAllCategories, createCategory } from "../controllers/categories";
import { authTokenMiddleware } from "../middleware/auth";
import { tenantResolverMiddleware } from "../middleware/tenant";
import { requireModule } from "../middleware/guards";
import { requirePermission } from "../middleware/permission";
import { PERMISSIONS } from "../utils/permissions";

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);
router.use(requireModule('products')); // products module covers category settings

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
router.get("/", requirePermission(PERMISSIONS.CATEGORY_READ), getAllCategories);

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
router.post("/", requirePermission(PERMISSIONS.CATEGORY_CREATE), createCategory);

export default router;
