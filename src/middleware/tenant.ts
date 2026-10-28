import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { TenantContext } from '../types/tenant';

function deny(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: code, code, message });
}

async function resolveEntitlements(license: any): Promise<{ modules: string[]; features: string[] }> {
  if (license.allow_all_modules) {
    const [modules, features] = await Promise.all([
      prisma.module.findMany({ where: { is_active: true }, select: { key: true } }),
      prisma.feature.findMany({ where: { is_active: true }, select: { key: true } }),
    ]);
    return { modules: modules.map((item) => item.key), features: features.map((item) => item.key) };
  }

  const [planModules, overrides, planFeatures, featureOverrides] = await Promise.all([
    prisma.planModule.findMany({ where: { plan_id: license.plan_id }, include: { module: true } }),
    prisma.licenseModule.findMany({ where: { license_id: license.id }, include: { module: true } }),
    prisma.planFeature.findMany({ where: { plan_id: license.plan_id }, include: { feature: true } }),
    prisma.licenseFeature.findMany({ where: { license_id: license.id }, include: { feature: true } }),
  ]);

  const moduleSet = new Set(planModules.filter((item) => item.module.is_active).map((item) => item.module.key));
  for (const item of overrides) {
    if (!item.module.is_active) continue;
    if (item.is_enabled) moduleSet.add(item.module.key);
    else moduleSet.delete(item.module.key);
  }

  const featureSet = new Set(planFeatures.filter((item) => item.feature.is_active).map((item) => item.feature.key));
  for (const item of featureOverrides) {
    if (!item.feature.is_active) continue;
    if (item.is_enabled) featureSet.add(item.feature.key);
    else featureSet.delete(item.feature.key);
  }

  return { modules: [...moduleSet], features: [...featureSet] };
}

export const tenantResolverMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.tokenPayload;
    if (!payload || !['device', 'user'].includes(payload.role)) {
      deny(res, 401, 'TOKEN_ROLE_INVALID', 'A device or employee token is required.');
      return;
    }

    const deviceIdHeader = String(req.headers['x-device-id'] || '');
    if (!deviceIdHeader || deviceIdHeader !== payload.device_id) {
      deny(res, 403, 'TENANT_ACCESS_DENIED', 'Device identity does not match the signed token.');
      return;
    }

    const [company, license, device] = await Promise.all([
      prisma.company.findUnique({ where: { id: payload.company_id } }),
      prisma.license.findUnique({ where: { id: payload.license_id } }),
      prisma.deviceActivation.findUnique({
        where: { license_id_device_id: { license_id: payload.license_id, device_id: payload.device_id } },
      }),
    ]);

    if (!company || !license || license.company_id !== company.id || !device || device.company_id !== company.id) {
      deny(res, 403, 'TENANT_ACCESS_DENIED', 'Company, license, or device context is invalid.');
      return;
    }
    if (company.status !== 'active') {
      deny(res, 403, 'COMPANY_SUSPENDED', 'Company access is not active.');
      return;
    }
    if (license.status !== 'active') {
      deny(res, 403, license.status === 'expired' ? 'LICENSE_EXPIRED' : 'LICENSE_SUSPENDED', 'License is not active.');
      return;
    }
    if (license.expires_at && license.expires_at < new Date()) {
      deny(res, 403, 'LICENSE_EXPIRED', 'License has expired.');
      return;
    }
    if (device.status !== 'active') {
      deny(res, 403, 'LICENSE_DEVICE_BLOCKED', 'This device is blocked.');
      return;
    }

    const headerBranch = Number(req.headers['x-branch-id']);
    let branchId: number | undefined;
    if (payload.role === 'user') {
      branchId = payload.branch_id;
      if (!branchId || (Number.isFinite(headerBranch) && headerBranch > 0 && headerBranch !== branchId)) {
        deny(res, 403, 'BRANCH_CONTEXT_MISMATCH', 'Branch context does not match the signed employee session.');
        return;
      }
    } else if (Number.isInteger(headerBranch) && headerBranch > 0) {
      branchId = headerBranch;
    }

    const branch = branchId
      ? await prisma.branch.findFirst({ where: { id: branchId, company_id: company.id } })
      : await prisma.branch.findFirst({
          where: { company_id: company.id },
          orderBy: [{ is_main: 'desc' }, { id: 'asc' }],
        });
    if (!branch) {
      deny(res, 403, 'BRANCH_REQUIRED', 'A valid company branch is required.');
      return;
    }

    let userContext: TenantContext['user'];
    if (payload.role === 'user') {
      if (!payload.user_id) {
        deny(res, 401, 'USER_SESSION_REQUIRED', 'The employee token is missing its user identity.');
        return;
      }
      const user = await prisma.user.findFirst({
        where: {
          id: payload.user_id,
          company_id: company.id,
          OR: [{ branch_id: branch.id }, { branch_id: null }],
        },
        select: {
          id: true,
          name: true,
          role: { select: { id: true, key: true, name: true, permissions: true } },
        },
      });
      if (!user) {
        deny(res, 401, 'USER_SESSION_INVALID', 'The employee account is no longer valid for this branch.');
        return;
      }
      userContext = user;
    }

    const entitlements = await resolveEntitlements(license);
    req.tenant = {
      company_id: company.id,
      company_name: company.name,
      company_app_name: company.app_name,
      license_id: license.id,
      device_id: device.device_id,
      branch_id: branch.id,
      allowed_modules: entitlements.modules,
      allowed_features: entitlements.features,
      user: userContext,
    };

    if (!device.last_seen_at || Date.now() - device.last_seen_at.getTime() > 120_000) {
      prisma.deviceActivation.update({ where: { id: device.id }, data: { last_seen_at: new Date() } }).catch(() => undefined);
    }
    next();
  } catch (error) {
    next(error);
  }
};
