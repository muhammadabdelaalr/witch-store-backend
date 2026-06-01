const http = require('http');

const data = JSON.stringify({
  discount: 0,
  tax: 0,
  amount_paid: 100,
  payment_method: 'cash',
  sale_type: 'wholesale',
  items: [
    {
      product_id: 1, // assuming product 1 exists
      qty: 1,
      unit_price: 100,
      cost_price: 50
    }
  ]
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/sales',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  let body = '';
  res.on('data', d => {
    body += d;
  });
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${body}`);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
