import { Request, Response } from 'express';
import { prisma, logUserActivity, getUsername } from '../prisma';

export const getCustomerInstallments = async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.customerId as string);
    if (isNaN(customerId)) {
      res.status(400).json({ error: 'Invalid customer ID' });
      return;
    }

    const plans = await prisma.installmentPlan.findMany({
      where: { customer_id: customerId },
      include: {
        installments: {
          orderBy: { due_date: 'asc' },
        },
        sale: {
          select: {
            id: true,
            created_at: true,
            total: true,
            seller_name: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    res.json(plans);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const payInstallment = async (req: Request, res: Response) => {
  try {
    const username = getUsername(req);
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid installment ID' });
      return;
    }

    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Fetch the installment
      const installment = await tx.installment.findUnique({
        where: { id },
        include: {
          plan: {
            include: {
              customer: true,
            },
          },
        },
      });

      if (!installment) {
        throw new Error('Installment not found');
      }

      if (installment.status === 'paid') {
        throw new Error('Installment is already paid');
      }

      const amountToPay = installment.amount;
      const customerId = installment.plan.customer_id;

      // 2. Mark installment as paid
      const updatedInstallment = await tx.installment.update({
        where: { id },
        data: {
          status: 'paid',
          amount_paid: amountToPay,
          paid_at: new Date(),
        },
      });

      // 3. Create customer payment transaction
      await tx.customerTransaction.create({
        data: {
          customer_id: customerId,
          type: 'payment',
          amount: amountToPay,
          notes: `سداد القسط المستحق بتاريخ ${new Date(installment.due_date).toLocaleDateString('ar-EG')} للفاتورة #${installment.plan.sale_id}`,
        },
      });

      // 4. Update customer balance
      await tx.customer.update({
        where: { id: customerId },
        data: {
          balance: {
            decrement: amountToPay,
          },
        },
      });

      // 5. Check if all installments under the plan are paid
      const allInstallments = await tx.installment.findMany({
        where: { plan_id: installment.plan_id },
      });

      const allPaid = allInstallments.every((inst: any) => inst.id === id ? true : inst.status === 'paid');

      if (allPaid) {
        await tx.installmentPlan.update({
          where: { id: installment.plan_id },
          data: { status: 'completed' },
        });
      }

      return { updatedInstallment, allPaid };
    });

    await logUserActivity(username, 'PAY_INSTALLMENT', {
      installment_id: id,
      amount: result.updatedInstallment.amount,
      plan_id: result.updatedInstallment.plan_id,
      completed: result.allPaid,
    });

    res.json({ message: 'Installment paid successfully', data: result.updatedInstallment });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getUpcomingInstallments = async (req: Request, res: Response) => {
  try {
    const { from, to, status } = req.query;
    const where: any = {};

    if (status) {
      where.status = status as string;
    }

    if (from || to) {
      where.due_date = {};
      if (from) {
        where.due_date.gte = new Date(from as string);
      }
      if (to) {
        where.due_date.lte = new Date(to as string);
      }
    }

    const installments = await prisma.installment.findMany({
      where,
      include: {
        plan: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: { due_date: 'asc' },
    });

    res.json(installments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
