import crypto from 'crypto';
import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';
import { hashRefreshToken } from '../utils/token';

function hashOwnerPassword(password: string): Promise<string> {
  return hashPassword(password);
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

    if (!owner || !(await verifyPassword(password, owner.password_hash))) {
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

    // Save refresh token hash to database
    await prisma.refreshToken.create({
      data: {
        token_hash: hashRefreshToken(refreshToken),
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

// 1.1 Owner Refresh Token (rotation)
export const ownerRefreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'INVALID_TOKEN', message: 'Refresh token مطلوب.' });
      return;
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!storedToken || storedToken.revoked || storedToken.expires_at < new Date() || storedToken.device_id !== 'owner-portal') {
      res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.' });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);
    const accessToken = generateAccessToken({
      user_id: payload.user_id,
      email: payload.email,
      role: payload.role as 'owner',
      company_id: 0,
      license_id: 0,
      device_id: '',
    });
    const newRefreshToken = generateRefreshToken({
      user_id: payload.user_id,
      email: payload.email,
      role: payload.role,
      company_id: 0,
      license_id: 0,
      device_id: '',
    });

    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { id: storedToken.id } }),
      prisma.refreshToken.create({
        data: {
          token_hash: hashRefreshToken(newRefreshToken),
          user_name: storedToken.user_name,
          device_id: 'owner-portal',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }
      })
    ]);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (error: any) {
    res.status(401).json({ error: 'TOKEN_INVALID', message: 'توكن التحقق غير صالح.' });
  }
};

