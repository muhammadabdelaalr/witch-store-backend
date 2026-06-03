"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const installments_1 = require("../controllers/installments");
const router = (0, express_1.Router)();
/**
 * @swagger
 * tags:
 *   name: Installments
 *   description: Installments management
 */
router.get('/customer/:customerId', installments_1.getCustomerInstallments);
router.post('/:id/pay', installments_1.payInstallment);
router.get('/upcoming', installments_1.getUpcomingInstallments);
exports.default = router;
