import { Request, Response, NextFunction } from 'express';

// 1. Module Guard
export const requireModule = (moduleKey: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const tenant = req.tenant;
    if (!tenant) {
      res.status(403).json({ error: 'TENANT_ACCESS_DENIED', message: 'لم يتم تحديد سياق الشركة المستأجرة.' });
      return;
    }

    if (!tenant.allowed_modules.includes(moduleKey)) {
      res.status(403).json({
        error: 'MODULE_NOT_ALLOWED',
        message: `هذه الوحدة (${moduleKey}) غير مفعلة في باقة الاشتراك الحالية.`
      });
      return;
    }

    next();
  };
};

// 2. Feature Guard
export const requireFeature = (featureKey: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const tenant = req.tenant;
    if (!tenant) {
      res.status(403).json({ error: 'TENANT_ACCESS_DENIED', message: 'لم يتم تحديد سياق الشركة المستأجرة.' });
      return;
    }

    if (!tenant.allowed_features.includes(featureKey)) {
      res.status(403).json({
        error: 'FEATURE_NOT_ALLOWED',
        message: `هذه الميزة الفرعية (${featureKey}) غير مفعلة في باقة الاشتراك الحالية.`
      });
      return;
    }

    next();
  };
};