// ==========================================
// 1.5 DASHBOARD & LOOKUPS
// ==========================================

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const [companies_count, active_licenses_count, expired_licenses_count, active_devices_count] = await Promise.all([
      prisma.company.count(),
      prisma.license.count({ where: { status: 'active' } }),
      prisma.license.count({ where: { status: 'expired' } }),
      prisma.deviceActivation.count({ where: { status: 'active' } }),
    ]);

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const paymentsThisMonthResult = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: { created_at: { gte: firstDayOfMonth }, status: 'paid' },
    });
    const payments_this_month = paymentsThisMonthResult._sum.amount || 0;

    const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const licenses_expiring_soon = await prisma.license.findMany({
      where: {
        status: 'active',
        expires_at: { not: null, lte: next30Days, gte: now }
      },
      include: { company: true },
      take: 5
    });

    res.json({
      companies_count,
      active_licenses_count,
      expired_licenses_count,
      active_devices_count,
      payments_this_month,
      licenses_expiring_soon,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const getLookups = async (req: Request, res: Response) => {
  try {
    const [companies, plans, modules, licenses] = await Promise.all([
      prisma.company.findMany({ select: { id: true, name: true, status: true } }),
      prisma.plan.findMany({ select: { id: true, name: true, is_active: true } }),
      prisma.module.findMany({ select: { id: true, key: true, name: true, is_active: true } }),
      prisma.license.findMany({ 
        select: { 
          id: true, 
          company_id: true, 
          plan_id: true,
          status: true,
          plan: { select: { name: true, price_monthly: true, price_yearly: true, is_lifetime: true } },
          company: { select: { name: true } }
        } 
      })
    ]);
    res.json({ companies, plans, modules, licenses });
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

// ==========================================
// 2. COMPANIES MANAGEMENT
// ==========================================

export const getCompanies = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [data, total, totalBranches, totalUsers, totalProducts] = await Promise.all([
      prisma.company.findMany({
        include: {
          _count: {
            select: {
              branches: true,
              licenses: true,
              devices: true,
              users: true,
              products: true,
            },
          },
          users: {
            where: { isAdmin: true },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              isAdmin: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.company.count(),
      prisma.branch.count(),
      prisma.user.count(),
      prisma.product.count(),
    ]);

    res.json({
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      totals: {
        companies: total,
        branches: totalBranches,
        users: totalUsers,
        products: totalProducts,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const createCompany = async (req: Request, res: Response) => {
  try {
    const { name, legal_name, phone, email, password, address, app_name } = req.body;
    if (!name && !phone) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'يجب إدخال اسم الشركة أو رقم الهاتف على الأقل.' });
      return;
    }
    if (!address) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'العنوان مطلوب.' });
      return;
    }
    if (!email) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'البريد الإلكتروني للمشرف مطلوب.' });
      return;
    }
    if (!password) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'كلمة مرور المشرف مطلوبة.' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'البريد الإلكتروني للمشرف غير صالح.' });
      return;
    }

    const singleCompanyMode = process.env.OWNER_SINGLE_COMPANY_MODE === 'true';
    if (singleCompanyMode) {
      const existingCompaniesCount = await prisma.company.count();
      if (existingCompaniesCount >= 1) {
        res.status(400).json({
          error: 'SINGLE_COMPANY_LIMIT_REACHED',
          message: 'النظام مخصص لشركة واحدة فقط.'
        });
        return;
      }
    }

    const ownerRole = await prisma.role.findUnique({ where: { key: 'owner' } });
    const adminPasswordHash = await hashPassword(password);

    // Create Company, default Branch, and Admin User inside a transaction
    const result = await prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: {
          name: name ? name.trim() : phone.trim(),
          legal_name: legal_name ? legal_name.trim() : null,
          phone: phone ? phone.trim() : null,
          email: email.trim(),
          address: address.trim(),
          status: 'active',
          app_name: app_name ? app_name.trim() : null,
        },
      });

      const defaultBranch = await tx.branch.create({
        data: {
          company_id: newCompany.id,
          name: 'الفرع الرئيسي',
          is_main: true,
        },
      });

      const adminUser = await tx.user.create({
        data: {
          company_id: newCompany.id,
          branch_id: defaultBranch.id,
          role_id: ownerRole?.id || null,
          name: email.trim(),
          email: email.trim(),
          password: adminPasswordHash,
          phone: phone ? phone.trim() : '0000000000',
          isAdmin: true,
          logs: '[]',
        },
      });

      return { company: newCompany, branch: defaultBranch, adminUser };
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'CREATE_COMPANY',
        'Company',
        result.company.id,
        `إنشاء شركة جديدة: ${name || phone} مع الفرع الرئيسي والمشرف`
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
    const { name, legal_name, phone, email, address, status, app_name } = req.body;

    const companyId = parseInt(id, 10);
    if (isNaN(companyId)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الشركة غير صالح.' });
      return;
    }

    const oldCompany = await prisma.company.findUnique({ where: { id: companyId } });
    if (!oldCompany) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'الشركة غير موجودة.' });
      return;
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { 
        name: name || (phone ? phone : undefined), 
        legal_name, 
        phone, 
        email, 
        address, 
        status,
        app_name: app_name !== undefined ? (app_name ? app_name.trim() : null) : undefined
      },
    });

    if (email && oldCompany.email !== email) {
      // Find the admin user with the old email and update to the new email
      const adminUser = await prisma.user.findFirst({
        where: {
          company_id: companyId,
          name: oldCompany.email || 'Administrator'
        }
      });

      if (adminUser) {
        await prisma.user.update({
          where: { id: adminUser.id },
          data: { name: email, email: email }
        });
      } else {
        // Fallback: look for Administrator or admin
        const fallbackAdmin = await prisma.user.findFirst({
          where: {
            company_id: companyId,
            name: { in: ['admin', 'Administrator'] }
          }
        });
        if (fallbackAdmin) {
          await prisma.user.update({
            where: { id: fallbackAdmin.id },
            data: { name: email, email: email }
          });
        }
      }
    }

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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.plan.findMany({
        include: {
          plan_modules: { include: { module: true } },
          plan_features: { include: { feature: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.plan.count(),
    ]);

    res.json({
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Auto-expire past licenses before fetching
    await prisma.license.updateMany({
      where: {
        status: 'active',
        expires_at: { lt: new Date() }
      },
      data: { status: 'expired' }
    });

    const [data, total] = await Promise.all([
      prisma.license.findMany({
        include: {
          company: true,
          plan: true,
          devices: true,
          license_modules: { include: { module: true } },
          license_features: { include: { feature: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.license.count(),
    ]);

    res.json({
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.deviceActivation.findMany({
        include: {
          company: true,
          license: true,
        },
        orderBy: { activated_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.deviceActivation.count(),
    ]);

    res.json({
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        include: {
          company: true,
          subscription: { include: { plan: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.payment.count(),
    ]);

    res.json({
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    let filter: any = {};
    if (req.query.entity_type) filter.entity_type = req.query.entity_type as string;
    if (req.query.owner_user_id) filter.owner_user_id = parseInt(req.query.owner_user_id as string);
    if (req.query.from || req.query.to) {
      filter.created_at = {};
      if (req.query.from) filter.created_at.gte = new Date(req.query.from as string);
      if (req.query.to) filter.created_at.lte = new Date(req.query.to as string);
    }

    const [data, total] = await Promise.all([
      prisma.ownerAuditLog.findMany({
        include: { owner_user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { created_at: 'desc' },
        where: filter,
        skip,
        take: limit,
      }),
      prisma.ownerAuditLog.count({ where: filter }),
    ]);

    res.json({
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

// ==========================================
// 9. DELETIONS & STATUS UPDATES
// ==========================================

export const updateCompanyStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { status } = req.body;
    const companyId = parseInt(id, 10);
    
    if (isNaN(companyId)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الشركة غير صالح.' });
      return;
    }

    if (status !== 'active' && status !== 'suspended') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'حالة غير صالحة.' });
      return;
    }

    const singleCompanyMode = process.env.OWNER_SINGLE_COMPANY_MODE === 'true';
    if (singleCompanyMode && status === 'suspended') {
      const count = await prisma.company.count({ where: { status: 'active' } });
      if (count <= 1) {
        res.status(400).json({
          error: 'CANNOT_SUSPEND_LAST_COMPANY',
          message: 'لا يمكن إيقاف الشركة الوحيدة النشطة في النظام.'
        });
        return;
      }
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { status },
    });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'UPDATE_COMPANY_STATUS',
        'Company',
        companyId,
        `تغيير حالة الشركة إلى: ${status}`
      );
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const deleteCompany = async (req: Request, res: Response) => {
  // Converted to safe soft-delete behavior per requirements
  res.status(400).json({ 
    error: 'HARD_DELETE_DISABLED', 
    message: 'تم إيقاف الحذف النهائي للشركات حفاظاً على سلامة البيانات. يرجى استخدام الإيقاف المؤقت (Suspension) بدلاً من ذلك.' 
  });
};

export const deletePlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const planId = parseInt(id, 10);
    if (isNaN(planId)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'معرف الباقة غير صالح.' });
      return;
    }

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'الباقة غير موجودة.' });
      return;
    }

    await prisma.plan.delete({ where: { id: planId } });

    if (req.ownerAdmin) {
      await logOwnerAction(
        req.ownerAdmin.id,
        'DELETE_PLAN',
        'Plan',
        planId,
        `حذف الباقة: ${plan.name}`
      );
    }

    res.json({ message: 'تم حذف الباقة بنجاح.' });
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};
