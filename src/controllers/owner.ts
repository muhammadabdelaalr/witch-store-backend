import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import crypto from 'crypto';

// Helper to hash passwords using SHA-256 (same as seed script)
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper for Owner Audit Logging
async function logOwnerAction(
  ownerUserId: number,
  action: string,
  entityType: string,
  entityId: number | null,
  details: string
) {
  try {
    await prisma.ownerAuditLog.create({
      data: {
        owner_user_id: ownerUserId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        details,
      },
    });
  } catch (error) {
    console.error('[OwnerAuditLog Error] Failed to write log:', error);
  }
}

// 1. Owner Admin Login
export const ownerLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'INVALID_CREDENTIALS', message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.' });
      return;
    }

    const owner = await prisma.ownerAdminUser.findUnique({
      where: { email },
    });

    if (!owner || owner.password_hash !== hashPassword(password)) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
      return;
    }

    // Generate Tokens
    const accessToken = generateAccessToken({
      user_id: owner.id,
      email: owner.email,
      role: owner.role as 'owner',
      company_id: 0,
      license_id: 0,
      device_id: '',
    });

    const refreshToken = generateRefreshToken({
      user_id: owner.id,
      email: owner.email,
      role: owner.role,
      company_id: 0,
      license_id: 0,
      device_id: '',
    });

    // Save refresh token to database
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        user_name: owner.name,
        device_id: 'owner-portal',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 Days
      },
    });

    await logOwnerAction(owner.id, 'LOGIN', 'ownerAdminUser', owner.id, 'تم تسجيل الدخول لوحة المالك');

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

// ==========================================
// 2. COMPANIES MANAGEMENT
// ==========================================

export const getCompanies = async (req: Request, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      include: {
        _count: {
          select: {
            branches: true,
            licenses: true,
            devices: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    res.json(companies);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const createCompany = async (req: Request, res: Response) => {
  try {
    const { name, legal_name, phone, email, address } = req.body;
    if (!name) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'اسم الشركة مطلوب.' });
      return;
    }

    // Create Company and default Branch inside a transaction
    const result = await prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: {
          name,
          legal_name,
          phone,
          email,
          address,
          status: 'active',
        },
      });

      const defaultBranch = await tx.branch.create({
        data: {
          company_id: newCompany.id,
          name: 'الفرع الرئيسي',
          is_main: true,
        },
      });

      return { company: newCompany, branch: defaultBranch };
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'CREATE_COMPANY',
        'Company',
        result.company.id,
        `إنشاء شركة جديدة: ${name} مع الفرع الرئيسي`
      );
    }

    res.status(201).json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const updateCompany = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { name, legal_name, phone, email, address, status } = req.body;

    const companyId = parseInt(id, 10);
    if (isNaN(companyId)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الشركة غير صالح.' });
      return;
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { name, legal_name, phone, email, address, status },
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'UPDATE_COMPANY',
        'Company',
        companyId,
        `تحديث بيانات الشركة: ${name || updated.name}، الحالة: ${status || updated.status}`
      );
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

// ==========================================
// 3. PLANS MANAGEMENT
// ==========================================

