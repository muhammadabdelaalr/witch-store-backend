import { Request, Response } from 'express';
import { prisma, logUserActivity, getUsername } from '../prisma';
import { hashPassword, verifyPassword } from '../utils/password';

async function resolveDefaultRole(isAdmin: boolean): Promise<number | undefined> {
  const key = isAdmin ? 'owner' : 'cashier';
  const role = await prisma.role.findUnique({ where: { key } });
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
  logs: true,
  registrationDate: true,
  role: {
    select: {
      id: true,
      key: true,
      name: true,
      permissions: true,
    },
  },
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id;
    const search = req.query.search as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const skip = (page - 1) * limit;

    const where: any = {
      company_id: companyId,
      branch_id: branchId,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: USER_PUBLIC_SELECT,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: users,
      meta: { total, page, limit, totalPages },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, code: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const branchId = req.tenant!.branch_id;
    const username = getUsername(req);
    const { name, email, password, phone, isAdmin, role_id } = req.body;

    if (!name || !password || !phone) {
      res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Username (name), password, and phone are required' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const isAdminFlag = isAdmin === true || isAdmin === 'true';
    const resolvedRoleId = role_id
      ? parseInt(role_id, 10)
      : await resolveDefaultRole(isAdminFlag);

    const user = await prisma.user.create({
      data: {
        company_id: companyId,
        branch_id: branchId,
        name,
        email: email || null,
        password: passwordHash,
        phone,
        isAdmin: isAdminFlag,
        role_id: resolvedRoleId,
        logs: '[]',
      },
      select: USER_PUBLIC_SELECT,
    });

    await logUserActivity(companyId, username, 'CREATE_USER', { name: user.name });

    res.status(201).json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, code: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Invalid user ID' });
      return;
    }

    const existing = await prisma.user.findFirst({
      where: { id, company_id: companyId },
    });
    if (!existing) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'User not found' });
      return;
    }

    const { name, email, password, phone, isAdmin, role_id } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (password !== undefined && password !== '') updateData.password = await hashPassword(password);
    if (phone !== undefined) updateData.phone = phone;

    let resolvedRoleId: number | null | undefined = undefined;
    if (role_id !== undefined) {
      resolvedRoleId = role_id ? parseInt(role_id, 10) : null;
    } else if (isAdmin !== undefined) {
      const isAdminFlag = isAdmin === true || isAdmin === 'true';
      updateData.isAdmin = isAdminFlag;
      resolvedRoleId = await resolveDefaultRole(isAdminFlag);
    }
    if (resolvedRoleId !== undefined) updateData.role_id = resolvedRoleId;

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: USER_PUBLIC_SELECT,
    });

    if (user.isAdmin && email !== undefined && existing.email !== email) {
      await prisma.company.update({
        where: { id: companyId },
        data: { email: email }
      });
    }

    await logUserActivity(companyId, username, 'UPDATE_USER', { id: user.id, name: user.name, changes: Object.keys(updateData) });

    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, code: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Invalid user ID' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { id, company_id: companyId },
    });

    if (!user) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'User not found' });
      return;
    }

    await prisma.user.delete({
      where: { id },
    });

    await logUserActivity(companyId, username, 'DELETE_USER', { id, name: user.name });

    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ success: false, code: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Username and password are required' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        company_id: companyId,
        OR: [{ name: username }, { email: username }],
      },
      include: { role: true },
    });

    if (!user || !(await verifyPassword(password, user.password))) {
      res.status(401).json({ success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
      return;
    }

    const logs = JSON.parse(user.logs || '[]');
    logs.push({
      action: 'LOGIN',
      timestamp: new Date().toISOString(),
    });

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { logs: JSON.stringify(logs) },
      select: USER_PUBLIC_SELECT,
    });

    res.json({ success: true, data: updatedUser });
  } catch (error: any) {
    res.status(500).json({ success: false, code: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const syncActiveUser = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const { id, name } = req.body;

    if (!id || !name) {
      res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'User id and name are required' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        company_id: companyId,
        id: parseInt(id),
        name,
      },
      select: USER_PUBLIC_SELECT,
    });

    if (!user) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'User session not found' });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, code: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

export const logoutUser = async (req: Request, res: Response) => {
  try {
    const companyId = req.tenant!.company_id;
    const username = req.headers['x-user-name'] as string;
    if (username) {
      const user = await prisma.user.findFirst({
        where: { name: username, company_id: companyId },
      });
      if (user) {
        const logs = JSON.parse(user.logs || '[]');
        logs.push({
          action: 'LOGOUT',
          timestamp: new Date().toISOString(),
        });
        await prisma.user.update({
          where: { id: user.id },
          data: { logs: JSON.stringify(logs) },
        });
      }
    }
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, code: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};
