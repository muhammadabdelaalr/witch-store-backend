import 'dotenv/config';
import { prisma } from '../src/prisma';

async function main() {
  const companyArg = process.argv.find((arg) => arg.startsWith('--company-id='));
  const companyId = companyArg ? Number(companyArg.split('=')[1]) : undefined;
  if (companyArg && !Number.isInteger(companyId)) throw new Error('Invalid --company-id');
  const companyWhere = companyId ? { company_id: companyId } : {};

  const [openShifts, heldSales, plaintextPasswords, stockMismatches, customerMismatches, crossTenantRows] = await Promise.all([
    prisma.shift.count({ where: { ...companyWhere, status: 'open' } }),
    prisma.sale.count({ where: { ...companyWhere, status: 'held' } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM users
      WHERE password NOT LIKE '$2%'
      ${companyId ? Prisma.sql`AND company_id = ${companyId}` : Prisma.empty}
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM product_stocks ps
      LEFT JOIN (
        SELECT company_id, branch_id, product_id, COALESCE(SUM(quantity_delta), 0)::int AS movement_qty
        FROM inventory_movements GROUP BY company_id, branch_id, product_id
      ) m ON m.company_id = ps.company_id AND m.branch_id = ps.branch_id AND m.product_id = ps.product_id
      WHERE ps.stock_qty <> COALESCE(m.movement_qty, 0)
      ${companyId ? Prisma.sql`AND ps.company_id = ${companyId}` : Prisma.empty}
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM customers c
      LEFT JOIN (
        SELECT company_id, customer_id,
          COALESCE(SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END), 0) AS ledger_balance
        FROM customer_transactions GROUP BY company_id, customer_id
      ) l ON l.company_id = c.company_id AND l.customer_id = c.id
      WHERE ABS(c.balance - COALESCE(l.ledger_balance, 0)) > 0.01
      ${companyId ? Prisma.sql`AND c.company_id = ${companyId}` : Prisma.empty}
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT (
        (SELECT COUNT(*) FROM product_stocks ps JOIN branches b ON b.id = ps.branch_id WHERE b.company_id <> ps.company_id) +
        (SELECT COUNT(*) FROM product_stocks ps JOIN products p ON p.id = ps.product_id WHERE p.company_id <> ps.company_id) +
        (SELECT COUNT(*) FROM refunds r JOIN sales s ON s.id = r.sale_id WHERE s.company_id <> r.company_id)
      )::bigint AS count
    `,
  ]);

  console.log(JSON.stringify({
    generated_at: new Date().toISOString(), company_id: companyId || null,
    open_shifts: openShifts, held_sales: heldSales,
    non_bcrypt_passwords: Number(plaintextPasswords[0]?.count || 0),
    stock_ledger_mismatches: Number(stockMismatches[0]?.count || 0),
    customer_balance_mismatches: Number(customerMismatches[0]?.count || 0),
    cross_tenant_rows: Number(crossTenantRows[0]?.count || 0),
  }, null, 2));
}

import { Prisma } from '../src/generated/prisma';
main().finally(() => prisma.$disconnect());
