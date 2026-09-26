import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { signLicenseSnapshot, LicenseSnapshot } from '../utils/licenseSigner';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { hashPassword } from '../utils/password';
import { hashRefreshToken } from '../utils/token';
import crypto from 'crypto';

// Helper to compute modules and features for a license
async function getLicensePermissions(licenseId: number, planId: number, allowAll: boolean) {
  let allowedModules: string[] = [];
  let allowedFeatures: string[] = [];

  if (allowAll) {
    const allMods = await prisma.module.findMany({ where: { is_active: true } });
    const allFeats = await prisma.feature.findMany({ where: { is_active: true } });
    allowedModules = allMods.map(m => m.key);
    allowedFeatures = allFeats.map(f => f.key);
  } else {
    // Modules
    const planModules = await prisma.planModule.findMany({
      where: { plan_id: planId },
      include: { module: true }
    });
    const overrides = await prisma.licenseModule.findMany({
      where: { license_id: licenseId },
      include: { module: true }
    });
    const moduleSet = new Set<string>();
    planModules.forEach(pm => { if (pm.module.is_active) moduleSet.add(pm.module.key); });
    overrides.forEach(o => {
      if (o.module.is_active) {
        if (o.is_enabled) moduleSet.add(o.module.key);
        else moduleSet.delete(o.module.key);
      }
    });
    allowedModules = Array.from(moduleSet);

    // Features
    const planFeatures = await prisma.planFeature.findMany({
      where: { plan_id: planId },
      include: { feature: true }
    });
    const featureOverrides = await prisma.licenseFeature.findMany({
      where: { license_id: licenseId },
      include: { feature: true }
    });
    const featureSet = new Set<string>();
    planFeatures.forEach(pf => { if (pf.feature.is_active) featureSet.add(pf.feature.key); });
    featureOverrides.forEach(fo => {
      if (fo.feature.is_active) {
        if (fo.is_enabled) featureSet.add(fo.feature.key);
        else featureSet.delete(fo.feature.key);
      }
    });
    allowedFeatures = Array.from(featureSet);
  }

  return { allowedModules, allowedFeatures };
}

