import { Router } from 'express';
import {
  activateLicense,
  validateLicense,
  refreshLicenseToken,
  logoutDevice
} from '../controllers/license';
import { authTokenMiddleware, rateLimitMiddleware, requireDeviceSession } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';
import { emptyBodySchema, licenseActivationSchema, refreshTokenSchema, validateBody } from '../middleware/validate';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: License
 *   description: License activation, validation and management for devices
 */

// 1. License Activation (Rate limited)
router.post(
  '/activate',
  rateLimitMiddleware(15 * 60 * 1000, 20, 'license-activation'),
  validateBody(licenseActivationSchema),
  activateLicense
);

// 2. Online License Validation
router.post(
  '/validate',
  authTokenMiddleware,
  requireDeviceSession,
  tenantResolverMiddleware,
  validateBody(emptyBodySchema),
  validateLicense
);

// 3. Refresh License Token (Rate limited)
router.post(
  '/refresh-token',
  rateLimitMiddleware(15 * 60 * 1000, 50, 'license-refresh'),
  validateBody(refreshTokenSchema),
  refreshLicenseToken
);

// 4. Logout / Deactivate Device
router.post(
  '/logout-device',
  authTokenMiddleware,
  requireDeviceSession,
  tenantResolverMiddleware,
  validateBody(emptyBodySchema),
  logoutDevice
);

export default router;
