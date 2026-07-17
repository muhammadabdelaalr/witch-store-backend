"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("./prisma");
async function runBackup() {
    console.log('--- Starting PostgreSQL Data Backup ---');
    const backupDir = path_1.default.join(__dirname, '..', 'backup_export');
    if (!fs_1.default.existsSync(backupDir)) {
        fs_1.default.mkdirSync(backupDir);
    }
    const tables = [
        { name: 'categories', model: prisma_1.prisma.category },
        { name: 'products', model: prisma_1.prisma.product },
        { name: 'customers', model: prisma_1.prisma.customer },
        { name: 'suppliers', model: prisma_1.prisma.supplier },
        { name: 'sales', model: prisma_1.prisma.sale },
        { name: 'sale_items', model: prisma_1.prisma.saleItem },
        { name: 'expenses', model: prisma_1.prisma.expense },
        { name: 'customer_transactions', model: prisma_1.prisma.customerTransaction },
        { name: 'supplier_transactions', model: prisma_1.prisma.supplierTransaction },
        { name: 'users', model: prisma_1.prisma.user },
        { name: 'refunds', model: prisma_1.prisma.refund },
        { name: 'refund_items', model: prisma_1.prisma.refundItem },
        { name: 'supplier_invoices', model: prisma_1.prisma.supplierInvoice },
        { name: 'supplier_invoice_items', model: prisma_1.prisma.supplierInvoiceItem },
        { name: 'supplier_invoice_history', model: prisma_1.prisma.supplierInvoiceHistory },
    ];
    for (const table of tables) {
        try {
            console.log(`Backing up table: ${table.name}...`);
            const data = await table.model.findMany();
            const filePath = path_1.default.join(backupDir, `${table.name}.json`);
            fs_1.default.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            console.log(`Saved ${data.length} records to ${filePath}`);
        }
        catch (error) {
            console.error(`Failed to back up table ${table.name}:`, error.message);
        }
    }
    // Also backup current schema file
    try {
        const schemaPath = path_1.default.join(__dirname, '..', 'prisma', 'schema.prisma');
        const destSchemaPath = path_1.default.join(backupDir, 'schema.prisma.bak');
        fs_1.default.copyFileSync(schemaPath, destSchemaPath);
        console.log(`Saved database schema backup to ${destSchemaPath}`);
    }
    catch (error) {
        console.error(`Failed to backup schema:`, error.message);
    }
    console.log('--- Backup Process Completed! ---');
    await prisma_1.prisma.$disconnect();
}
runBackup().catch((err) => {
    console.error('Backup failed:', err);
});
