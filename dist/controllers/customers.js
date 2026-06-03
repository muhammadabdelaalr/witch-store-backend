"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCustomer = exports.getCustomerTransactions = exports.addCustomerTransaction = exports.updateCustomer = exports.createCustomer = exports.getAllCustomers = void 0;
const prisma_1 = require("../prisma");
const getAllCustomers = async (req, res) => {
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
        const [customers, total] = await Promise.all([
            prisma_1.prisma.customer.findMany({
                where,
                orderBy: { name: 'asc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.customer.count({ where }),
        ]);
        const totalPages = Math.ceil(total / limit);
        res.json({
            data: customers,
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
exports.getAllCustomers = getAllCustomers;
const createCustomer = async (req, res) => {
    try {
        const username = (0, prisma_1.getUsername)(req);
        const { name, phone, email, address, balance } = req.body;
        if (!name || !phone) {
            res.status(400).json({ error: 'Customer name and phone number are required' });
            return;
        }
        const customer = await prisma_1.prisma.customer.create({
            data: {
                name,
                phone: phone || null,
                email: email || null,
                address: address || null,
                balance: balance ? parseFloat(balance) : 0,
            },
        });
        await (0, prisma_1.logUserActivity)(username, 'CREATE_CUSTOMER', {
            id: customer.id,
            name: customer.name,
        });
        res.status(201).json(customer);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createCustomer = createCustomer;
const updateCustomer = async (req, res) => {
    try {
        const username = (0, prisma_1.getUsername)(req);
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid customer ID' });
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
        const customer = await prisma_1.prisma.customer.update({
            where: { id },
            data: updateData,
        });
        await (0, prisma_1.logUserActivity)(username, 'UPDATE_CUSTOMER', {
            id: customer.id,
            name: customer.name,
            changes: req.body,
        });
        res.json(customer);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateCustomer = updateCustomer;
const addCustomerTransaction = async (req, res) => {
    try {
        const username = (0, prisma_1.getUsername)(req);
        const { customer_id, type, amount, notes } = req.body;
        if (!customer_id || !type || amount === undefined) {
            res.status(400).json({ error: 'customer_id, type, and amount are required' });
            return;
        }
        if (type !== 'payment' && type !== 'debt') {
            res.status(400).json({ error: 'Type must be payment or debt' });
            return;
        }
        const customerIdInt = parseInt(customer_id);
        const amountFloat = parseFloat(amount);
        const transaction = await prisma_1.prisma.$transaction(async (tx) => {
            // 1. Verify customer exists
            const customer = await tx.customer.findUnique({
                where: { id: customerIdInt },
            });
            if (!customer) {
                throw new Error('Customer not found');
            }
            // 2. Create customer transaction
            const newTx = await tx.customerTransaction.create({
                data: {
                    customer_id: customerIdInt,
                    type,
                    amount: amountFloat,
                    notes: notes || null,
                },
            });
            // 3. Update customer balance
            const balanceDelta = type === 'payment' ? -amountFloat : amountFloat;
            await tx.customer.update({
                where: { id: customerIdInt },
                data: {
                    balance: {
                        increment: balanceDelta,
                    },
                },
            });
            return newTx;
        });
        await (0, prisma_1.logUserActivity)(username, 'CUSTOMER_TRANSACTION', {
            customer_id: customerIdInt,
            type,
            amount: amountFloat,
        });
        res.status(201).json(transaction);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.addCustomerTransaction = addCustomerTransaction;
const getCustomerTransactions = async (req, res) => {
    try {
        const customerId = parseInt(req.params.id);
        if (isNaN(customerId)) {
            res.status(400).json({ error: 'Invalid customer ID' });
            return;
        }
        const transactions = await prisma_1.prisma.customerTransaction.findMany({
            where: { customer_id: customerId },
            orderBy: { created_at: 'desc' },
        });
        res.json(transactions);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getCustomerTransactions = getCustomerTransactions;
const deleteCustomer = async (req, res) => {
    try {
        const username = (0, prisma_1.getUsername)(req);
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid customer ID' });
            return;
        }
        await prisma_1.prisma.$transaction(async (tx) => {
            // 1. Delete all transactions of the customer
            await tx.customerTransaction.deleteMany({
                where: { customer_id: id },
            });
            // 2. Disconnect customer from all sales records
            await tx.sale.updateMany({
                where: { customer_id: id },
                data: { customer_id: null },
            });
            // 3. Delete customer
            await tx.customer.delete({
                where: { id },
            });
        });
        await (0, prisma_1.logUserActivity)(username, 'DELETE_CUSTOMER', { id });
        res.json({ message: 'Customer deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.deleteCustomer = deleteCustomer;