// 1. License Activation
export const activateLicense = async (req: Request, res: Response) => {
  try {
    const deviceId = req.headers['x-device-id'] as string;
    const { license_key, device_name, platform, app_version } = req.body;

    if (!license_key) {
      res.status(400).json({ error: 'LICENSE_INVALID', message: 'يرجى إدخال مفتاح الترخيص.' });
      return;
    }

    if (!deviceId) {
      res.status(400).json({ error: 'LICENSE_INVALID', message: 'معرف الجهاز غير موجود في ترويسة الطلب.' });
      return;
    }

    // A. Find License
    const license = await prisma.license.findUnique({
      where: { license_key },
      include: { company: true }
    });

    if (!license) {
      res.status(400).json({ error: 'LICENSE_INVALID', message: 'مفتاح الترخيص غير صالح.' });
      return;
    }

    // B. Validate Company
    if (license.company.status === 'suspended') {
      res.status(403).json({ error: 'COMPANY_SUSPENDED', message: 'تم إيقاف حساب الشركة مؤقتاً. يرجى التواصل مع الإدارة.' });
      return;
    }

    // C. Validate License Status & Expiry
    if (license.status === 'suspended') {
      res.status(403).json({ error: 'LICENSE_SUSPENDED', message: 'هذا الترخيص موقوف مؤقتاً.' });
      return;
    }

    const now = new Date();
    if (license.expires_at && license.expires_at < now) {
      if (license.status !== 'expired') {
        await prisma.license.update({ where: { id: license.id }, data: { status: 'expired' } });
      }
      res.status(403).json({ error: 'LICENSE_EXPIRED', message: 'انتهت صلاحية هذا الترخيص.' });
      return;
    }

    if (license.status === 'expired') {
      res.status(403).json({ error: 'LICENSE_EXPIRED', message: 'انتهت صلاحية هذا الترخيص.' });
      return;
    }

    // D. Validate/Register Device
    let device = await prisma.deviceActivation.findUnique({
      where: {
        license_id_device_id: {
          license_id: license.id,
          device_id: deviceId
        }
      }
    });

    if (device) {
      if (device.status === 'blocked') {
        res.status(403).json({ error: 'LICENSE_DEVICE_BLOCKED', message: 'هذا الجهاز محظور من الاستخدام.' });
        return;
      }
      // Update metadata on reactivate
      device = await prisma.deviceActivation.update({
        where: { id: device.id },
        data: {
          device_name: device_name || device.device_name,
          platform: platform || device.platform,
          app_version: app_version || device.app_version,
          last_seen_at: now
        }
      });
    } else {
      // Check device limit
      const currentDevices = await prisma.deviceActivation.count({
        where: { license_id: license.id, status: 'active' }
      });

      if (currentDevices >= license.max_devices) {
        res.status(403).json({
          error: 'LICENSE_DEVICE_LIMIT_REACHED',
          message: `تم الوصول للحد الأقصى من الأجهزة المفعلة لهذا الترخيص (${license.max_devices} أجهزة).`
        });
        return;
      }

      // Create activation
      device = await prisma.deviceActivation.create({
        data: {
          company_id: license.company_id,
          license_id: license.id,
          device_id: deviceId,
          device_name: device_name || 'Generic Device',
          platform: platform || 'unknown',
          app_version: app_version || '1.0.0',
          status: 'active'
        }
      });
    }

    // E. Generate Tokens
    const payload = {
      company_id: license.company_id,
      license_id: license.id,
      device_id: deviceId,
      role: 'device' as const
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Save refresh token hash to database
    await prisma.refreshToken.create({
      data: {
        token_hash: hashRefreshToken(refreshToken),
        user_name: 'DeviceActivation',
        device_id: deviceId,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 Days
      }
    });

    // Ensure default users exist for the company
    const userCount = await prisma.user.count({
      where: { company_id: license.company_id }
    });

    if (userCount === 0) {
      const defaultBranch = await prisma.branch.findFirst({
        where: { company_id: license.company_id, is_main: true }
      }) || await prisma.branch.findFirst({
        where: { company_id: license.company_id }
      });

      const branchId = defaultBranch?.id || null;
      const ownerRole = await prisma.role.findUnique({ where: { key: 'owner' } });
      const defaultPasswordHash = await hashPassword('admin');

      // Ensure 'Administrator' exists
      await prisma.user.upsert({
        where: {
          company_id_name: {
            company_id: license.company_id,
            name: 'Administrator'
          }
        },
        update: {
          isAdmin: true
        },
        create: {
          company_id: license.company_id,
          branch_id: branchId,
          role_id: ownerRole?.id || null,
          name: 'Administrator',
          phone: 'admin',
          password: defaultPasswordHash,
          isAdmin: true,
          logs: '[]',
        }
      });

      // Ensure 'admin' exists
      await prisma.user.upsert({
        where: {
          company_id_name: {
            company_id: license.company_id,
            name: 'admin'
          }
        },
        update: {
          isAdmin: true
        },
        create: {
          company_id: license.company_id,
          branch_id: branchId,
          role_id: ownerRole?.id || null,
          name: 'admin',
          phone: 'admin',
          password: defaultPasswordHash,
          isAdmin: true,
          logs: '[]',
        }
      });
      console.log(`Created default Administrator & admin users for company ID ${license.company_id}`);
    }

    // F. Build Snapshot
    const { allowedModules, allowedFeatures } = await getLicensePermissions(license.id, license.plan_id, license.allow_all_modules);
    
    const snapshot: LicenseSnapshot = {
      license_key_hash: crypto.createHash('sha256').update(license.license_key).digest('hex'),
      company_id: license.company_id,
      company_name: license.company.name,
      app_name: license.company.app_name || null,
      license_type: license.type,
      expires_at: license.expires_at ? license.expires_at.toISOString().split('T')[0] : null,
      allowed_modules: allowedModules,
      allowed_features: allowedFeatures,
      device_id: deviceId,
      last_validated_at: now.toISOString()
    };

    const signature = signLicenseSnapshot(snapshot);

    res.json({
      accessToken,
      refreshToken,
      company: {
        id: license.company.id,
        name: license.company.name,
        legal_name: license.company.legal_name,
        status: license.company.status,
        app_name: license.company.app_name || null
      },
      license: {
        id: license.id,
        type: license.type,
        status: license.status,
        expires_at: license.expires_at
      },
      allowed_modules: allowedModules,
      allowed_features: allowedFeatures,
      signedSnapshot: {
        ...snapshot,
        signature
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

// 2. Online License Validation
export const validateLicense = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const license = await prisma.license.findUnique({
      where: { id: tenant.license_id }
    });

    if (!license) {
      res.status(403).json({ error: 'LICENSE_INVALID', message: 'الترخيص غير موجود.' });
      return;
    }

    const now = new Date();
    const snapshot: LicenseSnapshot = {
      license_key_hash: crypto.createHash('sha256').update(license.license_key).digest('hex'),
      company_id: tenant.company_id,
      company_name: tenant.company_name,
      app_name: tenant.company_app_name || null,
      license_type: license.type,
      expires_at: license.expires_at ? license.expires_at.toISOString().split('T')[0] : null,
      allowed_modules: tenant.allowed_modules,
      allowed_features: tenant.allowed_features,
      device_id: tenant.device_id,
      last_validated_at: now.toISOString()
    };

    const signature = signLicenseSnapshot(snapshot);

    res.json({
      status: 'valid',
      company: tenant.company_name,
      app_name: tenant.company_app_name || null,
      license_type: license.type,
      expires_at: license.expires_at,
      allowed_modules: tenant.allowed_modules,
      allowed_features: tenant.allowed_features,
      signedSnapshot: {
        ...snapshot,
        signature
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

// 3. Refresh Token (rotation)
export const refreshLicenseToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const deviceId = req.headers['x-device-id'] as string;

    if (!refreshToken || !deviceId) {
      res.status(400).json({ error: 'TOKEN_INVALID', message: 'التوكن ومعرف الجهاز مطلوبين.' });
      return;
    }

    const tokenHash = hashRefreshToken(refreshToken);

    // A. Verify token hash & status in DB
    const dbToken = await prisma.refreshToken.findUnique({
      where: { token_hash: tokenHash }
    });

    if (!dbToken || dbToken.device_id !== deviceId || dbToken.revoked || dbToken.expires_at < new Date()) {
      res.status(401).json({ error: 'TOKEN_INVALID', message: 'توكن التجديد منتهي أو غير صالح.' });
      return;
    }

    // B. Verify JWT content
    const decoded = verifyRefreshToken(refreshToken);
    if (decoded.device_id !== deviceId) {
      res.status(401).json({ error: 'TOKEN_INVALID', message: 'معرف الجهاز غير متطابق.' });
      return;
    }

    // C. Check license & device state
    const device = await prisma.deviceActivation.findUnique({
      where: {
        license_id_device_id: {
          license_id: decoded.license_id,
          device_id: deviceId
        }
      },
      include: {
        license: {
          include: { company: true }
        }
      }
    });

    if (!device || device.status === 'blocked' || device.license.status === 'suspended' || device.license.company.status === 'suspended') {
      res.status(403).json({ error: 'LICENSE_INVALID', message: 'حساب الشركة أو الجهاز أو الترخيص موقوف.' });
      return;
    }

    // Check expiry
    if (device.license.expires_at && device.license.expires_at < new Date()) {
      res.status(403).json({ error: 'LICENSE_EXPIRED', message: 'انتهت صلاحية الترخيص.' });
      return;
    }

    // D. Rotate: issue new pair, revoke/delete old refresh token
    const payload = {
      company_id: decoded.company_id,
      license_id: decoded.license_id,
      device_id: deviceId,
      role: 'device' as const
    };

    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { id: dbToken.id } }),
      prisma.refreshToken.create({
        data: {
          token_hash: hashRefreshToken(newRefreshToken),
          user_name: 'DeviceActivation',
          device_id: deviceId,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      })
    ]);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error: any) {
    res.status(401).json({ error: 'TOKEN_INVALID', message: 'فشل تجديد التوكن.' });
  }
};

// 4. Logout Device / Deactivate
export const logoutDevice = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;

    // Delete device activation
    await prisma.deviceActivation.delete({
      where: {
        license_id_device_id: {
          license_id: tenant.license_id,
          device_id: tenant.device_id
        }
      }
    });

    // Clean refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { device_id: tenant.device_id }
    });

    res.json({ success: true, message: 'تم إلغاء تفعيل الجهاز بنجاح.' });
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};
