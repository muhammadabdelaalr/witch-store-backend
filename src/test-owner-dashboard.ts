import dotenv from 'dotenv';
import { prisma } from './prisma';
dotenv.config();

const BASE_URL = 'http://localhost:3000/api';

async function runTests() {
  console.log('=== STARTING AUTOMATED OWNER DASHBOARD CRUD TESTS ===');
  
  // Cleanup database leftovers from previous runs
  console.log('Cleaning up database leftovers...');
  try {
    await prisma.company.deleteMany({
      where: { name: 'Test Second Company' }
    });
    const testPlans = await prisma.plan.findMany({ where: { name: 'باقة الاختبار الآلي' } });
    const testPlanIds = testPlans.map(p => p.id);
    if (testPlanIds.length > 0) {
      await prisma.licenseModule.deleteMany({ where: { license: { plan_id: { in: testPlanIds } } } });
      await prisma.licenseFeature.deleteMany({ where: { license: { plan_id: { in: testPlanIds } } } });
      await prisma.license.deleteMany({ where: { plan_id: { in: testPlanIds } } });
    }
    await prisma.plan.deleteMany({
      where: { name: 'باقة الاختبار الآلي' }
    });
    console.log('Leftovers cleaned successfully.');
  } catch (cleanErr: any) {
    console.error('Failed to clean leftovers (ignoring):', cleanErr.message);
  }

  const createdLicenseIds: number[] = [];

  
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
  console.log('Login successful! Token acquired.');

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 2. Fetch list of companies
  console.log('2. Fetching companies...');
  const companiesRes = await fetch(`${BASE_URL}/owner/companies`, {
    headers: authHeaders
  });
  if (!companiesRes.ok) {
    throw new Error(`Failed to fetch companies: ${await companiesRes.text()}`);
  }
  const companiesResData = (await companiesRes.json()) as any;
  const companies = companiesResData.data || companiesResData;
  console.log(`Fetched ${companies.length} companies.`);
  
  if (companies.length === 0) {
    throw new Error('No companies found in database. Seed the database first.');
  }

  // 3. Store original company data
  const seededCompany = companies[0];
  const originalCompany = {
    name: seededCompany.name,
    legal_name: seededCompany.legal_name,
    phone: seededCompany.phone,
    email: seededCompany.email,
    address: seededCompany.address,
    status: seededCompany.status
  };
  console.log('Original company data stored:', originalCompany);

  try {
    // 4. Attempt to create a second company
    console.log('4. Attempting to create a second company (expecting limit block)...');
    const createRes = await fetch(`${BASE_URL}/owner/companies`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Test Second Company',
        legal_name: 'Test Legal Name',
        phone: '1234567890',
        email: 'test@second.com',
        password: 'admin-password',
        address: 'Test Address'
      })
    });

    const singleMode = process.env.OWNER_SINGLE_COMPANY_MODE === 'true';
    if (singleMode) {
      if (createRes.ok) {
        throw new Error('Expected company creation to fail, but it succeeded.');
      }
      const errData = (await createRes.json()) as any;
      console.log('Create company failed as expected:', errData);
      if (errData.error !== 'SINGLE_COMPANY_LIMIT_REACHED') {
        throw new Error(`Expected error code SINGLE_COMPANY_LIMIT_REACHED, got: ${errData.error}`);
      }
      console.log('Single company limit block verified successfully.');
    } else {
      console.log('Single company mode is disabled, skipping block assertion.');
    }

    // 5. Update seeded company
    console.log('5. Updating existing company details...');
    const updateRes = await fetch(`${BASE_URL}/owner/companies/${seededCompany.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        legal_name: 'شركة الساحرة المحدثة ش.م.م',
        phone: '01000000000',
        address: 'الأسكندرية، مصر'
      })
    });
    if (!updateRes.ok) {
      throw new Error(`Failed to update company: ${await updateRes.text()}`);
    }
    console.log('Company updated successfully.');

    // 6. Assert changes
    console.log('6. Re-fetching company and asserting changes...');
    const verifyRes = await fetch(`${BASE_URL}/owner/companies`, {
      headers: authHeaders
    });
    const verifyResData = (await verifyRes.json()) as any;
    const verifyCompanies = verifyResData.data || verifyResData;
    const verifiedComp = verifyCompanies.find((c: any) => c.id === seededCompany.id);
    
    if (verifiedComp.legal_name !== 'شركة الساحرة المحدثة ش.م.م' || verifiedComp.phone !== '01000000000') {
      throw new Error(`Assertion failed: Company details did not update correctly. Got: ${JSON.stringify(verifiedComp)}`);
    }
    console.log('Company details assertion passed.');

    // 7. Fetch plans
    console.log('7. Fetching plans...');
    const plansRes = await fetch(`${BASE_URL}/owner/plans`, {
      headers: authHeaders
    });
    if (!plansRes.ok) {
      throw new Error(`Failed to fetch plans: ${await plansRes.text()}`);
    }
    const plansResData = (await plansRes.json()) as any;
    const plans = plansResData.data || plansResData;
    console.log(`Fetched ${plans.length} plans.`);

    // 8. Create new test plan
    console.log('8. Creating a new test plan...');
    const createPlanRes = await fetch(`${BASE_URL}/owner/plans`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'باقة الاختبار الآلي',
        description: 'باقة منشأة عبر الفحص البرمجي التلقائي',
        price_monthly: 99,
        price_yearly: 999,
        is_lifetime: false,
        max_users: 3,
        max_devices: 3,
        max_branches: 1,
        is_active: true,
        moduleIds: [],
        featureIds: []
      })
    });
    if (!createPlanRes.ok) {
      throw new Error(`Failed to create plan: ${await createPlanRes.text()}`);
    }
    const createdPlan = (await createPlanRes.json()) as any;
    console.log('Plan created successfully with ID:', createdPlan.id);

    // 9. Update plan
    console.log('9. Updating test plan...');
    const updatePlanRes = await fetch(`${BASE_URL}/owner/plans/${createdPlan.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        description: 'وصف محدث للباقة التجريبية الآلية',
        price_monthly: 120
      })
    });
    if (!updatePlanRes.ok) {
      throw new Error(`Failed to update plan: ${await updatePlanRes.text()}`);
    }
    const updatedPlan = (await updatePlanRes.json()) as any;
    console.log('Plan updated successfully. Monthly price:', updatedPlan.price_monthly);

    // 9.1. Create License
    console.log('9.1. Creating a new test license...');
    const createLicenseRes = await fetch(`${BASE_URL}/owner/licenses`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        company_id: seededCompany.id,
        plan_id: createdPlan.id,
        type: 'subscription',
        expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        max_devices: 5,
        max_users: 5,
        max_branches: 1,
        allow_all_modules: false,
        customModules: []
      })
    });
    if (!createLicenseRes.ok) {
      throw new Error(`Failed to create license: ${await createLicenseRes.text()}`);
    }
    const createdLicense = (await createLicenseRes.json()) as any;
    console.log('License created successfully with key:', createdLicense.license_key);
    createdLicenseIds.push(createdLicense.id);

    // 9.2. Update License (PATCH)
    console.log('9.2. Updating license max devices/users limits...');
    const updateLicenseRes = await fetch(`${BASE_URL}/owner/licenses/${createdLicense.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        type: 'subscription',
        max_devices: 10,
        max_users: 25,
        max_branches: 2,
        allow_all_modules: true
      })
    });
    if (!updateLicenseRes.ok) {
      throw new Error(`Failed to update license: ${await updateLicenseRes.text()}`);
    }
    const updatedLicense = (await updateLicenseRes.json()) as any;
    console.log('License updated successfully. Max devices:', updatedLicense.max_devices, 'Max users:', updatedLicense.max_users);
    if (updatedLicense.max_devices !== 10 || updatedLicense.max_users !== 25) {
      throw new Error(`License assertions failed on update! Got: ${JSON.stringify(updatedLicense)}`);
    }

    // 9.3. Suspend License
    console.log('9.3. Suspending license...');
    const suspendRes = await fetch(`${BASE_URL}/owner/licenses/${createdLicense.id}/suspend`, {
      method: 'POST',
      headers: authHeaders
    });
    if (!suspendRes.ok) {
      throw new Error(`Failed to suspend license: ${await suspendRes.text()}`);
    }
    const suspendedLicense = (await suspendRes.json()) as any;
    console.log('License suspended successfully. Status:', suspendedLicense.status);
    if (suspendedLicense.status !== 'suspended') {
      throw new Error(`Expected suspended status, got: ${suspendedLicense.status}`);
    }

    // 9.4. Reactivate License
    console.log('9.4. Reactivating license...');
    const reactivateRes = await fetch(`${BASE_URL}/owner/licenses/${createdLicense.id}/reactivate`, {
      method: 'POST',
      headers: authHeaders
    });
    if (!reactivateRes.ok) {
      throw new Error(`Failed to reactivate license: ${await reactivateRes.text()}`);
    }
    const reactivatedLicense = (await reactivateRes.json()) as any;
    console.log('License reactivated successfully. Status:', reactivatedLicense.status);
    if (reactivatedLicense.status !== 'active') {
      throw new Error(`Expected active status, got: ${reactivatedLicense.status}`);
    }

    // 9.5. Extend License
    console.log('9.5. Extending license by 15 days...');
    const extendRes = await fetch(`${BASE_URL}/owner/licenses/${createdLicense.id}/extend`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ days: 15 })
    });
    if (!extendRes.ok) {
      throw new Error(`Failed to extend license: ${await extendRes.text()}`);
    }
    const extendedLicense = (await extendRes.json()) as any;
    console.log('License extended successfully. Expiry:', extendedLicense.expires_at);

    // 9.6. Convert License to Lifetime
    console.log('9.6. Converting license to lifetime subscription...');
    const convertRes = await fetch(`${BASE_URL}/owner/licenses/${createdLicense.id}/convert-lifetime`, {
      method: 'POST',
      headers: authHeaders
    });
    if (!convertRes.ok) {
      throw new Error(`Failed to convert license to lifetime: ${await convertRes.text()}`);
    }
    const lifetimeLicense = (await convertRes.json()) as any;
    console.log('License converted to lifetime successfully. Type:', lifetimeLicense.type, 'Expiry:', lifetimeLicense.expires_at);
    if (lifetimeLicense.type !== 'lifetime' || lifetimeLicense.expires_at !== null) {
      throw new Error(`Expected lifetime type with null expiry, got: ${JSON.stringify(lifetimeLicense)}`);
    }

    // 9.7. Delete test license (via Prisma directly to allow plan deletion)
    console.log('9.7. Deleting test license to allow plan deletion...');
    await prisma.licenseModule.deleteMany({
      where: { license_id: { in: createdLicenseIds } }
    });
    await prisma.licenseFeature.deleteMany({
      where: { license_id: { in: createdLicenseIds } }
    });
    await prisma.license.deleteMany({
      where: { id: { in: createdLicenseIds } }
    });
    createdLicenseIds.length = 0;

    // 10. Delete plan
    console.log('10. Deleting test plan...');
    const deletePlanRes = await fetch(`${BASE_URL}/owner/plans/${createdPlan.id}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    if (!deletePlanRes.ok) {
      throw new Error(`Failed to delete plan: ${await deletePlanRes.text()}`);
    }
    console.log('Plan deleted successfully.');

  } finally {
    // 11. Database cleanup
    if (createdLicenseIds.length > 0) {
      console.log('Cleaning up created test licenses from DB...');
      try {
        await prisma.licenseModule.deleteMany({
          where: { license_id: { in: createdLicenseIds } }
        });
        await prisma.licenseFeature.deleteMany({
          where: { license_id: { in: createdLicenseIds } }
        });
        await prisma.license.deleteMany({
          where: { id: { in: createdLicenseIds } }
        });
        console.log('Licenses cleaned successfully.');
      } catch (dbCleanErr: any) {
        console.error('Failed to delete licenses in database cleanup:', dbCleanErr.message);
      }
    }

    // 12. Restore original company data
    console.log('12. Restoring original company data in finally block...');
    const restoreRes = await fetch(`${BASE_URL}/owner/companies/${seededCompany.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify(originalCompany)
    });
    if (restoreRes.ok) {
      console.log('Original company data restored successfully.');
    } else {
      console.error('Failed to restore original company data:', await restoreRes.text());
    }
  }

  console.log('=== ALL TESTS COMPLETED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('Test run failed with error:', err.message);
  process.exit(1);
});
