"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjustStock = exports.deleteProduct = exports.updateProduct = exports.createProduct = exports.getProductByBarcode = exports.getAllProducts = void 0;
const prisma_1 = require("../prisma");
const getAllProducts = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const branchId = req.tenant.branch_id;
        const categoryId = req.query.categoryId ? parseInt(req.query.categoryId) : undefined;
        const search = req.query.search;
        const lowStock = req.query.lowStock === 'true';
        const page = req.query.page ? parseInt(req.query.page) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
        const skip = (page - 1) * limit;
        const where = {
            company_id: companyId,
        };
        if (categoryId) {
            where.category_id = categoryId;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { barcode: { contains: search, mode: 'insensitive' } },
                { factory: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }
        let products;
        let total = 0;
        if (lowStock) {
            // Use raw SQL to handle field-to-field comparison for low stock threshold at the branch level
            let queryStr = `
        SELECT p.*
        FROM products p
        INNER JOIN product_stocks ps ON ps.product_id = p.id
        WHERE p.company_id = $1 AND ps.branch_id = $2 AND ps.stock_qty <= ps.low_stock_threshold
      `;
            const queryParams = [companyId, branchId];
            let paramCount = 3;
            if (categoryId) {
                queryStr += ` AND p.category_id = $${paramCount++}`;
                queryParams.push(categoryId);
            }
            if (search) {
                queryStr += ` AND (p.name ILIKE $${paramCount} OR p.sku ILIKE $${paramCount} OR p.barcode ILIKE $${paramCount} OR p.factory ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
                queryParams.push(`%${search}%`);
                paramCount++;
            }
            const countQueryStr = `SELECT COUNT(*)::int as count FROM (${queryStr}) as count_table`;
            const countRes = await prisma_1.prisma.$queryRawUnsafe(countQueryStr, ...queryParams);
            total = countRes[0]?.count || 0;
            queryStr += ` ORDER BY p.name ASC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
            queryParams.push(limit, skip);
            const rawProducts = await prisma_1.prisma.$queryRawUnsafe(queryStr, ...queryParams);
            const productIds = rawProducts.map((p) => p.id);
            const productStocks = await prisma_1.prisma.productStock.findMany({
                where: { product_id: { in: productIds }, branch_id: branchId },
            });
            const categoryIds = rawProducts.map((p) => p.category_id).filter((id) => id !== null);
            const categories = await prisma_1.prisma.category.findMany({
                where: { id: { in: categoryIds } },
            });
            products = rawProducts.map((p) => {
                const cat = categories.find((c) => c.id === p.category_id);
                const ps = productStocks.find((s) => s.product_id === p.id);
                return {
                    ...p,
                    category: cat || null,
                    stock_qty: ps ? ps.stock_qty : 0,
                    low_stock_threshold: ps ? ps.low_stock_threshold : 5,
                };
            });
        }
        else {
            const [data, count] = await Promise.all([
                prisma_1.prisma.product.findMany({
                    where,
                    include: {
                        category: true,
                        product_stocks: {
                            where: { branch_id: branchId },
                        },
                    },
                    orderBy: { name: 'asc' },
                    skip,
                    take: limit,
                }),
                prisma_1.prisma.product.count({ where }),
            ]);
            products = data.map((p) => {
                const ps = p.product_stocks[0];
                return {
                    ...p,
                    stock_qty: ps ? ps.stock_qty : 0,
                    low_stock_threshold: ps ? ps.low_stock_threshold : 5,
                    product_stocks: undefined,
                };
            });
            total = count;
        }
        const totalPages = Math.ceil(total / limit);
        res.json({
            data: products,
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
exports.getAllProducts = getAllProducts;
const getProductByBarcode = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const branchId = req.tenant.branch_id;
        const query = req.query.query;
        if (!query) {
            res.status(400).json({ error: 'Search query is required' });
            return;
        }
        let products = await prisma_1.prisma.product.findMany({
            where: {
                company_id: companyId,
                OR: [
                    { barcode: query },
                    { sku: query },
                ],
            },
            include: {
                category: true,
                product_stocks: {
                    where: { branch_id: branchId },
                },
            },
        });
        if (products.length === 0) {
            products = await prisma_1.prisma.product.findMany({
                where: {
                    company_id: companyId,
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { barcode: { contains: query, mode: 'insensitive' } },
                        { sku: { contains: query, mode: 'insensitive' } },
                        { factory: { contains: query, mode: 'insensitive' } },
                    ],
                },
                include: {
                    category: true,
                    product_stocks: {
                        where: { branch_id: branchId },
                    },
                },
                take: 10,
            });
        }
        const mappedProducts = products.map((p) => {
            const ps = p.product_stocks[0];
            return {
                ...p,
                stock_qty: ps ? ps.stock_qty : 0,
                low_stock_threshold: ps ? ps.low_stock_threshold : 5,
                product_stocks: undefined,
            };
        });
        res.json(mappedProducts);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getProductByBarcode = getProductByBarcode;
const createProduct = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const branchId = req.tenant.branch_id;
        const username = (0, prisma_1.getUsername)(req);
        const { name, sku, barcode, category_id, factory, description, cost_price, sell_price, stock_qty, low_stock_threshold, image_path, } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Product name is required' });
            return;
        }
        // Wrap in transaction to initialize stocks for all branches of the company
        const product = await prisma_1.prisma.$transaction(async (tx) => {
            const prod = await tx.product.create({
                data: {
                    company_id: companyId,
                    branch_id: branchId,
                    name,
                    sku: sku || null,
                    barcode: barcode || null,
                    category_id: category_id ? parseInt(category_id) : null,
                    factory: factory || null,
                    description: description || null,
                    cost_price: cost_price ? parseFloat(cost_price) : 0,
                    sell_price: sell_price ? parseFloat(sell_price) : 0,
                    stock_qty: stock_qty ? parseInt(stock_qty) : 0,
                    low_stock_threshold: low_stock_threshold ? parseInt(low_stock_threshold) : 5,
                    image_path: image_path || null,
                },
            });
            // Get all branches of company
            const branches = await tx.branch.findMany({
                where: { company_id: companyId },
            });
            for (const b of branches) {
                await tx.productStock.create({
                    data: {
                        company_id: companyId,
                        branch_id: b.id,
                        product_id: prod.id,
                        stock_qty: b.id === branchId ? (stock_qty ? parseInt(stock_qty) : 0) : 0,
                        low_stock_threshold: low_stock_threshold ? parseInt(low_stock_threshold) : 5,
                    },
                });
            }
            return prod;
        });
        await (0, prisma_1.logUserActivity)(companyId, username, 'CREATE_PRODUCT', {
            id: product.id,
            name: product.name,
            sku: product.sku,
        });
        res.status(201).json({
            ...product,
            stock_qty: stock_qty ? parseInt(stock_qty) : 0,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createProduct = createProduct;
const updateProduct = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const branchId = req.tenant.branch_id;
        const username = (0, prisma_1.getUsername)(req);
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid product ID' });
            return;
        }
        // Ensure product belongs to company
        const existing = await prisma_1.prisma.product.findFirst({
            where: { id, company_id: companyId },
        });
        if (!existing) {
            res.status(404).json({ error: 'Product not found' });
            return;
        }
        const updateData = {};
        const fields = [
            'name',
            'sku',
            'barcode',
            'factory',
            'description',
            'image_path',
        ];
        fields.forEach((field) => {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        });
        if (req.body.category_id !== undefined) {
            updateData.category_id = req.body.category_id ? parseInt(req.body.category_id) : null;
        }
        if (req.body.cost_price !== undefined) {
            updateData.cost_price = parseFloat(req.body.cost_price);
        }
        if (req.body.sell_price !== undefined) {
            updateData.sell_price = parseFloat(req.body.sell_price);
        }
        if (req.body.low_stock_threshold !== undefined) {
            updateData.low_stock_threshold = req.body.low_stock_threshold ? parseInt(req.body.low_stock_threshold) : null;
        }
        // Run in transaction to update core product and branch-specific stock levels
        const product = await prisma_1.prisma.$transaction(async (tx) => {
            const prod = await tx.product.update({
                where: { id },
                data: updateData,
            });
            if (req.body.stock_qty !== undefined || req.body.low_stock_threshold !== undefined) {
                await tx.productStock.upsert({
                    where: {
                        company_id_branch_id_product_id: {
                            company_id: companyId,
                            branch_id: branchId,
                            product_id: id,
                        },
                    },
                    update: {
                        stock_qty: req.body.stock_qty !== undefined ? parseInt(req.body.stock_qty) : undefined,
                        low_stock_threshold: req.body.low_stock_threshold !== undefined ? parseInt(req.body.low_stock_threshold) : undefined,
                    },
                    create: {
                        company_id: companyId,
                        branch_id: branchId,
                        product_id: id,
                        stock_qty: req.body.stock_qty !== undefined ? parseInt(req.body.stock_qty) : 0,
                        low_stock_threshold: req.body.low_stock_threshold !== undefined ? parseInt(req.body.low_stock_threshold) : 5,
                    },
                });
            }
            return prod;
        });
        const activeStock = await prisma_1.prisma.productStock.findUnique({
            where: {
                company_id_branch_id_product_id: {
                    company_id: companyId,
                    branch_id: branchId,
                    product_id: id,
                },
            },
        });
        await (0, prisma_1.logUserActivity)(companyId, username, 'UPDATE_PRODUCT', {
            id: product.id,
            name: product.name,
            changes: req.body,
        });
        res.json({
            ...product,
            stock_qty: activeStock ? activeStock.stock_qty : 0,
            low_stock_threshold: activeStock ? activeStock.low_stock_threshold : 5,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateProduct = updateProduct;
const deleteProduct = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const username = (0, prisma_1.getUsername)(req);
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid product ID' });
            return;
        }
        const product = await prisma_1.prisma.product.findFirst({
            where: { id, company_id: companyId },
        });
        if (!product) {
            res.status(404).json({ error: 'Product not found' });
            return;
        }
        await prisma_1.prisma.product.delete({
            where: { id },
        });
        await (0, prisma_1.logUserActivity)(companyId, username, 'DELETE_PRODUCT', {
            id: product.id,
            name: product.name,
        });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.deleteProduct = deleteProduct;
const adjustStock = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const branchId = req.tenant.branch_id;
        const username = (0, prisma_1.getUsername)(req);
        const id = parseInt(req.params.id);
        const { delta } = req.body;
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid product ID' });
            return;
        }
        if (delta === undefined || isNaN(parseInt(delta))) {
            res.status(400).json({ error: 'Invalid stock delta' });
            return;
        }
        const product = await prisma_1.prisma.product.findFirst({
            where: { id, company_id: companyId },
        });
        if (!product) {
            res.status(404).json({ error: 'Product not found' });
            return;
        }
        const updatedStock = await prisma_1.prisma.productStock.upsert({
            where: {
                company_id_branch_id_product_id: {
                    company_id: companyId,
                    branch_id: branchId,
                    product_id: id,
                },
            },
            update: {
                stock_qty: {
                    increment: parseInt(delta),
                },
            },
            create: {
                company_id: companyId,
                branch_id: branchId,
                product_id: id,
                stock_qty: parseInt(delta),
                low_stock_threshold: 5,
            },
        });
        await (0, prisma_1.logUserActivity)(companyId, username, 'ADJUST_STOCK', {
            id: product.id,
            name: product.name,
            delta: parseInt(delta),
            new_stock: updatedStock.stock_qty,
        });
        res.json({
            ...product,
            stock_qty: updatedStock.stock_qty,
            low_stock_threshold: updatedStock.low_stock_threshold,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.adjustStock = adjustStock;
