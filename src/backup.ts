import fs from 'fs';
import path from 'path';
import { prisma } from './prisma';

async function runBackup() {
  console.log('--- Starting PostgreSQL Data Backup ---');
  const backupDir = path.join(__dirname, '..', 'backup_export');
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }

  const tables = [
    { name: 'categories', model: prisma.category },
    { name: 'products', model: prisma.product },
    { name: 'customers', model: prisma.customer },
    { name: 'suppliers', model: prisma.supplier },
    { name: 'sales', model: prisma.sale },
    { name: 'sale_items', model: prisma.saleItem },
    { name: 'expenses', model: prisma.expense },
    { name: 'customer_transactions', model: prisma.customerTransaction },
    { name: 'supplier_transactions', model: prisma.supplierTransaction },
    { name: 'users', model: prisma.user },
    { name: 'refunds', model: prisma.refund },
    { name: 'refund_items', model: prisma.refundItem },
    { name: 'supplier_invoices', model: prisma.supplierInvoice },
    { name: 'supplier_invoice_items', model: prisma.supplierInvoiceItem },
    { name: 'supplier_invoice_history', model: prisma.supplierInvoiceHistory },
  ];

  for (const table of tables) {
    try {
      console.log(`Backing up table: ${table.name}...`);
      const data = await (table.model as any).findMany();
      const filePath = path.join(backupDir, `${table.name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`Saved ${data.length} records to ${filePath}`);
    } catch (error: any) {
      console.error(`Failed to back up table ${table.name}:`, error.message);
    }
  }

  // Also backup current schema file
  try {
    const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
    const destSchemaPath = path.join(backupDir, 'schema.prisma.bak');
    fs.copyFileSync(schemaPath, destSchemaPath);
    console.log(`Saved database schema backup to ${destSchemaPath}`);
  } catch (error: any) {
    console.error(`Failed to backup schema:`, error.message);
  }

  console.log('--- Backup Process Completed! ---');
  await prisma.$disconnect();
}

runBackup().catch((err) => {
  console.error('Backup failed:', err);
});
