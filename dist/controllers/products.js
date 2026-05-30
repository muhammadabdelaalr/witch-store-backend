"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjustStock = exports.deleteProduct = exports.updateProduct = exports.createProduct = exports.getProductByBarcode = exports.getAllProducts = void 0;
const prisma_1 = require("../prisma");
const getAllProducts = async (req, res) => {
    try {
        const categoryId = req.query.categoryId ? parseInt(req.query.categoryId) : undefined;
        const search = req.query.search;
        const lowStock = req.query.lowStock === 'true';
        const page = req.query.page ? parseInt(req.query.page) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
        const skip = (page - 1) * limit;
        const where = {};
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
        if (lowStock) {
            where.AND = [
                ...(where.AND || []),
                {
                    OR: [
                        { stock_qty: { lte: 0 } },
                        {
                            stock_qty: {
                                lte: prisma_1.prisma.product.fields.low_stock_threshold
                            }
                        }
                    ]
                }
            ];
        }
        let products;
        let total = 0;
        if (lowStock) {
            let queryStr = `SELECT p.* FROM products p WHERE p.stock_qty <= COALESCE(p.low_stock_threshold, 5)`;
            const queryParams = [];
            let paramCount = 1;
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
            products = await prisma_1.prisma.$queryRawUnsafe(queryStr, ...queryParams);
        }
        else {
            const [data, count] = await Promise.all([
                prisma_1.prisma.product.findMany({
                    where,
                    include: { category: true },
                    orderBy: { name: 'asc' },
                    skip,
                    take: limit,
                }),
                prisma_1.prisma.product.count({ where }),
            ]);
            products = data;
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
        const query = req.query.query;
        if (!query) {
            res.status(400).json({ error: 'Search query is required' });
            return;
        }
        let products = await prisma_1.prisma.product.findMany({
            where: {
                OR: [
                    { barcode: query },
                    { sku: query },
                ]
            },
            include: { category: true }
        });
        if (products.length === 0) {
            products = await prisma_1.prisma.product.findMany({
                where: {
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { barcode: { contains: query, mode: 'insensitive' } },
                        { sku: { contains: query, mode: 'insensitive' } },
                        { factory: { contains: query, mode: 'insensitive' } },
                    ]
                },
                include: { category: true },
                take: 10,
            });
        }
        res.json(products);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getProductByBarcode = getProductByBarcode;
const createProduct = async (req, res) => {
    try {
        const username = (0, prisma_1.getUsername)(req);
        const { name, sku, barcode, category_id, factory, description, cost_price, sell_price, stock_qty, low_stock_threshold, image_path, } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Product name is required' });
            return;
        }
        const product = await prisma_1.prisma.product.create({
            data: {
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
        await (0, prisma_1.logUserActivity)(username, 'CREATE_PRODUCT', {
            id: product.id,
            name: product.name,
            sku: product.sku,
        });
        res.status(201).json(product);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createProduct = createProduct;
const updateProduct = async (req, res) => {
    try {
        const username = (0, prisma_1.getUsername)(req);
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid product ID' });
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
        if (req.body.stock_qty !== undefined) {
            updateData.stock_qty = parseInt(req.body.stock_qty);
        }
        if (req.body.low_stock_threshold !== undefined) {
            updateData.low_stock_threshold = req.body.low_stock_threshold ? parseInt(req.body.low_stock_threshold) : null;
        }
        const product = await prisma_1.prisma.product.update({
            where: { id },
            data: updateData,
        });
        await (0, prisma_1.logUserActivity)(username, 'UPDATE_PRODUCT', {
            id: product.id,
            name: product.name,
            changes: req.body,
        });
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateProduct = updateProduct;
const deleteProduct = async (req, res) => {
    try {
        const username = (0, prisma_1.getUsername)(req);
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid product ID' });
            return;
        }
        const product = await prisma_1.prisma.product.findUnique({ where: { id } });
        if (!product) {
            res.status(404).json({ error: 'Product not found' });
            return;
        }
        await prisma_1.prisma.product.delete({
            where: { id },
        });
        await (0, prisma_1.logUserActivity)(username, 'DELETE_PRODUCT', {
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
        const product = await prisma_1.prisma.product.update({
            where: { id },
            data: {
                stock_qty: {
                    increment: parseInt(delta),
                },
            },
        });
        await (0, prisma_1.logUserActivity)(username, 'ADJUST_STOCK', {
            id: product.id,
            name: product.name,
            delta: parseInt(delta),
            new_stock: product.stock_qty,
        });
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.adjustStock = adjustStock;
