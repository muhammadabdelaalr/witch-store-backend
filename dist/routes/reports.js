"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reports_1 = require("../controllers/reports");
const router = (0, express_1.Router)();
router.get('/dashboard', reports_1.getDashboardStats);
router.get('/sales', reports_1.getSalesReport);
router.get('/profit', reports_1.getProfitReport);
exports.default = router;
