import { prisma } from './src/prisma';

async function runTests() {
  console.log('--- STARTING SUPPLIER INVOICE INTEGRATION TEST ---');

  // 1. Setup/Get Test Supplier and Product
  let supplier = await prisma.supplier.findFirst({
    where: { name: 'مورد اختبارى' }
  });
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: {
        name: 'مورد اختبارى',
        phone: '01000000000',
        address: 'عنوان اختبارى',
        balance: 0
      }
    });
    console.log(`Created test supplier with ID: ${supplier.id}`);
  } else {
    console.log(`Using existing test supplier ID: ${supplier.id}, Current Balance: ${supplier.balance}`);
  }

  let product = await prisma.product.findFirst({
    where: { name: 'قميص تجريبى' }
  });
  if (!product) {
    product = await prisma.product.create({
      data: {
        name: 'قميص تجريبى',
        cost_price: 100,
        sell_price: 150,
        stock_qty: 10,
        barcode: 'TESTPROD123',
        sku: 'TESTPROD123'
      }
    });
    console.log(`Created test product with ID: ${product.id}`);
  } else {
    console.log(`Using existing test product ID: ${product.id}, Stock: ${product.stock_qty}, Cost: ${product.cost_price}`);
  }

  const initialStock = product.stock_qty;
  const initialSupplierBalance = supplier.balance;

  // 2. Test Create Supplier Invoice
  console.log('\n--- Test Case 1: Create Supplier Invoice ---');
  const invoiceTotal = 1500; // 10 units at 150 cost price
  const amountPaid = 500;
  const qty = 10;
  const unitCost = 150;
  const notes = 'فاتورة تجريبية أولى';
  const sellerName = 'البائع أحمد';
  const invoiceDate = new Date();

  // We import controllers directly to test the code
  const { createSupplierInvoice, updateSupplierInvoice } = require('./src/controllers/supplierInvoices');
  
  // Let's call the database transaction logic directly to test
  console.log(`Creating invoice for supplier: ${supplier.id}, product: ${product.id}, qty: ${qty}, unitCost: ${unitCost}`);

  // Create Mock Request / Response for Controller
  const mockReqCreate = {
    headers: { 'x-user-name': 'admin' },
    body: {
      supplier_id: supplier.id,
      total: invoiceTotal,
      amount_paid: amountPaid,
      notes,
      invoice_date: invoiceDate.toISOString(),
      seller_name: sellerName,
      items: [
        {
          product_id: product.id,
          qty,
          unit_cost: unitCost
        }
      ]
    }
  } as any;

  let createdInvoice: any = null;
  const mockResCreate = {
    status: (code: number) => {
      console.log(`Response Status: ${code}`);
      return mockResCreate;
    },
    json: (data: any) => {
      if (data.error) {
        console.error('Error in Response:', data.error);
      } else {
        createdInvoice = data;
        console.log('Invoice created successfully: ID =', data.id);
      }
    }
  } as any;

  await createSupplierInvoice(mockReqCreate, mockResCreate);

  if (!createdInvoice) {
    throw new Error('Invoice creation failed');
  }

  // Verify stock was updated
  const updatedProduct = await prisma.product.findUnique({ where: { id: product.id } });
  console.log(`Product Stock after Invoice: ${updatedProduct?.stock_qty} (Expected: ${initialStock + qty})`);
  console.log(`Product Cost Price after Invoice: ${updatedProduct?.cost_price} (Expected: ${unitCost})`);
  if (updatedProduct?.stock_qty !== initialStock + qty) {
    throw new Error('Stock was not adjusted correctly!');
  }
  if (updatedProduct?.cost_price !== unitCost) {
    throw new Error('Cost price was not updated correctly!');
  }

  // Verify supplier balance was updated
  const updatedSupplier = await prisma.supplier.findUnique({ where: { id: supplier.id } });
  const expectedNewBalance = initialSupplierBalance + (invoiceTotal - amountPaid);
  console.log(`Supplier Balance after Invoice: ${updatedSupplier?.balance} (Expected: ${expectedNewBalance})`);
  if (updatedSupplier?.balance !== expectedNewBalance) {
    throw new Error('Supplier balance was not adjusted correctly!');
  }

  // Verify transactions were created
  const txs = await prisma.supplierTransaction.findMany({
    where: { invoice_id: createdInvoice.id }
  });
  console.log(`Transactions recorded: ${txs.length} (Expected: 2)`);
  txs.forEach(t => {
    console.log(`- Type: ${t.type}, Amount: ${t.amount}, Notes: ${t.notes}, Seller: ${t.seller_name}`);
  });
  if (txs.length !== 2) {
    throw new Error('Should record exactly 2 transactions (purchase + payment)!');
  }

  // Verify history logs
  const logs = await prisma.supplierInvoiceHistory.findMany({
    where: { invoice_id: createdInvoice.id }
  });
  console.log(`History logs: ${logs.length} (Expected: 1)`);
  logs.forEach(l => {
    console.log(`- Action: ${l.action}, Seller: ${l.seller_name}, Details: ${l.changes}`);
  });
  if (logs.length !== 1 || logs[0].action !== 'create') {
    throw new Error('Should record creation history log!');
  }

  // 3. Test Edit Supplier Invoice (Refund/Return 4 units)
  console.log('\n--- Test Case 2: Edit/Refund Supplier Invoice ---');
  // We edit the invoice: change qty from 10 to 6 (retaining 6 units, which means 4 units are returned)
  // New Total: 6 * 150 = 900
  // New Amount Paid: 500 (remains same)
  // New Unpaid: 400 (Expected supplier balance adjustment: reduces debt by 600, so new balance should decrease by 600)
  const newQty = 6;
  const newTotal = newQty * unitCost;

  const mockReqEdit = {
    headers: { 'x-user-name': 'admin' },
    params: { id: String(createdInvoice.id) },
    body: {
      total: newTotal,
      amount_paid: amountPaid,
      notes: 'تعديل الفاتورة وإرجاع جزء من البضاعة',
      invoice_date: invoiceDate.toISOString(),
      seller_name: 'المشرف عمر',
      is_refund: true,
      items: [
        {
          product_id: product.id,
          qty: newQty,
          unit_cost: unitCost
        }
      ]
    }
  } as any;

  let editedInvoice: any = null;
  const mockResEdit = {
    status: (code: number) => {
      console.log(`Response Status: ${code}`);
      return mockResEdit;
    },
    json: (data: any) => {
      if (data.error) {
        console.error('Error in Response:', data.error);
      } else {
        editedInvoice = data;
        console.log('Invoice edited successfully: ID =', data.id);
      }
    }
  } as any;

  await updateSupplierInvoice(mockReqEdit, mockResEdit);

  if (!editedInvoice) {
    throw new Error('Invoice edit failed');
  }

  // Verify stock was adjusted down (reverted +10, applied +6)
  const finalProduct = await prisma.product.findUnique({ where: { id: product.id } });
  console.log(`Product Stock after Edit: ${finalProduct?.stock_qty} (Expected: ${initialStock + newQty})`);
  if (finalProduct?.stock_qty !== initialStock + newQty) {
    throw new Error('Stock was not adjusted correctly after edit!');
  }

  // Verify supplier balance was adjusted down
  const finalSupplier = await prisma.supplier.findUnique({ where: { id: supplier.id } });
  const finalExpectedBalance = initialSupplierBalance + (newTotal - amountPaid);
  console.log(`Supplier Balance after Edit: ${finalSupplier?.balance} (Expected: ${finalExpectedBalance})`);
  if (finalSupplier?.balance !== finalExpectedBalance) {
    throw new Error('Supplier balance was not adjusted correctly after edit!');
  }

  // Verify transactions updated
  const updatedTxs = await prisma.supplierTransaction.findMany({
    where: { invoice_id: createdInvoice.id }
  });
  console.log(`Transactions recorded after edit: ${updatedTxs.length} (Expected: 2)`);
  updatedTxs.forEach(t => {
    console.log(`- Type: ${t.type}, Amount: ${t.amount}, Notes: ${t.notes}, Seller: ${t.seller_name}`);
  });
  const purchaseTx = updatedTxs.find(t => t.type === 'purchase');
  if (purchaseTx?.amount !== newTotal) {
    throw new Error(`Purchase transaction amount did not update! Got: ${purchaseTx?.amount}`);
  }
  if (purchaseTx?.seller_name !== 'المشرف عمر') {
    throw new Error(`Transaction seller_name did not update! Got: ${purchaseTx?.seller_name}`);
  }

  // Verify history logs expanded
  const finalLogs = await prisma.supplierInvoiceHistory.findMany({
    where: { invoice_id: createdInvoice.id },
    orderBy: { created_at: 'asc' }
  });
  console.log(`History logs after edit: ${finalLogs.length} (Expected: 2)`);
  finalLogs.forEach(l => {
    console.log(`- Action: ${l.action}, Seller: ${l.seller_name}, Details: ${l.changes}`);
  });
  if (finalLogs.length !== 2 || finalLogs[1].action !== 'refund') {
    throw new Error('Should record refund action in history log!');
  }

  console.log('\n--- CLEANING UP TEST DATA ---');
  // Revert stock and balance changes
  await prisma.product.update({
    where: { id: product.id },
    data: { stock_qty: initialStock }
  });
  await prisma.supplier.update({
    where: { id: supplier.id },
    data: { balance: initialSupplierBalance }
  });
  // Delete test transactions, history, items, invoices
  await prisma.supplierTransaction.deleteMany({ where: { invoice_id: createdInvoice.id } });
  await prisma.supplierInvoiceHistory.deleteMany({ where: { invoice_id: createdInvoice.id } });
  await prisma.supplierInvoiceItem.deleteMany({ where: { invoice_id: createdInvoice.id } });
  await prisma.supplierInvoice.delete({ where: { id: createdInvoice.id } });
  console.log('Cleanup completed successfully.');

  console.log('\n✅ ALL TEST SCENARIOS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
