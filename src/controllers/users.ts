import { Request, Response } from 'express';
import { prisma, logUserActivity, getUsername } from '../prisma';

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      data: users,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const username = getUsername(req);
    const { name, phone } = req.body;

    if (!name || !phone) {
      res.status(400).json({ error: 'Username (name) and password/phone are required' });
      return;
    }

    const user = await prisma.user.create({
      data: {
        name,
        phone,
        logs: '[]',
      },
    });

    await logUserActivity(username, 'CREATE_USER', { name: user.name });

    res.status(201).json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const { name, phone } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    await logUserActivity(username, 'UPDATE_USER', { id: user.id, name: user.name, changes: req.body });

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await prisma.user.delete({
      where: { id },
    });

    await logUserActivity(username, 'DELETE_USER', { id, name: user.name });

    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        name: username,
        phone: password,
      },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const logs = JSON.parse(user.logs || '[]');
    logs.push({
      action: 'LOGIN',
      timestamp: new Date().toISOString(),
    });

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        logs: JSON.stringify(logs),
      },
    });

    res.json(updatedUser);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const syncActiveUser = async (req: Request, res: Response) => {
  try {
    const { id, name } = req.body;

    if (!id || !name) {
      res.status(400).json({ error: 'User id and name are required' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        id: parseInt(id),
        name,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User session not found' });
      return;
    }

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const logoutUser = async (req: Request, res: Response) => {
  try {
    const username = req.headers['x-user-name'] as string;
    if (username) {
      const user = await prisma.user.findUnique({
        where: { name: username },
      });
      if (user) {
        const logs = JSON.parse(user.logs || '[]');
        logs.push({
          action: 'LOGOUT',
          timestamp: new Date().toISOString(),
        });
        await prisma.user.update({
          where: { id: user.id },
          data: {
            logs: JSON.stringify(logs),
          },
        });
      }
    }
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
