import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { TenantContext, OwnerContext } from '../types/tenant';
import {
  decodeTokenWithoutVerification,
  verifyAccessToken,
  TokenPayload,
  TokenRole,
} from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      tenant?: TenantContext;
      ownerAdmin?: OwnerContext;
      tokenPayload?: TokenPayload;
    }
  }
}

function tokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
}

export const authTokenMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = tokenFromRequest(req);
  if (!token) {
    res.status(401).json({ success: false, error: 'TOKEN_INVALID', code: 'TOKEN_INVALID', message: 'Authentication token is required.' });
    return;
  }

  try {
    req.tokenPayload = verifyAccessToken(token);
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      const decoded = decodeTokenWithoutVerification(token);
      const code = decoded?.role === 'user' ? 'USER_TOKEN_EXPIRED' : 'TOKEN_EXPIRED';
      res.status(401).json({ success: false, error: code, code, message: 'The session has expired.' });
      return;
    }
    res.status(401).json({ success: false, error: 'TOKEN_INVALID', code: 'TOKEN_INVALID', message: 'The authentication token is invalid.' });
  }
};

export const requireTokenRole = (...roles: TokenRole[]) => (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const role = req.tokenPayload?.role;
  if (!role || !roles.includes(role)) {
    const code = roles.includes('user') ? 'USER_SESSION_REQUIRED' : 'TOKEN_ROLE_INVALID';
    res.status(401).json({ success: false, error: code, code, message: 'A valid session with the required role is needed.' });
    return;
  }
  next();
};

export const requireUserSession = requireTokenRole('user');
export const requireDeviceSession = requireTokenRole('device');

export const ownerAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = tokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'TOKEN_INVALID', code: 'TOKEN_INVALID', message: 'Owner token is required.' });
    return;
  }

  try {
    const decoded = verifyAccessToken(token);
    if (!['owner', 'support', 'sales'].includes(decoded.role)) {
      res.status(403).json({ error: 'TENANT_ACCESS_DENIED', code: 'TENANT_ACCESS_DENIED', message: 'Owner portal access denied.' });
      return;
    }
    req.tokenPayload = decoded;
    req.ownerAdmin = { id: decoded.user_id || 0, email: decoded.email || '', role: decoded.role };
    next();
  } catch (error: any) {
    const code = error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    res.status(401).json({ error: code, code, message: 'Owner session is invalid or expired.' });
  }
};

function rateLimitIdentity(req: Request): string {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const identity = body.email || body.license_key || body.username || body.refreshToken || '';
  return crypto.createHash('sha256').update(`${req.ip}|${String(identity).toLowerCase()}`).digest('hex');
}

export const rateLimitMiddleware = (windowMs: number, maxRequests: number, scope?: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = Date.now();
      const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
      const expiresAt = new Date(windowStart.getTime() + windowMs);
      const bucketScope = scope || `${req.method}:${req.baseUrl}${req.path}`;
      const keyHash = rateLimitIdentity(req);

      const bucket = await prisma.rateLimitBucket.upsert({
        where: {
          scope_key_hash_window_start: {
            scope: bucketScope,
            key_hash: keyHash,
            window_start: windowStart,
          },
        },
        create: { scope: bucketScope, key_hash: keyHash, window_start: windowStart, expires_at: expiresAt, count: 1 },
        update: { count: { increment: 1 }, expires_at: expiresAt },
      });

      res.setHeader('RateLimit-Limit', String(maxRequests));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - bucket.count)));
      res.setHeader('RateLimit-Reset', String(Math.ceil(expiresAt.getTime() / 1000)));

      if (bucket.count > maxRequests) {
        res.status(429).json({ success: false, error: 'TOO_MANY_REQUESTS', code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please try again later.' });
        return;
      }

      if (Math.random() < 0.01) {
        prisma.rateLimitBucket.deleteMany({ where: { expires_at: { lt: new Date() } } }).catch(() => undefined);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};
