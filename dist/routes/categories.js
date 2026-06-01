"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const categories_1 = require("../controllers/categories");
const router = (0, express_1.Router)();
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
