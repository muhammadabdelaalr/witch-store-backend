"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sales_1 = require("../controllers/sales");
const router = (0, express_1.Router)();
router.post('/', sales_1.createSale);
router.get('/', sales_1.getAllSales);
router.get('/:id', sales_1.getSaleById);
exports.default = router;