export const getPlans = async (req: Request, res: Response) => {
  try {
    const plans = await prisma.plan.findMany({
      include: {
        plan_modules: { include: { module: true } },
        plan_features: { include: { feature: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    res.json(plans);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const createPlan = async (req: Request, res: Response) => {
  try {
    const { name, description, price_monthly, price_yearly, is_lifetime, max_users, max_devices, max_branches, moduleIds, featureIds } = req.body;
    if (!name || price_monthly === undefined || price_yearly === undefined) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'الاسم والأسعار الشهرية والسنوية مطلوبة.' });
      return;
    }

    const newPlan = await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          name,
          description,
          price_monthly,
          price_yearly,
          is_lifetime: !!is_lifetime,
          max_users: max_users || 5,
          max_devices: max_devices || 5,
          max_branches: max_branches || 1,
          is_active: true,
        },
      });

      if (moduleIds && Array.isArray(moduleIds)) {
        await tx.planModule.createMany({
          data: moduleIds.map((mId: number) => ({ plan_id: plan.id, module_id: mId })),
        });
      }

      if (featureIds && Array.isArray(featureIds)) {
        await tx.planFeature.createMany({
          data: featureIds.map((fId: number) => ({ plan_id: plan.id, feature_id: fId })),
        });
      }

      return plan;
    });

    // Fetch complete plan
    const completePlan = await prisma.plan.findUnique({
      where: { id: newPlan.id },
      include: {
        plan_modules: { include: { module: true } },
        plan_features: { include: { feature: true } },
      },
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'CREATE_PLAN',
        'Plan',
        newPlan.id,
        `إنشاء باقة جديدة: ${name}`
      );
    }

    res.status(201).json(completePlan);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const updatePlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { name, description, price_monthly, price_yearly, is_lifetime, max_users, max_devices, max_branches, is_active, moduleIds, featureIds } = req.body;

    const planId = parseInt(id, 10);
    if (isNaN(planId)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الباقة غير صالح.' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.plan.update({
        where: { id: planId },
        data: {
          name,
          description,
          price_monthly,
          price_yearly,
          is_lifetime,
          max_users,
          max_devices,
          max_branches,
          is_active,
        },
      });

      if (moduleIds && Array.isArray(moduleIds)) {
        await tx.planModule.deleteMany({ where: { plan_id: planId } });
        await tx.planModule.createMany({
          data: moduleIds.map((mId: number) => ({ plan_id: planId, module_id: mId })),
        });
      }

      if (featureIds && Array.isArray(featureIds)) {
        await tx.planFeature.deleteMany({ where: { plan_id: planId } });
        await tx.planFeature.createMany({
          data: featureIds.map((fId: number) => ({ plan_id: planId, feature_id: fId })),
        });
      }
    });

    const updatedPlan = await prisma.plan.findUnique({
      where: { id: planId },
      include: {
        plan_modules: { include: { module: true } },
        plan_features: { include: { feature: true } },
      },
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'UPDATE_PLAN',
        'Plan',
        planId,
        `تحديث الباقة: ${name || updatedPlan?.name}`
      );
    }

    res.json(updatedPlan);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

// ==========================================
// 4. MODULES & FEATURES LOOKUPS
// ==========================================

