import Database from 'better-sqlite3';
import { prisma } from './prisma';

const dbPath = 'C:\\Users\\2p\\AppData\\Roaming\\the-witch-store\\erp-store.db';

async function runMigration() {
  console.log('--- Starting Data Migration from local SQLite to PostgreSQL ---');
  console.log('Connecting to SQLite:', dbPath);
  
  let sqliteDb: Database.Database;
  try {
    sqliteDb = new Database(dbPath, { readonly: true });
  } catch (err: any) {
    console.error('Failed to connect to SQLite:', err.message);
    process.exit(1);
  }

  try {
    // 1. Clean existing PostgreSQL data in reverse dependency order
    console.log('Cleaning existing database records in PostgreSQL...');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sale_items" CASCADE;`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales" CASCADE;`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "customer_transactions" CASCADE;`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "supplier_transactions" CASCADE;`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "expenses" CASCADE;`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "products" CASCADE;`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "categories" CASCADE;`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "customers" CASCADE;`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "suppliers" CASCADE;`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users" CASCADE;`);
    console.log('Cleaned all tables successfully.');

    // 2. Migrate Categories
    console.log('Migrating Categories...');
    const categories = sqliteDb.prepare('SELECT * FROM categories').all() as any[];
    for (const cat of categories) {
      await prisma.category.create({
        data: {
          id: cat.id,
          name: cat.name,
          created_at: new Date(cat.created_at || Date.now()),
        }
      });
    }
    console.log(`Migrated ${categories.length} categories.`);

    // 3. Migrate Customers
    console.log('Migrating Customers...');
    const customers = sqliteDb.prepare('SELECT * FROM customers').all() as any[];
    for (const c of customers) {
      await prisma.customer.create({
        data: {
          id: c.id,
          name: c.name,
          phone: c.phone || null,
          email: c.email || null,
          address: c.address || null,
          balance: parseFloat(c.balance || 0),
          created_at: new Date(c.created_at || Date.now()),
        }
      });
    }
    console.log(`Migrated ${customers.length} customers.`);

    // 4. Migrate Suppliers
    console.log('Migrating Suppliers...');
    const suppliers = sqliteDb.prepare('SELECT * FROM suppliers').all() as any[];
    for (const s of suppliers) {
      await prisma.supplier.create({
        data: {
          id: s.id,
          name: s.name,
          phone: s.phone || null,
          email: s.email || null,
          address: s.address || null,
          balance: parseFloat(s.balance || 0),
          created_at: new Date(s.created_at || Date.now()),
        }
      });
    }
    console.log(`Migrated ${suppliers.length} suppliers.`);

    // 5. Migrate Products
    console.log('Migrating Products...');
    const products = sqliteDb.prepare('SELECT * FROM products').all() as any[];
    for (const p of products) {
      await prisma.product.create({
        data: {
          id: p.id,
          name: p.name,
          sku: p.sku || null,
          barcode: p.barcode || null,
          category_id: p.category_id || null,
          factory: p.factory || null,
          description: p.description || null,
          cost_price: parseFloat(p.cost_price || 0),
          sell_price: parseFloat(p.sell_price || 0),
          stock_qty: parseInt(p.stock_qty || 0),
          low_stock_threshold: p.low_stock_threshold !== null ? parseInt(p.low_stock_threshold) : 5,
          image_path: p.image_path || null,
          created_at: new Date(p.created_at || Date.now()),
          updated_at: new Date(p.updated_at || Date.now()),
        }
      });
    }
    console.log(`Migrated ${products.length} products.`);

    // 6. Migrate Sales
    console.log('Migrating Sales...');
    const sales = sqliteDb.prepare('SELECT * FROM sales').all() as any[];
    for (const s of sales) {
      await prisma.sale.create({
        data: {
          id: s.id,
          customer_id: s.customer_id || null,
          total: parseFloat(s.total || 0),
          discount: parseFloat(s.discount || 0),
          tax: parseFloat(s.tax || 0),
          amount_paid: parseFloat(s.amount_paid || 0),
          payment_method: s.payment_method as any,
          notes: s.notes || null,
          seller_name: s.seller_name || null,
          created_at: new Date(s.created_at || Date.now()),
        }
      });
    }
    console.log(`Migrated ${sales.length} sales.`);

    // 7. Migrate Sale Items
    console.log('Migrating Sale Items...');
    const saleItems = sqliteDb.prepare('SELECT * FROM sale_items').all() as any[];
    for (const si of saleItems) {
      await prisma.saleItem.create({
        data: {
          id: si.id,
          sale_id: si.sale_id,
          product_id: si.product_id,
          qty: parseInt(si.qty || 0),
          unit_price: parseFloat(si.unit_price || 0),
          cost_price: parseFloat(si.cost_price || 0),
        }
      });
    }
    console.log(`Migrated ${saleItems.length} sale items.`);

    // 8. Migrate Expenses
    console.log('Migrating Expenses...');
    const expenses = sqliteDb.prepare('SELECT * FROM expenses').all() as any[];
    for (const e of expenses) {
      await prisma.expense.create({
        data: {
          id: e.id,
          category_id: e.category_id || null,
          category: e.category,
          amount: parseFloat(e.amount || 0),
          description: e.description || null,
          date: e.date,
          created_at: new Date(e.created_at || Date.now()),
        }
      });
    }
    console.log(`Migrated ${expenses.length} expenses.`);

    // 9. Migrate Customer Transactions
    console.log('Migrating Customer Transactions...');
    const customerTransactions = sqliteDb.prepare('SELECT * FROM customer_transactions').all() as any[];
    for (const ct of customerTransactions) {
      await prisma.customerTransaction.create({
        data: {
          id: ct.id,
          customer_id: ct.customer_id,
          type: ct.type as any,
          amount: parseFloat(ct.amount || 0),
          notes: ct.notes || null,
          created_at: new Date(ct.created_at || Date.now()),
        }
      });
    }
    console.log(`Migrated ${customerTransactions.length} customer transactions.`);

    // 10. Migrate Supplier Transactions
    console.log('Migrating Supplier Transactions...');
    const supplierTransactions = sqliteDb.prepare('SELECT * FROM supplier_transactions').all() as any[];
    for (const st of supplierTransactions) {
      await prisma.supplierTransaction.create({
        data: {
          id: st.id,
          supplier_id: st.supplier_id,
          type: st.type as any,
          amount: parseFloat(st.amount || 0),
          notes: st.notes || null,
          created_at: new Date(st.created_at || Date.now()),
        }
      });
    }
    console.log(`Migrated ${supplierTransactions.length} supplier transactions.`);

    // 11. Migrate Users
    console.log('Migrating Users...');
    const users = sqliteDb.prepare('SELECT * FROM users').all() as any[];
    for (const u of users) {
      await prisma.user.create({
        data: {
          id: u.id,
          name: u.name,
          phone: u.phone,
          logs: u.logs || '[]',
          created_at: new Date(u.created_at || Date.now()),
        }
      });
    }
    console.log(`Migrated ${users.length} users.`);

    // 12. Reset auto-increment sequences in PostgreSQL to prevent ID conflicts
    console.log('Resetting PostgreSQL sequences...');
    const tablesWithSequences = [
      { table: 'categories', seq: 'categories_id_seq' },
      { table: 'products', seq: 'products_id_seq' },
      { table: 'customers', seq: 'customers_id_seq' },
      { table: 'suppliers', seq: 'suppliers_id_seq' },
      { table: 'sales', seq: 'sales_id_seq' },
      { table: 'sale_items', seq: 'sale_items_id_seq' },
      { table: 'expenses', seq: 'expenses_id_seq' },
      { table: 'customer_transactions', seq: 'customer_transactions_id_seq' },
      { table: 'supplier_transactions', seq: 'supplier_transactions_id_seq' },
      { table: 'users', seq: 'users_id_seq' },
    ];

    for (const item of tablesWithSequences) {
      try {
        await prisma.$executeRawUnsafe(`
          SELECT setval(pg_get_serial_sequence('"${item.table}"', 'id'), COALESCE(MAX(id), 1)) FROM "${item.table}";
        `);
      } catch (err: any) {
        console.warn(`Could not reset sequence for ${item.table}:`, err.message);
      }
    }
    console.log('Sequences reset successfully.');
    console.log('--- Migration Finished Successfully! ---');
  } catch (error: any) {
    console.error('Migration encountered an error:', error);
  } finally {
    sqliteDb.close();
    await prisma.$disconnect();
  }
}

runMigration();
