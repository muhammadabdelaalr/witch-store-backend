import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { writeTenantAuditBestEffort } from '../services/audit.service';
import { generateUserAccessToken } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';

async function resolveDefaultRole(isAdmin: boolean): Promise<number | undefined> {
  const role = await prisma.role.findUnique({ where: { key: isAdmin ? 'owner' : 'cashier' } });
  return role?.id;
}

const USER_PUBLIC_SELECT = {
  id: true,
  company_id: true,
  branch_id: true,
  role_id: true,
  name: true,
  email: true,
  phone: true,
  isAdmin: true,
  registrationDate: true,
  role: { select: { id: true, key: true, name: true, permissions: true } },
} as const;

function validatePassword(password: unknown): string {
  if (typeof password !== 'string') throw Object.assign(new Error('Password is required'), { status: 400, code: 'INVALID_PASSWORD' });
  const value = password.trim();
  if (value.length < 8 || value.length > 128) {
    throw Object.assign(new Error('Password must be between 8 and 128 characters'), { status: 400, code: 'INVALID_PASSWORD' });
  }
  if (['admin', 'password', '12345678'].includes(value.toLowerCase())) {
    throw Object.assign(new Error('This password is not allowed'), { status: 400, code: 'WEAK_PASSWORD' });
  }
  return value;
}

export const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.tenant!.company_id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
    const where: any = { company_id: companyId };
    const branchId = Number(req.query.branch_id);
    if (Number.isInteger(branchId) && branchId > 0) where.branch_id = branchId;
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const search = req.query.search.trim().slice(0, 100);
      where.OR = ['name', 'phone', 'email'].map((field) => ({ [field]: { contains: search, mode: 'insensitive' } }));
    }
    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, select: USER_PUBLIC_SELECT, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
      prisma.user.count({ where }),
    ]);
    res.json({ success: true, data: users, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = req.tenant!;
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
    if (!name || name.length > 100 || !phone || phone.length > 30) {
      res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Valid name and phone are required' });
      return;
    }
    const password = validatePassword(req.body.password);
    const isAdmin = req.body.isAdmin === true || req.body.isAdmin === 'true';
    const roleId = req.body.role_id ? Number(req.body.role_id) : await resolveDefaultRole(isAdmin);
    const user = await prisma.user.create({
      data: {
        company_id: tenant.company_id,
        branch_id: tenant.branch_id,
        name,
        email: typeof req.body.email === 'string' && req.body.email.trim() ? req.body.email.trim().slice(0, 254) : null,
        password: await hashPassword(password),
        phone,
        isAdmin,
        role_id: roleId,
      },
      select: USER_PUBLIC_SELECT,
    });
    writeTenantAuditBestEffort(req, { action: 'CREATE_USER', entityType: 'user', entityId: user.id, details: { name: user.name, role_id: user.role_id } });
    res.status(201).json({ success: true, data: user });
  } catch (error) { next(error); }
};

export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.tenant!.company_id;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Invalid user ID' });
      return;
    }
    const existing = await prisma.user.findFirst({ where: { id, company_id: companyId } });
    if (!existing) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'User not found' });
      return;
    }

    const data: any = {};
    if (req.body.name !== undefined) data.name = String(req.body.name).trim().slice(0, 100);
    if (req.body.email !== undefined) data.email = String(req.body.email).trim().slice(0, 254) || null;
    if (req.body.phone !== undefined) data.phone = String(req.body.phone).trim().slice(0, 30);
    if (req.body.password) data.password = await hashPassword(validatePassword(req.body.password));
    if (req.body.role_id !== undefined) data.role_id = req.body.role_id ? Number(req.body.role_id) : null;
    if (req.body.isAdmin !== undefined) {
      data.isAdmin = req.body.isAdmin === true || req.body.isAdmin === 'true';
      if (req.body.role_id === undefined) data.role_id = await resolveDefaultRole(data.isAdmin);
    }

    const user = await prisma.user.update({ where: { id }, data, select: USER_PUBLIC_SELECT });
    writeTenantAuditBestEffort(req, { action: 'UPDATE_USER', entityType: 'user', entityId: user.id, details: { fields: Object.keys(data).filter((key) => key !== 'password'), password_reset: Boolean(data.password) } });
    res.json({ success: true, data: user });
  } catch (error) { next(error); }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Invalid user ID' });
      return;
    }
    if (id === req.tenant!.user?.id) {
      res.status(409).json({ success: false, code: 'CANNOT_DELETE_ACTIVE_USER', message: 'You cannot delete the active user session.' });
      return;
    }
    const user = await prisma.user.findFirst({ where: { id, company_id: req.tenant!.company_id } });
    if (!user) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'User not found' });
      return;
    }
    await prisma.user.delete({ where: { id } });
    writeTenantAuditBestEffort(req, { action: 'DELETE_USER', entityType: 'user', entityId: id, details: { name: user.name } });
    res.status(204).send();
  } catch (error) { next(error); }
};

export const loginUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = req.tenant!;
    const username = String(req.body.username || req.body.name || req.body.email || '').trim();
    const password = String(req.body.password || '');
    if (!username || !password) {
      res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Username and password are required' });
      return;
    }
    const user = await prisma.user.findFirst({
      where: { company_id: tenant.company_id, OR: [{ name: username }, { email: username }, { phone: username }] },
      include: { role: true },
    });
    if (!user || !(await verifyPassword(password, user.password))) {
      res.status(401).json({ success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
      return;
    }
    const branchId = user.branch_id || tenant.branch_id;
    const session = generateUserAccessToken({
      user_id: user.id,
      username: user.name,
      company_id: tenant.company_id,
      license_id: tenant.license_id,
      device_id: tenant.device_id,
      branch_id: branchId,
    });
    const publicUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: USER_PUBLIC_SELECT });
    writeTenantAuditBestEffort(req, { action: 'LOGIN', entityType: 'user', entityId: user.id });
    res.json({ success: true, data: publicUser, userAccessToken: session.token, expiresAt: session.expiresAt });
  } catch (error) { next(error); }
};

export const syncActiveUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.tenant!.user!.id;
    const user = await prisma.user.findFirst({ where: { id: userId, company_id: req.tenant!.company_id }, select: USER_PUBLIC_SELECT });
    if (!user) {
      res.status(404).json({ success: false, code: 'USER_SESSION_INVALID', message: 'User session not found' });
      return;
    }
    res.json({ success: true, data: user });
  } catch (error) { next(error); }
};

export const logoutUser = async (req: Request, res: Response) => {
  writeTenantAuditBestEffort(req, { action: 'LOGOUT', entityType: 'user', entityId: req.tenant?.user?.id });
  res.status(200).json({ success: true });
};

export const getLoginUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      where: { company_id: req.tenant!.company_id, OR: [{ branch_id: req.tenant!.branch_id }, { branch_id: null }] },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: users });
  } catch (error) { next(error); }
};

export const getUserAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Invalid user ID' });
      return;
    }
    const exists = await prisma.user.findFirst({ where: { id: userId, company_id: req.tenant!.company_id }, select: { id: true } });
    if (!exists) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'User not found' });
      return;
    }
    const logs = await prisma.tenantAuditLog.findMany({
      where: { company_id: req.tenant!.company_id, user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    res.json({
      success: true,
      data: logs.map((log) => ({ ...log, id: log.id.toString(), timestamp: log.created_at })),
    });
  } catch (error) { next(error); }
};
