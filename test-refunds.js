const http = require('http');

const API_URL = 'http://localhost:3000/api';

async function fetchJSON(path, options = {}) {
  const url = new URL(path, API_URL);
  
  if (options.body) {
    options.body = JSON.stringify(options.body);
    options.headers = {
      ...options.headers,
      'Content-Type': 'application/json'
    };
  }

  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw { response: { data } };
  }
  return { data };
}

async function runTest() {
  console.log('--- STARTING FULL SALES & REFUNDS TEST ---');
  try {
    // 1. Get initial data
    const productsRes = await fetchJSON('/api/products?limit=2');
    if (productsRes.data.data.length < 2) {
      console.log('Not enough products to test. Please create at least 2 products.');
      return;
    }
    const productA = productsRes.data.data[0];
    const productB = productsRes.data.data[1];

    const customersRes = await fetchJSON('/api/customers?limit=1');
    if (customersRes.data.data.length < 1) {
      console.log('No customers found to test. Please create at least 1 customer.');
      return;
    }
    const customer = customersRes.data.data[0];

    console.log(`\nInitial State:`);
    console.log(`Product A (${productA.name}): Stock = ${productA.stock_qty}, Retail Price = ${productA.sell_price}`);
    console.log(`Product B (${productB.name}): Stock = ${productB.stock_qty}, Retail Price = ${productB.sell_price}`);
    console.log(`Customer (${customer.name}): Initial Balance = ${customer.total_debts - customer.total_payments}`);

    // 2. Create Sale
    console.log('\n--- CREATING SALE ---');
    const modifiedPriceB = productB.sell_price - 10; // Modified price for B
    const qtyA = 2;
    const qtyB = 3;

    const subtotal = (productA.sell_price * qtyA) + (modifiedPriceB * qtyB);
    const tax = 0;
    const discount = 0;
    const total = subtotal + tax - discount;
    const amountPaid = total - 50; // Leave 50 as debt

    const salePayload = {
      customer_id: customer.id,
      items: [
        { product_id: productA.id, qty: qtyA, unit_price: productA.sell_price, cost_price: productA.cost_price },
        { product_id: productB.id, qty: qtyB, unit_price: modifiedPriceB, cost_price: productB.cost_price }
      ],
      payment_method: 'cash',
      subtotal,
      tax,
      discount,
      total,
      amount_paid: amountPaid,
      sale_type: 'retail',
      seller_name: 'Test Runner'
    };

    console.log('Sale Payload:', JSON.stringify(salePayload, null, 2));
    const saleRes = await fetchJSON('/api/sales', { method: 'POST', body: salePayload });
    const saleId = saleRes.data.id;
    console.log(`Sale Created Successfully! ID: ${saleId}`);

    // Verify post-sale state
    const allCustomers1 = (await fetchJSON(`/api/customers?limit=100`)).data.data;
    const postSaleCustomer = allCustomers1.find(c => c.id === customer.id);
    const postSaleProductA = (await fetchJSON(`/api/products`)).data.data.find(p => p.id === productA.id);
    const postSaleProductB = (await fetchJSON(`/api/products`)).data.data.find(p => p.id === productB.id);

    console.log(`\nPost-Sale State Verification:`);
    console.log(`Product A Stock: ${postSaleProductA.stock_qty} (Expected: ${productA.stock_qty - qtyA}) -> ${postSaleProductA.stock_qty === productA.stock_qty - qtyA ? 'PASS' : 'FAIL'}`);
    console.log(`Product B Stock: ${postSaleProductB.stock_qty} (Expected: ${productB.stock_qty - qtyB}) -> ${postSaleProductB.stock_qty === productB.stock_qty - qtyB ? 'PASS' : 'FAIL'}`);
    
    const expectedDebtIncrease = total - amountPaid;
    const initialBalance = customer.total_debts - customer.total_payments;
    const currentBalance = postSaleCustomer.total_debts - postSaleCustomer.total_payments;
    console.log(`Customer Balance: ${currentBalance} (Expected: ${initialBalance + expectedDebtIncrease}) -> ${Math.abs(currentBalance - (initialBalance + expectedDebtIncrease)) < 0.01 ? 'PASS' : 'FAIL'}`);

    // 3. Refund Product B (Modified Price)
    console.log('\n--- REFUNDING PRODUCT B (MODIFIED PRICE) ---');
    const refundBPayload = {
      seller_name: 'Test Runner',
      items: [
        { product_id: productB.id, qty: 1 }
      ]
    };
    const refundBRes = await fetchJSON(`/api/sales/${saleId}/refund`, { method: 'POST', body: refundBPayload });
    console.log(`Refund Created Successfully! ID: ${refundBRes.data.id}`);
    
    // Verify refund amount logic uses original unit_price (modifiedPriceB), not current product price.
    console.log(`Refund Total Expected: ${modifiedPriceB} (Since it was sold at modified price)`);
    console.log(`Refund Total Actual: ${refundBRes.data.total}`);
    console.log(`Refund Value Check -> ${Math.abs(refundBRes.data.total - modifiedPriceB) < 0.01 ? 'PASS' : 'FAIL'}`);

    const allCustomers2 = (await fetchJSON(`/api/customers?limit=100`)).data.data;
    const postRefundBCustomer = allCustomers2.find(c => c.id === customer.id);
    const postRefundBProductB = (await fetchJSON(`/api/products`)).data.data.find(p => p.id === productB.id);

    console.log(`Product B Stock restored: ${postRefundBProductB.stock_qty} (Expected: ${postSaleProductB.stock_qty + 1}) -> ${postRefundBProductB.stock_qty === postSaleProductB.stock_qty + 1 ? 'PASS' : 'FAIL'}`);
    
    const balanceAfterRefundB = postRefundBCustomer.total_debts - postRefundBCustomer.total_payments;
    console.log(`Customer Debt Reduced by Refund: ${balanceAfterRefundB} (Expected: ${currentBalance - modifiedPriceB}) -> ${Math.abs(balanceAfterRefundB - (currentBalance - modifiedPriceB)) < 0.01 ? 'PASS' : 'FAIL'}`);

    // 4. Try Refunding Product B again (Should fail due to lockout rule)
    console.log('\n--- TESTING DOUBLE REFUND LOCKOUT (PRODUCT B) ---');
    try {
      await fetchJSON(`/api/sales/${saleId}/refund`, {
        method: 'POST',
        body: {
          seller_name: 'Test Runner',
          items: [{ product_id: productB.id, qty: 1 }]
        }
      });
      console.log(`Double Refund Check -> FAIL (It allowed a second refund on the same product!)`);
    } catch (err) {
      console.log(`Double Refund Check -> PASS (Backend rejected the second refund with error: ${err.response?.data?.error || err.message})`);
    }

    // 5. Refund Product A (Full quantity, Normal Price)
    console.log('\n--- REFUNDING PRODUCT A (FULL QTY, NORMAL PRICE) ---');
    const refundAPayload = {
      seller_name: 'Test Runner',
      items: [
        { product_id: productA.id, qty: qtyA }
      ]
    };
    const refundARes = await fetchJSON(`/api/sales/${saleId}/refund`, { method: 'POST', body: refundAPayload });
    console.log(`Refund Created Successfully! ID: ${refundARes.data.id}`);

    console.log(`Refund Total Expected: ${productA.sell_price * qtyA}`);
    console.log(`Refund Total Actual: ${refundARes.data.total}`);
    console.log(`Refund Value Check -> ${Math.abs(refundARes.data.total - (productA.sell_price * qtyA)) < 0.01 ? 'PASS' : 'FAIL'}`);

    console.log('\n--- TEST CYCLE COMPLETE ---');
  } catch (error) {
    console.error('Test Failed Exception:', error.response?.data || error);
  }
}

runTest();
