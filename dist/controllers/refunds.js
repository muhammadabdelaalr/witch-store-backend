"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRefund = void 0;
const prisma_1 = require("../prisma");
const createRefund = async (req, res) => {
    try {
        const companyId = req.tenant.company_id;
        const branchId = req.tenant.branch_id;
        const saleId = parseInt(req.params.id);
        if (isNaN(saleId)) {
            res.status(400).json({ error: 'Invalid sale ID' });
            return;
        }
        const { items, reason, seller_name } = req.body;
        if (!items || !Array.isArray(items) || items.length === 0) {
            res.status(400).json({ error: 'Refund must contain at least one item' });
            return;
        }
        // Start Prisma Transaction
        const refund = await prisma_1.prisma.$transaction(async (tx) => {
            // 1. Fetch the original sale and make sure it belongs to the tenant
            const sale = await tx.sale.findFirst({
                where: { id: saleId, company_id: companyId },
                include: { items: true, refunds: { include: { items: true } } },
            });
            if (!sale) {
                throw new Error('Sale not found');
            }
            // 2. Validate refund quantities against original sale AND past refunds
            const maxRefundable = {};
            for (const saleItem of sale.items) {
                maxRefundable[saleItem.product_id] = {
                    maxQty: saleItem.qty,
                    unitPrice: saleItem.unit_price,
                    costPrice: saleItem.cost_price,
                };
            }
            for (const pastRefund of sale.refunds) {
                for (const refundItem of pastRefund.items) {
                    if (maxRefundable[refundItem.product_id]) {
                        // Business Rule: If a product was refunded once, it cannot be refunded again.
                        maxRefundable[refundItem.product_id].maxQty = 0;
                    }
                }
            }
            let rawRefundSubtotal = 0;
            const verifiedRefundItems = [];
            for (const item of items) {
                const productIdInt = parseInt(item.product_id);
                const qtyInt = parseInt(item.qty);
                if (qtyInt <= 0)
                    continue;
                if (!maxRefundable[productIdInt]) {
                    throw new Error(`Product ID ${productIdInt} was not part of this sale`);
                }
                if (qtyInt > maxRefundable[productIdInt].maxQty) {
                    throw new Error(`Cannot refund ${qtyInt} of Product ID ${productIdInt}. Only ${maxRefundable[productIdInt].maxQty} available for refund.`);
                }
                const refundItemAmount = qtyInt * maxRefundable[productIdInt].unitPrice;
                rawRefundSubtotal += refundItemAmount;
                verifiedRefundItems.push({
                    product_id: productIdInt,
                    qty: qtyInt,
                    unit_price: maxRefundable[productIdInt].unitPrice,
                    cost_price: maxRefundable[productIdInt].costPrice,
                });
                // 3. Restock inventory at branch level
                await tx.productStock.upsert({
                    where: {
                        company_id_branch_id_product_id: {
                            company_id: companyId,
                            branch_id: branchId,
                            product_id: productIdInt,
                        },
                    },
                    update: {
                        stock_qty: {
                            increment: qtyInt,
                        },
                    },
                    create: {
                        company_id: companyId,
                        branch_id: branchId,
                        product_id: productIdInt,
                        stock_qty: qtyInt,
                        low_stock_threshold: 5,
                    },
                });
                // Also restock core fallback stock_qty column
                await tx.product.update({
                    where: { id: productIdInt },
                    data: {
                        stock_qty: {
                            increment: qtyInt,
                        },
                    },
                });
            }
            if (verifiedRefundItems.length === 0) {
                throw new Error('No valid items to refund');
            }
            // Calculate final refund total matching invoice structure
            const discountAmount = rawRefundSubtotal * (sale.discount / 100);
            const taxAmount = (rawRefundSubtotal - discountAmount) * (sale.tax / 100);
            const refundTotal = rawRefundSubtotal - discountAmount + taxAmount;
            // 4. Create the Refund record
            const newRefund = await tx.refund.create({
                data: {
                    company_id: companyId,
                    branch_id: branchId,
                    sale_id: sale.id,
                    total: refundTotal,
                    reason: reason || null,
                    seller_name: seller_name || null,
                    items: {
                        create: verifiedRefundItems,
                    },
                },
            });
            // 5. Update Customer Ledger if Customer is attached
            if (sale.customer_id) {
                const customer = await tx.customer.findFirst({
                    where: { id: sale.customer_id, company_id: companyId },
                });
                if (customer) {
                    // Create customer ledger transaction for the refund
                    await tx.customerTransaction.create({
                        data: {
                            company_id: companyId,
                            customer_id: sale.customer_id,
                            type: 'payment',
                            amount: refundTotal,
                            notes: `Refund for Sale #${sale.id}`,
                        },
                    });
                    // Update customer balance
                    await tx.customer.update({
                        where: { id: sale.customer_id },
                        data: {
                            balance: {
                                decrement: refundTotal,
                            },
                        },
                    });
                }
            }
            // 6. User Activity Log
            if (seller_name) {
                const user = await tx.user.findFirst({
                    where: { name: seller_name, company_id: companyId },
                });
                if (user) {
                    const logs = JSON.parse(user.logs || '[]');
                    logs.push({
                        action: 'CREATE_REFUND',
                        details: { refund_id: newRefund.id, sale_id: sale.id, total: refundTotal },
                        timestamp: new Date().toISOString(),
                    });
                    await tx.user.update({
                        where: { id: user.id },
                        data: { logs: JSON.stringify(logs) },
                    });
                }
            }
            return newRefund;
        }, {
            maxWait: 15000,
            timeout: 30000,
        });
        res.status(201).json(refund);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.createRefund = createRefund;
