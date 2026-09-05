import { Request, Response, NextFunction } from 'express';

export const requirePermission = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.tenant?.user;
    if (!user) {
      return next();
    }
    const userPermissions = user?.role?.permissions || [];

    const hasAll = permissions.every((p) => userPermissions.includes(p));
    if (!hasAll) {
      res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
      });
      return;
    }

    next();
  };
};

export const requireAnyPermission = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.tenant?.user;
    const userPermissions = user?.role?.permissions || [];

    const hasAny = permissions.some((p) => userPermissions.includes(p));
    if (!hasAny) {
      res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
      });
      return;
    }

    next();
  };
};
