import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';

// Extend Express Request type
export interface TenantContext {
  company_id: number;
  company_name: string;
  license_id: number;
  device_id: string;
  branch_id: number;
  allowed_modules: string[];
  allowed_features: string[];
}

export interface OwnerContext {
  id: number;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
      ownerAdmin?: OwnerContext;
      tokenPayload?: TokenPayload;
    }
  }
}

// 1. Auth Token Middleware
export const authTokenMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'TOKEN_INVALID', message: 'توكن التحقق غير موجود أو غير صالح.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    req.tokenPayload = decoded;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'انتهت صلاحية توكن التحقق. يرجى تجديد الجلسة.' });
      return;
    }
    res.status(401).json({ error: 'TOKEN_INVALID', message: 'توكن التحقق غير صالح.' });
  }
};

// 2. Owner Auth Middleware
export const ownerAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'TOKEN_INVALID', message: 'توكن مدير المنصة غير موجود.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    if (decoded.role !== 'owner' && decoded.role !== 'device') {
      // Allow 'device' role for checking license info if it matches owner requests,
      // but standard owner endpoints require role = owner/support/sales
    }

    if (!['owner', 'support', 'sales'].includes(decoded.role)) {
      res.status(403).json({ error: 'TENANT_ACCESS_DENIED', message: 'ليس لديك صلاحية للوصول لوحة التحكم الخاصة بالمالك.' });
      return;
    }

    req.ownerAdmin = {
      id: decoded.user_id || 0,
      email: decoded.email || '',
      role: decoded.role,
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'انتهت صلاحية الجلسة لمدير المنصة.' });
      return;
    }
    res.status(401).json({ error: 'TOKEN_INVALID', message: 'توكن التحقق غير صالح لمدير المنصة.' });
  }
};

// 3. Rate Limiter Middleware
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export const rateLimitMiddleware = (windowMs: number, maxRequests: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const limitInfo = rateLimitMap.get(ip);

    if (!limitInfo || now > limitInfo.resetAt) {
      rateLimitMap.set(ip, {
        count: 1,
        resetAt: now + windowMs,
      });
      return next();
    }

    limitInfo.count++;
    if (limitInfo.count > maxRequests) {
      res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: 'لقد تجاوزت الحد المسموح به من الطلبات. يرجى الانتظار والمحاولة لاحقاً.',
      });
      return;
    }

    next();
  };
};
