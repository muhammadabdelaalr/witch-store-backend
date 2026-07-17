"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutUser = exports.syncActiveUser = exports.loginUser = exports.deleteUser = exports.updateUser = exports.createUser = exports.getAllUsers = void 0;
const prisma_1 = require("../prisma");
const getAllUsers = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const branchId = req.tenant.branch_id;
        const search = req.query.search;
        const page = req.query.page ? parseInt(req.query.page) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
        const skip = (page - 1) * limit;
        const where = {
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
            prisma_1.prisma.user.findMany({
                where,
                orderBy: { name: 'asc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.user.count({ where }),
        ]);
        const totalPages = Math.ceil(total / limit);
        res.json({
            data: users,
            total,
            page,
            limit,
            totalPages,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getAllUsers = getAllUsers;
const createUser = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const branchId = req.tenant.branch_id;
        const username = (0, prisma_1.getUsername)(req);
        const { name, email, password, phone, isAdmin } = req.body;
        if (!name || !password || !phone) {
            res.status(400).json({ error: 'Username (name), password, and phone are required' });
            return;
        }
        const user = await prisma_1.prisma.user.create({
            data: {
                company_id: companyId,
                branch_id: branchId,
                name,
                email: email || null,
                password,
                phone,
                isAdmin: isAdmin === true || isAdmin === 'true',
                logs: '[]',
            },
        });
        await (0, prisma_1.logUserActivity)(companyId, username, 'CREATE_USER', { name: user.name });
        res.status(201).json(user);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createUser = createUser;
const updateUser = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const username = (0, prisma_1.getUsername)(req);
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid user ID' });
            return;
        }
        // Ensure user belongs to company
        const existing = await prisma_1.prisma.user.findFirst({
            where: { id, company_id: companyId },
        });
        if (!existing) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const { name, email, password, phone, isAdmin } = req.body;
        const updateData = {};
        if (name !== undefined)
            updateData.name = name;
        if (email !== undefined)
            updateData.email = email;
        if (password !== undefined)
            updateData.password = password;
        if (phone !== undefined)
            updateData.phone = phone;
        if (isAdmin !== undefined)
            updateData.isAdmin = isAdmin === true || isAdmin === 'true';
        const user = await prisma_1.prisma.user.update({
            where: { id },
            data: updateData,
        });
        if (user.isAdmin && email !== undefined && existing.email !== email) {
            await prisma_1.prisma.company.update({
                where: { id: companyId },
                data: { email: email }
            });
        }
        await (0, prisma_1.logUserActivity)(companyId, username, 'UPDATE_USER', { id: user.id, name: user.name, changes: req.body });
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const username = (0, prisma_1.getUsername)(req);
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid user ID' });
            return;
        }
        const user = await prisma_1.prisma.user.findFirst({
            where: { id, company_id: companyId },
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        await prisma_1.prisma.user.delete({
            where: { id },
        });
        await (0, prisma_1.logUserActivity)(companyId, username, 'DELETE_USER', { id, name: user.name });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.deleteUser = deleteUser;
const loginUser = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({ error: 'Username and password are required' });
            return;
        }
        const user = await prisma_1.prisma.user.findFirst({
            where: {
                company_id: companyId,
                password: password,
                OR: [
                    { name: username },
                    { email: username }
                ]
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
        const updatedUser = await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: {
                logs: JSON.stringify(logs),
            },
        });
        res.json(updatedUser);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.loginUser = loginUser;
const syncActiveUser = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const { id, name } = req.body;
        if (!id || !name) {
            res.status(400).json({ error: 'User id and name are required' });
            return;
        }
        const user = await prisma_1.prisma.user.findFirst({
            where: {
                company_id: companyId,
                id: parseInt(id),
                name,
            },
        });
        if (!user) {
            res.status(404).json({ error: 'User session not found' });
            return;
        }
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.syncActiveUser = syncActiveUser;
const logoutUser = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const username = req.headers['x-user-name'];
        if (username) {
            const user = await prisma_1.prisma.user.findFirst({
                where: { name: username, company_id: companyId },
            });
            if (user) {
                const logs = JSON.parse(user.logs || '[]');
                logs.push({
                    action: 'LOGOUT',
                    timestamp: new Date().toISOString(),
                });
                await prisma_1.prisma.user.update({
                    where: { id: user.id },
                    data: {
                        logs: JSON.stringify(logs),
                    },
                });
            }
        }
        res.status(200).json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.logoutUser = logoutUser;
