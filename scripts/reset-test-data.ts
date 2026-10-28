import 'dotenv/config';
import { prisma } from '../src/prisma';

async function main() {
  const args = new Set(process.argv.slice(2));
  const companyArg = [...args].find((arg) => arg.startsWith('--company-id='));
  const companyId = companyArg ? Number(companyArg.split('=')[1]) : NaN;
  const apply = args.has('--apply');
  const confirmed = args.has('--confirm=RESET_TEST_DATA');

  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    throw new Error('Test-data reset is disabled in production');
  }
  if (!Number.isInteger(companyId) || companyId <= 0) throw new Error('--company-id=<positive integer> is required');

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } });
  if (!company) throw new Error('Company not found');
  const preview = {
    company,
    sales: await prisma.sale.count({ where: { company_id: companyId } }),
    products: await prisma.product.count({ where: { company_id: companyId } }),
    customers: await prisma.customer.count({ where: { company_id: companyId } }),
    suppliers: await prisma.supplier.count({ where: { company_id: companyId } }),
    shifts: await prisma.shift.count({ where: { company_id: companyId } }),
  };
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...preview }, null, 2));
  if (!apply) return;
  if (!confirmed) throw new Error('Add --confirm=RESET_TEST_DATA to perform the reset');

  await prisma.$transaction(async (tx) => {
    await tx.tenantAuditLog.deleteMany({ where: { company_id: companyId } });
    await tx.cashMovement.deleteMany({ where: { company_id: companyId } });
    await tx.refundPayment.deleteMany({ where: { company_id: companyId } });
    await tx.refund.deleteMany({ where: { company_id: companyId } });
    await tx.salePayment.deleteMany({ where: { company_id: companyId } });
    await tx.sale.deleteMany({ where: { company_id: companyId } });
    await tx.shift.deleteMany({ where: { company_id: companyId } });
    await tx.customerTransaction.deleteMany({ where: { company_id: companyId } });
    await tx.supplierInvoiceHistory.deleteMany({ where: { company_id: companyId } });
    await tx.supplierTransaction.deleteMany({ where: { company_id: companyId } });
    await tx.supplierInvoice.deleteMany({ where: { company_id: companyId } });
    await tx.inventoryMovement.deleteMany({ where: { company_id: companyId } });
    await tx.expense.deleteMany({ where: { company_id: companyId } });
    await tx.productStock.deleteMany({ where: { company_id: companyId } });
    await tx.product.deleteMany({ where: { company_id: companyId } });
    await tx.category.deleteMany({ where: { company_id: companyId } });
    await tx.customer.deleteMany({ where: { company_id: companyId } });
    await tx.supplier.deleteMany({ where: { company_id: companyId } });
  });
  console.log(JSON.stringify({ reset: true, company_id: companyId }));
}

main().finally(() => prisma.$disconnect());

