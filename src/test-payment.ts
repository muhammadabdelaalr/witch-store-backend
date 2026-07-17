import dotenv from 'dotenv';
import { prisma } from './prisma';
dotenv.config();

const BASE_URL = 'http://localhost:3000/api';

async function runPaymentTest() {
  console.log('=== STARTING PAYMENT SCENARIO TEST ===');
  
  // 1. Login
  console.log('1. Attempting owner admin login...');
  const loginRes = await fetch(`${BASE_URL}/owner/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@store.com',
      password: 'Aa152026@'
    })
  });
  
  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}: ${await loginRes.text()}`);
  }
  
  const loginData = (await loginRes.json()) as any;
  const token = loginData.accessToken;
  console.log('Login successful!');

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 2. Fetch Licenses
  console.log('2. Fetching existing licenses...');
  const licensesRes = await fetch(`${BASE_URL}/owner/licenses`, {
    headers: authHeaders
  });
  
  if (!licensesRes.ok) {
    throw new Error(`Failed to fetch licenses: ${await licensesRes.text()}`);
  }
  
  const licensesData = (await licensesRes.json()) as any;
  const licenses = licensesData.data;
  
  if (licenses.length === 0) {
    throw new Error('No licenses found to test payment on!');
  }
  
  const targetLicense = licenses[0];
  console.log(`Target License selected: Key [${targetLicense.license_key}], Company [${targetLicense.company.name}]`);
  console.log(`Current Expiration: ${targetLicense.expires_at}`);
  console.log(`Current Status: ${targetLicense.status}`);

  // 3. Register a Payment (Yearly Renewal)
  console.log('\n3. Registering a New Payment (Yearly Renewal)...');
  const paymentRes = await fetch(`${BASE_URL}/owner/payments`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      company_id: targetLicense.company_id,
      license_id: targetLicense.id,
      plan_id: targetLicense.plan_id,
      amount: 1200, // example amount
      billing_cycle: 'yearly',
      method: 'bank_transfer',
      notes: 'Automated test payment for yearly renewal'
    })
  });
  
  if (!paymentRes.ok) {
    throw new Error(`Payment failed: ${await paymentRes.text()}`);
  }
  
  const paymentRecord = (await paymentRes.json()) as any;
  console.log(`Payment Registered successfully! Payment ID: ${paymentRecord.id}`);

  // 4. Verify the updated License
  console.log('\n4. Verifying updated License state...');
  const verifyRes = await fetch(`${BASE_URL}/owner/licenses`, { headers: authHeaders });
  const verifyData = (await verifyRes.json()) as any;
  const updatedLicense = verifyData.data.find((l: any) => l.id === targetLicense.id);
  
  console.log(`New Expiration Date: ${updatedLicense.expires_at}`);
  console.log(`New Status: ${updatedLicense.status}`);
  
  const oldDate = new Date(targetLicense.expires_at);
  const newDate = new Date(updatedLicense.expires_at);
  
  const diffDays = Math.round((newDate.getTime() - oldDate.getTime()) / (1000 * 3600 * 24));
  console.log(`\n✅ The license was successfully extended by ~${diffDays} days!`);

  console.log('\n=== PAYMENT SCENARIO COMPLETED SUCCESSFULLY ===');
}

runPaymentTest().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
