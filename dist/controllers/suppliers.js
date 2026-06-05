"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupplierTransactions = exports.addSupplierTransaction = exports.updateSupplier = exports.createSupplier = exports.getAllSuppliers = void 0;
const prisma_1 = require("../prisma");
const getAllSuppliers = async (req, res) => {
    try {
        const search = req.query.search;
        const page = req.query.page ? parseInt(req.query.page) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
        const skip = (page - 1) * limit;
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [suppliers, total] = await Promise.all([
            prisma_1.prisma.supplier.findMany({
                where,
                orderBy: { name: 'asc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.supplier.count({ where }),
        ]);
        const totalPages = Math.ceil(total / limit);
        res.json({
            data: suppliers,
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
exports.getAllSuppliers = getAllSuppliers;
const createSupplier = async (req, res) => {
    try {
        const username = (0, prisma_1.getUsername)(req);
        const { name, phone, email, address, balance } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Supplier name is required' });
            return;
        }
        const supplier = await prisma_1.prisma.supplier.create({
            data: {
                name,
                phone: phone || null,
                email: email || null,
                address: address || null,
                balance: balance ? parseFloat(balance) : 0,
            },
        });
        await (0, prisma_1.logUserActivity)(username, 'CREATE_SUPPLIER', {
            id: supplier.id,
            name: supplier.name,
        });
        res.status(201).json(supplier);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createSupplier = createSupplier;
const updateSupplier = async (req, res) => {
    try {
        const username = (0, prisma_1.getUsername)(req);
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid supplier ID' });
            return;
        }
        const updateData = {};
        const fields = ['name', 'phone', 'email', 'address'];
        fields.forEach((field) => {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        });
        if (req.body.balance !== undefined) {
            updateData.balance = parseFloat(req.body.balance);
        }
        const supplier = await prisma_1.prisma.supplier.update({
            where: { id },
            data: updateData,
        });
        await (0, prisma_1.logUserActivity)(username, 'UPDATE_SUPPLIER', {
            id: supplier.id,
            name: supplier.name,
            changes: req.body,
        });
        res.json(supplier);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateSupplier = updateSupplier;
const addSupplierTransaction = async (req, res) => {
    try {
        const username = (0, prisma_1.getUsername)(req);
        const { supplier_id, type, amount, notes, date, seller_name } = req.body;
        if (!supplier_id || !type || amount === undefined) {
            res.status(400).json({ error: 'supplier_id, type, and amount are required' });
            return;
        }
        if (!notes || notes.trim() === '') {
            res.status(400).json({ error: 'Notes are required for all supplier transactions' });
            return;
        }
        if (type !== 'payment' && type !== 'purchase') {
            res.status(400).json({ error: 'Type must be payment or purchase' });
            return;
        }
        const supplierIdInt = parseInt(supplier_id);
        const amountFloat = parseFloat(amount);
        const transaction = await prisma_1.prisma.$transaction(async (tx) => {
            // 1. Verify supplier exists
            const supplier = await tx.supplier.findUnique({
                where: { id: supplierIdInt },
            });
            if (!supplier) {
                throw new Error('Supplier not found');
            }
            // 2. Create supplier transaction
            const newTx = await tx.supplierTransaction.create({
                data: {
                    supplier_id: supplierIdInt,
                    type,
                    amount: amountFloat,
                    notes: notes.trim(),
                    seller_name: seller_name || null,
                    created_at: date ? new Date(date) : new Date(),
                },
            });
            // 3. Update supplier balance
            const balanceDelta = type === 'payment' ? -amountFloat : amountFloat;
            await tx.supplier.update({
                where: { id: supplierIdInt },
                data: {
                    balance: {
                        increment: balanceDelta,
                    },
                },
            });
            return newTx;
        });
        await (0, prisma_1.logUserActivity)(username, 'SUPPLIER_TRANSACTION', {
            supplier_id: supplierIdInt,
            type,
            amount: amountFloat,
        });
        res.status(201).json(transaction);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.addSupplierTransaction = addSupplierTransaction;
const getSupplierTransactions = async (req, res) => {
    try {
        const supplierId = parseInt(req.params.id);
        if (isNaN(supplierId)) {
            res.status(400).json({ error: 'Invalid supplier ID' });
            return;
        }
        const transactions = await prisma_1.prisma.supplierTransaction.findMany({
            where: { supplier_id: supplierId },
            orderBy: { created_at: 'desc' },
        });
        res.json(transactions);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getSupplierTransactions = getSupplierTransactions;
