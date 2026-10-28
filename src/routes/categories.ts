import { Router } from "express";
import { getAllCategories, createCategory } from "../controllers/categories";
import { authTokenMiddleware, requireUserSession } from "../middleware/auth";
import { tenantResolverMiddleware } from "../middleware/tenant";
import { requireModule } from "../middleware/guards";
import { requirePermission } from "../middleware/permission";
import { PERMISSIONS } from "../utils/permissions";
import { categorySchema, validateBody } from "../middleware/validate";

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);
router.use(requireUserSession);
router.use(requireModule('products')); // products module covers category settings

/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Category management
 */

/**
 * @swagger
 * /api/v1/categories:
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
 * /api/v1/categories:
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
router.post("/", requirePermission(PERMISSIONS.CATEGORY_CREATE), validateBody(categorySchema), createCategory);

export default router;
