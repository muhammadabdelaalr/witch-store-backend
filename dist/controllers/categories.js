"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCategory = exports.getAllCategories = void 0;
const prisma_1 = require("../prisma");
const getAllCategories = async (req, res) => {
    try {
        const categories = await prisma_1.prisma.category.findMany({
            orderBy: {
                name: 'asc',
            },
        });
        res.json(categories);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getAllCategories = getAllCategories;
const createCategory = async (req, res) => {
    try {
        const username = (0, prisma_1.getUsername)(req);
        const { name } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Category name is required' });
            return;
        }
        const category = await prisma_1.prisma.category.create({
            data: { name },
        });
        await (0, prisma_1.logUserActivity)(username, 'CREATE_CATEGORY', {
            id: category.id,
            name: category.name,
        });
        res.status(201).json(category);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createCategory = createCategory;
