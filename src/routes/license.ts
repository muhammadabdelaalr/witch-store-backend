import { Router } from 'express';
import {
  activateLicense,
  validateLicense,
  refreshLicenseToken,
  logoutDevice
} from '../controllers/license';
import { authTokenMiddleware, rateLimitMiddleware } from '../middleware/auth';
import { tenantResolverMiddleware } from '../middleware/tenant';

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
  rateLimitMiddleware(15 * 60 * 1000, 20), // 15 mins, 20 requests max
  activateLicense
);

// 2. Online License Validation
router.post(
  '/validate',
  authTokenMiddleware,
  tenantResolverMiddleware,
  validateLicense
);

// 3. Refresh License Token (Rate limited)
router.post(
  '/refresh-token',
  rateLimitMiddleware(15 * 60 * 1000, 50),
  refreshLicenseToken
);

// 4. Logout / Deactivate Device
router.post(
  '/logout-device',
  authTokenMiddleware,
  tenantResolverMiddleware,
  logoutDevice
);

export default router;
