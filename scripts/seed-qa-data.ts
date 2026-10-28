import 'dotenv/config';
import { prisma } from '../src/prisma';
import { InventoryService, MOVEMENT_TYPES } from '../src/services/inventory.service';

async function main() {
  const args = new Set(process.argv.slice(2));
  const companyArg = [...args].find((arg) => arg.startsWith('--company-id='));
  const branchArg = [...args].find((arg) => arg.startsWith('--branch-id='));
  const companyId = companyArg ? Number(companyArg.split('=')[1]) : NaN;
  const branchId = branchArg ? Number(branchArg.split('=')[1]) : NaN;
  const apply = args.has('--apply');
  const confirmed = args.has('--confirm=SEED_QA_DATA');

  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    throw new Error('QA seeding is disabled in production');
  }
  if (!Number.isInteger(companyId) || companyId <= 0) throw new Error('--company-id=<positive integer> is required');
  if (!Number.isInteger(branchId) || branchId <= 0) throw new Error('--branch-id=<positive integer> is required');

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, company_id: companyId },
    select: { id: true, name: true, company: { select: { id: true, name: true } } },
  });
  if (!branch) throw new Error('Branch does not belong to the selected company');

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    company: branch.company,
    branch: { id: branch.id, name: branch.name },
    seed: { categories: 1, products: 3, customers: 1, suppliers: 1 },
  }, null, 2));
  if (!apply) return;
  if (!confirmed) throw new Error('Add --confirm=SEED_QA_DATA to create deterministic QA records');

  await prisma.$transaction(async (tx) => {
    const category = await tx.category.upsert({
      where: { company_id_name: { company_id: companyId, name: 'QA General' } },
      update: {},
      create: { company_id: companyId, name: 'QA General' },
    });

    const products = [
      { sku: 'QA-001', name: 'QA Product A', cost: 10, price: 15, opening: 20 },
      { sku: 'QA-002', name: 'QA Product B', cost: 20, price: 30, opening: 10 },
      { sku: 'QA-003', name: 'QA Low Stock', cost: 5, price: 8, opening: 2 },
    ];

    for (const fixture of products) {
      const product = await tx.product.upsert({
        where: { company_id_sku: { company_id: companyId, sku: fixture.sku } },
        update: {
          name: fixture.name,
          category_id: category.id,
          cost_price: fixture.cost,
          sell_price: fixture.price,
          is_active: true,
        },
        create: {
          company_id: companyId,
          branch_id: branchId,
          category_id: category.id,
          sku: fixture.sku,
          name: fixture.name,
          cost_price: fixture.cost,
          sell_price: fixture.price,
          low_stock_threshold: 5,
        },
      });
      const stock = await tx.productStock.findUnique({
        where: { company_id_branch_id_product_id: { company_id: companyId, branch_id: branchId, product_id: product.id } },
      });
      if (!stock || stock.stock_qty === 0) {
        await InventoryService.applyMovement(tx, {
          company_id: companyId,
          branch_id: branchId,
          product_id: product.id,
          movement_type: MOVEMENT_TYPES.OPENING,
          quantity_delta: fixture.opening,
          reference_type: 'qa_seed',
          reference_id: product.id,
          notes: 'Deterministic QA opening balance',
        });
      }
    }

    await tx.customer.upsert({
      where: { company_id_phone: { company_id: companyId, phone: '+201000000001' } },
      update: { name: 'QA Customer' },
      create: { company_id: companyId, name: 'QA Customer', phone: '+201000000001' },
    });
    await tx.supplier.upsert({
      where: { company_id_phone: { company_id: companyId, phone: '+201000000002' } },
      update: { name: 'QA Supplier' },
      create: { company_id: companyId, name: 'QA Supplier', phone: '+201000000002' },
    });
  }, { maxWait: 15_000, timeout: 30_000 });

  console.log(JSON.stringify({ seeded: true, company_id: companyId, branch_id: branchId }));
}

main().finally(() => prisma.$disconnect());
