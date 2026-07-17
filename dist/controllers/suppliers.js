"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupplierTransactions = exports.addSupplierTransaction = exports.updateSupplier = exports.createSupplier = exports.getAllSuppliers = void 0;
const prisma_1 = require("../prisma");
const getAllSuppliers = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const search = req.query.search;
        const page = req.query.page ? parseInt(req.query.page) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
        const skip = (page - 1) * limit;
        const where = {
            company_id: companyId,
        };
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
        const companyId = req.tenant.company_id;
        const username = (0, prisma_1.getUsername)(req);
        const { name, phone, email, address, balance } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Supplier name is required' });
            return;
        }
        const supplier = await prisma_1.prisma.supplier.create({
            data: {
                company_id: companyId,
                name,
                phone: phone || null,
                email: email || null,
                address: address || null,
                balance: balance ? parseFloat(balance) : 0,
            },
        });
        await (0, prisma_1.logUserActivity)(companyId, username, 'CREATE_SUPPLIER', {
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
        const companyId = req.tenant.company_id;
        const username = (0, prisma_1.getUsername)(req);
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid supplier ID' });
            return;
        }
        // Ensure supplier belongs to company
        const existing = await prisma_1.prisma.supplier.findFirst({
            where: { id, company_id: companyId },
        });
        if (!existing) {
            res.status(404).json({ error: 'Supplier not found' });
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
        await (0, prisma_1.logUserActivity)(companyId, username, 'UPDATE_SUPPLIER', {
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
        const companyId = req.tenant.company_id;
        const username = (0, prisma_1.getUsername)(req);
        const { supplier_id, type, amount, notes, date, seller_name, invoice_id } = req.body;
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
        const invoiceIdInt = invoice_id ? parseInt(invoice_id) : undefined;
        const transaction = await prisma_1.prisma.$transaction(async (tx) => {
            // 1. Verify supplier exists and belongs to company
            const supplier = await tx.supplier.findFirst({
                where: { id: supplierIdInt, company_id: companyId },
            });
            if (!supplier) {
                throw new Error('Supplier not found');
            }
            // If invoice_id is provided, verify it exists and belongs to this supplier & company
            let invoice = null;
            if (invoiceIdInt) {
                invoice = await tx.supplierInvoice.findFirst({
                    where: { id: invoiceIdInt, supplier_id: supplierIdInt, company_id: companyId },
                });
                if (!invoice) {
                    throw new Error('Supplier invoice not found');
                }
            }
            // 2. Create supplier transaction
            const newTx = await tx.supplierTransaction.create({
                data: {
                    company_id: companyId,
                    supplier_id: supplierIdInt,
                    type,
                    amount: amountFloat,
                    notes: notes.trim(),
                    seller_name: seller_name || null,
                    invoice_id: invoiceIdInt || null,
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
            // 4. If linked to an invoice and is a payment, update the invoice's amount_paid
            if (invoice && type === 'payment') {
                const updatedInvoice = await tx.supplierInvoice.update({
                    where: { id: invoiceIdInt },
                    data: {
                        amount_paid: {
                            increment: amountFloat,
                        },
                    },
                });
                // Create a history log entry for the invoice
                await tx.supplierInvoiceHistory.create({
                    data: {
                        company_id: companyId,
                        invoice_id: invoiceIdInt,
                        seller_name: seller_name || 'سيستم',
                        action: 'edit',
                        changes: `تسجيل سداد بقيمة ${amountFloat} ج.م - المدفوع الجديد: ${updatedInvoice.amount_paid} ج.م | [ملاحظة: ${notes.trim()}]`,
                        created_at: new Date(),
                    },
                });
            }
            return newTx;
        });
        await (0, prisma_1.logUserActivity)(companyId, username, 'SUPPLIER_TRANSACTION', {
            supplier_id: supplierIdInt,
            type,
            amount: amountFloat,
            invoice_id: invoiceIdInt,
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
        const companyId = req.tenant.company_id;
        const supplierId = parseInt(req.params.id);
        if (isNaN(supplierId)) {
            res.status(400).json({ error: 'Invalid supplier ID' });
            return;
        }
        // Verify supplier belongs to company
        const supplier = await prisma_1.prisma.supplier.findFirst({
            where: { id: supplierId, company_id: companyId },
        });
        if (!supplier) {
            res.status(404).json({ error: 'Supplier not found' });
            return;
        }
        const transactions = await prisma_1.prisma.supplierTransaction.findMany({
            where: { supplier_id: supplierId, company_id: companyId },
            orderBy: { created_at: 'desc' },
        });
        res.json(transactions);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getSupplierTransactions = getSupplierTransactions;
