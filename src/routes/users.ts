import { Router } from 'express';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  loginUser,
  syncActiveUser,
  logoutUser,
  getLoginUsers,
  getUserAuditLogs,
} from '../controllers/users';
import { authTokenMiddleware, rateLimitMiddleware, requireDeviceSession, requireUserSession } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { requireModule } from '../middleware/guards';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../utils/permissions';
import { createUserSchema, employeeLoginSchema, emptyBodySchema, idParamSchema, listQuerySchema, updateUserSchema, validateBody, validateParams, validateQuery } from '../middleware/validate';

const router = Router();

router.use(authTokenMiddleware);
router.use(tenantResolverMiddleware);

router.get('/login-list', requireDeviceSession, getLoginUsers);
router.post('/login', requireDeviceSession, rateLimitMiddleware(15 * 60 * 1000, 20, 'employee-login'), validateBody(employeeLoginSchema), loginUser);

// Every route below this point requires a signed employee session.
router.use(requireUserSession);

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management and authentication
 */

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Success
 *   post:
 *     summary: Create a user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - phone
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/', requireModule('users'), requirePermission(PERMISSIONS.USER_READ), validateQuery(listQuerySchema), getAllUsers);
router.get('/:id/audit-logs', requireModule('users'), requirePermission(PERMISSIONS.USER_READ), validateParams(idParamSchema), getUserAuditLogs);
router.post('/', requireModule('users'), requirePermission(PERMISSIONS.USER_CREATE), validateBody(createUserSchema), createUser);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   put:
 *     summary: Update a user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
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
 *     summary: Delete a user
 *     tags: [Users]
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
router.put('/:id', requireModule('users'), requirePermission(PERMISSIONS.USER_UPDATE), validateParams(idParamSchema), validateBody(updateUserSchema), updateUser);
router.delete('/:id', requireModule('users'), requirePermission(PERMISSIONS.USER_DELETE), validateParams(idParamSchema), deleteUser);

/**
 * @swagger
 * /api/v1/users/login:
 *   post:
 *     summary: Login user
 *     tags: [Users]
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
 *     responses:
 *       200:
 *         description: Success
 */

/**
 * @swagger
 * /api/v1/users/sync:
 *   post:
 *     summary: Sync active user
 *     tags: [Users]
 *     description: Returns the active employee represented by the signed User Access Token.
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/sync', validateBody(emptyBodySchema), syncActiveUser);

/**
 * @swagger
 * /api/v1/users/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/logout', validateBody(emptyBodySchema), logoutUser);

export default router;
