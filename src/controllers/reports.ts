import { Request, Response } from 'express';
import { prisma } from '../prisma';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 1. Today's Revenue and Transactions count
    let todayRevenue = 0;
    let todayTransactionsCount = 0;

    if (categoryId) {
      // Find sale items for products in category sold today
      const saleItems = await prisma.saleItem.findMany({
        where: {
          sale: {
            created_at: { gte: todayStart, lte: todayEnd },
          },
          product: {
            category_id: categoryId,
          },
        },
        include: {
          sale: true,
        },
      });

      // Sum revenue (unit_price * qty)
      todayRevenue = saleItems.reduce((sum: number, item: any) => sum + item.unit_price * item.qty, 0);

      // Unique sales count
      const uniqueSaleIds = new Set(saleItems.map((item: any) => item.sale_id));
      todayTransactionsCount = uniqueSaleIds.size;
    } else {
      const salesToday = await prisma.sale.findMany({
        where: {
          created_at: { gte: todayStart, lte: todayEnd },
        },
      });
      todayRevenue = salesToday.reduce((sum: number, sale: any) => sum + sale.total, 0);
      todayTransactionsCount = salesToday.length;
    }

    // 2. Customer Count
    const customerCount = await prisma.customer.count();

    // 3. Low Stock Items Count
    let lowStockCount = 0;
    if (categoryId) {
      const products = await prisma.product.findMany({
        where: {
          category_id: categoryId,
        },
      });
      lowStockCount = products.filter(
        (p: any) => p.stock_qty <= (p.low_stock_threshold ?? 5)
      ).length;
    } else {
      const products = await prisma.product.findMany();
      lowStockCount = products.filter(
        (p: any) => p.stock_qty <= (p.low_stock_threshold ?? 5)
      ).length;
    }

    // 4. Weekly Sales Data (Last 7 Days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const weeklySales = await prisma.sale.findMany({
      where: {
        created_at: { gte: sevenDaysAgo },
        ...(categoryId
          ? {
              items: {
                some: {
                  product: {
                    category_id: categoryId,
                  },
                },
              },
            }
          : {}),
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    // Group sales by day of week
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dailyData: { [key: string]: number } = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dailyData[dayNames[d.getDay()]] = 0;
    }

    weeklySales.forEach((sale: any) => {
      const day = dayNames[new Date(sale.created_at).getDay()];
      if (day in dailyData) {
        if (categoryId) {
          const categoryTotal = sale.items
            .filter((item: any) => item.product.category_id === categoryId)
            .reduce((sum: number, item: any) => sum + item.unit_price * item.qty, 0);
          dailyData[day] += categoryTotal;
        } else {
          dailyData[day] += sale.total;
        }
      }
    });

    const weeklyChart = Object.keys(dailyData)
      .reverse()
      .map((day) => ({
        day,
        amount: dailyData[day],
      }));

    // 5. Top Selling Products (Top 5)
    const topItems = await prisma.saleItem.findMany({
      where: {
        ...(categoryId
          ? {
              product: {
                category_id: categoryId,
              },
            }
          : {}),
      },
      include: {
        product: true,
      },
    });

    const productSales: { [key: number]: { name: string; qty: number; total: number } } = {};
    topItems.forEach((item: any) => {
      if (!productSales[item.product_id]) {
        productSales[item.product_id] = {
          name: item.product.name,
          qty: 0,
          total: 0,
        };
      }
      productSales[item.product_id].qty += item.qty;
      productSales[item.product_id].total += item.unit_price * item.qty;
    });

    const topSelling = Object.keys(productSales)
      .map((id) => ({
        id: parseInt(id),
        ...productSales[parseInt(id)],
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
    res.json({
      todayRevenue,
      todayTransactionsCount,
      customerCount,
      lowStockCount,
      weeklyChart,
      topSelling,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getSalesReport = async (req: Request, res: Response) => {
  try {
    const { from, to, sale_type } = req.query;

    if (!from || !to) {
      res.status(400).json({ error: 'from and to date parameters are required' });
      return;
    }

    const startDate = new Date((from as string) + 'T00:00:00.000Z');
    const endDate = new Date((to as string) + 'T23:59:59.999Z');

    const sales = await prisma.sale.findMany({
      where: {
        created_at: {
          gte: startDate,
          lte: endDate,
        },
        ...(sale_type && sale_type !== 'all' ? { sale_type: sale_type as any } : {}),
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    let totalRevenue = 0;
    let totalDiscountAmount = 0;
    let totalTaxAmount = 0;
    const dailyTotals: { [key: string]: { total: number; count: number } } = {};
    const productSales: { [key: number]: { name: string; qty: number; revenue: number } } = {};
    const paymentMethods: { [key: string]: { count: number; total: number } } = {
      cash: { count: 0, total: 0 },
      instapay: { count: 0, total: 0 },
      wallet: { count: 0, total: 0 },
      card: { count: 0, total: 0 },
      deferred: { count: 0, total: 0 },
    };

    sales.forEach((sale: any) => {
      totalRevenue += sale.total;

      const subtotal = sale.items.reduce((sum: number, item: any) => sum + item.unit_price * item.qty, 0);
      const discountVal = subtotal * (sale.discount / 100);
      const taxVal = (subtotal - discountVal) * (sale.tax / 100);

      totalDiscountAmount += discountVal;
      totalTaxAmount += taxVal;

      const dateStr = sale.created_at.toISOString().split('T')[0];
      if (!dailyTotals[dateStr]) {
        dailyTotals[dateStr] = { total: 0, count: 0 };
      }
      dailyTotals[dateStr].total += sale.total;
      dailyTotals[dateStr].count += 1;

      const method = sale.payment_method;
      if (paymentMethods[method]) {
        paymentMethods[method].count += 1;
        paymentMethods[method].total += sale.total;
      }

      sale.items.forEach((item: any) => {
        if (!productSales[item.product_id]) {
          productSales[item.product_id] = {
            name: item.product.name,
            qty: 0,
            revenue: 0,
          };
        }
        productSales[item.product_id].qty += item.qty;
        productSales[item.product_id].revenue += item.unit_price * item.qty;
      });
    });

    const refunds = await prisma.refund.findMany({
      where: {
        created_at: {
          gte: startDate,
          lte: endDate,
        },
        ...(sale_type && sale_type !== 'all' ? { sale: { sale_type: sale_type as any } } : {}),
      },
      include: {
        items: true,
      }
    });

    refunds.forEach((refund: any) => {
      totalRevenue -= refund.total;

      const dateStr = refund.created_at.toISOString().split('T')[0];
      if (!dailyTotals[dateStr]) {
        dailyTotals[dateStr] = { total: 0, count: 0 };
      }
      dailyTotals[dateStr].total -= refund.total;

      refund.items.forEach((item: any) => {
        if (productSales[item.product_id]) {
          productSales[item.product_id].qty -= item.qty;
          productSales[item.product_id].revenue -= item.unit_price * item.qty;
        }
      });
    });

    const salesByDay = Object.keys(dailyTotals).map((date) => ({
      date,
      total: dailyTotals[date].total,
      count: dailyTotals[date].count,
    }));

    const topProducts = Object.keys(productSales)
      .map((id) => ({
        id: parseInt(id),
        ...productSales[parseInt(id)],
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    const paymentMethodBreakdown = Object.keys(paymentMethods)
      .map((method) => ({
        method,
        total: paymentMethods[method].total,
        count: paymentMethods[method].count,
      }))
      .filter((m) => m.count > 0); // Only return used methods

    res.json({
      totalSales: sales.length,
      totalRevenue,
      totalDiscount: totalDiscountAmount,
      averageOrderValue: sales.length > 0 ? totalRevenue / sales.length : 0,
      salesByDay,
      topProducts,
      paymentMethodBreakdown,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getProfitReport = async (req: Request, res: Response) => {
  try {
    const { from, to, sale_type } = req.query;

    if (!from || !to) {
      res.status(400).json({ error: 'from and to date parameters are required' });
      return;
    }

    const startDate = new Date((from as string) + 'T00:00:00.000Z');
    const endDate = new Date((to as string) + 'T23:59:59.999Z');

    const sales = await prisma.sale.findMany({
      where: {
        created_at: {
          gte: startDate,
          lte: endDate,
        },
        ...(sale_type && sale_type !== 'all' ? { sale_type: sale_type as any } : {}),
      },
      include: {
        items: true,
      },
    });

    let totalRevenue = 0;
    let costOfGoodsSold = 0;
    const dailyProfit: { [key: string]: { revenue: number; cost: number; profit: number } } = {};

    sales.forEach((sale: any) => {
      totalRevenue += sale.total;
      let saleCost = 0;
      sale.items.forEach((item: any) => {
        saleCost += item.cost_price * item.qty;
      });
      costOfGoodsSold += saleCost;

      const dateStr = sale.created_at.toISOString().split('T')[0];
      if (!dailyProfit[dateStr]) {
        dailyProfit[dateStr] = { revenue: 0, cost: 0, profit: 0 };
      }
      dailyProfit[dateStr].revenue += sale.total;
      dailyProfit[dateStr].cost += saleCost;
      dailyProfit[dateStr].profit += (sale.total - saleCost);
    });

    const refunds = await prisma.refund.findMany({
      where: {
        created_at: {
          gte: startDate,
          lte: endDate,
        },
        ...(sale_type && sale_type !== 'all' ? { sale: { sale_type: sale_type as any } } : {}),
      },
      include: {
        items: true,
      }
    });

    refunds.forEach((refund: any) => {
      totalRevenue -= refund.total;
      let refundCost = 0;
      refund.items.forEach((item: any) => {
        refundCost += item.cost_price * item.qty;
      });
      costOfGoodsSold -= refundCost;

      const dateStr = refund.created_at.toISOString().split('T')[0];
      if (!dailyProfit[dateStr]) {
        dailyProfit[dateStr] = { revenue: 0, cost: 0, profit: 0 };
      }
      dailyProfit[dateStr].revenue -= refund.total;
      dailyProfit[dateStr].cost -= refundCost;
      dailyProfit[dateStr].profit -= (refund.total - refundCost);
    });

    const grossProfit = totalRevenue - costOfGoodsSold;

    const expenses = await prisma.expense.findMany({
      where: {
        date: {
          gte: from as string,
          lte: to as string,
        },
      },
    });

    let totalExpenses = 0;
    const expByCategory: { [key: string]: number } = {};

    expenses.forEach((exp: any) => {
      totalExpenses += exp.amount;
      expByCategory[exp.category] = (expByCategory[exp.category] || 0) + exp.amount;
    });

    const expensesByCategory = Object.keys(expByCategory).map(category => ({
      category,
      total: expByCategory[category]
    }));

    const netProfit = grossProfit - totalExpenses;

    const profitByDay = Object.keys(dailyProfit).map((date) => ({
      date,
      revenue: dailyProfit[date].revenue,
      cost: dailyProfit[date].cost,
      profit: dailyProfit[date].profit,
    }));

    res.json({
      grossProfit,
      totalExpenses,
      netProfit,
      profitByDay,
      expensesByCategory
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