export const getModules = async (req: Request, res: Response) => {
  try {
    const modules = await prisma.module.findMany({ orderBy: { key: 'asc' } });
    res.json(modules);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const getFeatures = async (req: Request, res: Response) => {
  try {
    const features = await prisma.feature.findMany({ orderBy: { key: 'asc' } });
    res.json(features);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

// ==========================================
// 5. LICENSES MANAGEMENT
// ==========================================

export const getLicenses = async (req: Request, res: Response) => {
  try {
    const licenses = await prisma.license.findMany({
      include: {
        company: true,
        plan: true,
        devices: true,
        license_modules: { include: { module: true } },
        license_features: { include: { feature: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    res.json(licenses);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const createLicense = async (req: Request, res: Response) => {
  try {
    const { company_id, plan_id, type, expires_at, max_devices, max_users, max_branches, allow_all_modules, customModules, customFeatures } = req.body;
    if (!company_id || !plan_id) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الشركة ومعرف الباقة مطلوبين.' });
      return;
    }

    const company = await prisma.company.findUnique({ where: { id: company_id } });
    const plan = await prisma.plan.findUnique({
      where: { id: plan_id },
      include: {
        plan_modules: true,
        plan_features: true,
      },
    });

    if (!company || !plan) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'الشركة أو الباقة غير صالحة.' });
      return;
    }

    // Generate random secure license key (e.g. XXXX-XXXX-XXXX-XXXX)
    const licenseKey = crypto.randomBytes(8).toString('hex').toUpperCase().match(/.{1,4}/g)?.join('-') || 'KEY-ERROR';

    const result = await prisma.$transaction(async (tx) => {
      // Determine values (fallback to plan defaults)
      const finalMaxDevices = max_devices !== undefined ? max_devices : plan.max_devices;
      const finalMaxUsers = max_users !== undefined ? max_users : plan.max_users;
      const finalMaxBranches = max_branches !== undefined ? max_branches : plan.max_branches;

      const license = await tx.license.create({
        data: {
          company_id,
          plan_id,
          license_key: licenseKey,
          type: type || 'subscription',
          status: 'active',
          starts_at: new Date(),
          expires_at: expires_at ? new Date(expires_at) : (type === 'lifetime' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // Default 30 days if subscription
          max_devices: finalMaxDevices,
          max_users: finalMaxUsers,
          max_branches: finalMaxBranches,
          allow_all_modules: !!allow_all_modules,
        },
      });

      // Default modules/features mappings from Plan
      if (!allow_all_modules) {
        // Module overrides
        for (const pm of plan.plan_modules) {
          await tx.licenseModule.create({
            data: { license_id: license.id, module_id: pm.module_id, is_enabled: true },
          });
        }
        // Custom override adjustments if supplied
        if (customModules && Array.isArray(customModules)) {
          // customModules [{ moduleId: number, isEnabled: boolean }]
          for (const cm of customModules) {
            await tx.licenseModule.upsert({
              where: { license_id_module_id: { license_id: license.id, module_id: cm.moduleId } },
              update: { is_enabled: cm.isEnabled },
              create: { license_id: license.id, module_id: cm.moduleId, is_enabled: cm.isEnabled },
            });
          }
        }

        // Feature overrides
        for (const pf of plan.plan_features) {
          await tx.licenseFeature.create({
            data: { license_id: license.id, feature_id: pf.feature_id, is_enabled: true },
          });
        }
        // Custom override adjustments if supplied
        if (customFeatures && Array.isArray(customFeatures)) {
          // customFeatures [{ featureId: number, isEnabled: boolean }]
          for (const cf of customFeatures) {
            await tx.licenseFeature.upsert({
              where: { license_id_feature_id: { license_id: license.id, feature_id: cf.featureId } },
              update: { is_enabled: cf.isEnabled },
              create: { license_id: license.id, feature_id: cf.featureId, is_enabled: cf.isEnabled },
            });
          }
        }
      }

      return license;
    });

    const completeLicense = await prisma.license.findUnique({
      where: { id: result.id },
      include: {
        company: true,
        plan: true,
        license_modules: { include: { module: true } },
        license_features: { include: { feature: true } },
      },
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'CREATE_LICENSE',
        'License',
        result.id,
        `إنشاء ترخيص جديد: ${licenseKey} للشركة: ${company.name}`
      );
    }

    res.status(201).json(completeLicense);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const updateLicense = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { type, expires_at, max_devices, max_users, max_branches, allow_all_modules, customModules, customFeatures } = req.body;

    const licenseId = parseInt(id, 10);
    if (isNaN(licenseId)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الترخيص غير صالح.' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.license.update({
        where: { id: licenseId },
        data: {
          type,
          expires_at: expires_at ? new Date(expires_at) : (type === 'lifetime' ? null : undefined),
          max_devices,
          max_users,
          max_branches,
          allow_all_modules,
        },
      });

      if (customModules && Array.isArray(customModules)) {
        for (const cm of customModules) {
          await tx.licenseModule.upsert({
            where: { license_id_module_id: { license_id: licenseId, module_id: cm.moduleId } },
            update: { is_enabled: cm.isEnabled },
            create: { license_id: licenseId, module_id: cm.moduleId, is_enabled: cm.isEnabled },
          });
        }
      }

      if (customFeatures && Array.isArray(customFeatures)) {
        for (const cf of customFeatures) {
          await tx.licenseFeature.upsert({
            where: { license_id_feature_id: { license_id: licenseId, feature_id: cf.featureId } },
            update: { is_enabled: cf.isEnabled },
            create: { license_id: licenseId, feature_id: cf.featureId, is_enabled: cf.isEnabled },
          });
        }
      }
    });

    const updatedLicense = await prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        company: true,
        plan: true,
        license_modules: { include: { module: true } },
        license_features: { include: { feature: true } },
      },
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'UPDATE_LICENSE',
        'License',
        licenseId,
        `تحديث تفاصيل الترخيص ID: ${licenseId}`
      );
    }

    res.json(updatedLicense);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const suspendLicense = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const licenseId = parseInt(id, 10);
    if (isNaN(licenseId)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الترخيص غير صالح.' });
      return;
    }

    const updated = await prisma.license.update({
      where: { id: licenseId },
      data: { status: 'suspended' },
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'SUSPEND_LICENSE',
        'License',
        licenseId,
        `إيقاف الترخيص مؤقتاً: ${updated.license_key}`
      );
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const reactivateLicense = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const licenseId = parseInt(id, 10);
    if (isNaN(licenseId)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الترخيص غير صالح.' });
      return;
    }

    const license = await prisma.license.findUnique({ where: { id: licenseId } });
    if (!license) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'الترخيص غير موجود.' });
      return;
    }

    // Determine correct status (check if already expired)
    let newStatus = 'active';
    if (license.expires_at && license.expires_at < new Date()) {
      newStatus = 'expired';
    }

    const updated = await prisma.license.update({
      where: { id: licenseId },
      data: { status: newStatus },
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'REACTIVATE_LICENSE',
        'License',
        licenseId,
        `إعادة تفعيل الترخيص: ${updated.license_key}`
      );
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const extendLicense = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { days, newExpiryDate } = req.body;

    const licenseId = parseInt(id, 10);
    if (isNaN(licenseId)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الترخيص غير صالح.' });
      return;
    }

    const license = await prisma.license.findUnique({ where: { id: licenseId } });
    if (!license) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'الترخيص غير موجود.' });
      return;
    }

    let finalExpiry: Date;
    if (newExpiryDate) {
      finalExpiry = new Date(newExpiryDate);
    } else if (days) {
      const baseDate = license.expires_at && license.expires_at > new Date() ? license.expires_at : new Date();
      finalExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
    } else {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'يرجى توفير الأيام أو تاريخ الانتهاء الجديد لتمديد الترخيص.' });
      return;
    }

    const updated = await prisma.license.update({
      where: { id: licenseId },
      data: {
        expires_at: finalExpiry,
        status: finalExpiry > new Date() ? 'active' : 'expired',
      },
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'EXTEND_LICENSE',
        'License',
        licenseId,
        `تمديد تاريخ انتهاء الترخيص إلى: ${finalExpiry.toISOString()}`
      );
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const convertLicenseToLifetime = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const licenseId = parseInt(id, 10);
    if (isNaN(licenseId)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الترخيص غير صالح.' });
      return;
    }

    const updated = await prisma.license.update({
      where: { id: licenseId },
      data: {
        type: 'lifetime',
        expires_at: null,
        status: 'active',
      },
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'CONVERT_LIFETIME',
        'License',
        licenseId,
        `تحويل الترخيص لرخصة مدى الحياة: ${updated.license_key}`
      );
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

// ==========================================
// 6. DEVICES MANAGEMENT
// ==========================================

export const getDevices = async (req: Request, res: Response) => {
  try {
    const devices = await prisma.deviceActivation.findMany({
      include: {
        company: true,
        license: true,
      },
      orderBy: { activated_at: 'desc' },
    });
    res.json(devices);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const blockDevice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const deviceId = parseInt(id, 10);
    if (isNaN(deviceId)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف تفعيل الجهاز غير صالح.' });
      return;
    }

    const updated = await prisma.deviceActivation.update({
      where: { id: deviceId },
      data: { status: 'blocked' },
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'BLOCK_DEVICE',
        'DeviceActivation',
        deviceId,
        `حظر الجهاز: ${updated.device_name} (ID: ${updated.device_id})`
      );
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const unblockDevice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const deviceId = parseInt(id, 10);
    if (isNaN(deviceId)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف تفعيل الجهاز غير صالح.' });
      return;
    }

    const updated = await prisma.deviceActivation.update({
      where: { id: deviceId },
      data: { status: 'active' },
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'UNBLOCK_DEVICE',
        'DeviceActivation',
        deviceId,
        `إلغاء حظر الجهاز: ${updated.device_name} (ID: ${updated.device_id})`
      );
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

// ==========================================
// 7. PAYMENTS & SUBSCRIPTIONS
// ==========================================

export const getPayments = async (req: Request, res: Response) => {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        company: true,
        subscription: { include: { plan: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    res.json(payments);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const createPayment = async (req: Request, res: Response) => {
  try {
    const { company_id, license_id, plan_id, amount, billing_cycle, method, notes } = req.body;
    if (!company_id || !license_id || !plan_id || !amount || !method) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'الشركة والترخيص والخصائص المالية كاملة مطلوبة.' });
      return;
    }

    const license = await prisma.license.findUnique({ where: { id: license_id } });
    if (!license || license.company_id !== company_id) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'الترخيص غير صالح أو غير مرتبط بهذه الشركة.' });
      return;
    }

    // Run transaction
    const payment = await prisma.$transaction(async (tx) => {
      // 1. Resolve active or new subscription
      let sub = await tx.subscription.findFirst({
        where: { company_id, license_id, plan_id, status: 'active' },
      });

      const now = new Date();
      let newEnd = new Date();

      // Extend duration depending on cycle
      const cycle = billing_cycle || 'monthly';
      const durationMs = cycle === 'yearly'
        ? 365 * 24 * 60 * 60 * 1000
        : cycle === 'lifetime'
        ? 100 * 365 * 24 * 60 * 60 * 1000 // practically lifetime
        : 30 * 24 * 60 * 60 * 1000;      // 30 days

      if (sub) {
        const base = sub.current_period_end > now ? sub.current_period_end : now;
        newEnd = new Date(base.getTime() + durationMs);

        sub = await tx.subscription.update({
          where: { id: sub.id },
          data: {
            current_period_start: now,
            current_period_end: newEnd,
            billing_cycle: cycle,
          },
        });
      } else {
        newEnd = new Date(now.getTime() + durationMs);
        sub = await tx.subscription.create({
          data: {
            company_id,
            license_id,
            plan_id,
            status: 'active',
            billing_cycle: cycle,
            current_period_start: now,
            current_period_end: newEnd,
          },
        });
      }

      // 2. Create the Payment record
      const manualProvider = await tx.paymentProvider.findUnique({ where: { key: 'manual' } });
      const payRecord = await tx.payment.create({
        data: {
          company_id,
          subscription_id: sub.id,
          amount: parseFloat(amount),
          currency: 'EGP',
          method,
          status: 'paid',
          paid_at: now,
          notes,
          provider_id: manualProvider?.id || null,
        },
      });

      // 3. Update the associated License expires_at & status
      await tx.license.update({
        where: { id: license_id },
        data: {
          expires_at: cycle === 'lifetime' ? null : newEnd,
          status: 'active',
          type: cycle === 'lifetime' ? 'lifetime' : 'subscription',
        },
      });

      return payRecord;
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'CREATE_PAYMENT',
        'Payment',
        payment.id,
        `تسجيل دفعة يدوية بمبلغ ${amount} EGP لتجديد الترخيص ID: ${license_id}`
      );
    }

    res.status(201).json(payment);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

// ==========================================
// 8. AUDIT LOGS
// ==========================================

export const getOwnerAuditLogs = async (req: Request, res: Response) => {
  try {
    const logs = await prisma.ownerAuditLog.findMany({
      include: { owner_user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { created_at: 'desc' },
      take: 100, // safety limit
    });
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};
