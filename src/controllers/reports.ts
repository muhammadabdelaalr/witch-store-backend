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
    const { from, to } = req.query;

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
    const dailyTotals: { [key: string]: number } = {};
    const productSales: { [key: number]: { name: string; qty: number; revenue: number } } = {};
    const paymentMethods: { [key: string]: { count: number; total: number } } = {
      cash: { count: 0, total: 0 },
      instapay: { count: 0, total: 0 },
      wallet: { count: 0, total: 0 },
      card: { count: 0, total: 0 },
      credit: { count: 0, total: 0 },
    };

    sales.forEach((sale: any) => {
      totalRevenue += sale.total;

      const subtotal = sale.items.reduce((sum: number, item: any) => sum + item.unit_price * item.qty, 0);
      const discountVal = subtotal * (sale.discount / 100);
      const taxVal = (subtotal - discountVal) * (sale.tax / 100);

      totalDiscountAmount += discountVal;
      totalTaxAmount += taxVal;

      const dateStr = sale.created_at.toISOString().split('T')[0];
      dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + sale.total;

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

    const salesByDay = Object.keys(dailyTotals).map((date) => ({
      date,
      total: dailyTotals[date],
    }));

    const topProducts = Object.keys(productSales)
      .map((id) => ({
        id: parseInt(id),
        ...productSales[parseInt(id)],
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    res.json({
      totalRevenue,
      totalDiscountAmount,
      totalTaxAmount,
      salesCount: sales.length,
      salesByDay,
      topProducts,
      paymentMethods,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getProfitReport = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;

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
      },
      include: {
        items: true,
      },
    });

    let totalRevenue = 0;
    let costOfGoodsSold = 0;

    sales.forEach((sale: any) => {
      totalRevenue += sale.total;
      sale.items.forEach((item: any) => {
        costOfGoodsSold += item.cost_price * item.qty;
      });
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

    const totalExpenses = expenses.reduce((sum: number, exp: any) => sum + exp.amount, 0);

    const netProfit = grossProfit - totalExpenses;

    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    res.json({
      totalRevenue,
      costOfGoodsSold,
      grossProfit,
      grossMargin,
      totalExpenses,
      netProfit,
      netMargin,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
